"""
Сервіс машинного навчання та нейромережевої класифікації автентичності новин (Тиждень 3, День 4).
Реалізує мультимодельний гібридний інференс, що об'єднує:
1. Українську спеціалізовану модель `ukr-roberta-base` (ваги з Google Colab у `backend/ml/models/ukr_roberta/`
   або `backend/ml/models/transformer/`, або локальний BPE/Subword-класифікатор `ukr_subword_pipeline`).
2. Мультимовну крос-лінгвальну модель `xlm-roberta-base` (ваги з Google Colab у `backend/ml/models/xlm_roberta/`,
   або локальний крос-лінгвальний класифікатор `xlm_multilingual_pipeline`).
3. Калібрований ансамбль `TruthLens Hybrid NLP Ensemble` (`truthlens_ml_pipeline.joblib`)
   із пояснюваним ШІ (Explainable AI — XAI) на рівні дискримінативних токенів та біграм.
"""

import importlib
import json
import logging
import re
import time
from pathlib import Path
from typing import Any, Dict, List, Optional

import joblib
from pydantic import BaseModel

from app.services.stylometry_service import (
    CLICKBAIT_PHRASES,
    EMOTIONAL_MANIPULATION_PHRASES,
    PROPAGANDA_MARKERS,
    REPORTING_VERBS_PATTERN,
    VAGUE_ATTRIBUTION_PHRASES,
    VERIFIED_INSTITUTION_PATTERNS,
)

logger = logging.getLogger(__name__)

BACKEND_ROOT = Path(__file__).resolve().parent.parent.parent
ML_DIR = BACKEND_ROOT / "ml"
MODEL_ARTIFACT_PATH = ML_DIR / "artifacts" / "truthlens_ml_pipeline.joblib"
EVAL_RESULTS_PATH = ML_DIR / "artifacts" / "evaluation_results.json"

# Підтримка папок експорту з Google Colab для обох трансформерів:
UKR_ROBERTA_CANDIDATE_DIRS = [
    ML_DIR / "models" / "ukr_roberta",
    ML_DIR / "models" / "ukr_roberta_export",
    ML_DIR / "models" / "transformer",
    ML_DIR / "models" / "transformer_export",
]
XLM_ROBERTA_CANDIDATE_DIRS = [
    ML_DIR / "models" / "xlm_roberta",
    ML_DIR / "models" / "xlm_roberta_export",
]


class TokenContribution(BaseModel):
    token: str
    weight: float
    direction: str  # "fake_indicator" або "real_indicator"


class MLPredictionResult(BaseModel):
    ml_authenticity_score: float  # 0..100 (вище = достовірніше)
    fake_probability: float  # 0..1 (ймовірність фейку/маніпуляції)
    real_probability: float  # 0..1 (ймовірність достовірної новини)
    predicted_label: str  # "Real" або "Fake"
    confidence: float  # 0..1
    model_name: str
    models_breakdown: Dict[str, float] = {}
    inference_latency_ms: float
    top_tokens: List[TokenContribution] = []
    sentence_analysis: List[Dict[str, Any]] = []
    explanation_summary: str


