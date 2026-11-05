from typing import List
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, delete
from app.db.session import get_db
from app.models.user import User
from app.models.history import VerificationHistory
from app.schemas.history import HistoryItemRead
from app.api.deps import get_current_user

router = APIRouter()


@router.get("", response_model=List[HistoryItemRead])
@router.get("/", response_model=List[HistoryItemRead])
async def get_user_history(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Отримати персональну історію перевірок посилань та текстів."""
    stmt = (
        select(VerificationHistory)
        .where(VerificationHistory.user_id == current_user.id)
        .order_by(VerificationHistory.created_at.desc())
        .limit(100)
    )
    res = await db.execute(stmt)
    items = res.scalars().all()
    return [HistoryItemRead.model_validate(item) for item in items]


@router.delete("/{history_id}", status_code=status.HTTP_200_OK)
async def delete_history_item(
    history_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Видалити запис з історії перевірок."""
    res = await db.execute(
        select(VerificationHistory).where(
            VerificationHistory.id == history_id,
            VerificationHistory.user_id == current_user.id
        )
    )
    item = res.scalar_one_or_none()
    if not item:
        raise HTTPException(status_code=404, detail="Запис історії не знайдено")
    
    await db.delete(item)
    await db.commit()
    return {"status": "deleted", "id": history_id}


@router.delete("/", status_code=status.HTTP_200_OK)
async def clear_all_history(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Очистити всю особисту історію перевірок."""
    await db.execute(
        delete(VerificationHistory).where(VerificationHistory.user_id == current_user.id)
    )
    await db.commit()
    return {"status": "history_cleared"}
