from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.core.config import settings
from app.core.logging import setup_logging
from app.api import api_router
from app.db.session import engine, Base
import app.models  # noqa: F401 - ensure all tables are registered with Base.metadata

from app.services.scheduler import start_scheduler, stop_scheduler

logger = setup_logging()


@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info(f"Запуск застосунку {settings.PROJECT_NAME} v{settings.VERSION}...")
    logger.info(f"Середовище: {settings.ENVIRONMENT}, Режим налагодження: {settings.DEBUG}")

    # Створення таблиць БД та розширення pgvector під час запуску
    try:
        from sqlalchemy import text
        async with engine.begin() as conn:
            if not str(engine.url).startswith("sqlite"):
                try:
                    await conn.execute(text("CREATE EXTENSION IF NOT EXISTS vector"))
                except Exception as ext_e:
                    logger.debug(f"Примітка щодо pgvector: {ext_e}")
            await conn.run_sync(Base.metadata.create_all)
        logger.info("Базу даних успішно ініціалізовано.")
    except Exception as e:
        logger.error(f"Помилка ініціалізації бази даних: {e}")

    # Запуск фонового планувальника збору новин (якщо не в середовищі тестів)
    try:
        start_scheduler()
    except Exception as e:
        logger.error(f"Не вдалося запустити планувальник новин: {e}")

    yield

    logger.info("Зупинка застосунку...")
    try:
        stop_scheduler()
    except Exception as e:
        logger.error(f"Помилка зупинки планувальника: {e}")

    await engine.dispose()
    logger.info("З'єднання з базою даних закрито.")


app = FastAPI(
    title=settings.PROJECT_NAME,
    version=settings.VERSION,
    description=settings.DESCRIPTION,
    openapi_url=f"{settings.API_V1_STR}/openapi.json",
    docs_url="/docs",
    redoc_url="/redoc",
    lifespan=lifespan
)

# Налаштування CORS для взаємодії з Next.js фронтендом
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.BACKEND_CORS_ORIGINS or ["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Підключення роутів API v1
app.include_router(api_router, prefix=settings.API_V1_STR)


@app.get("/", tags=["Root"])
async def root():
    return {
        "app": settings.PROJECT_NAME,
        "version": settings.VERSION,
        "status": "online",
        "documentation": "/docs",
        "api_v1": settings.API_V1_STR
    }


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("app.main:app", host="0.0.0.0", port=8000, reload=True)
