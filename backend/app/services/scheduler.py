import asyncio
from datetime import datetime, timezone
import logging

from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.interval import IntervalTrigger
from sqlalchemy import func, select

from app.core.config import settings
from app.db.session import async_session_maker
from app.models.article import Article
from app.services.ingestion import news_ingestion_service
from app.services.factcheck_service import fact_check_service

logger = logging.getLogger(__name__)

scheduler = AsyncIOScheduler()


async def scheduled_news_ingestion_job():
    """Періодична задача фонового збору новин з активних RSS-стрічок."""
    logger.info("Запуск планового збору новин (RSS Ingestion)...")
    try:
        async with async_session_maker() as db:
            result = await news_ingestion_service.sync_all_feeds(
                db, max_per_feed=settings.MAX_ARTICLES_PER_FEED
            )
            logger.info(
                f"Плановий збір новин завершено. Додано {result['total_new_articles']} нових статей за {result['duration_seconds']} сек."
            )
    except Exception as e:
        logger.error(f"Помилка під час планового збору новин: {e}", exc_info=True)


async def scheduled_factcheck_sync_job():
    """Періодична задача фонової синхронізації бази спростувань (StopFake, VoxCheck)."""
    logger.info("Запуск планової синхронізації фактчеків (StopFake & VoxCheck)...")
    try:
        async with async_session_maker() as db:
            result = await fact_check_service.sync_all_fact_checks(db, pages=3)
            logger.info(
                f"Планову синхронізацію фактчеків завершено. Додано {result.get('new_claims_added', 0)} нових спростувань (всього: {result.get('total_claims', 0)})."
            )
    except Exception as e:
        logger.error(f"Помилка під час планової синхронізації фактчеків: {e}", exc_info=True)


async def startup_catchup_check():
    """
    Розумне дооновлення при старті (Smart Catch-Up):
    Перевіряє час останньої доданої статті у БД. Якщо база порожня або остання новина
    старіша за INGESTION_INTERVAL_MINUTES, одразу у фоні підтягує свіжі новини та фактчеки.
    """
    try:
        async with async_session_maker() as db:
            latest_created = (
                await db.execute(select(func.max(Article.created_at)))
            ).scalar_one_or_none()

        should_sync = False
        if latest_created is None:
            should_sync = True
        else:
            if latest_created.tzinfo is None:
                latest_created = latest_created.replace(tzinfo=timezone.utc)
            age_minutes = (datetime.now(timezone.utc) - latest_created).total_seconds() / 60.0
            if age_minutes >= settings.INGESTION_INTERVAL_MINUTES:
                should_sync = True
                logger.info(
                    f"Остання новина у БД додана {age_minutes:.1f} хв тому. Запуск миттєвого фонового оновлення (Smart Catch-Up)..."
                )

        if should_sync:
            await scheduled_news_ingestion_job()
            await scheduled_factcheck_sync_job()
    except Exception as e:
        logger.warning(f"Помилка під час Smart Catch-Up перевірки: {e}")


def start_scheduler():
    """Ініціалізація та запуск планувальника задач."""
    if not scheduler.running:
        trigger = IntervalTrigger(minutes=settings.INGESTION_INTERVAL_MINUTES)
        scheduler.add_job(
            scheduled_news_ingestion_job,
            trigger=trigger,
            id="periodic_news_ingestion",
            name="Періодичний збір новин",
            replace_existing=True,
            coalesce=True,
            max_instances=1,
        )
        scheduler.add_job(
            scheduled_factcheck_sync_job,
            trigger=trigger,
            id="periodic_factcheck_sync",
            name="Періодична синхронізація фактчеків",
            replace_existing=True,
            coalesce=True,
            max_instances=1,
        )
        scheduler.start()
        logger.info(
            f"Фоновий планувальник запущено: збір новин та синхронізація фактчеків кожні {settings.INGESTION_INTERVAL_MINUTES} хв."
        )
        try:
            loop = asyncio.get_running_loop()
            loop.create_task(startup_catchup_check())
        except RuntimeError:
            pass


def stop_scheduler():
    """Коректна зупинка планувальника під час вимкнення сервера."""
    if scheduler.running:
        scheduler.shutdown(wait=False)
        logger.info("Фоновий планувальник новин зупинено.")
