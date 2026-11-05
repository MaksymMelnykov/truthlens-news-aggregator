"""
Автономний скрипт збору новин, синхронізації фактчеків та оновлення векторів pgvector (24/7 Cloud Cron Worker).
Призначений для автоматичного запуску за розкладом через GitHub Actions (кожні 5 хвилин)
або з командного рядка. Працює напряму з хмарною базою PostgreSQL (Neon.tech / Supabase)
навіть коли ваш локальний комп'ютер вимкнений.
"""

import asyncio
import logging
import sys
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parent.parent
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from sqlalchemy import delete, func, select, text
from app.core.config import settings
from app.db.session import Base, async_session_maker, engine
import app.models  # noqa: F401
from app.models.article import Article
from app.models.bookmark import Bookmark
from app.services.embedding_service import embedding_service
from app.services.factcheck_service import fact_check_service
from app.services.ingestion import news_ingestion_service

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s | %(levelname)-8s | %(message)s",
)
logger = logging.getLogger("cloud_cron_sync")

MAX_STORED_ARTICLES = 50000


async def run_sync() -> None:
    logger.info("=== Початок автономної 24/7 синхронізації новин, фактчеків та pgvector TruthLens ===")

    # 1. Перевірка схеми БД та розширення pgvector
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
        await embedding_service.ensure_pgvector_columns(conn)

    # 2. Синхронізація бази спростувань (StopFake & VoxCheck)
    async with async_session_maker() as db:
        try:
            fc_res = await fact_check_service.sync_all_fact_checks(db, pages=2)
            logger.info(
                "Фактчеки синхронізовано: +%s нових спростувань (усього в базі: %s)",
                fc_res.get("new_claims_added", 0),
                fc_res.get("total_claims", 0),
            )
        except Exception as e:
            logger.error("Помилка синхронізації фактчеків: %s", e)

    # 3. Збір свіжих новин з усіх RSS-стрічок та розрахунок Trust Score V4
    async with async_session_maker() as db:
        try:
            news_res = await news_ingestion_service.sync_all_feeds(
                db, max_per_feed=settings.MAX_ARTICLES_PER_FEED
            )
            logger.info(
                "Збір новин завершено: +%s нових статей за %s сек.",
                news_res.get("total_new_articles", 0),
                news_res.get("duration_seconds", 0),
            )
        except Exception as e:
            logger.error("Помилка збору RSS-новин: %s", e)
            raise

    # 4. Автоматичне дозаповнення векторних ембедингів pgvector для нових статей і фактчеків
    async with engine.begin() as conn:
        if "postgresql" in conn.dialect.name.lower():
            try:
                new_arts = (
                    await conn.execute(
                        text("SELECT id, title, summary, full_text FROM articles WHERE embedding IS NULL LIMIT 300")
                    )
                ).mappings().all()
                if new_arts:
                    pairs = [(str(r["title"]), str(r["summary"] or r["full_text"] or "")) for r in new_arts]
                    vecs = embedding_service.encode_batch(pairs)
                    params = [
                        {"aid": int(r["id"]), "vec": embedding_service.to_pgvector_str(v)}
                        for r, v in zip(new_arts, vecs)
                    ]
                    await conn.execute(
                        text("UPDATE articles SET embedding = CAST(:vec AS vector) WHERE id = :aid"),
                        params,
                    )
                    logger.info("Оновлено pgvector ембединги для %d нових статей.", len(new_arts))

                new_claims = (
                    await conn.execute(
                        text("SELECT id, claim, explanation FROM fact_check_claims WHERE embedding IS NULL LIMIT 200")
                    )
                ).mappings().all()
                if new_claims:
                    c_pairs = [(str(r["claim"]), str(r["explanation"] or "")) for r in new_claims]
                    c_vecs = embedding_service.encode_batch(c_pairs)
                    c_params = [
                        {"cid": int(r["id"]), "vec": embedding_service.to_pgvector_str(v)}
                        for r, v in zip(new_claims, c_vecs)
                    ]
                    await conn.execute(
                        text("UPDATE fact_check_claims SET embedding = CAST(:vec AS vector) WHERE id = :cid"),
                        c_params,
                    )
                    logger.info("Оновлено pgvector ембединги для %d нових фактчеків.", len(new_claims))
            except Exception as e:
                logger.warning("Помилка оновлення pgvector ембедингів: %s", e)

    # 5. Контроль вільного місця у хмарній БД (Retention Guard для безкоштовного тарифу)
    async with async_session_maker() as db:
        total_articles = (await db.execute(select(func.count(Article.id)))).scalar() or 0
        logger.info("Загальна кількість статей у базі даних: %s", total_articles)

        if total_articles > MAX_STORED_ARTICLES:
            excess = total_articles - MAX_STORED_ARTICLES
            bookmarked_subq = select(Bookmark.article_id)
            oldest_ids_q = (
                select(Article.id)
                .where(Article.id.notin_(bookmarked_subq))
                .order_by(Article.published_at.asc())
                .limit(excess)
            )
            oldest_ids = [r[0] for r in (await db.execute(oldest_ids_q)).fetchall()]
            if oldest_ids:
                await db.execute(delete(Article).where(Article.id.in_(oldest_ids)))
                await db.commit()
                logger.info("Очищено %s найстаріших незбережених статей для економії місця у хмарній БД.", len(oldest_ids))

    await engine.dispose()
    logger.info("=== Автономну синхронізацію успішно завершено! ===")


if __name__ == "__main__":
    asyncio.run(run_sync())
