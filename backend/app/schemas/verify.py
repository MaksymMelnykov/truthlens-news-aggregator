from datetime import datetime
from typing import Optional
from pydantic import BaseModel, Field
from .news import TrustScoreBreakdown


class VerifyTextRequest(BaseModel):
    text: str = Field(..., min_length=3, max_length=50000, description="Текст новини для перевірки")
    title: Optional[str] = Field(None, max_length=500, description="Необов'язковий заголовок новини")
    source_url: Optional[str] = Field(None, description="Посилання на першоджерело, якщо відомо")


class VerifyUrlRequest(BaseModel):
    url: str = Field(..., description="URL адреса новини для онлайн-парсингу та перевірки")


class VerificationResultResponse(BaseModel):
    analysis_id: Optional[int] = None
    title: Optional[str] = None
    extracted_text_preview: str
    analyzed_domain: Optional[str] = None
    source_url: Optional[str] = None
    query_type: str = "url"
    created_at: Optional[datetime] = None
    trust_breakdown: TrustScoreBreakdown
