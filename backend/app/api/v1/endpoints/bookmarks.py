from typing import List
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.orm import selectinload
from app.db.session import get_db
from app.models.user import User
from app.models.article import Article
from app.models.bookmark import Bookmark
from app.schemas.news import ArticleRead
from app.api.deps import get_current_user

router = APIRouter()


@router.get("", response_model=List[ArticleRead])
@router.get("/", response_model=List[ArticleRead])
async def get_user_bookmarks(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Отримати список збережених статей (закладок) поточного користувача."""
    stmt = (
        select(Bookmark)
        .where(Bookmark.user_id == current_user.id)
        .options(selectinload(Bookmark.article))
        .order_by(Bookmark.created_at.desc())
    )
    res = await db.execute(stmt)
    bookmarks = res.scalars().all()
    items = []
    for b in bookmarks:
        if b.article:
            item = ArticleRead.model_validate(b.article)
            item.is_bookmarked = True
            items.append(item)
    return items


@router.post("/{article_id}", status_code=status.HTTP_201_CREATED)
async def add_bookmark(
    article_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Додати статтю до закладок користувача."""
    art_res = await db.execute(select(Article).where(Article.id == article_id))
    article = art_res.scalar_one_or_none()
    if not article:
        raise HTTPException(status_code=404, detail="Статтю не знайдено")

    existing = await db.execute(
        select(Bookmark).where(
            Bookmark.user_id == current_user.id,
            Bookmark.article_id == article_id
        )
    )
    if existing.scalar_one_or_none():
        return {"status": "already_bookmarked", "article_id": article_id}

    bookmark = Bookmark(user_id=current_user.id, article_id=article_id)
    db.add(bookmark)
    await db.commit()
    return {"status": "bookmarked", "article_id": article_id}


@router.delete("/{article_id}")
async def remove_bookmark(
    article_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Видалити статтю із закладок користувача."""
    res = await db.execute(
        select(Bookmark).where(
            Bookmark.user_id == current_user.id,
            Bookmark.article_id == article_id
        )
    )
    bookmark = res.scalar_one_or_none()
    if not bookmark:
        raise HTTPException(status_code=404, detail="Закладку не знайдено")

    await db.delete(bookmark)
    await db.commit()
    return {"status": "removed", "article_id": article_id}


@router.get("/check/{article_id}")
async def check_bookmark(
    article_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Перевірити, чи стаття вже збережена в закладках."""
    res = await db.execute(
        select(Bookmark).where(
            Bookmark.user_id == current_user.id,
            Bookmark.article_id == article_id
        )
    )
    is_bookmarked = res.scalar_one_or_none() is not None
    return {"article_id": article_id, "is_bookmarked": is_bookmarked}
