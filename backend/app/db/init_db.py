import asyncio
import logging
from sqlalchemy import select
from app.db.session import engine, Base, async_session_maker
from app.models.user import User
from app.core.security import get_password_hash
import app.models  # ensure all models are registered

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


async def init_database():
    logger.info("Створення таблиць бази даних у PostgreSQL...")
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    logger.info("Усі таблиці успішно створено!")

    # Створення тестового адміністратора за замовчуванням
    async with async_session_maker() as session:
        result = await session.execute(select(User).where(User.email == "admin@truthlens.ua"))
        admin = result.scalar_one_or_none()
        if not admin:
            admin = User(
                email="admin@truthlens.ua",
                hashed_password=get_password_hash("Admin12345!"),
                full_name="Головний Адміністратор",
                role="admin",
                is_active=True
            )
            session.add(admin)
            await session.commit()
            logger.info("Створено дефолтного адміністратора: admin@truthlens.ua (пароль: Admin12345!)")
        else:
            logger.info("Адміністратор admin@truthlens.ua вже існує в базі даних.")

    await engine.dispose()


if __name__ == "__main__":
    asyncio.run(init_database())
