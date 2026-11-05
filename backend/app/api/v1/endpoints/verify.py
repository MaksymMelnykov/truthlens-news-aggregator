import re
from typing import Any, Dict, Optional
from urllib.parse import urlparse

import httpx
import trafilatura
from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_optional_current_user
from app.db.session import get_db
from app.models.analysis import AnalysisReport
from app.models.history import VerificationHistory
from app.models.user import User
from app.schemas.news import TrustScoreBreakdown
from app.schemas.verify import (
    VerificationResultResponse,
    VerifyTextRequest,
    VerifyUrlRequest,
)
from app.services.ingestion import calculate_multi_factor_trust, news_ingestion_service
from app.services.ml_classifier_service import ml_classifier_service
from app.services.reputation_service import reputation_service

router = APIRouter()


@router.post("/text", response_model=VerificationResultResponse)
async def verify_custom_text(
    payload: VerifyTextRequest,
    current_user: Optional[User] = Depends(get_optional_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Повна багатофакторна перевірка довільного тексту (Trust Score V3):
    поєднує оцінку репутації джерела (ІМІ), стилометричний аналіз,
    ML-класифікатор автентичності (TruthLens Hybrid Ensemble / ukr-roberta)
    та звірку з базою фактчеків (StopFake / VoxCheck).
    """
    effective_title = (payload.title or "").strip()
    if not effective_title:
        first_sentence = re.split(r"[.!?\n]+", payload.text.strip())[0]
        effective_title = first_sentence[:140] if first_sentence else payload.text[:140]

    domain_str = reputation_service.normalize_domain(payload.source_url or "")

    score, verdict, details = await calculate_multi_factor_trust(
        title=effective_title,
        text=payload.text,
        source=None,
        db=db,
        source_domain_override=domain_str,
    )

    breakdown = TrustScoreBreakdown(
        score=score,
        verdict=verdict,
        stylometry_score=float(details.get("stylometry_score", 80.0)),
        source_reputation_score=float(details.get("source_reputation", 75.0)),
        ml_authenticity_score=float(details.get("ml_authenticity_score", 80.0)),
        corroboration_score=float(details.get("corroboration_score", 75.0)),
        fact_check_flag=bool(details.get("factcheck_debunked", False)),
        manipulation_markers=list(details.get("manipulation_markers", [])),
        explanation=str(details.get("explanation") or details.get("reason") or ""),
        models_breakdown=dict(details.get("models_breakdown", {})),
        xai_top_tokens=list(details.get("xai_top_tokens", [])),
        corroborating_articles=list(details.get("corroborating_articles", [])),
        corroboration_summary=str(details.get("corroboration_summary", "")),
        matched_fact_checks=list(details.get("matched_fact_checks", [])),
        xai_reasoning_steps=list(details.get("xai_reasoning_steps", [])),
    )

    # Зберігаємо аналітичний звіт у таблицю analysis_reports
    report_entry = AnalysisReport(
        url=payload.source_url,
        input_text=payload.text[:5000],
        user_id=current_user.id if current_user else None,
        trust_score=breakdown.score,
        verdict=breakdown.verdict,
        stylometry_score=breakdown.stylometry_score,
        source_reputation_score=breakdown.source_reputation_score,
        ml_authenticity_score=breakdown.ml_authenticity_score,
        corroboration_score=breakdown.corroboration_score,
        fact_check_flag=breakdown.fact_check_flag,
        manipulation_markers=breakdown.manipulation_markers,
        explanation=breakdown.explanation,
    )
    db.add(report_entry)

    # Якщо запит від авторизованого користувача — фіксуємо в особисту історію
    if current_user:
        history_entry = VerificationHistory(
            user_id=current_user.id,
            query_type="text",
            query_preview=(payload.title or payload.text)[:120],
            trust_score=breakdown.score,
            verdict=breakdown.verdict,
        )
        db.add(history_entry)

    await db.commit()

    preview = payload.text[:260] + "..." if len(payload.text) > 260 else payload.text
    return VerificationResultResponse(
        title=payload.title or effective_title,
        extracted_text_preview=preview,
        analyzed_domain=domain_str or None,
        trust_breakdown=breakdown,
    )


async def _extract_title_and_text_from_url(url: str) -> tuple[str, str]:
    """Витягує заголовок і повний текст статті за URL за допомогою trafilatura та мета-тегів."""
    extracted_title = ""
    extracted_text = ""

    try:
        async with httpx.AsyncClient(
            headers=news_ingestion_service.headers,
            follow_redirects=True,
            timeout=12.0,
        ) as client:
            res = await client.get(url)
            if res.status_code == 200:
                html = res.text
                meta = trafilatura.extract_metadata(html)
                if meta and meta.title:
                    extracted_title = meta.title.strip()

                if not extracted_title:
                    title_match = re.search(r"<title[^>]*>(.*?)</title>", html, re.IGNORECASE | re.DOTALL)
                    if title_match:
                        extracted_title = re.sub(r"\s+", " ", title_match.group(1)).strip()

                body = trafilatura.extract(
                    html,
                    include_comments=False,
                    include_tables=False,
                    no_fallback=False,
                )
                if body:
                    extracted_text = body.strip()
    except Exception:
        pass

    if not extracted_title:
        parsed = urlparse(url)
        slug = parsed.path.strip("/").replace("-", " ").replace("_", " ")
        extracted_title = f"Аналіз публікації ({parsed.netloc}): {slug[:80]}" if slug else f"Публікація з домену {parsed.netloc or url}"

    if not extracted_text:
        extracted_text = f"{extracted_title}. Аналіз матеріалу за посиланням {url}."

    return extracted_title, extracted_text


@router.post("/url", response_model=VerificationResultResponse)
async def verify_custom_url(
    payload: VerifyUrlRequest,
    current_user: Optional[User] = Depends(get_optional_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Онлайн-парсинг сторінки за URL (trafilatura) та повний розбір маніпуляцій і достовірності
    через конвеєр Trust Score V3 (Репутація домену ІМІ + Стилометрія + ML-класифікатор + Фактчеки).
    """
    domain_str = reputation_service.normalize_domain(payload.url)
    extracted_title, extracted_text = await _extract_title_and_text_from_url(payload.url)

    score, verdict, details = await calculate_multi_factor_trust(
        title=extracted_title,
        text=extracted_text,
        source=None,
        db=db,
        source_domain_override=domain_str,
    )

    breakdown = TrustScoreBreakdown(
        score=score,
        verdict=verdict,
        stylometry_score=float(details.get("stylometry_score", 75.0)),
        source_reputation_score=float(details.get("source_reputation", 75.0)),
        ml_authenticity_score=float(details.get("ml_authenticity_score", 75.0)),
        corroboration_score=float(details.get("corroboration_score", 75.0)),
        fact_check_flag=bool(details.get("factcheck_debunked", False)),
        manipulation_markers=list(details.get("manipulation_markers", [])),
        explanation=str(details.get("explanation") or details.get("reason") or ""),
        models_breakdown=dict(details.get("models_breakdown", {})),
        xai_top_tokens=list(details.get("xai_top_tokens", [])),
        corroborating_articles=list(details.get("corroborating_articles", [])),
        corroboration_summary=str(details.get("corroboration_summary", "")),
        matched_fact_checks=list(details.get("matched_fact_checks", [])),
        xai_reasoning_steps=list(details.get("xai_reasoning_steps", [])),
    )

    report_entry = AnalysisReport(
        url=payload.url,
        input_text=extracted_text[:5000],
        user_id=current_user.id if current_user else None,
        trust_score=breakdown.score,
        verdict=breakdown.verdict,
        stylometry_score=breakdown.stylometry_score,
        source_reputation_score=breakdown.source_reputation_score,
        ml_authenticity_score=breakdown.ml_authenticity_score,
        corroboration_score=breakdown.corroboration_score,
        fact_check_flag=breakdown.fact_check_flag,
        manipulation_markers=breakdown.manipulation_markers,
        explanation=breakdown.explanation,
    )
    db.add(report_entry)

    if current_user:
        history_entry = VerificationHistory(
            user_id=current_user.id,
            query_type="url",
            query_preview=payload.url[:120],
            trust_score=breakdown.score,
            verdict=breakdown.verdict,
        )
        db.add(history_entry)

    await db.commit()

    preview = extracted_text[:260] + "..." if len(extracted_text) > 260 else extracted_text
    return VerificationResultResponse(
        title=extracted_title,
        extracted_text_preview=preview,
        analyzed_domain=domain_str or payload.url,
        trust_breakdown=breakdown,
    )


@router.get("/model-info")
async def get_ml_model_info() -> Dict[str, Any]:
    """Отримання метаданих активного ML-класифікатора та результатів його валідації."""
    return ml_classifier_service.get_evaluation_metrics()
