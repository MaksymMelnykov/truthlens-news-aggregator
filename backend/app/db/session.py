from typing import Any, AsyncGenerator, Dict, Tuple
from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.orm import DeclarativeBase
from app.core.config import settings


class Base(DeclarativeBase):
    pass


def normalize_async_db_url(raw_url: str) -> Tuple[str, Dict[str, Any]]:
    """
    Автоматично адаптує будь-який URL підключення (локальний PostgreSQL, Neon.tech, Supabase, SQLite)
    для безпомилкової роботи з асинхронним драйвером SQLAlchemy + asyncpg:
    1. Замінює схему `postgres://` або `postgresql://` на `postgresql+asyncpg://`.
    2. Конвертує параметри `?sslmode=require&channel_binding=require` (які викликають помилку в asyncpg)
       у коректний словник `connect_args={"ssl": "require"}`.
    3. Для хмарних пулерів (Neon `-pooler`, Supabase `:6543`) вимикає кеш prepared statements,
       щоб уникнути конфліктів PgBouncer.
    """
    url = (raw_url or "").strip()
    if url.startswith("sqlite"):
        return url, {"check_same_thread": False}

    if url.startswith("postgres://"):
        url = "postgresql+asyncpg://" + url[len("postgres://") :]
    elif url.startswith("postgresql://"):
        url = "postgresql+asyncpg://" + url[len("postgresql://") :]

    parts = urlsplit(url)
    query_params = dict(parse_qsl(parts.query, keep_blank_values=True))

    connect_args: Dict[str, Any] = {}
    ssl_mode = query_params.pop("sslmode", None)
    query_params.pop("channel_binding", None)

    host_lower = (parts.hostname or "").lower()
    is_cloud_host = any(
        cloud_domain in host_lower
        for cloud_domain in ("neon.tech", "supabase.co", "supabase.com", "railway.app", "render.com", "aivencloud.com")
    )

    if (ssl_mode and ssl_mode != "disable") or is_cloud_host:
        connect_args["ssl"] = "require"

    # Якщо використовується PgBouncer / Transaction Pooler (Neon -pooler або порт 6543 у Supabase)
    if "-pooler" in host_lower or parts.port == 6543 or query_params.pop("pgbouncer", None):
        connect_args["statement_cache_size"] = 0

    clean_query = urlencode(query_params)
    clean_url = urlunsplit((parts.scheme, parts.netloc, parts.path, clean_query, parts.fragment))
    return clean_url, connect_args


normalized_db_url, db_connect_args = normalize_async_db_url(settings.DATABASE_URL)

engine_kwargs: Dict[str, Any] = {
    "echo": False,
    "connect_args": db_connect_args,
    "pool_pre_ping": True,
}
if not normalized_db_url.startswith("sqlite"):
    engine_kwargs["pool_recycle"] = 300

engine = create_async_engine(normalized_db_url, **engine_kwargs)

async_session_maker = async_sessionmaker(
    bind=engine,
    class_=AsyncSession,
    expire_on_commit=False,
    autocommit=False,
    autoflush=False,
)


async def get_db() -> AsyncGenerator[AsyncSession, None]:
    async with async_session_maker() as session:
        try:
            yield session
        finally:
            await session.close()
