import logging
import re
from typing import List, Dict, Any, Optional
from pydantic import BaseModel

logger = logging.getLogger(__name__)


class StylometryTrigger(BaseModel):
    text: str
    category: str  # "clickbait", "typography", "emotional", "attribution"
    severity: str  # "low", "medium", "high"
    description: str


class StylometryAnalysisResult(BaseModel):
    clickbait_score: float  # 0 to 100 (вище = більше клікбейту)
    emotional_score: float  # 0 to 100 (вище = більше емоційного маніпулювання)
    manipulation_score: float  # 0 to 100 (вище = більше маніпулятивних маркерів)
    caps_lock_ratio: float = 0.0  # 0 to 1
    overall_penalty: float  # 0 to 100
    stylometry_trust_index: float  # 100 - overall_penalty (0 to 100)
    summary_verdict: str  # "Нейтральний", "Помірний ризик", "Висока маніпулятивність"
    triggers: List[StylometryTrigger]


# Словники клікбейту (українська + англійська)
CLICKBAIT_PHRASES = [
    (r"\bшок(!|\?)*\b", "ШОК!", "clickbait", "high", "Типовий клікбейт-маркер штучної сенсаційності"),
    (r"\bсенсація(!|\?)*\b", "СЕНСАЦІЯ!", "clickbait", "high", "Штучна сенсаційність для заманювання переходів"),
    (r"ви не повірите", "Ви не повірите", "clickbait", "high", "Клікбейт-заклик з маніпуляцією допитливістю"),
    (r"терміново дивіться", "Терміново дивіться", "clickbait", "high", "Штучне нагнітання терміновості"),
    (r"приховують від (народу|людей|громадян)", "Приховують від народу", "clickbait", "high", "Конспірологічний штамп про 'приховану правду'"),
    (r"ось що сталося", "Ось що сталося", "clickbait", "medium", "Інтригуючий кліфгенгер без суті новини"),
    (r"деталі вражають", "Деталі вражають", "clickbait", "medium", "Оціночний клікбейт замість фактів"),
    (r"вже з понеділка", "Вже з понеділка", "clickbait", "medium", "Популярний клікбейт-патерн фальшивих заборон"),
    (r"несподіваний поворот", "Несподіваний поворот", "clickbait", "low", "Драматизація новинного приводу"),
    (r"вся правда про", "Вся правда про", "clickbait", "medium", "Претензія на 'ексклюзивне викриття'"),
    (r"паніка в", "Паніка в...", "clickbait", "medium", "Спроба посіяти штучну тривожність"),
    (r"почалося(!|\?)*", "Почалося!", "clickbait", "high", "Алярмістський клікбейт без конкретики"),
    (r"\bshocking\b", "Shocking", "clickbait", "high", "Sensationalist clickbait indicator"),
    (r"you won't believe", "You won't believe", "clickbait", "high", "Clickbait curiosity gap"),
    (r"miracle cure", "Miracle cure", "clickbait", "high", "Pseudoscience clickbait claim"),
    (r"secret revealed", "Secret revealed", "clickbait", "medium", "Sensationalist reveal teaser"),
]

# Пропагандистські наративи та кремлівські штампи
PROPAGANDA_MARKERS = [
    (r"київськ(ий|ого|ому|им) режим(у|ом)?", "Київський режим", "propaganda", "high", "Кремлівський пропагандистський штамп"),
    (r"\bукронацист(и|ів|ам|ами)?\b", "Укронацисти", "propaganda", "high", "Кремлівська мова ворожнечі та дегуманізація"),
    (r"біолабораторі(ї|ях|й) нато", "Біолабораторії НАТО", "propaganda", "high", "Конспірологічний дезінформаційний наратив"),
    (r"\bанглосакс(и|ів|ам|ами)?\b", "Англосакси", "propaganda", "high", "Антизахідний конспірологічний ярлик"),
    (r"\bбрудн(а|ої|у) бомб(а|и|у)\b", "Брудна бомба", "propaganda", "high", "Дезінформація про радіаційну загрозу"),
    (r"\bзовнішн(є|ього) управлінн(я|ям)\b", "Зовнішнє управління", "propaganda", "medium", "Наратив про втрату суверенітету"),
    (r"\bкарател(і|ів|ям)\b", "Карателі", "propaganda", "high", "Дегуманізуючий пропагандистський термін"),
    (r"\bхунт(а|и|і|ою)\b", "Хунта", "propaganda", "high", "Пропагандистський штамп делегітимізації влади"),
]

