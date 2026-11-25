"""
Сервіс семантичної крос-верифікації новин між незалежними ЗМІ та векторного пошуку
в базі фактчеків через PostgreSQL `pgvector` (Тиждень 4, Дні 2–3).

Реалізує:
1. Пошук семантично споріднених публікацій про ту саму подію від інших незалежних медіа-агентств
   за допомогою оператора косинусної відстані `<=>` у `pgvector` (та fallback-режиму для SQLite).
2. Розумний розрахунок індексу крос-верифікації (`corroboration_score`) з урахуванням кількості
   незалежних доменів та їхнього статусу в Білому списку ІМІ.
3. Семантичний пошук перефразованих фейків у базі спростувань StopFake та VoxCheck (`fact_check_claims`).
"""

import logging
import re
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Set, Tuple

from pydantic import BaseModel, Field
from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.article import Article
from app.models.claim import FactCheckClaim
from app.services.embedding_service import embedding_service
from app.services.factcheck_service import clean_html_text, is_specific_debunked_claim
from app.services.reputation_service import reputation_service

logger = logging.getLogger(__name__)

STOPWORDS_UA_EN: Set[str] = {
    "що", "як", "та", "на", "не", "до", "про", "для", "від", "або", "але", "вже", "під",
    "при", "після", "через", "його", "вони", "буде", "були", "було", "який", "яка", "яке",
    "які", "цього", "цьому", "також", "лише", "більше", "може", "року", "році", "день",
    "час", "the", "and", "that", "with", "from", "this", "for", "are", "was", "were",
    "have", "has", "had", "will", "would", "about", "into", "over", "after", "змі",
    "повідомляє", "заявив", "заявила", "стало", "відомо", "можуть", "треба", "перед",
    "проти", "між", "над", "тому", "коли", "якщо", "щоб", "цього", "вона", "вони",
}

# Широкі фонові слова, які мають нижчий пріоритет при виборі якорів пошуку в SQL
BROAD_ANCHOR_STEMS: Set[str] = {
    "україн", "росій", "росія", "зелен", "прези", "волод", "путін", "трамп",
    "київ", "києв", "війн", "облас", "міста", "країн", "світ", "нові", "новий",
    "нових", "новин", "зсу", "сша", "європ", "після", "через", "проти", "заяв",
}


class CorroboratingArticleItem(BaseModel):
    id: int
    title: str
    url: str
    source_name: str
    domain: str
    category: str = "Загальне"
    published_at: Optional[datetime] = None
    trust_score: float = 80.0
    verdict: str = "Verified"
    similarity: float = Field(..., description="Семантична подібність (0..1)")
    is_whitelisted_source: bool = False


class SemanticFactCheckHit(BaseModel):
    id: int
    claim: str
    fact_checker: str
    rating: str
    explanation: Optional[str] = None
    review_url: Optional[str] = None
    similarity: float = Field(..., description="Семантична подібність (0..1)")


class CorroborationResult(BaseModel):
    corroboration_score: float
    independent_sources_count: int = 0
    whitelisted_sources_count: int = 0
    corroboration_status: str  # "confirmed_multi", "confirmed_single", "neutral_fresh", "isolated_suspicious"
    summary: str
    related_articles: List[CorroboratingArticleItem] = Field(default_factory=list)


