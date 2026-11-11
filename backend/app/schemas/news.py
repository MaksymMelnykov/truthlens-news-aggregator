from datetime import datetime
from typing import Any, Dict, List, Optional
from pydantic import BaseModel, Field, ConfigDict


class TrustScoreBreakdown(BaseModel):
    score: float = Field(..., ge=0.0, le=100.0, description="Загальний індекс довіри (0-100%)")
    verdict: str = Field(..., description="Вердикт: Verified / Caution / Suspicious / High Risk")
    stylometry_score: float = Field(..., ge=0.0, le=100.0, description="Оцінка спокою мови та відсутності клікбейту")
    source_reputation_score: float = Field(..., ge=0.0, le=100.0, description="Індекс авторитетності видання")
    ml_authenticity_score: float = Field(..., ge=0.0, le=100.0, description="Ймовірність достовірності за ансамблем NLP (ukr-roberta-base + xlm-roberta-base)")
    corroboration_score: float = Field(..., ge=0.0, le=100.0, description="Семантичне підтвердження іншими ЗМІ (pgvector)")
    fact_check_flag: bool = Field(default=False, description="Чи є пряме або семантичне спростування у базі фактчекерів")
    manipulation_markers: List[str] = Field(default_factory=list, description="Знайдені маніпулятивні патерни чи слова")
    explanation: str = Field(..., description="Розгорнуте пояснення XAI чому сформовано такий рейтинг")
    models_breakdown: Dict[str, float] = Field(
        default_factory=dict,
        description="Окремі оцінки автентичності від ukr-roberta-base, xlm-roberta-base та TruthLens Hybrid Ensemble",
    )
    xai_top_tokens: List[Dict[str, Any]] = Field(
        default_factory=list,
        description="Дискримінативні токени та біграми XAI з ваговими коефіцієнтами",
    )
    corroborating_articles: List[Dict[str, Any]] = Field(
        default_factory=list,
        description="Список знайдених через pgvector публікацій інших незалежних ЗМІ про цю подію",
    )
    corroboration_summary: str = Field(
        default="",
        description="Текстовий підсумок крос-верифікації по незалежних медіа",
    )
    matched_fact_checks: List[Dict[str, Any]] = Field(
        default_factory=list,
        description="Знайдені через pgvector семантично близькі спростування StopFake та VoxCheck",
    )
    xai_reasoning_steps: List[Dict[str, Any]] = Field(
        default_factory=list,
        description="Покроковий XAI-аудит 5 компонентів формування Trust Score V4",
    )
    sentence_analysis: List[Dict[str, Any]] = Field(
        default_factory=list,
        description="Пореченкова теплова карта достовірності (оцінка кожного речення 0-100%)",
    )
    attribution_analysis: Dict[str, Any] = Field(
        default_factory=dict,
        description="NER-аналіз атрибуції цитат, офіційних відомств та анонімних вкидів",
    )


class SourceBase(BaseModel):
    name: str
    domain: str
    homepage_url: Optional[str] = None
    rss_url: Optional[str] = None
    language: str = "ua"
    country: str = "UA"
    reliability_rating: float = 80.0
    is_whitelisted: bool = False
    is_blacklisted: bool = False


class SourceRead(SourceBase):
    id: int
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class ArticleBase(BaseModel):
    title: str
    url: str
    source_name: str
    domain: str
    summary: Optional[str] = None
    author: Optional[str] = None
    language: str = "ua"
    category: str = "Загальне"
    published_at: datetime
    image_url: Optional[str] = None


class ArticleRead(ArticleBase):
    id: int
    trust_score: float
    verdict: str
    created_at: datetime
    is_bookmarked: bool = False

    model_config = ConfigDict(from_attributes=True)


class ArticleDetail(ArticleRead):
    full_text: str
    trust_breakdown: TrustScoreBreakdown
    similar_articles: List[ArticleRead] = Field(default_factory=list)


class NewsFeedResponse(BaseModel):
    total: int
    page: int
    page_size: int
    items: List[ArticleRead]
