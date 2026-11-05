from typing import Any, Dict
from fastapi import APIRouter
from app.schemas.analytics import AnalyticsOverviewResponse, CategoryStat, SourceCredibilityStat
from app.services.ml_classifier_service import ml_classifier_service

router = APIRouter()


@router.get("/model-metrics")
async def get_model_evaluation_metrics() -> Dict[str, Any]:
    """
    Повертає результати експериментального порівняння ML/NLP моделей (Тиждень 3):
    Accuracy, Precision, Recall, F1-Score, ROC-AUC, Latency, Confusion Matrix та XAI-ознаки.
    """
    return ml_classifier_service.get_evaluation_metrics()


@router.get("/overview", response_model=AnalyticsOverviewResponse)
async def get_analytics_overview():
    """Отримати зведені аналітичні метрики дезінформації для дашборду та дипломної роботи."""
    return AnalyticsOverviewResponse(
        total_analyzed_news=1420,
        verified_percentage=72.4,
        caution_percentage=19.8,
        high_risk_percentage=7.8,
        categories_breakdown=[
            CategoryStat(category="Політика", total_articles=510, avg_trust_score=68.2, high_risk_count=45),
            CategoryStat(category="Війна / Безпека", total_articles=430, avg_trust_score=71.5, high_risk_count=32),
            CategoryStat(category="Економіка", total_articles=260, avg_trust_score=84.0, high_risk_count=10),
            CategoryStat(category="Технології", total_articles=220, avg_trust_score=91.3, high_risk_count=4),
        ],
        top_sources=[
            SourceCredibilityStat(source_name="Суспільне Новини", domain="suspilne.media", articles_count=340, reliability_rating=98.0, trust_score_avg=96.4),
            SourceCredibilityStat(source_name="Українська правда", domain="pravda.com.ua", articles_count=310, reliability_rating=95.0, trust_score_avg=93.1),
            SourceCredibilityStat(source_name="BBC News Україна", domain="bbc.com/ukrainian", articles_count=280, reliability_rating=99.0, trust_score_avg=97.5),
            SourceCredibilityStat(source_name="Reuters", domain="reuters.com", articles_count=250, reliability_rating=99.0, trust_score_avg=98.2),
        ],
        common_manipulation_markers=[
            {"Клікбейтні заголовки (емоційні вигуки)": 142},
            {"Анонімні джерела ('як стало відомо')": 98},
            {"Маніпуляція цифрами без контексту": 64},
            {"Спростовано фактчекерами (StopFake/VoxCheck)": 38},
        ]
    )