# Емоційна та поляризуюча лексика (мова ворожнечі, паніка)
EMOTIONAL_MANIPULATION_PHRASES = [
    (r"\bбіомас(а|и|ою)\b", "Біомаса", "emotional", "high", "Зневажлива дегуманізація населення"),
    (r"тотальна катастрофа", "Тотальна катастрофа", "emotional", "medium", "Гіперболізоване нагнітання паніки"),
    (r"\bапокаліпсис\b", "Апокаліпсис", "emotional", "medium", "Есхатологічне залякування аудиторії"),
    (r"неминуча загибель", "Неминуча загибель", "emotional", "high", "Фаталістичне навіювання безпорадності"),
    (r"тотальний (крах|дефолт|голод)", "Тотальний крах/голод", "emotional", "high", "Штучна катастрофізація ситуації"),
    (r"суцільна зрада", "Суцільна зрада", "emotional", "low", "Поляризація суспільних настроїв"),
    (r"ганьба століття", "Ганьба століття", "emotional", "low", "Суб'єктивна емоційна оцінка замість фактів"),
]

# Анонімна або розмита атрибуція (відсутність фактів)
VAGUE_ATTRIBUTION_PHRASES = [
    (r"як стверджують експерти", "Як стверджують експерти", "attribution", "medium", "Розмита атрибуція без зазначення імен експертів"),
    (r"анонімні джерела (повідомили|заявили|кажуть)", "Анонімні джерела", "attribution", "medium", "Відсутність верифікованого авторства"),
    (r"у мережі спалахнула паніка", "У мережі спалахнула паніка", "attribution", "medium", "Узагальнення настроїв без репрезентативних даних"),
    (r"всім очевидно(,| що)", "Всім очевидно", "attribution", "low", "Когнітивне спотворення (апеляція до псевдоочевидності)"),
    (r"інсайдери розкрили", "Інсайдери розкрили", "attribution", "medium", "Псевдоінсайдерство без документальних свідчень"),
    (r"секретні дані", "Секретні дані", "attribution", "medium", "Маніпулювання грифом секретності для довіри"),
]

# Загальноприйняті абревіатури, які не вважаються надмірним CAPS LOCK
STANDARD_ACRONYMS = {
    "ЗСУ", "НАТО", "США", "ЄС", "РНБО", "ООН", "ГУР", "СБУ", "ППО", "ТЦК", "ДБР", "НАБУ", "МВС",
    "МОЗ", "МАГАТЕ", "МВФ", "ВПО", "УП", "ZN", "BBC", "CNN", "NPR", "DW", "AP", "AFP", "USA", "EU", "NATO", "UN", "IMF", "WHO"
}