class CrossVerificationService:
    """Сервіс семантичної крос-верифікації новин і фактчеків на базі pgvector."""

    @staticmethod
    def _extract_content_stems(text_val: str) -> Set[str]:
        tokens = re.findall(r"[\w\u0400-\u04ff]{4,}", text_val.lower())
        stems: Set[str] = set()
        for tok in tokens:
            if tok in STOPWORDS_UA_EN or tok.isdigit():
                continue
            # Використовуємо префікс (перші 5-6 символів слова) для морфологічної інваріантності укр. відмінків
            stems.add(tok[:6] if len(tok) >= 6 else tok)
        return stems

    @classmethod
    def _lexical_stem_similarity(cls, text_a: str, text_b: str) -> float:
        stems_a = cls._extract_content_stems(text_a)
        stems_b = cls._extract_content_stems(text_b)
        if not stems_a or not stems_b:
            return 0.0
        inter = len(stems_a & stems_b)
        # Для підтвердження тієї самої події потрібно щонайменше 2 спільних змістовних корені
        if inter < 2:
            return 0.0
        denom = max(3, min(len(stems_a), len(stems_b)))
        overlap = inter / float(denom)
        jaccard = inter / float(len(stems_a | stems_b))
        return round(0.65 * overlap + 0.35 * jaccard, 4)

    @classmethod
    def _extract_title_anchors(cls, title: str, max_anchors: int = 5) -> List[str]:
        """
        Виділяє 3–5 найспецифічніших якорів (брендів, власних назв, ключових коренів) із заголовка
        для гібридного SQL-відбору кандидатів, щоб OOV-сутності (напр. Nvidia, Хуанг)
        гарантовано потрапляли на MiniLM-переранжування.
        """
        clean_t = clean_html_text(title)
        raw_tokens = re.findall(r"[A-Za-z0-9\u0400-\u04ff'-]{3,}", clean_t)
        scored: Dict[str, int] = {}

        for idx, tok in enumerate(raw_tokens):
            low = tok.lower().strip("'-")
            if len(low) < 3 or low in STOPWORDS_UA_EN or low.isdigit():
                continue

            is_latin = bool(re.match(r"^[a-z][a-z0-9-]{2,}$", low))
            is_upper_inner = idx > 0 and tok[0].isupper() and len(low) >= 4
            is_all_caps = tok.isupper() and len(low) >= 3

            # Для кирилиці беремо основу (5–6 символів), щоб ловити всі відмінки
            if is_latin:
                anchor = low
            else:
                if len(low) < 4:
                    continue
                anchor = low[:6] if len(low) >= 7 else (low[:5] if len(low) >= 6 else low)

            is_broad = anchor in BROAD_ANCHOR_STEMS or any(
                anchor.startswith(b) for b in BROAD_ANCHOR_STEMS if len(b) >= 5
            )

            priority = 1
            if is_latin:
                priority = 10
            elif is_all_caps and not is_broad:
                priority = 9
            elif is_upper_inner and not is_broad:
                priority = 8
            elif not is_broad and len(low) >= 6:
                priority = 6
            elif not is_broad:
                priority = 4
            elif is_upper_inner:
                priority = 2

            if anchor not in scored or priority > scored[anchor]:
                scored[anchor] = priority

        ranked = sorted(scored.items(), key=lambda kv: (-kv[1], -len(kv[0])))
        return [k for k, _ in ranked[:max_anchors]]

    @staticmethod
    def _time_proximity_adjustment(
        ref_dt: Optional[datetime], cand_dt: Optional[datetime]
    ) -> float:
        """Бонус за збіг у часі (±3/±7 днів) та штраф для віддалених подій (>14–21 днів)."""
        if ref_dt is None or cand_dt is None:
            return 0.0
        try:
            r = ref_dt if ref_dt.tzinfo else ref_dt.replace(tzinfo=timezone.utc)
            c = cand_dt if cand_dt.tzinfo else cand_dt.replace(tzinfo=timezone.utc)
            days_diff = abs((r - c).total_seconds()) / 86400.0
            if days_diff <= 3.0:
                return 0.05
            if days_diff <= 7.0:
                return 0.02
            if days_diff <= 14.0:
                return 0.0
            if days_diff <= 21.0:
                return -0.04
            return -0.08
        except Exception:
            return 0.0

    async def corroborate_article(
        self,
        title: str,
        text_body: str = "",
        source_domain: str = "",
        is_whitelisted: bool = False,
        ml_authenticity_score: float = 80.0,
        stylometry_score: float = 80.0,
        db: Optional[AsyncSession] = None,
        exclude_article_id: Optional[int] = None,
        max_related: int = 6,
        reference_published_at: Optional[datetime] = None,
    ) -> CorroborationResult:
        """
        Гібридна крос-верифікація події по незалежних українських ЗМІ:
        1. Канал 1: векторний пошук pgvector (HNSW, <=>) — топ-35 семантичних сусідів.
        2. Канал 2: пошук за специфічними сутностями/якорями заголовка в SQL — топ-45 кандидатів.
        3. Пакетне нейромережеве переранжування MiniLM-L12-v2 + лексична близькість + часова близькість.
        4. Повертає до `max_related` (6) найкращих збігів від різних незалежних ЗМІ за спаданням % схожості.
        """
        clean_q_title = clean_html_text(title)
        clean_q_body = clean_html_text(text_body[:1000])
        norm_src_domain = reputation_service.normalize_domain(source_domain) if source_domain else ""
        query_combined = f"{clean_q_title}. {clean_q_body}"
        query_vec = embedding_service.encode(clean_q_title, clean_q_body)
        title_anchors = self._extract_title_anchors(clean_q_title, max_anchors=5)

        candidates_by_id: Dict[int, Dict[str, Any]] = {}

        if db is not None:
            bind = db.get_bind()
            dialect = bind.dialect.name.lower()

            # 1. Гібридний пошук у PostgreSQL (pgvector + Entity/Anchor SQL Recall)
            if "postgresql" in dialect:
                excl_val = int(exclude_article_id) if exclude_article_id is not None else -1
                vec_literal = embedding_service.to_pgvector_str(query_vec)

                # Канал 1: pgvector HNSW
                try:
                    sql_vec = text(
                        """
                        SELECT id, title, url, source_name, domain, category,
                               published_at, trust_score, verdict, LEFT(COALESCE(summary, ''), 320) AS summary_short,
                               1 - (embedding <=> CAST(:vec AS vector)) AS vec_sim
                        FROM articles
                        WHERE language = 'ua'
                          AND embedding IS NOT NULL
                          AND id != :excl_id
                        ORDER BY embedding <=> CAST(:vec AS vector) ASC
                        LIMIT 35
                        """
                    )
                    rows = (await db.execute(sql_vec, {"vec": vec_literal, "excl_id": excl_val})).mappings().all()
                    for r in rows:
                        cand_domain = reputation_service.normalize_domain(str(r["domain"] or ""))
                        if norm_src_domain and cand_domain == norm_src_domain:
                            continue
                        aid = int(r["id"])
                        c_title = clean_html_text(str(r["title"] or ""))
                        c_sum = clean_html_text(str(r["summary_short"] or ""))
                        candidates_by_id[aid] = {
                            "id": aid,
                            "title": c_title,
                            "url": str(r["url"]),
                            "source_name": str(r["source_name"]),
                            "domain": cand_domain or str(r["domain"]),
                            "category": str(r["category"] or "Загальне"),
                            "published_at": r["published_at"],
                            "trust_score": float(r["trust_score"] or 80.0),
                            "verdict": str(r["verdict"] or "Verified"),
                            "summary": c_sum,
                            "vec_sim": max(0.0, min(1.0, float(r["vec_sim"] or 0.0))),
                        }
                except Exception as e:
                    logger.debug("Помилка векторного каналу pgvector: %s", e)
                    try:
                        await db.rollback()
                    except Exception:
                        pass

                # Канал 2: SQL Entity/Keyword Anchor Recall (знаходить точні події з власними назвами типу Nvidia/Хуанг)
                if title_anchors:
                    try:
                        like_clauses = []
                        score_clauses = []
                        params: Dict[str, Any] = {
                            "excl_id": excl_val,
                            "vec": vec_literal,
                        }
                        for i, anc in enumerate(title_anchors):
                            p_name = f"anc_{i}"
                            params[p_name] = f"%{anc}%"
                            like_clauses.append(f"title ILIKE :{p_name}")
                            weight = 2 if i < 2 else 1
                            score_clauses.append(f"(CASE WHEN title ILIKE :{p_name} THEN {weight} ELSE 0 END)")

                        where_src = ""
                        if norm_src_domain:
                            params["src_dom"] = norm_src_domain
                            where_src = "AND LOWER(domain) != :src_dom"

                        order_time = "published_at DESC"
                        if reference_published_at is not None:
                            params["ref_dt"] = reference_published_at
                            order_time = "ABS(EXTRACT(EPOCH FROM (published_at - :ref_dt))) ASC"

                        sql_anc = text(
                            f"""
                            SELECT id, title, url, source_name, domain, category,
                                   published_at, trust_score, verdict, LEFT(COALESCE(summary, ''), 320) AS summary_short,
                                   CASE WHEN embedding IS NOT NULL
                                        THEN 1 - (embedding <=> CAST(:vec AS vector))
                                        ELSE 0.0 END AS vec_sim,
                                   ({' + '.join(score_clauses)}) AS anchor_score
                            FROM articles
                            WHERE language = 'ua'
                              AND id != :excl_id
                              {where_src}
                              AND ({' OR '.join(like_clauses)})
                            ORDER BY anchor_score DESC, {order_time}
                            LIMIT 45
                            """
                        )
                        anc_rows = (await db.execute(sql_anc, params)).mappings().all()
                        for r in anc_rows:
                            cand_domain = reputation_service.normalize_domain(str(r["domain"] or ""))
                            if norm_src_domain and cand_domain == norm_src_domain:
                                continue
                            aid = int(r["id"])
                            if aid in candidates_by_id:
                                continue
                            c_title = clean_html_text(str(r["title"] or ""))
                            c_sum = clean_html_text(str(r["summary_short"] or ""))
                            candidates_by_id[aid] = {
                                "id": aid,
                                "title": c_title,
                                "url": str(r["url"]),
                                "source_name": str(r["source_name"]),
                                "domain": cand_domain or str(r["domain"]),
                                "category": str(r["category"] or "Загальне"),
                                "published_at": r["published_at"],
                                "trust_score": float(r["trust_score"] or 80.0),
                                "verdict": str(r["verdict"] or "Verified"),
                                "summary": c_sum,
                                "vec_sim": max(0.0, min(1.0, float(r["vec_sim"] or 0.0))),
                            }
                    except Exception as e:
                        logger.debug("Помилка якірного SQL-каналу крос-верифікації: %s", e)
                        try:
                            await db.rollback()
                        except Exception:
                            pass

            # 2. Резервний пошук (для SQLite у тестах або якщо векторні стовпці порожні)
            if not candidates_by_id:
                try:
                    stmt = select(Article).where(Article.language == "ua").order_by(Article.published_at.desc()).limit(120)
                    db_articles = (await db.execute(stmt)).scalars().all()
                    for a in db_articles:
                        if exclude_article_id is not None and a.id == exclude_article_id:
                            continue
                        cand_domain = reputation_service.normalize_domain(a.domain or "")
                        if norm_src_domain and cand_domain == norm_src_domain:
                            continue
                        c_title = clean_html_text(a.title)
                        c_sum = clean_html_text((a.summary or a.full_text or "")[:320])
                        cand_vec = embedding_service.encode(c_title, c_sum)
                        vec_sim = embedding_service.cosine_similarity(query_vec, cand_vec)
                        candidates_by_id[a.id] = {
                            "id": a.id,
                            "title": c_title,
                            "url": a.url,
                            "source_name": a.source_name,
                            "domain": cand_domain or a.domain,
                            "category": a.category or "Загальне",
                            "published_at": a.published_at,
                            "trust_score": float(a.trust_score or 80.0),
                            "verdict": a.verdict or "Verified",
                            "summary": c_sum,
                            "vec_sim": vec_sim,
                        }
                except Exception as e:
                    logger.warning("Помилка резервного пошуку крос-верифікації: %s", e)
                    try:
                        await db.rollback()
                    except Exception:
                        pass

        # 3. Обчислюємо лексичну схожість і кількість спільних якорів для всіх кандидатів
        candidates: List[Dict[str, Any]] = []
        for c in candidates_by_id.values():
            c_title_low = c["title"].lower()
            cand_text = f"{c['title']}. {c['summary']}"
            lex_body = self._lexical_stem_similarity(query_combined, cand_text)
            lex_title = self._lexical_stem_similarity(clean_q_title, c["title"])
            anchor_hits = sum(1 for anc in title_anchors if anc in c_title_low)
            time_adj = self._time_proximity_adjustment(reference_published_at, c["published_at"])
            pre_score = (
                0.50 * c["vec_sim"]
                + 0.35 * max(lex_title, lex_body)
                + 0.08 * min(3, anchor_hits)
                + time_adj
            )
            c["lex_sim"] = lex_body
            c["lex_title"] = lex_title
            c["anchor_hits"] = anchor_hits
            c["time_adj"] = time_adj
            c["pre_score"] = pre_score
            c["similarity"] = round(max(0.0, min(0.99, 0.62 * c["vec_sim"] + 0.38 * max(lex_title, lex_body) + time_adj)), 4)
            c["neural_sim"] = None
            candidates.append(c)

        candidates.sort(key=lambda x: x["pre_score"], reverse=True)
        rerank_pool = candidates[:40]

        # 4. Пакетне нейромережеве переранжування топ-40 кандидатів через MiniLM-L12-v2
        minilm_used = False
        if rerank_pool:
            q_minilm = embedding_service.encode_minilm_384(clean_q_title)
            if q_minilm is not None:
                cand_vecs = embedding_service.encode_minilm_384_batch([c["title"] for c in rerank_pool])
                if cand_vecs is not None:
                    minilm_used = True
                    for c, c_vec in zip(rerank_pool, cand_vecs):
                        if c_vec is None:
                            continue
                        nsim = max(0.0, min(1.0, float(c_vec @ q_minilm)))
                        c["neural_sim"] = nsim
                        lex_best = max(c["lex_title"], c["lex_sim"])
                        entity_bonus = 0.05 if c["anchor_hits"] >= 2 else (0.02 if c["anchor_hits"] == 1 else 0.0)
                        combined = (
                            0.72 * nsim
                            + 0.16 * lex_best
                            + 0.12 * c["vec_sim"]
                            + entity_bonus
                            + c["time_adj"]
                        )
                        c["similarity"] = round(max(0.0, min(0.99, combined)), 4)

        # 5. Суворе сортування за спаданням % схожості та дедуплікація по 1 найкращій статті на незалежне ЗМІ
        rerank_pool.sort(key=lambda x: x["similarity"], reverse=True)
        seen_domains: Set[str] = set()
        matched_items: List[CorroboratingArticleItem] = []

        for c in rerank_pool:
            lex_best = max(c["lex_title"], c["lex_sim"])
            if minilm_used and c["neural_sim"] is not None:
                nsim = float(c["neural_sim"])
                # Проходить, якщо MiniLM підтверджує ту саму подію + є спільні сутності/контекст
                passes = (
                    (nsim >= 0.47 and c["anchor_hits"] >= 1 and (lex_best >= 0.16 or nsim >= 0.56))
                    or (nsim >= 0.64 and c["similarity"] >= 0.50)
                    or (c["similarity"] >= 0.50 and lex_best >= 0.22)
                )
                if not passes or c["similarity"] < 0.42:
                    continue
            else:
                if lex_best < 0.20 or c["similarity"] < 0.38:
                    continue

            dom = c["domain"]
            if dom in seen_domains:
                continue
            seen_domains.add(dom)

            rep = reputation_service.get_reputation(dom)
            is_wl = bool(rep.is_whitelisted or c["trust_score"] >= 80.0)
            matched_items.append(
                CorroboratingArticleItem(
                    id=c["id"],
                    title=c["title"],
                    url=c["url"],
                    source_name=c["source_name"],
                    domain=dom,
                    category=c["category"],
                    published_at=c["published_at"],
                    trust_score=round(c["trust_score"], 1),
                    verdict=c["verdict"],
                    similarity=round(min(0.99, c["similarity"]), 3),
                    is_whitelisted_source=is_wl,
                )
            )
            if len(matched_items) >= max_related:
                break

        indep_count = len(matched_items)
        wl_count = sum(1 for m in matched_items if m.is_whitelisted_source)

        # Розрахунок індексу крос-верифікації за узгодженим правилом
        if wl_count >= 2:
            top_sim = matched_items[0].similarity if matched_items else 0.6
            score = min(98.5, round(90.0 + (wl_count * 2.0) + (top_sim * 4.0), 1))
            sources_str = ", ".join(m.source_name for m in matched_items[:3])
            summary_text = (
                f"Висока узгодженість між джерелами ({score}%): тему незалежно висвітлюють "
                f"ще {wl_count} редакцій ({sources_str})."
                if top_sim >= 0.72
                else f"Знайдено {wl_count} споріднених публікацій за темою в інших ЗМІ ({sources_str}), "
                f"індекс узгодженості — {score}%."
            )
            return CorroborationResult(
                corroboration_score=score,
                independent_sources_count=indep_count,
                whitelisted_sources_count=wl_count,
                corroboration_status="confirmed_multi",
                summary=summary_text,
                related_articles=matched_items,
            )

        if wl_count == 1:
            top_match = matched_items[0]
            score = round(84.0 + min(6.0, top_match.similarity * 8.0), 1)
            sim_pct = int(round(top_match.similarity * 100))
            summary_text = (
                f"Схожу публікацію за цією темою знайдено у виданні «{top_match.source_name}» "
                f"(схожість {sim_pct}%, оцінка узгодженості — {score}%)."
                if top_match.similarity >= 0.72
                else f"Знайдено споріднений матеріал за темою у виданні «{top_match.source_name}» "
                f"(схожість {sim_pct}%)."
            )
            return CorroborationResult(
                corroboration_score=score,
                independent_sources_count=indep_count,
                whitelisted_sources_count=1,
                corroboration_status="confirmed_single",
                summary=summary_text,
                related_articles=matched_items,
            )

        if indep_count >= 1:
            score = 72.0
            return CorroborationResult(
                corroboration_score=score,
                independent_sources_count=indep_count,
                whitelisted_sources_count=0,
                corroboration_status="confirmed_single",
                summary=f"Знайдено {indep_count} споріднених публікацій в інших редакціях (оцінка узгодженості — {score}%).",
                related_articles=matched_items,
            )

        # Якщо дублів у базі за останні години ще немає:
        # для перевірених ЗМІ або спокійних інформаційних новин даємо нейтральні 78% без штрафу
        if is_whitelisted or (ml_authenticity_score >= 70.0 and stylometry_score >= 72.0):
            score = 78.0 if not is_whitelisted else 84.0
            return CorroborationResult(
                corroboration_score=score,
                independent_sources_count=0,
                whitelisted_sources_count=0,
                corroboration_status="neutral_fresh",
                summary=(
                    f"Свіжа або ексклюзивна публікація ({score}%): схожих матеріалів в інших редакціях поки не зафіксовано, "
                    "ознак ізольованого вкиду немає."
                ),
                related_articles=[],
            )

        # Сумнівний або сенсаційний вкид без жодного підтвердження в якісних ЗМІ
        score = max(22.0, min(42.0, round(ml_authenticity_score * 0.35 + stylometry_score * 0.25, 1)))
        return CorroborationResult(
            corroboration_score=score,
            independent_sources_count=0,
            whitelisted_sources_count=0,
            corroboration_status="isolated_suspicious",
            summary=(
                f"Низький рівень підтвердження ({score}%): жодне перевірене ЗМІ "
                "не публікувало матеріалів на цю сенсаційну тему."
            ),
            related_articles=[],
        )

    async def find_semantic_factchecks(
        self,
        title: str,
        text_body: str = "",
        db: Optional[AsyncSession] = None,
        top_k: int = 3,
    ) -> List[SemanticFactCheckHit]:
        """
        Виконує високоточний семантичний пошук у таблиці `fact_check_claims` (StopFake, VoxCheck)
        через `pgvector` (<=>) із обов'язковим переранжуванням MiniLM-L12-v2 та фільтром конкретних фейків.
        """
        if db is None:
            return []

        clean_q_title = clean_html_text(title)
        clean_q_body = clean_html_text(text_body[:1000])
        query_combined = f"{clean_q_title}. {clean_q_body}"
        query_vec = embedding_service.encode(clean_q_title, clean_q_body)
        raw_candidates: List[Dict[str, Any]] = []

        bind = db.get_bind()
        dialect = bind.dialect.name.lower()

        if "postgresql" in dialect:
            try:
                vec_literal = embedding_service.to_pgvector_str(query_vec)
                sql = text(
                    """
                    SELECT id, claim, fact_checker, rating, explanation, review_url,
                           1 - (embedding <=> CAST(:vec AS vector)) AS vec_sim
                    FROM fact_check_claims
                    WHERE embedding IS NOT NULL
                    ORDER BY embedding <=> CAST(:vec AS vector) ASC
                    LIMIT 15
                    """
                )
                rows = (await db.execute(sql, {"vec": vec_literal})).mappings().all()
                for r in rows:
                    claim_str = clean_html_text(str(r["claim"] or ""))
                    expl_str = clean_html_text(str(r["explanation"] or ""))
                    if not is_specific_debunked_claim(claim_str, expl_str):
                        continue
                    raw_candidates.append(
                        {
                            "id": int(r["id"]),
                            "claim": claim_str,
                            "fact_checker": str(r["fact_checker"]),
                            "rating": str(r["rating"]),
                            "explanation": expl_str or None,
                            "review_url": str(r["review_url"]) if r["review_url"] else None,
                            "vec_sim": max(0.0, min(1.0, float(r["vec_sim"] or 0.0))),
                        }
                    )
            except Exception as e:
                logger.debug("Резервний пошук у fact_check_claims: %s", e)
                try:
                    await db.rollback()
                except Exception:
                    pass

        if not raw_candidates:
            try:
                from app.services.factcheck_service import fact_check_service

                cached_claims = await fact_check_service._get_cached_claims(db)
                for c in cached_claims:
                    claim_str = clean_html_text(c.claim)
                    expl_str = clean_html_text(c.explanation or "")
                    if not is_specific_debunked_claim(claim_str, expl_str):
                        continue
                    cand_vec = embedding_service.encode(claim_str, expl_str)
                    vec_sim = embedding_service.cosine_similarity(query_vec, cand_vec)
                    raw_candidates.append(
                        {
                            "id": c.id,
                            "claim": claim_str,
                            "fact_checker": c.fact_checker,
                            "rating": c.rating,
                            "explanation": expl_str or None,
                            "review_url": c.review_url,
                            "vec_sim": vec_sim,
                        }
                    )
            except Exception as e:
                logger.debug("Помилка резервного пошуку fact_check_claims: %s", e)
                try:
                    await db.rollback()
                except Exception:
                    pass

        if not raw_candidates:
            return []

        raw_candidates.sort(key=lambda x: x["vec_sim"], reverse=True)
        pool = raw_candidates[:15]

        hits: List[SemanticFactCheckHit] = []
        q_minilm = embedding_service.encode_minilm_384(clean_q_title)
        c_minilm_list = (
            embedding_service.encode_minilm_384_batch([c["claim"] for c in pool])
            if q_minilm is not None
            else None
        )

        for idx, c in enumerate(pool):
            lex_title = self._lexical_stem_similarity(clean_q_title, c["claim"])
            lex_all = self._lexical_stem_similarity(query_combined, f"{c['claim']}. {(c['explanation'] or '')[:400]}")
            lex_best = max(lex_title, lex_all)

            if q_minilm is not None and c_minilm_list is not None and c_minilm_list[idx] is not None:
                nsim = max(0.0, min(1.0, float(c_minilm_list[idx] @ q_minilm)))
                # Високий поріг MiniLM, щоб не підмішувати випадкові статті з подібною темою
                if nsim < 0.70 or (nsim < 0.78 and lex_best < 0.25):
                    continue
                final_sim = round(min(0.99, 0.72 * nsim + 0.18 * lex_best + 0.10 * c["vec_sim"]), 3)
            else:
                hybrid_sim = 0.55 * c["vec_sim"] + 0.45 * lex_best
                if hybrid_sim < 0.58 or lex_best < 0.35:
                    continue
                final_sim = round(min(0.99, hybrid_sim), 3)

            hits.append(
                SemanticFactCheckHit(
                    id=c["id"],
                    claim=c["claim"],
                    fact_checker=c["fact_checker"],
                    rating=c["rating"],
                    explanation=c["explanation"],
                    review_url=c["review_url"],
                    similarity=final_sim,
                )
            )

        hits.sort(key=lambda x: x.similarity, reverse=True)
        return hits[:top_k]


cross_verification_service = CrossVerificationService()

