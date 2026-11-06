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
from datetime import datetime
from typing import Any, Dict, List, Optional, Set

from pydantic import BaseModel, Field
from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.article import Article
from app.models.claim import FactCheckClaim
from app.services.embedding_service import embedding_service
from app.services.reputation_service import reputation_service

logger = logging.getLogger(__name__)

STOPWORDS_UA_EN: Set[str] = {
    "що", "як", "та", "на", "не", "до", "про", "для", "від", "або", "але", "вже", "під",
    "при", "після", "через", "його", "вони", "буде", "були", "було", "який", "яка", "яке",
    "які", "цього", "цьому", "також", "лише", "більше", "може", "року", "році", "день",
    "час", "the", "and", "that", "with", "from", "this", "for", "are", "was", "were",
    "have", "has", "had", "will", "would", "about", "into", "over", "after",
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
        max_related: int = 5,
    ) -> CorroborationResult:
        """
        Шукає семантично близькі публікації в інших незалежних ЗМІ через `pgvector`
        та обчислює індекс крос-верифікації `corroboration_score`.
        """
        norm_src_domain = reputation_service.normalize_domain(source_domain) if source_domain else ""
        query_combined = f"{title}. {text_body[:1000]}"
        query_vec = embedding_service.encode(title, text_body)

        candidates: List[Dict[str, Any]] = []

        if db is not None:
            bind = db.get_bind()
            dialect = bind.dialect.name.lower()

            # 1. Спроба швидкого векторного пошуку через PostgreSQL pgvector (<=>)
            if "postgresql" in dialect:
                try:
                    vec_literal = embedding_service.to_pgvector_str(query_vec)
                    excl_val = int(exclude_article_id) if exclude_article_id is not None else -1
                    sql = text(
                        """
                        SELECT id, title, url, source_name, domain, category,
                               published_at, trust_score, verdict, summary,
                               1 - (embedding <=> CAST(:vec AS vector)) AS vec_sim
                        FROM articles
                        WHERE embedding IS NOT NULL
                          AND id != :excl_id
                        ORDER BY embedding <=> CAST(:vec AS vector) ASC
                        LIMIT 35
                        """
                    )
                    res = await db.execute(
                        sql,
                        {
                            "vec": vec_literal,
                            "excl_id": excl_val,
                        },
                    )
                    rows = res.mappings().all()
                    for r in rows:
                        cand_domain = reputation_service.normalize_domain(str(r["domain"] or ""))
                        if norm_src_domain and cand_domain == norm_src_domain:
                            continue
                        cand_text = f"{r['title']}. {r.get('summary') or ''}"
                        lex_sim = self._lexical_stem_similarity(query_combined, cand_text)
                        vec_sim = max(0.0, min(1.0, float(r["vec_sim"] or 0.0)))
                        hybrid_sim = round(0.62 * vec_sim + 0.38 * lex_sim, 4)
                        candidates.append(
                            {
                                "id": int(r["id"]),
                                "title": str(r["title"]),
                                "url": str(r["url"]),
                                "source_name": str(r["source_name"]),
                                "domain": cand_domain or str(r["domain"]),
                                "category": str(r["category"] or "Загальне"),
                                "published_at": r["published_at"],
                                "trust_score": float(r["trust_score"] or 80.0),
                                "verdict": str(r["verdict"] or "Verified"),
                                "similarity": hybrid_sim,
                                "lex_sim": lex_sim,
                                "vec_sim": vec_sim,
                            }
                        )
                except Exception as e:
                    logger.debug("Перехід на резервний семантичний пошук (pgvector ще не заповнено): %s", e)
                    try:
                        await db.rollback()
                    except Exception:
                        pass

            # 2. Резервний пошук (для SQLite у тестах або якщо векторні стовпці порожні)
            if not candidates:
                try:
                    stmt = select(Article).order_by(Article.published_at.desc()).limit(120)
                    db_articles = (await db.execute(stmt)).scalars().all()
                    for a in db_articles:
                        if exclude_article_id is not None and a.id == exclude_article_id:
                            continue
                        cand_domain = reputation_service.normalize_domain(a.domain or "")
                        if norm_src_domain and cand_domain == norm_src_domain:
                            continue
                        cand_body = a.summary or a.full_text or ""
                        cand_vec = embedding_service.encode(a.title, cand_body)
                        vec_sim = embedding_service.cosine_similarity(query_vec, cand_vec)
                        lex_sim = self._lexical_stem_similarity(query_combined, f"{a.title}. {cand_body}")
                        hybrid_sim = round(0.62 * vec_sim + 0.38 * lex_sim, 4)
                        candidates.append(
                            {
                                "id": a.id,
                                "title": a.title,
                                "url": a.url,
                                "source_name": a.source_name,
                                "domain": cand_domain or a.domain,
                                "category": a.category or "Загальне",
                                "published_at": a.published_at,
                                "trust_score": float(a.trust_score or 80.0),
                                "verdict": a.verdict or "Verified",
                                "similarity": hybrid_sim,
                                "lex_sim": lex_sim,
                                "vec_sim": vec_sim,
                            }
                        )
                except Exception as e:
                    logger.warning("Помилка резервного пошуку крос-верифікації: %s", e)
                    try:
                        await db.rollback()
                    except Exception:
                        pass

        # Фільтруємо та дедуплікуємо за доменом, щоб кожне незалежне медіа враховувалося один раз
        candidates.sort(key=lambda x: x["similarity"], reverse=True)

        # Нейромережеве переранжування топ-кандидатів за допомогою paraphrase-multilingual-MiniLM-L12-v2
        for c in candidates[:10]:
            if c["lex_sim"] >= 0.15 or c["vec_sim"] >= 0.32:
                neural_sim = embedding_service.neural_semantic_similarity(
                    query_combined[:450], c["title"]
                )
                if neural_sim is not None:
                    c["similarity"] = round(
                        0.45 * c["vec_sim"] + 0.30 * neural_sim + 0.25 * c["lex_sim"], 4
                    )

        candidates.sort(key=lambda x: x["similarity"], reverse=True)
        seen_domains: Set[str] = set()
        matched_items: List[CorroboratingArticleItem] = []

        for c in candidates:
            # Поріг семантичної спорідненості події та спільних ключових сутностей (щонайменше 2 спільні корені)
            if c["lex_sim"] < 0.20 or c["similarity"] < 0.38:
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
            return CorroborationResult(
                corroboration_score=score,
                independent_sources_count=indep_count,
                whitelisted_sources_count=wl_count,
                corroboration_status="confirmed_multi",
                summary=(
                    f"Високий рівень крос-верифікації ({score}%): інформацію незалежно висвітлюють "
                    f"{wl_count} авторитетних ЗМІ ({sources_str})."
                ),
                related_articles=matched_items,
            )

        if wl_count == 1:
            top_match = matched_items[0]
            score = round(84.0 + min(6.0, top_match.similarity * 8.0), 1)
            return CorroborationResult(
                corroboration_score=score,
                independent_sources_count=indep_count,
                whitelisted_sources_count=1,
                corroboration_status="confirmed_single",
                summary=(
                    f"Крос-верифікація підтверджена ({score}%): споріднену публікацію знайдено "
                    f"в авторитетному виданні «{top_match.source_name}» (схожість {top_match.similarity * 100:.0f}%)."
                ),
                related_articles=matched_items,
            )

        if indep_count >= 1:
            score = 72.0
            return CorroborationResult(
                corroboration_score=score,
                independent_sources_count=indep_count,
                whitelisted_sources_count=0,
                corroboration_status="confirmed_single",
                summary=f"Знайдено {indep_count} споріднених публікацій в інших джерелах ({score}%).",
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
                    f"Свіжа або ексклюзивна публікація ({score}%): прямих дублікатів в інших стрічках ще не зафіксовано, "
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
                f"Низький рівень крос-верифікації ({score}%): жодне авторитетне ЗМІ з Білого списку ІМІ "
                "не підтверджує цей сенсаційний інфопривід."
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
        Виконує семантичний пошук у таблиці `fact_check_claims` (StopFake, VoxCheck)
        за допомогою `pgvector` (<=>) та морфологічного перетину для виявлення перефразованих фейків.
        """
        if db is None:
            return []

        query_combined = f"{title}. {text_body[:1000]}"
        query_vec = embedding_service.encode(title, text_body)
        hits: List[SemanticFactCheckHit] = []

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
                    claim_str = str(r["claim"] or "")
                    expl_str = str(r["explanation"] or "")
                    lex_sim = self._lexical_stem_similarity(query_combined, f"{claim_str}. {expl_str[:400]}")
                    vec_sim = max(0.0, min(1.0, float(r["vec_sim"] or 0.0)))
                    hybrid_sim = round(0.55 * vec_sim + 0.45 * lex_sim, 4)
                    if hybrid_sim >= 0.36 or lex_sim >= 0.30:
                        hits.append(
                            SemanticFactCheckHit(
                                id=int(r["id"]),
                                claim=claim_str,
                                fact_checker=str(r["fact_checker"]),
                                rating=str(r["rating"]),
                                explanation=expl_str or None,
                                review_url=str(r["review_url"]) if r["review_url"] else None,
                                similarity=round(min(0.99, hybrid_sim), 3),
                            )
                        )
            except Exception as e:
                logger.debug("Резервний пошук у fact_check_claims: %s", e)
                try:
                    await db.rollback()
                except Exception:
                    pass

        if not hits:
            try:
                claims = (await db.execute(select(FactCheckClaim).limit(200))).scalars().all()
                for c in claims:
                    expl_str = c.explanation or ""
                    cand_vec = embedding_service.encode(c.claim, expl_str)
                    vec_sim = embedding_service.cosine_similarity(query_vec, cand_vec)
                    lex_sim = self._lexical_stem_similarity(query_combined, f"{c.claim}. {expl_str[:400]}")
                    hybrid_sim = round(0.55 * vec_sim + 0.45 * lex_sim, 4)
                    if hybrid_sim >= 0.36 or lex_sim >= 0.30:
                        hits.append(
                            SemanticFactCheckHit(
                                id=c.id,
                                claim=c.claim,
                                fact_checker=c.fact_checker,
                                rating=c.rating,
                                explanation=c.explanation,
                                review_url=c.review_url,
                                similarity=round(min(0.99, hybrid_sim), 3),
                            )
                        )
            except Exception as e:
                logger.debug("Помилка резервного пошуку fact_check_claims: %s", e)
                try:
                    await db.rollback()
                except Exception:
                    pass

        hits.sort(key=lambda x: x.similarity, reverse=True)
        return hits[:top_k]


cross_verification_service = CrossVerificationService()