class StylometryService:
    """Аналізатор стилометричних характеристик тексту, клікбейту та емоційних маніпуляцій."""

    def analyze(self, title: str, text: str = "") -> StylometryAnalysisResult:
        """Повний стилометричний аналіз заголовка та тексту новини."""
        triggers: List[StylometryTrigger] = []
        combined_text = f"{title}. {text}".strip()

        # 1. Аналіз клікбейт-фраз у заголовку та ліді
        clickbait_hits = 0
        for pattern, label, cat, sev, desc in CLICKBAIT_PHRASES:
            if re.search(pattern, title, flags=re.IGNORECASE):
                clickbait_hits += 1
                triggers.append(StylometryTrigger(text=label, category=cat, severity=sev, description=desc))

        # 2. Аналіз пропагандистських маркерів
        propaganda_hits = 0
        for pattern, label, cat, sev, desc in PROPAGANDA_MARKERS:
            if re.search(pattern, combined_text, flags=re.IGNORECASE):
                propaganda_hits += 1
                triggers.append(StylometryTrigger(text=label, category=cat, severity=sev, description=desc))

        # 3. Аналіз емоційної поляризації
        emotional_hits = 0
        for pattern, label, cat, sev, desc in EMOTIONAL_MANIPULATION_PHRASES:
            if re.search(pattern, combined_text, flags=re.IGNORECASE):
                emotional_hits += 1
                triggers.append(StylometryTrigger(text=label, category=cat, severity=sev, description=desc))

        # 4. Аналіз розмитої атрибуції
        attribution_hits = 0
        for pattern, label, cat, sev, desc in VAGUE_ATTRIBUTION_PHRASES:
            if re.search(pattern, combined_text, flags=re.IGNORECASE):
                attribution_hits += 1
                triggers.append(StylometryTrigger(text=label, category=cat, severity=sev, description=desc))

        # 5. Аналіз графічних та пунктуаційних аномалій (CAPS LOCK & !/?)
        excessive_punct = re.findall(r"(!{2,}|\?{2,}|\?!|!\?|\.{4,})", title)
        if excessive_punct:
            triggers.append(
                StylometryTrigger(
                    text="".join(excessive_punct),
                    category="typography",
                    severity="high" if any(len(p) >= 3 for p in excessive_punct) else "medium",
                    description="Аномальне використання знаків оклику/питання в заголовку для штучного нагнітання емоцій",
                )
            )

        # CAPS LOCK у заголовку
        words = re.findall(r"\b[A-Za-zА-Яа-яІіЇїЄєҐґ']+\b", title)
        upper_words = [w for w in words if len(w) >= 3 and w.isupper() and w not in STANDARD_ACRONYMS]
        caps_ratio = len(upper_words) / max(1, len(words))

        if len(upper_words) >= 2 or caps_ratio >= 0.25:
            triggers.append(
                StylometryTrigger(
                    text=", ".join(upper_words[:3]),
                    category="typography",
                    severity="high" if caps_ratio >= 0.4 else "medium",
                    description=f"Надмірний CAPS LOCK у заголовку ({len(upper_words)} слів), що порушує журналістські стандарти нейтральності",
                )
            )

        # Розрахунок балів (0 to 100)
        clickbait_score = min(100.0, clickbait_hits * 30.0 + (len(excessive_punct) * 20.0))
        emotional_score = min(100.0, emotional_hits * 35.0)
        manipulation_score = min(100.0, (propaganda_hits * 40.0) + (attribution_hits * 25.0) + (caps_ratio * 100.0 * 0.5))

        # Загальний штрафний бал з посиленим штрафом за ворожу пропаганду
        base_penalty = (clickbait_score * 0.40) + (emotional_score * 0.30) + (manipulation_score * 0.40)
        if propaganda_hits > 0:
            base_penalty += (propaganda_hits * 15.0)

        penalty = min(100.0, base_penalty)

        trust_index = max(0.0, round(100.0 - penalty, 1))

        if penalty <= 15.0:
            summary = "Нейтральний журналістський стиль"
        elif penalty <= 45.0:
            summary = "Помірні маніпулятивні ознаки (клікбейт/емоційність)"
        else:
            summary = "Високий ризик дезінформації та маніпуляцій"

        return StylometryAnalysisResult(
            clickbait_score=round(clickbait_score, 1),
            emotional_score=round(emotional_score, 1),
            manipulation_score=round(manipulation_score, 1),
            caps_lock_ratio=round(caps_ratio, 2),
            overall_penalty=round(penalty, 1),
            stylometry_trust_index=trust_index,
            summary_verdict=summary,
            triggers=triggers,
        )


stylometry_service = StylometryService()