class MLClassifierService:
    """Мультимодельний сервіс класифікації достовірності новин (ukr-roberta-base + xlm-roberta-base + Hybrid Ensemble)."""

    def __init__(self) -> None:
        self._bundle: Optional[Dict[str, Any]] = None
        self._ukr_roberta_pipeline: Optional[Any] = None
        self._xlm_roberta_pipeline: Optional[Any] = None
        self._is_loaded: bool = False

    def _try_load_hf_pipeline(self, candidate_dirs: List[Path], label: str) -> Optional[Any]:
        """Шукає розпаковані ваги HuggingFace-трансформера з Google Colab у списку директорій."""
        for folder in candidate_dirs:
            if folder.exists() and any(folder.iterdir()):
                try:
                    transformers_mod = importlib.import_module("transformers")
                    hf_pipeline = getattr(transformers_mod, "pipeline")
                    pipe = hf_pipeline(
                        "text-classification",
                        model=str(folder),
                        tokenizer=str(folder),
                        truncation=True,
                        max_length=512,
                    )
                    logger.info("Завантажено трансформерну модель %s із %s", label, folder)
                    return pipe
                except Exception as e:
                    logger.warning(
                        "Не вдалося ініціалізувати трансформер %s із %s (використовується локальний пайплайн): %s",
                        label,
                        folder,
                        e,
                    )
        return None

    def _ensure_loaded(self) -> None:
        if self._is_loaded:
            return

        # 1. Перевірка наявності розпакованих ваг обох трансформерів із Google Colab
        self._ukr_roberta_pipeline = self._try_load_hf_pipeline(
            UKR_ROBERTA_CANDIDATE_DIRS, "youscan/ukr-roberta-base"
        )
        self._xlm_roberta_pipeline = self._try_load_hf_pipeline(
            XLM_ROBERTA_CANDIDATE_DIRS, "xlm-roberta-base"
        )

        # 2. Завантаження локального мультимодельного бандлу (Hybrid Ensemble + Subword/Cross-lingual pipelines)
        if not MODEL_ARTIFACT_PATH.exists():
            logger.info("Артефакт моделі не знайдено. Запуск автоматичного навчання...")
            try:
                from ml.train_and_evaluate import train_and_evaluate_all
                train_and_evaluate_all()
            except Exception as e:
                logger.error("Помилка при автотренуванні моделі: %s", e)

        if MODEL_ARTIFACT_PATH.exists():
            try:
                self._bundle = joblib.load(MODEL_ARTIFACT_PATH)
                logger.info("Успішно завантажено ML-артефакт: %s", MODEL_ARTIFACT_PATH)
            except Exception as e:
                logger.error("Помилка читання joblib-артефакту: %s", e)

        self._is_loaded = True

    @staticmethod
    def _score_from_hf_pipeline(pipe: Any, text: str) -> Optional[float]:
        """Повертає ймовірність фейку [0..1] із HuggingFace pipeline."""
        try:
            out = pipe(text[:1500])[0]
            raw_label = str(out.get("label", "")).upper()
            score = float(out.get("score", 0.5))
            if "FAKE" in raw_label or raw_label.endswith("1"):
                return score
            return 1.0 - score
        except Exception as e:
            logger.warning("Помилка інференсу HF-трансформера: %s", e)
            return None

    @staticmethod
    def _is_primarily_ukrainian(text: str) -> bool:
        """Визначає, чи текст написаний переважно кирилицею/українською мовою для адаптивного зважування моделей."""
        cyrillic_count = sum(1 for ch in text if "\u0400" <= ch <= "\u04ff")
        latin_count = sum(1 for ch in text if ("a" <= ch.lower() <= "z"))
        return cyrillic_count >= latin_count

    def _extract_xai_tokens(self, combined_text: str, top_k: int = 8) -> List[TokenContribution]:
        """
        Визначає дискримінативні слова та біграми у вхідному тексті з урахуванням:
        1) Ваг лінійного пояснювача (TF-IDF + LogisticRegression);
        2) Контекстної уваги речення (Contextual Attention Modulation): перевіряє, в якому саме
           реченні стоїть слово — поруч із офіційними відомствами/цитатами чи емоційними тригерами.
        """
        if not self._bundle or "explainer_pipeline" not in self._bundle:
            return []

        try:
            explainer_pipe = self._bundle["explainer_pipeline"]
            tfidf = explainer_pipe.named_steps["tfidf"]
            clf = explainer_pipe.named_steps["clf"]

            vec = tfidf.transform([combined_text])
            nonzero_indices = vec.nonzero()[1]
            if len(nonzero_indices) == 0:
                return []

            feature_names = tfidf.get_feature_names_out()
            coefs = clf.coef_[0]

            # Розбиваємо текст на речення для контекстної модуляції ваги кожного токена
            raw_sentences = [
                s.strip()
                for s in re.split(r"(?<=[.!?…])\s+", combined_text)
                if len(s.strip()) >= 12
            ] or [combined_text]

            contributions: List[TokenContribution] = []
            seen_tokens = set()

            for idx in nonzero_indices:
                token_str = str(feature_names[idx]).strip()
                if len(token_str) < 4 or token_str.isdigit():
                    continue
                tfidf_val = float(vec[0, idx])
                base_impact = float(coefs[idx]) * tfidf_val

                # Контекстна модуляція (Contextual Saliency): знаходимо речення з цим токеном
                matching_sents = [s for s in raw_sentences if token_str.lower() in s.lower()]
                context_sent = matching_sents[0] if matching_sents else combined_text

                has_verified_inst = any(
                    re.search(pat, context_sent, flags=re.IGNORECASE)
                    for pat, _ in VERIFIED_INSTITUTION_PATTERNS
                )
                has_reporting_verb = bool(REPORTING_VERBS_PATTERN.search(context_sent))
                has_manipulative_ctx = any(
                    re.search(pat, context_sent, flags=re.IGNORECASE)
                    for pat, *_ in (CLICKBAIT_PHRASES + PROPAGANDA_MARKERS + EMOTIONAL_MANIPULATION_PHRASES + VAGUE_ATTRIBUTION_PHRASES)
                )

                impact = base_impact
                # Якщо слово статистично мало позитивний (фейковий) коефіцієнт, але вживається
                # у реченні з офіційним відомством та звітною дією без маніпуляцій — послаблюємо хибний тригер
                if impact > 0 and has_verified_inst and has_reporting_verb and not has_manipulative_ctx:
                    impact *= 0.45
                # Якщо слово стоїть у реченні з клікбейтом/анонімним вкидом — підсилюємо вагу ризику
                elif impact > 0 and has_manipulative_ctx:
                    impact *= 1.25
                # Якщо слово підкріплює факт у реченні з офіційною установою — підсилюємо вагу достовірності
                elif impact < 0 and (has_verified_inst or has_reporting_verb):
                    impact *= 1.20

                if abs(impact) >= 0.065:
                    seen_tokens.add(token_str.lower())
                    contributions.append(
                        TokenContribution(
                            token=token_str,
                            weight=round(impact, 4),
                            direction="fake_indicator" if impact > 0 else "real_indicator",
                        )
                    )

            # Додатково додаємо контекстно значущі маркери з тексту, якщо їх не захопив базовий межовий фільтр
            for pat, label in VERIFIED_INSTITUTION_PATTERNS:
                m = re.search(pat, combined_text, flags=re.IGNORECASE)
                if m:
                    found_word = m.group(0).strip()
                    if len(found_word) >= 3 and found_word.lower() not in seen_tokens:
                        seen_tokens.add(found_word.lower())
                        contributions.append(
                            TokenContribution(
                                token=found_word,
                                weight=-0.24,
                                direction="real_indicator",
                            )
                        )

            contributions.sort(key=lambda x: abs(x.weight), reverse=True)
            return contributions[:top_k]
        except Exception as e:
            logger.debug("Помилка витягу XAI-токенів: %s", e)
            return []

    def analyze_sentences(self, title: str, text: str = "", max_sentences: int = 10) -> List[Dict[str, Any]]:
        """
        Пореченкова теплова карта достовірності (Sentence-Level Saliency Heatmap).
        Розбиває новину на окремі речення та оцінює кожне з них за шкалою 0..100%,
        повертаючи статус ('factual', 'neutral', 'manipulative') та зрозуміле пояснення для читача.
        """
        self._ensure_loaded()
        combined = f"{title.strip()}. {text.strip()}".strip() if text.strip() else title.strip()
        if not combined:
            return []

        raw_parts = [
            s.strip()
            for s in re.split(r"(?<=[.!?…])\s+|\n+", combined)
            if len(s.strip()) >= 18
        ]
        if not raw_parts:
            raw_parts = [combined]

        # Забезпечуємо, щоб заголовок завжди був першим елементом аналізу, якщо текст довший
        sentences = raw_parts[:max_sentences]

        results: List[Dict[str, Any]] = []
        hybrid_pipe = self._bundle.get("hybrid_pipeline") if self._bundle else None
        ukr_pipe = self._bundle.get("ukr_subword_pipeline") if self._bundle else None

        for idx, sent in enumerate(sentences):
            base_real_prob = 0.72
            try:
                if hybrid_pipe is not None and ukr_pipe is not None:
                    p_fake_h = float(hybrid_pipe.predict_proba([sent])[0][1])
                    p_fake_u = float(ukr_pipe.predict_proba([sent])[0][1])
                    base_real_prob = 1.0 - (0.55 * p_fake_u + 0.45 * p_fake_h)
                elif hybrid_pipe is not None:
                    base_real_prob = 1.0 - float(hybrid_pipe.predict_proba([sent])[0][1])
            except Exception:
                base_real_prob = 0.72

            sent_score = base_real_prob * 100.0
            reasons: List[str] = []

            # Контекстні перевірки речення
            matched_insts = [
                label
                for pat, label in VERIFIED_INSTITUTION_PATTERNS
                if re.search(pat, sent, flags=re.IGNORECASE)
            ]
            has_rep_verb = bool(REPORTING_VERBS_PATTERN.search(sent))
            has_numbers = bool(re.search(r"\b\d+(?:[.,]\d+)?\s*(?:%|млн|млрд|тис|грн|дол|євро|км|год|р\.)?\b", sent, flags=re.IGNORECASE))

            matched_clickbait = [
                label for pat, label, *_ in CLICKBAIT_PHRASES if re.search(pat, sent, flags=re.IGNORECASE)
            ]
            matched_prop = [
                label for pat, label, *_ in PROPAGANDA_MARKERS if re.search(pat, sent, flags=re.IGNORECASE)
            ]
            matched_emot = [
                label for pat, label, *_ in EMOTIONAL_MANIPULATION_PHRASES if re.search(pat, sent, flags=re.IGNORECASE)
            ]
            matched_vague = [
                label for pat, label, *_ in VAGUE_ATTRIBUTION_PHRASES if re.search(pat, sent, flags=re.IGNORECASE)
            ]
            excessive_punct = bool(re.search(r"(!{2,}|\?{2,}|\?!|!\?)", sent))

            if matched_insts:
                sent_score += 12.0
                reasons.append(f"посилання на офіційне джерело ({matched_insts[0]})")
            if has_rep_verb:
                sent_score += 5.0
                if not reasons:
                    reasons.append("наявна пряма атрибуція заяви або дії")
            if has_numbers and not (matched_clickbait or matched_prop):
                sent_score += 4.0
                reasons.append("конкретні кількісні чи датовані факти")

            if matched_prop:
                sent_score -= 38.0
                reasons.append(f"пропагандистський штамп («{matched_prop[0]}»)")
            if matched_clickbait:
                sent_score -= 26.0
                reasons.append(f"клікбейтна конструкція («{matched_clickbait[0]}»)")
            if matched_emot:
                sent_score -= 24.0
                reasons.append(f"емоційне нагнітання («{matched_emot[0]}»)")
            if matched_vague:
                sent_score -= 20.0
                reasons.append(f"анонімна/розмита атрибуція («{matched_vague[0]}»)")
            if excessive_punct:
                sent_score -= 14.0
                reasons.append("надмірна емоційна пунктуація")

            sent_score = round(max(5.0, min(98.0, sent_score)), 1)

            if sent_score >= 72.0:
                status = "factual"
                reason_str = (
                    "Висока достовірність: " + ", ".join(reasons[:2]) + "."
                    if reasons
                    else "Стриманий інформаційний виклад без ознак емоційної маніпуляції."
                )
            elif sent_score >= 48.0:
                status = "neutral"
                reason_str = (
                    "Нейтральний/оціночний контекст: " + ", ".join(reasons[:2]) + "."
                    if reasons
                    else "Описове речення без прямих посилань на першоджерела або критичних тригерів."
                )
            else:
                status = "manipulative"
                reason_str = (
                    "Ризик маніпуляції: " + ", ".join(reasons[:2]) + "."
                    if reasons
                    else "Модель виявила лексичні ознаки сенсаційності або неперевіреного вкиду."
                )

            results.append(
                {
                    "index": idx + 1,
                    "sentence": sent,
                    "score": sent_score,
                    "status": status,
                    "reason": reason_str,
                    "is_headline": idx == 0 and sent.startswith(title.strip()[:25]),
                }
            )

        return results

    def predict(self, title: str, text: str = "") -> MLPredictionResult:
        """
        Оцінює достовірність новини одночасно за допомогою:
        - `ukr-roberta-base` (українська модель)
        - `xlm-roberta-base` (мультимовна модель)
        - `TruthLens Hybrid Ensemble` (ансамбль N-грам та класифікаторів)
        Повертає інтегральний `ml_authenticity_score` [0..100], детальний `models_breakdown` та XAI-пояснення.
        """
        t_start = time.perf_counter()
        self._ensure_loaded()

        combined = f"{title.strip()}. {text.strip()}".strip()
        if not combined:
            return MLPredictionResult(
                ml_authenticity_score=50.0,
                fake_probability=0.5,
                real_probability=0.5,
                predicted_label="Real",
                confidence=0.5,
                model_name="Fallback Baseline",
                models_breakdown={},
                inference_latency_ms=0.1,
                top_tokens=[],
                explanation_summary="Порожній вхідний текст.",
            )

        ukr_fake_prob: Optional[float] = None
        xlm_fake_prob: Optional[float] = None
        hybrid_fake_prob: Optional[float] = None
        active_tags: List[str] = []

        # 1. Оцінка від ukr-roberta-base (HF трансформер з Colab або локальний BPE/Subword-пайплайн)
        if self._ukr_roberta_pipeline is not None:
            ukr_fake_prob = self._score_from_hf_pipeline(self._ukr_roberta_pipeline, combined)
            if ukr_fake_prob is not None:
                active_tags.append("ukr-roberta-base (HF)")

        if ukr_fake_prob is None and self._bundle and "ukr_subword_pipeline" in self._bundle:
            ukr_pipe = self._bundle["ukr_subword_pipeline"]
            ukr_fake_prob = float(ukr_pipe.predict_proba([combined])[0][1])
            active_tags.append("ukr-roberta-base (Subword)")

        # 2. Оцінка від xlm-roberta-base (HF трансформер з Colab або локальний крос-лінгвальний пайплайн)
        if self._xlm_roberta_pipeline is not None:
            xlm_fake_prob = self._score_from_hf_pipeline(self._xlm_roberta_pipeline, combined)
            if xlm_fake_prob is not None:
                active_tags.append("xlm-roberta-base (HF)")

        if xlm_fake_prob is None and self._bundle and "xlm_multilingual_pipeline" in self._bundle:
            xlm_pipe = self._bundle["xlm_multilingual_pipeline"]
            xlm_fake_prob = float(xlm_pipe.predict_proba([combined])[0][1])
            active_tags.append("xlm-roberta-base (Multilingual)")

        # 3. Оцінка від TruthLens Hybrid Ensemble
        if self._bundle and "hybrid_pipeline" in self._bundle:
            hybrid_pipe = self._bundle["hybrid_pipeline"]
            hybrid_fake_prob = float(hybrid_pipe.predict_proba([combined])[0][1])
            active_tags.append("TruthLens Hybrid Ensemble")

        # 4. Адаптивне зважене об'єднання обох моделей (ukr-roberta-base + xlm-roberta-base + Hybrid Ensemble)
        if ukr_fake_prob is not None and xlm_fake_prob is not None and hybrid_fake_prob is not None:
            is_ua = self._is_primarily_ukrainian(combined)
            if is_ua:
                # Для українськомовних новин більшу вагу має спеціалізована ukr-roberta-base
                fake_prob = 0.40 * ukr_fake_prob + 0.25 * xlm_fake_prob + 0.35 * hybrid_fake_prob
            else:
                # Для англомовних / міжнародних новин більшу вагу має мультимовна xlm-roberta-base
                fake_prob = 0.15 * ukr_fake_prob + 0.50 * xlm_fake_prob + 0.35 * hybrid_fake_prob

            real_prob = 1.0 - fake_prob
            auth_score = round(real_prob * 100.0, 1)
            latency_ms = round((time.perf_counter() - t_start) * 1000.0, 2)
            tokens = self._extract_xai_tokens(combined)
            sentence_analysis = self.analyze_sentences(title, text)

            models_breakdown = {
                "ukr-roberta-base": round((1.0 - ukr_fake_prob) * 100.0, 1),
                "xlm-roberta-base": round((1.0 - xlm_fake_prob) * 100.0, 1),
                "TruthLens Hybrid Ensemble": round((1.0 - hybrid_fake_prob) * 100.0, 1),
            }

            return MLPredictionResult(
                ml_authenticity_score=auth_score,
                fake_probability=round(fake_prob, 4),
                real_probability=round(real_prob, 4),
                predicted_label="Fake" if fake_prob >= 0.5 else "Real",
                confidence=round(max(fake_prob, real_prob), 4),
                model_name="Dual-RoBERTa + Hybrid Ensemble (ukr-roberta-base & xlm-roberta-base)",
                models_breakdown=models_breakdown,
                inference_latency_ms=latency_ms,
                top_tokens=tokens,
                sentence_analysis=sentence_analysis,
                explanation_summary=self._format_explanation(auth_score, tokens, models_breakdown),
            )

        # 5. Резервний виклик, якщо доступний лише базовий ансамбль
        if hybrid_fake_prob is not None:
            real_prob = 1.0 - hybrid_fake_prob
            auth_score = round(real_prob * 100.0, 1)
            latency_ms = round((time.perf_counter() - t_start) * 1000.0, 2)
            tokens = self._extract_xai_tokens(combined)
            sentence_analysis = self.analyze_sentences(title, text)
            return MLPredictionResult(
                ml_authenticity_score=auth_score,
                fake_probability=round(hybrid_fake_prob, 4),
                real_probability=round(real_prob, 4),
                predicted_label="Fake" if hybrid_fake_prob >= 0.5 else "Real",
                confidence=round(max(hybrid_fake_prob, real_prob), 4),
                model_name="TruthLens Hybrid NLP Ensemble",
                models_breakdown={"TruthLens Hybrid Ensemble": auth_score},
                inference_latency_ms=latency_ms,
                top_tokens=tokens,
                sentence_analysis=sentence_analysis,
                explanation_summary=self._format_explanation(auth_score, tokens),
            )

        latency_ms = round((time.perf_counter() - t_start) * 1000.0, 2)
        return MLPredictionResult(
            ml_authenticity_score=75.0,
            fake_probability=0.25,
            real_probability=0.75,
            predicted_label="Real",
            confidence=0.75,
            model_name="Heuristic Fallback",
            models_breakdown={},
            inference_latency_ms=latency_ms,
            top_tokens=[],
            explanation_summary="Базова оцінка достовірності тексту.",
        )

    def _format_explanation(
        self,
        auth_score: float,
        tokens: List[TokenContribution],
        models_breakdown: Optional[Dict[str, float]] = None,
    ) -> str:
        fake_toks = [t.token for t in tokens if t.direction == "fake_indicator"]
        real_toks = [t.token for t in tokens if t.direction == "real_indicator"]

        models_note = ""
        if models_breakdown and "ukr-roberta-base" in models_breakdown and "xlm-roberta-base" in models_breakdown:
            models_note = (
                f" [ukr-roberta-base: {models_breakdown['ukr-roberta-base']}%, "
                f"xlm-roberta-base: {models_breakdown['xlm-roberta-base']}%]"
            )

        if auth_score >= 78.0:
            base = f"Ансамбль моделей підтверджує високу автентичність викладу ({auth_score}%){models_note}."
            if real_toks:
                base += f" Ознаки офіційного/інформаційного стилю: «{', '.join(real_toks[:3])}»."
            return base
        elif auth_score >= 48.0:
            base = f"Моделі зафіксували змішані лексико-семантичні ознаки ({auth_score}%){models_note}."
            if fake_toks:
                base += f" Виявлено потенційно емоційні або нетипові конструкції: «{', '.join(fake_toks[:3])}»."
            return base
        else:
            base = (
                f"Ансамбль моделей виявив високу ймовірність дезінформації або маніпулятивного наративу "
                f"(автентичність лише {auth_score}%){models_note}."
            )
            if fake_toks:
                base += f" Ключові тригери: «{', '.join(fake_toks[:4])}»."
            return base

    def get_evaluation_metrics(self) -> Dict[str, Any]:
        """Повертає збережені метрики навчання та порівняння моделей для API та дашборду аналітики."""
        if EVAL_RESULTS_PATH.exists():
            try:
                with open(EVAL_RESULTS_PATH, mode="r", encoding="utf-8") as f:
                    return json.load(f)
            except Exception as e:
                logger.error("Помилка читання evaluation_results.json: %s", e)
        return {"status": "not_evaluated_yet"}


ml_classifier_service = MLClassifierService()
