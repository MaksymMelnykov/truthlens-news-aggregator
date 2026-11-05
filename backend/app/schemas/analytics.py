from typing import List, Dict
from pydantic import BaseModel


class CategoryStat(BaseModel):
    category: str
    total_articles: int
    avg_trust_score: float
    high_risk_count: int


class SourceCredibilityStat(BaseModel):
    source_name: str
    domain: str
    articles_count: int
    reliability_rating: float
    trust_score_avg: float


class AnalyticsOverviewResponse(BaseModel):
    total_analyzed_news: int
    verified_percentage: float
    caution_percentage: float
    high_risk_percentage: float
    categories_breakdown: List[CategoryStat]
    top_sources: List[SourceCredibilityStat]
    common_manipulation_markers: List[Dict[str, int]]
