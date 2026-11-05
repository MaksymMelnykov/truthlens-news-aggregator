from typing import Optional
from fastapi import APIRouter, Depends, Query, HTTPException
from sqlalchemy import select, func, or_
from sqlalchemy.ext.asyncio import AsyncSession
from pydantic import BaseModel

from app.db.session import get_db
from app.models.claim import FactCheckClaim
from app.schemas.claim import FactCheckClaimRead, FactCheckListResponse, FactCheckMatchResult
from app.services.factcheck_service import fact_check_service

router = APIRouter()


class CheckTextRequest(BaseModel):
    title: str
    text: Optional[str] = ""


@router.get("", response_model=FactCheckListResponse)
@router.get("/", response_model=FactCheckListResponse)
async def get_fact_checks(
    page: int = Query(1, ge=1, description="Номер сторінки"),
    page_size: int = Query(24, ge=1, le=200, description="Кількість записів"),
    limit: Optional[int] = Query(None, description="Альтернативний параметр ліміту (наприклад limit=100)"),
    search: Optional[str] = Query(None, description="Пошук у змісті фейку чи спростування"),
    rating: Optional[str] = Query(None, description="Фільтр за вердиктом: Фейк, Маніпуляція, Неправда"),
    fact_checker: Optional[str] = Query(None, description="Організація: StopFake, VoxCheck, Google FactCheck"),
    db: AsyncSession = Depends(get_db),
):
    """Отримати список перевірених фактчекінгових спростувань із можливістю фільтрації та пошуку."""
    # Переконуємось, що початкові фактчеки завантажені
    await fact_check_service.seed_initial_claims_if_empty(db)

    effective_page_size = min(max(1, limit), 200) if limit is not None else page_size

    query = select(FactCheckClaim)

    if search:
        search_pattern = f"%{search}%"
        query = query.where(
            or_(
                FactCheckClaim.claim.ilike(search_pattern),
                FactCheckClaim.explanation.ilike(search_pattern),
                FactCheckClaim.claimant.ilike(search_pattern),
            )
        )

    if rating:
        query = query.where(FactCheckClaim.rating == rating)

    if fact_checker:
        query = query.where(FactCheckClaim.fact_checker.ilike(f"%{fact_checker}%"))

    # Підрахунок кількості
    count_stmt = select(func.count()).select_from(query.subquery())
    total = (await db.execute(count_stmt)).scalar() or 0

    # Пагінація та сортування
    query = (
        query.order_by(FactCheckClaim.published_at.desc().nullslast(), FactCheckClaim.created_at.desc())
        .offset((page - 1) * effective_page_size)
        .limit(effective_page_size)
    )

    items = (await db.execute(query)).scalars().all()

    return FactCheckListResponse(
        total=total,
        page=page,
        page_size=effective_page_size,
        items=[FactCheckClaimRead.model_validate(item) for item in items],
    )


@router.post("/sync")
async def trigger_fact_check_sync(db: AsyncSession = Depends(get_db)):
    """Синхронізація бази спростувань зі свіжих джерел (StopFake RSS та VoxCheck)."""
    result = await fact_check_service.sync_all_fact_checks(db)
    return result


@router.post("/check", response_model=FactCheckMatchResult)
async def check_claim_against_database(
    data: CheckTextRequest,
    db: AsyncSession = Depends(get_db),
):
    """Перевірка конкретного заголовка або тексту на наявність відомих спростованих фейків."""
    await fact_check_service.seed_initial_claims_if_empty(db)
    match_result = await fact_check_service.match_article(data.title, data.text or "", db)
    return match_result
