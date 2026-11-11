import re
from typing import Any, Dict, List, Optional
from urllib.parse import urlparse

import httpx
import trafilatura
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_optional_current_user
from app.db.session import get_db
from app.models.analysis import AnalysisReport
from app.models.article import Article
from app.models.history import VerificationHistory
from app.models.user import User
from app.schemas.news import TrustScoreBreakdown
from app.schemas.verify import (
    VerificationResultResponse,
    VerifyTextRequest,
    VerifyUrlRequest,
)
from app.services.ingestion import (
    calculate_multi_factor_trust,
    news_ingestion_service,
    normalize_url,
)
from app.services.ml_classifier_service import ml_classifier_service
from app.services.reputation_service import reputation_service

router = APIRouter()


async def _find_existing_article(
    db: AsyncSession,
    raw_url: Optional[str] = None,
    title: Optional[str] = None,
) -> Optional[Article]:
    """
    Шукає статтю в базі даних за нормалізованим URL або точним заголовком,
    щоб забезпечити 100% ідентичний TrustScore між стрічкою новин та модулем перевірки.
    """
    if raw_url and raw_url.strip():
        clean_u = normalize_url(raw_url.strip())
        raw_u = raw_url.strip().rstrip("/")
        stmt = (
            select(Article)
            .where(
                or_(
                    Article.url == clean_u,
                    Article.url == raw_url.strip(),
                    Article.url == raw_u,
                )
            )
            .limit(1)
        )
        found = (await db.execute(stmt)).scalar_one_or_none()
        if found:
            return found

    if title and len(title.strip()) >= 15:
        t_clean = title.strip()
        stmt_t = (
            select(Article)
            .where(func.lower(Article.title) == t_clean.lower())
            .order_by(Article.published_at.desc())
            .limit(1)
        )
        found_t = (await db.execute(stmt_t)).scalar_one_or_none()
        if found_t:
            return found_t

    return None


