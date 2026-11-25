from typing import Optional
from datetime import datetime, timezone, timedelta
from fastapi import APIRouter, Query, HTTPException, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, or_
from sqlalchemy.orm import defer
from app.db.session import get_db
from app.models.article import Article
from app.models.source import Source
from app.models.user import User
from app.models.bookmark import Bookmark
from app.api.deps import get_optional_current_user
from app.schemas.news import NewsFeedResponse, ArticleDetail, ArticleRead, TrustScoreBreakdown
from app.services.ingestion import news_ingestion_service

router = APIRouter()


async def seed_initial_articles_if_empty(db: AsyncSession):
    """Початкове наповнення демонстраційними статтями українських медіа з різними рівнями довіри."""
    count_res = await db.execute(select(func.count(Article.id)))
    if (count_res.scalar() or 0) > 0:
        return

    # Створюємо джерела
    sources_data = [
        {"name": "Суспільне Новини", "domain": "suspilne.media", "reliability_rating": 96.0, "is_whitelisted": True},
        {"name": "Українська правда", "domain": "pravda.com.ua", "reliability_rating": 92.0, "is_whitelisted": True},
        {"name": "BBC News Україна", "domain": "bbc.com", "reliability_rating": 95.0, "is_whitelisted": True},
        {"name": "Укрінформ", "domain": "ukrinform.ua", "reliability_rating": 91.0, "is_whitelisted": True},
        {"name": "Сумнівне Медіа Таблоїд", "domain": "clickbait-news.net", "reliability_rating": 35.0, "is_blacklisted": True},
    ]
    created_sources = {}
    for s_data in sources_data:
        src = Source(**s_data)
        db.add(src)
        created_sources[s_data["domain"]] = src
    await db.flush()

    # Створюємо зразки новин
    now = datetime.now(timezone.utc)
    articles_data = [
        Article(
            title="ЄС погодив новий пакет фінансової та оборонної підтримки України",
            url="https://suspilne.media/news/eu-support-package-2026",
            domain="suspilne.media",
            source_name="Суспільне Новини",
            summary="Лідери країн Європейського Союзу затвердили багатомільярдну програму безпекової допомоги на спільній зустрічі в Брюсселі.",
            full_text="Європейська рада після тривалих консультацій одноголосно підтримала виділення нового пакета макрофінансової та гуманітарної допомоги. Рішення спрямоване на зміцнення енергетичної стійкості та відновлення інфраструктури.",
            author="Олена Ковальчук",
            language="ua",
            category="Політика",
            published_at=now - timedelta(hours=2),
            image_url="https://images.unsplash.com/photo-1526304640581-d334cdbbf45e?w=800&q=80",
            trust_score=94.5,
            verdict="Verified"
        ),
        Article(
            title="Штучний інтелект допоміг виявити нові терапевтичні білкові структури",
            url="https://pravda.com.ua/technology/ai-protein-breakthrough",
            domain="pravda.com.ua",
            source_name="Українська правда",
            summary="Міжнародна дослідницька група за участю українських біоінформатиків розробила алгоритм глибокого навчання для точного моделювання лігандів.",
            full_text="Нове наукове дослідження, опубліковане у провідному рецензованому журналі, демонструє прискорення скринінгу молекул у десятки разів завдяки гібридним трансформерам.",
            author="Максим Демченко",
            language="ua",
            category="Технології",
            published_at=now - timedelta(hours=5),
            image_url="https://images.unsplash.com/photo-1507413245164-6160d8298b31?w=800&q=80",
            trust_score=91.0,
            verdict="Verified"
        ),
        Article(
            title="Незвичні коливання валютного курсу: аналіз експертів банківського сектору",
            url="https://ukrinform.ua/economics/currency-market-trends",
            domain="ukrinform.ua",
            source_name="Укрінформ",
            summary="Національний банк України пояснив фактори сезонної волатильності на міжбанківському ринку та стабільність золотовалютних резервів.",
            full_text="Попит на безготівкову валюту залишається контрольованим завдяки інтервенціям регулятора та ритмічним надходженням міжнародної допомоги.",
            author="Андрій Савчук",
            language="ua",
            category="Економіка",
            published_at=now - timedelta(hours=9),
            image_url="https://images.unsplash.com/photo-1611974789855-9c2a0a7236a3?w=800&q=80",
            trust_score=88.0,
            verdict="Verified"
        ),
        Article(
            title="ТЕРМІНОВО! Всі банки заблокують картки з понеділка: що приховують фінансисти?!",
            url="https://clickbait-news.net/cards-block-scandal",
            domain="clickbait-news.net",
            source_name="Сумнівне Медіа Таблоїд",
            summary="Шокуючі чутки поширюються у соціальних мережах про масове списання грошей та блокування рахунків громадян.",
            full_text="У мережі спалахнула паніка через вигадане рішення про тотальне замороження рахунків без жодних офіційних підтверджень регуляторів.",
            author="Анонімний кореспондент",
            language="ua",
            category="Економіка",
            published_at=now - timedelta(hours=14),
            image_url="https://images.unsplash.com/photo-1563013544-824ae1b704d3?w=800&q=80",
            trust_score=24.0,
            verdict="High Risk"
        ),
        Article(
            title="Погода в Україні: синоптики попереджають про різке потепління та грози",
            url="https://bbc.com/ukrainian/weather-weekend-forecast",
            domain="bbc.com",
            source_name="BBC News Україна",
            summary="Гідрометцентр прогнозує підвищення температури до +24°C у більшості областей України наприкінці тижня.",
            full_text="Атмосферний фронт із південного заходу принесе весняне тепло та періодичні дощі в західні та центральні регіони.",
            author="BBC Monitoring",
            language="ua",
            category="Суспільство",
            published_at=now - timedelta(hours=18),
            image_url="https://images.unsplash.com/photo-1534088568595-a066f410bcda?w=800&q=80",
            trust_score=93.0,
            verdict="Verified"
        ),
        Article(
            title="СЕНСАЦІЯ! Вчені знайшли таємну воду, яка лікує всі хвороби за один день!",
            url="https://clickbait-news.net/secret-healing-water",
            domain="clickbait-news.net",
            source_name="Сумнівне Медіа Таблоїд",
            summary="Псевдонауковий матеріал про магічні властивості структурованої води, що суперечить усім законам біохімії.",
            full_text="Текст побудований на маніпуляціях, відсутності клінічних посилань та прямій рекламі несертифікованих біодобавок.",
            author="Невідомий",
            language="ua",
            category="Здоров'я",
            published_at=now - timedelta(hours=22),
            image_url="https://images.unsplash.com/photo-1548839140-29a749e1bc4e?w=800&q=80",
            trust_score=15.0,
            verdict="High Risk"
        )
    ]
    db.add_all(articles_data)
    await db.commit()


