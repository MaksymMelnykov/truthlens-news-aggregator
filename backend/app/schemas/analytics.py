from typing import List, Dict
from pydantic import BaseModel


class CategoryStat(BaseModel):
    category: str
    total_articles: int
    avg_trust_score: float
    verified_count: int = 0
    caution_count: int = 0
    high_risk_count: int


class SourceCredibilityStat(BaseModel):
    source_name: str
    domain: str
    articles_count: int
    reliability_rating: float
    trust_score_avg: float
    is_whitelisted: bool = False
    is_blacklisted: bool = False
    language: str = "ua"


class DailyTimelineStat(BaseModel):
    date: str
    total: int
    verified: int
    caution: int
    high_risk: int
    avg_trust: float


class AnalyticsOverviewResponse(BaseModel):
    total_analyzed_news: int
    total_factchecks: int = 0
    total_user_reports: int = 0
    avg_trust_score: float = 0.0
    verified_count: int = 0
    caution_count: int = 0
    high_risk_count: int = 0
    verified_percentage: float
    caution_percentage: float
    high_risk_percentage: float
    categories_breakdown: List[CategoryStat]
    top_sources: List[SourceCredibilityStat]
    daily_timeline: List[DailyTimelineStat] = []
    common_manipulation_markers: List[Dict[str, int]]