@router.post("/text", response_model=VerificationResultResponse)
async def verify_custom_text(
    payload: VerifyTextRequest,
    current_user: Optional[User] = Depends(get_optional_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Повна багатофакторна перевірка довільного тексту (Trust Score V4):
    поєднує оцінку надійності джерела (ІМІ), аналіз тону та клікбейту,
    ШІ-класифікатор правдивості, крос-верифікацію в інших ЗМІ та звірку з базою фактчеків.
    """
    effective_title = (payload.title or "").strip()
    if not effective_title:
        first_sentence = re.split(r"[.!?\n]+", payload.text.strip())[0]
        effective_title = first_sentence[:140] if first_sentence else payload.text[:140]

    existing_article = await _find_existing_article(
        db=db,
        raw_url=payload.source_url,
        title=effective_title,
    )

    domain_str = reputation_service.normalize_domain(
        payload.source_url or (existing_article.domain if existing_article else "")
    )

    score, verdict, details = await calculate_multi_factor_trust(
        title=existing_article.title if existing_article else effective_title,
        text=payload.text,
        source=None,
        db=db,
        source_domain_override=domain_str,
        exclude_article_id=existing_article.id if existing_article else None,
    )

    # Якщо стаття вже є в нашій стрічці новин — синхронізуємо підсумковий бал на 100%
    if existing_article and existing_article.trust_score is not None:
        score = round(float(existing_article.trust_score), 1)
        verdict = str(existing_article.verdict or verdict)

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
        sentence_analysis=list(details.get("sentence_analysis", [])),
        attribution_analysis=dict(details.get("attribution_analysis", {})),
    )

    # Зберігаємо аналітичний звіт у таблицю analysis_reports
    report_entry = AnalysisReport(
        article_id=existing_article.id if existing_article else None,
        url=payload.source_url or (existing_article.url if existing_article else None),
        input_text=f"{effective_title}\n\n{payload.text}"[:5000],
        user_id=current_user.id if current_user else None,
        trust_score=breakdown.score,
        verdict=breakdown.verdict,
        stylometry_score=breakdown.stylometry_score,
        source_reputation_score=breakdown.source_reputation_score,
        ml_authenticity_score=breakdown.ml_authenticity_score,
        corroboration_score=breakdown.corroboration_score,
        fact_check_flag=breakdown.fact_check_flag,
        manipulation_markers=breakdown.manipulation_markers,
        xai_data=breakdown.model_dump(mode="json"),
        explanation=breakdown.explanation,
    )
    db.add(report_entry)
    await db.flush()

    # Якщо запит від авторизованого користувача — фіксуємо в особисту історію з прив'язкою analysis_id
    if current_user:
        history_entry = VerificationHistory(
            user_id=current_user.id,
            query_type="text",
            query_preview=(payload.title or payload.text)[:120],
            trust_score=breakdown.score,
            verdict=breakdown.verdict,
            analysis_id=report_entry.id,
        )
        db.add(history_entry)

    await db.commit()
    await db.refresh(report_entry)

    preview = payload.text[:260] + "..." if len(payload.text) > 260 else payload.text
    return VerificationResultResponse(
        analysis_id=report_entry.id,
        title=payload.title or effective_title,
        extracted_text_preview=preview,
        analyzed_domain=domain_str or None,
        source_url=payload.source_url,
        query_type="text",
        created_at=report_entry.created_at,
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
    через конвеєр Trust Score V4. Якщо стаття за цим URL вже є у нашій базі новин —
    використовує її збережений текст і синхронізує підсумковий TrustScore на 100%.
    """
    existing_article = await _find_existing_article(db=db, raw_url=payload.url)

    domain_str = reputation_service.normalize_domain(
        existing_article.domain if existing_article and existing_article.domain else payload.url
    )

    if existing_article and (existing_article.full_text or existing_article.summary):
        extracted_title = existing_article.title
        extracted_text = existing_article.full_text or existing_article.summary or existing_article.title
    else:
        extracted_title, extracted_text = await _extract_title_and_text_from_url(payload.url)
        if not existing_article:
            existing_article = await _find_existing_article(db=db, raw_url=payload.url, title=extracted_title)

    score, verdict, details = await calculate_multi_factor_trust(
        title=extracted_title,
        text=extracted_text,
        source=None,
        db=db,
        source_domain_override=domain_str,
        exclude_article_id=existing_article.id if existing_article else None,
    )

    # Синхронізація TrustScore на 100%, якщо стаття вже є у стрічці новин
    if existing_article and existing_article.trust_score is not None:
        score = round(float(existing_article.trust_score), 1)
        verdict = str(existing_article.verdict or verdict)

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
        sentence_analysis=list(details.get("sentence_analysis", [])),
        attribution_analysis=dict(details.get("attribution_analysis", {})),
    )

    report_entry = AnalysisReport(
        article_id=existing_article.id if existing_article else None,
        url=payload.url,
        input_text=f"{extracted_title}\n\n{extracted_text}"[:5000],
        user_id=current_user.id if current_user else None,
        trust_score=breakdown.score,
        verdict=breakdown.verdict,
        stylometry_score=breakdown.stylometry_score,
        source_reputation_score=breakdown.source_reputation_score,
        ml_authenticity_score=breakdown.ml_authenticity_score,
        corroboration_score=breakdown.corroboration_score,
        fact_check_flag=breakdown.fact_check_flag,
        manipulation_markers=breakdown.manipulation_markers,
        xai_data=breakdown.model_dump(mode="json"),
        explanation=breakdown.explanation,
    )
    db.add(report_entry)
    await db.flush()

    if current_user:
        history_entry = VerificationHistory(
            user_id=current_user.id,
            query_type="url",
            query_preview=extracted_title[:120] if extracted_title else payload.url[:120],
            trust_score=breakdown.score,
            verdict=breakdown.verdict,
            analysis_id=report_entry.id,
        )
        db.add(history_entry)

    await db.commit()
    await db.refresh(report_entry)

    preview = extracted_text[:260] + "..." if len(extracted_text) > 260 else extracted_text
    return VerificationResultResponse(
        analysis_id=report_entry.id,
        title=extracted_title,
        extracted_text_preview=preview,
        analyzed_domain=domain_str or payload.url,
        source_url=payload.url,
        query_type="url",
        created_at=report_entry.created_at,
        trust_breakdown=breakdown,
    )


async def _reconstruct_report_response(
    report: AnalysisReport,
    db: AsyncSession,
) -> VerificationResultResponse:
    """
    Повертає збережений розбір VerificationResultResponse із AnalysisReport
    без повторного запуску аналізу з нуля (використовує збережений знімок xai_data).
    """
    raw_input = report.input_text or ""
    if "\n\n" in raw_input:
        parts = raw_input.split("\n\n", 1)
        title_str = parts[0].strip()
        body_str = parts[1].strip()
    else:
        first_sentence = re.split(r"[.!?\n]+", raw_input.strip())[0]
        title_str = first_sentence[:140] if first_sentence else "Перевірений матеріал"
        body_str = raw_input

    domain_str = reputation_service.normalize_domain(report.url or "")

    # Якщо повний XAI-знімок вже збережений у БД — повертаємо його миттєво без повторного аналізу
    if report.xai_data and isinstance(report.xai_data, dict) and report.xai_data.get("xai_reasoning_steps"):
        xai_dict = dict(report.xai_data)
        if not xai_dict.get("sentence_analysis"):
            xai_dict["sentence_analysis"] = ml_classifier_service.analyze_sentences(title_str, body_str)
        if not xai_dict.get("attribution_analysis"):
            from app.services.stylometry_service import stylometry_service

            xai_dict["attribution_analysis"] = stylometry_service.analyze_attribution(title_str, body_str)
        breakdown = TrustScoreBreakdown(**xai_dict)
    else:
        _, _, details = await calculate_multi_factor_trust(
            title=title_str,
            text=body_str or title_str,
            source=None,
            db=db,
            source_domain_override=domain_str,
            exclude_article_id=report.article_id,
        )
        breakdown = TrustScoreBreakdown(
            score=round(float(report.trust_score), 1),
            verdict=str(report.verdict),
            stylometry_score=round(float(report.stylometry_score), 1),
            source_reputation_score=round(float(report.source_reputation_score), 1),
            ml_authenticity_score=round(float(report.ml_authenticity_score), 1),
            corroboration_score=round(float(report.corroboration_score), 1),
            fact_check_flag=bool(report.fact_check_flag),
            manipulation_markers=list(report.manipulation_markers or details.get("manipulation_markers", [])),
            explanation=str(report.explanation or details.get("explanation") or ""),
            models_breakdown=dict(details.get("models_breakdown", {})),
            xai_top_tokens=list(details.get("xai_top_tokens", [])),
            corroborating_articles=list(details.get("corroborating_articles", [])),
            corroboration_summary=str(details.get("corroboration_summary", "")),
            matched_fact_checks=list(details.get("matched_fact_checks", [])),
            xai_reasoning_steps=list(details.get("xai_reasoning_steps", [])),
            sentence_analysis=list(details.get("sentence_analysis", [])),
            attribution_analysis=dict(details.get("attribution_analysis", {})),
        )
        try:
            report.xai_data = breakdown.model_dump(mode="json")
            await db.commit()
        except Exception:
            await db.rollback()

    preview = body_str[:260] + "..." if len(body_str) > 260 else body_str
    return VerificationResultResponse(
        analysis_id=report.id,
        title=title_str,
        extracted_text_preview=preview,
        analyzed_domain=domain_str or report.url,
        source_url=report.url,
        query_type="url" if report.url else "text",
        created_at=report.created_at,
        trust_breakdown=breakdown,
    )


@router.get("/reports", response_model=List[Dict[str, Any]])
async def get_recent_verification_reports(
    limit: int = 20,
    current_user: Optional[User] = Depends(get_optional_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Повертає список раніше перевірених статей за посиланням або власним текстом
    (для поточного користувача або останні перевірки), щоб їх можна було переглянути знову в будь-який час.
    """
    stmt = select(AnalysisReport).order_by(AnalysisReport.created_at.desc()).limit(min(limit, 50))
    if current_user:
        stmt = (
            select(AnalysisReport)
            .where(or_(AnalysisReport.user_id == current_user.id, AnalysisReport.user_id.is_(None)))
            .order_by(AnalysisReport.created_at.desc())
            .limit(min(limit, 50))
        )

    reports = (await db.execute(stmt)).scalars().all()
    items: List[Dict[str, Any]] = []
    for r in reports:
        raw_input = (r.input_text or "").strip()
        if "\n\n" in raw_input:
            title_part, body_part = raw_input.split("\n\n", 1)
        else:
            title_part = raw_input[:110] or r.url or "Перевірений матеріал"
            body_part = raw_input
        items.append(
            {
                "id": r.id,
                "analysis_id": r.id,
                "query_type": "url" if r.url else "text",
                "title": title_part.strip()[:140],
                "preview": body_part.strip()[:200],
                "url": r.url,
                "trust_score": round(float(r.trust_score), 1),
                "verdict": r.verdict,
                "explanation": r.explanation,
                "created_at": r.created_at.isoformat() if r.created_at else None,
            }
        )
    return items


@router.get("/reports/{report_id}", response_model=VerificationResultResponse)
async def get_verification_report_by_id(
    report_id: int,
    db: AsyncSession = Depends(get_db),
):
    """Отримати повний збережений XAI-звіт раніше перевіреної статті за її ID."""
    res = await db.execute(select(AnalysisReport).where(AnalysisReport.id == report_id))
    report = res.scalar_one_or_none()
    if not report:
        raise HTTPException(status_code=404, detail="Звіт перевірки не знайдено")
    return await _reconstruct_report_response(report, db)


@router.get("/model-info")
async def get_ml_model_info() -> Dict[str, Any]:
    """Отримання метаданих активного ML-класифікатора та результатів його валідації."""
    return ml_classifier_service.get_evaluation_metrics()
