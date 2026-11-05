from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.db.session import get_db
from app.models.source import Source
from app.models.user import User
from app.schemas.news import SourceRead, SourceBase
from app.api.deps import get_current_admin

router = APIRouter()


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
    admin: User = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db)
):
    """Додати нове джерело (тільки для адміністраторів)."""
    existing = await db.execute(select(Source).where(Source.domain == source_in.domain.lower()))
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="Джерело з таким доменом вже існує")

    source = Source(
        name=source_in.name,
        domain=source_in.domain.lower(),
        homepage_url=source_in.homepage_url,
        language=source_in.language,
        country=source_in.country,
        reliability_rating=source_in.reliability_rating,
        is_whitelisted=source_in.is_whitelisted,
        is_blacklisted=source_in.is_blacklisted
    )
    db.add(source)
    await db.commit()
    await db.refresh(source)
    return SourceRead.model_validate(source)


@router.put("/{source_id}", response_model=SourceRead)
async def update_source(
    source_id: int,
    source_in: SourceBase,
    admin: User = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db)
):
    """Оновити параметри джерела та оцінку надійності (тільки для адміністраторів)."""
    res = await db.execute(select(Source).where(Source.id == source_id))
    source = res.scalar_one_or_none()
    if not source:
        raise HTTPException(status_code=404, detail="Джерело не знайдено")

    source.name = source_in.name
    source.domain = source_in.domain.lower()
    source.homepage_url = source_in.homepage_url
    source.language = source_in.language
    source.country = source_in.country
    source.reliability_rating = source_in.reliability_rating
    source.is_whitelisted = source_in.is_whitelisted
    source.is_blacklisted = source_in.is_blacklisted

    db.add(source)
    await db.commit()
    await db.refresh(source)
    return SourceRead.model_validate(source)


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
