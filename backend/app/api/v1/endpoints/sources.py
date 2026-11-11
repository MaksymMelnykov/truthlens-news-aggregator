import logging
from typing import List, Optional
from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, status, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.db.session import async_session_maker, get_db
from app.models.source import Source
from app.models.user import User
from app.schemas.news import SourceRead, SourceBase
from app.api.deps import get_current_admin

logger = logging.getLogger(__name__)
router = APIRouter()


def _normalize_domain(raw_domain: str) -> str:
    cleaned = raw_domain.lower().strip()
    for prefix in ("https://", "http://"):
        if cleaned.startswith(prefix):
            cleaned = cleaned[len(prefix):]
    if cleaned.startswith("www."):
        cleaned = cleaned[4:]
    return cleaned.split("/")[0].strip()


async def _background_ingest_source(source_id: int, max_items: int = 15) -> None:
    """Фоновий миттєвий імпорт новин із RSS щойно доданого або оновленого джерела."""
    try:
        from app.services.ingestion import news_ingestion_service

        async with async_session_maker() as db:
            res = await db.execute(select(Source).where(Source.id == source_id))
            source = res.scalar_one_or_none()
            if not source or not source.rss_url or source.is_blacklisted:
                return
            feed_config = {
                "name": source.name,
                "domain": source.domain,
                "homepage_url": source.homepage_url or f"https://{source.domain}",
                "rss_url": source.rss_url,
                "reliability_rating": source.reliability_rating,
                "is_whitelisted": source.is_whitelisted,
                "language": source.language or "ua",
                "country": source.country or "UA",
            }
            added = await news_ingestion_service.ingest_feed(db, feed_config, max_items=max_items)
            logger.info("Авто-імпорт RSS для нового джерела '%s': додано %d статей", source.name, added)
    except Exception as e:
        logger.error("Помилка фонового авто-імпорту RSS для джерела id=%s: %s", source_id, e)


@router.get("", response_model=List[SourceRead])
@router.get("/", response_model=List[SourceRead])
async def get_sources(
    whitelisted_only: Optional[bool] = Query(None),
    blacklisted_only: Optional[bool] = Query(None),
    db: AsyncSession = Depends(get_db)
):
    """Отримати список джерел новин з фільтрацією за репутаційними списками."""
    query = select(Source)
    if whitelisted_only is True:
        query = query.where(Source.is_whitelisted == True)
    elif blacklisted_only is True:
        query = query.where(Source.is_blacklisted == True)
    
    query = query.order_by(Source.reliability_rating.desc())
    res = await db.execute(query)
    sources = res.scalars().all()
    return [SourceRead.model_validate(s) for s in sources]


@router.post("", response_model=SourceRead, status_code=status.HTTP_201_CREATED)
@router.post("/", response_model=SourceRead, status_code=status.HTTP_201_CREATED)
async def create_source(
    source_in: SourceBase,
    background_tasks: BackgroundTasks,
    admin: User = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db)
):
    """Додати нове джерело та одразу запустити збір RSS-новин у фоні (тільки для адміністраторів)."""
    norm_domain = _normalize_domain(source_in.domain)
    existing = await db.execute(select(Source).where(Source.domain == norm_domain))
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="Джерело з таким доменом вже існує")

    source = Source(
        name=source_in.name.strip(),
        domain=norm_domain,
        homepage_url=source_in.homepage_url.strip() if source_in.homepage_url else f"https://{norm_domain}",
        rss_url=source_in.rss_url.strip() if source_in.rss_url else None,
        language=source_in.language,
        country=source_in.country,
        reliability_rating=source_in.reliability_rating,
        is_whitelisted=source_in.is_whitelisted,
        is_blacklisted=source_in.is_blacklisted
    )
    db.add(source)
    await db.commit()
    await db.refresh(source)

    if source.rss_url and not source.is_blacklisted:
        background_tasks.add_task(_background_ingest_source, source.id, 15)

    return SourceRead.model_validate(source)


