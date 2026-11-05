"""
Автономний скрипт збору новин та синхронізації фактчеків (24/7 Cloud Cron Worker).
Призначений для автоматичного запуску за розкладом через GitHub Actions (кожні 2 години)
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
from app.services.factcheck_service import fact_check_service
from app.services.ingestion import news_ingestion_service

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s | %(levelname)-8s | %(message)s",
)
logger = logging.getLogger("cloud_cron_sync")

# Максимальний поріг статей для автоматичного захисту безкоштовного ліміту 512 MB у Neon.tech
# (50 000 статей займають ~140 MB, що залишає більш ніж 3-кратний запас місця)
MAX_STORED_ARTICLES = 50000


async def run_sync() -> None:
    logger.info("=== Початок автономної 24/7 синхронізації новин та фактчеків TruthLens ===")

    # 1. Перевірка схеми БД та розширення pgvector
    async with engine.begin() as conn:
        if not str(engine.url).startswith("sqlite"):
            try:
                await conn.execute(text("CREATE EXTENSION IF NOT EXISTS vector"))
            except Exception as e:
                logger.debug("Примітка pgvector: %s", e)
        await conn.run_sync(Base.metadata.create_all)

    # 2. Синхронізація бази спростувань (StopFake & VoxCheck), щоб нові статті звірялися з найсвіжішими фактчеками
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

    # 3. Збір свіжих новин з усіх RSS-стрічок та розрахунок Trust Score V3
    async with async_session_maker() as db:
        try:
            news_res = await news_ingestion_service.sync_all_feeds(
                db, max_per_feed=settings.MAX_ARTICLES_PER_FEED
            )
            logger.info(
                "Збір новин завершено: +%s нових статей із %s джерел за %s сек.",
                news_res.get("total_new_articles", 0),
                news_res.get("feeds_processed", 0),
                news_res.get("duration_seconds", 0),
            )
        except Exception as e:
            logger.error("Помилка збору RSS-новин: %s", e)
            raise

    # 4. Контроль вільного місця у хмарній БД (Retention Guard для безкоштовного тарифу 512 MB)
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