@router.get("", response_model=NewsFeedResponse)
@router.get("/", response_model=NewsFeedResponse)
async def get_news_feed(
    page: int = Query(1, ge=1, description="Номер сторінки"),
    page_size: int = Query(12, ge=1, le=50, description="Кількість новин на сторінці"),
    category: Optional[str] = Query(None, description="Фільтр за категорією"),
    language: Optional[str] = Query(None, description="Мова (ua або en)"),
    source: Optional[str] = Query(None, description="Фільтр за доменом або назвою джерела"),
    verdict: Optional[str] = Query(None, description="Рівень довіри: Verified, Caution, High Risk"),
    search: Optional[str] = Query(None, description="Пошуковий запит у заголовку, тексті чи джерелі"),
    time_range: Optional[str] = Query("all", description="Часовий діапазон: all, 24h, today, week"),
    sort_by: Optional[str] = Query("newest", description="Сортування: newest, trust_desc, trust_asc"),
    personalized: bool = Query(False, description="Застосувати персональні уподобання авторизованого користувача"),
    current_user: Optional[User] = Depends(get_optional_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Отримати агреговану стрічку новин з фільтрацією за достовірністю, мовою, часом та категоріями."""
    await seed_initial_articles_if_empty(db)

    query = select(Article).where(Article.language == "ua")

    # Персоналізація для авторизованого користувача
    if personalized and current_user and current_user.preferences:
        prefs = current_user.preferences
        fav_cats = prefs.get("favorite_categories") or []
        fav_srcs = prefs.get("favorite_sources") or []
        only_ver = prefs.get("only_verified", False)

        if fav_cats:
            query = query.where(Article.category.in_(fav_cats))
        if fav_srcs:
            query = query.where(
                or_(
                    Article.domain.in_(fav_srcs),
                    Article.source_name.in_(fav_srcs)
                )
            )
        if only_ver:
            query = query.where(Article.verdict == "Verified")

    if category:
        query = query.where(Article.category == category)
    if language and language != "all":
        query = query.where(Article.language == language)
    if source and source != "ALL":
        query = query.where(
            or_(
                Article.domain == source,
                Article.source_name == source,
            )
        )
    if verdict:
        query = query.where(Article.verdict == verdict)
    if search:
        search_pattern = f"%{search}%"
        query = query.where(
            or_(
                Article.title.ilike(search_pattern),
                Article.summary.ilike(search_pattern),
                Article.source_name.ilike(search_pattern),
                Article.domain.ilike(search_pattern),
            )
        )

    # Фільтрація за часом публікації
    now_utc = datetime.now(timezone.utc)
    if time_range == "24h":
        query = query.where(Article.published_at >= now_utc - timedelta(hours=24))
    elif time_range == "today":
        today_start = now_utc.replace(hour=0, minute=0, second=0, microsecond=0)
        query = query.where(Article.published_at >= today_start)
    elif time_range == "week":
        query = query.where(Article.published_at >= now_utc - timedelta(days=7))

    # Загальна кількість
    count_stmt = select(func.count()).select_from(query.subquery())
    total_count = (await db.execute(count_stmt)).scalar() or 0

    # Сортування
    if sort_by == "trust_desc":
        order_clauses = [Article.trust_score.desc(), Article.published_at.desc()]
    elif sort_by == "trust_asc":
        order_clauses = [Article.trust_score.asc(), Article.published_at.desc()]
    else:  # newest
        order_clauses = [Article.published_at.desc()]

    # Пагінація (не тягнемо важкий full_text із БД для списку карток)
    query = (
        query.options(defer(Article.full_text))
        .order_by(*order_clauses)
        .offset((page - 1) * page_size)
        .limit(page_size)
    )
    articles = (await db.execute(query)).scalars().all()

    bookmarked_ids = set()
    if current_user and articles:
        article_ids = [a.id for a in articles]
        b_stmt = select(Bookmark.article_id).where(
            Bookmark.user_id == current_user.id,
            Bookmark.article_id.in_(article_ids)
        )
        b_res = await db.execute(b_stmt)
        bookmarked_ids = set(b_res.scalars().all())

    items = []
    for a in articles:
        item = ArticleRead.model_validate(a)
        item.is_bookmarked = a.id in bookmarked_ids
        items.append(item)

    return NewsFeedResponse(
        total=total_count,
        page=page,
        page_size=page_size,
        items=items
    )


@router.post("/sync", tags=["News Ingestion"])
async def trigger_news_sync(
    max_per_feed: int = Query(100, ge=1, le=200, description="Максимальна кількість новин з кожного каналу"),
    db: AsyncSession = Depends(get_db)
):
    """
    Ручний запуск збору свіжих новин з активних RSS-каналів (Українська правда, BBC Україна, Дзеркало тижня, Суспільне, Укрінформ).
    """
    stats = await news_ingestion_service.sync_all_feeds(db, max_per_feed=max_per_feed)
    return stats


@router.get("/{article_id}", response_model=ArticleDetail)
async def get_article_detail(
    article_id: int,
    current_user: Optional[User] = Depends(get_optional_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Отримати детальну інформацію про новину, розгорнутий XAI звіт та схожі публікації інших ЗМІ."""
    res = await db.execute(select(Article).where(Article.id == article_id))
    article = res.scalar_one_or_none()
    if not article:
        raise HTTPException(status_code=404, detail=f"Новину з ID {article_id} не знайдено")

    # Якщо збережено лише короткий опис або відсутні підпис/автор, довантажуємо деталі з першоджерела
    from app.services.ingestion import build_summary_from_text, clean_author_name

    current_body = (article.full_text or "").strip()
    current_sum = (article.summary or "").strip()
    current_auth = (article.author or "").strip()
    needs_enrich = len(current_body) < 220 or len(current_sum) < 35 or not current_auth

    if needs_enrich and article.url and article.url.startswith("http"):
        updated_fields = False
        if len(current_body) < 220 or not current_auth:
            try:
                details = await news_ingestion_service.extract_article_details(article.url)
                extracted_text = (details.get("full_text") or "").strip()
                if extracted_text and len(extracted_text) > len(current_body):
                    article.full_text = extracted_text[:12000]
                    current_body = article.full_text
                    updated_fields = True
                extracted_author = details.get("author")
                if not current_auth:
                    resolved_auth = clean_author_name(extracted_author, article.source_name)
                    if resolved_auth:
                        article.author = resolved_auth
                        current_auth = resolved_auth
                        updated_fields = True
                if len(current_sum) < 35 and details.get("description"):
                    from app.services.factcheck_service import clean_html_text
                    desc = clean_html_text(details["description"])
                    if len(desc) >= 35:
                        article.summary = desc[:1000]
                        current_sum = article.summary
                        updated_fields = True
            except Exception:
                await db.rollback()

        if len(current_sum) < 35 and len(current_body) >= 35:
            article.summary = build_summary_from_text(current_body, max_len=260)
            updated_fields = True

        if not current_auth and article.source_name:
            article.author = clean_author_name(None, article.source_name)
            updated_fields = True

        if updated_fields:
            try:
                await db.commit()
                await db.refresh(article)
            except Exception:
                await db.rollback()

    is_bookmarked = False
    if current_user:
        b_res = await db.execute(
            select(Bookmark.id).where(Bookmark.user_id == current_user.id, Bookmark.article_id == article.id)
        )
        is_bookmarked = b_res.scalar_one_or_none() is not None

    # Схожі новини з тієї ж категорії (без зайвого full_text)
    sim_res = await db.execute(
        select(Article)
        .options(defer(Article.full_text))
        .where(Article.category == article.category, Article.id != article.id)
        .order_by(Article.published_at.desc())
        .limit(3)
    )
    similar_articles = sim_res.scalars().all()

    # Генерація розгорнутого звіту XAI через конвеєр Trust Score V4 (pgvector + Dual-RoBERTa)
    # Обов'язково передаємо той самий об'єкт Source із БД, що й при імпорті RSS, для 100% узгодженості бала
    from app.services.ingestion import calculate_multi_factor_trust

    source_obj: Optional[Source] = None
    if article.source_id is not None:
        source_obj = (
            await db.execute(select(Source).where(Source.id == article.source_id))
        ).scalar_one_or_none()
    if source_obj is None and article.domain:
        source_obj = (
            await db.execute(select(Source).where(Source.domain == article.domain))
        ).scalar_one_or_none()

    calc_score, calc_verdict, details = await calculate_multi_factor_trust(
        title=article.title,
        text=article.full_text or article.summary or "",
        source=source_obj,
        db=db,
        source_domain_override=article.domain,
        exclude_article_id=article.id,
        reference_published_at=article.published_at,
    )

    # Синхронізуємо збережений бал із актуальним перерахунком Trust Score V4 (наприклад, якщо інші ЗМІ вже підтвердили подію)
    if article.trust_score is None or abs(float(article.trust_score) - float(calc_score)) >= 0.5:
        article.trust_score = calc_score
        article.verdict = calc_verdict
        try:
            await db.commit()
        except Exception:
            await db.rollback()

    breakdown = TrustScoreBreakdown(
        score=calc_score,
        verdict=calc_verdict,
        stylometry_score=float(details.get("stylometry_score", 85.0)),
        source_reputation_score=float(details.get("source_reputation", 85.0)),
        ml_authenticity_score=float(details.get("ml_authenticity_score", 85.0)),
        corroboration_score=float(details.get("corroboration_score", 85.0)),
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

    article_read = ArticleRead.model_validate(article)
    article_read.is_bookmarked = is_bookmarked

    detail_dict = {
        **article_read.model_dump(),
        "full_text": article.full_text or article.summary or "",
        "trust_breakdown": breakdown,
        "similar_articles": [ArticleRead.model_validate(s) for s in similar_articles]
    }
    return ArticleDetail(**detail_dict)


@router.get("/{article_id}/related")
async def get_related_cross_verified_articles(
    article_id: int,
    db: AsyncSession = Depends(get_db),
):
    """
    Пошук семантично близьких публікацій з інших незалежних ЗМІ у pgvector (Cosine Distance <=>)
    для крос-верифікації події.
    """
    from app.services.cross_verification_service import cross_verification_service
    from app.services.reputation_service import reputation_service

    res = await db.execute(select(Article).where(Article.id == article_id))
    article = res.scalar_one_or_none()
    if not article:
        raise HTTPException(status_code=404, detail=f"Новину з ID {article_id} не знайдено")

    rep = reputation_service.get_reputation(article.domain)
    corr_res = await cross_verification_service.corroborate_article(
        title=article.title,
        text_body=article.full_text or article.summary or "",
        source_domain=article.domain,
        is_whitelisted=rep.is_whitelisted,
        ml_authenticity_score=article.trust_score or 85.0,
        stylometry_score=85.0,
        db=db,
        exclude_article_id=article.id,
        max_related=6,
        reference_published_at=article.published_at,
    )
    items = [
        {
            "id": a.id,
            "title": a.title,
            "url": a.url,
            "source_name": a.source_name,
            "domain": a.domain,
            "trust_score": a.trust_score,
            "verdict": a.verdict,
            "similarity": a.similarity,
            "is_whitelisted": a.is_whitelisted_source,
            "published_at": a.published_at.isoformat() if a.published_at else None,
        }
        for a in corr_res.related_articles
    ]
    return {
        "corroboration_score": corr_res.corroboration_score,
        "independent_sources_count": corr_res.independent_sources_count,
        "whitelisted_sources_count": corr_res.whitelisted_sources_count,
        "corroboration_status": corr_res.corroboration_status,
        "explanation": corr_res.summary,
        "summary": corr_res.summary,
        "corroborating_articles": items,
    }