@router.put("/{source_id}", response_model=SourceRead)
async def update_source(
    source_id: int,
    source_in: SourceBase,
    background_tasks: BackgroundTasks,
    admin: User = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db)
):
    """Оновити параметри джерела, RSS-стрічку та оцінку надійності (тільки для адміністраторів)."""
    res = await db.execute(select(Source).where(Source.id == source_id))
    source = res.scalar_one_or_none()
    if not source:
        raise HTTPException(status_code=404, detail="Джерело не знайдено")

    old_rss = source.rss_url
    norm_domain = _normalize_domain(source_in.domain)

    source.name = source_in.name.strip()
    source.domain = norm_domain
    source.homepage_url = source_in.homepage_url.strip() if source_in.homepage_url else f"https://{norm_domain}"
    source.rss_url = source_in.rss_url.strip() if source_in.rss_url else None
    source.language = source_in.language
    source.country = source_in.country
    source.reliability_rating = source_in.reliability_rating
    source.is_whitelisted = source_in.is_whitelisted
    source.is_blacklisted = source_in.is_blacklisted

    db.add(source)
    await db.commit()
    await db.refresh(source)

    if source.rss_url and source.rss_url != old_rss and not source.is_blacklisted:
        background_tasks.add_task(_background_ingest_source, source.id, 15)

    return SourceRead.model_validate(source)


@router.post("/{source_id}/fetch-rss")
async def fetch_source_rss_now(
    source_id: int,
    max_items: int = Query(10, ge=1, le=30),
    admin: User = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
):
    """Миттєвий збір свіжих новин із RSS-каналу конкретного джерела (тільки адмін)."""
    res = await db.execute(select(Source).where(Source.id == source_id))
    source = res.scalar_one_or_none()
    if not source:
        raise HTTPException(status_code=404, detail="Джерело не знайдено")
    if not source.rss_url:
        raise HTTPException(status_code=400, detail="Для цього джерела не вказано URL RSS-стрічки")

    from app.services.ingestion import news_ingestion_service

    feed_config = {
        "name": source.name,
        "domain": source.domain,
        "homepage_url": source.homepage_url or f"https://{source.domain}",
        "rss_url": source.rss_url,
        "reliability_rating": source.reliability_rating,
        "is_whitelisted": source.is_whitelisted,
        "language": source.language or "ua",
        "country": source.country or "UA",
    }
    added_count = await news_ingestion_service.ingest_feed(db, feed_config, max_items=max_items)
    return {
        "status": "success",
        "source_id": source.id,
        "source_name": source.name,
        "rss_url": source.rss_url,
        "new_articles": added_count,
    }


@router.get("/check-reputation")
async def check_domain_reputation(domain: str = Query(..., description="Домен або URL для перевірки репутації")):
    """Отримати оцінку репутації домену за моніторинговими списками ІМІ."""
    from app.services.reputation_service import reputation_service
    result = reputation_service.get_reputation(domain)
    return result


@router.post("/sync-reputation")
async def sync_sources_reputation(
    admin: User = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db)
):
    """Синхронізувати каталог джерел у БД з офіційними списками ІМІ (тільки адмін)."""
    from app.services.reputation_service import reputation_service
    updated = await reputation_service.sync_sources_with_reputation(db)
    return {"status": "success", "updated_sources": updated}


@router.delete("/{source_id}", status_code=status.HTTP_200_OK)
async def delete_source(
    source_id: int,
    admin: User = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db)
):
    """Видалити джерело (тільки для адміністраторів)."""
    res = await db.execute(select(Source).where(Source.id == source_id))
    source = res.scalar_one_or_none()
    if not source:
        raise HTTPException(status_code=404, detail="Джерело не знайдено")

    await db.delete(source)
    await db.commit()
    return {"status": "deleted", "id": source_id}
