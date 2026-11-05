from datetime import datetime
from pydantic import BaseModel, ConfigDict
from app.schemas.news import ArticleRead


class BookmarkCreate(BaseModel):
    article_id: int


class BookmarkRead(BaseModel):
    id: int
    user_id: int
    article_id: int
    article: ArticleRead
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)
