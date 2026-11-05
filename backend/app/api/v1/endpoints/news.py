from typing import Optional
from datetime import datetime, timezone, timedelta
from fastapi import APIRouter, Query, HTTPException, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, or_
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
    verdict: Optional[str] = Query(None, description="Рівень довіри: Verified, Caution, High Risk"),
    search: Optional[str] = Query(None, description="Пошуковий запит у заголовку чи тексті"),
    time_range: Optional[str] = Query("all", description="Часовий діапазон: all, 24h, today, week"),
    sort_by: Optional[str] = Query("newest", description="Сортування: newest, trust_desc, trust_asc"),
    personalized: bool = Query(False, description="Застосувати персональні уподобання авторизованого користувача"),
    current_user: Optional[User] = Depends(get_optional_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Отримати агреговану стрічку новин з фільтрацією за достовірністю, мовою, часом та категоріями."""
    await seed_initial_articles_if_empty(db)

    query = select(Article)

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
    if verdict:
        query = query.where(Article.verdict == verdict)
    if search:
        search_pattern = f"%{search}%"
        query = query.where(
            or_(
                Article.title.ilike(search_pattern),
                Article.summary.ilike(search_pattern)
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

    # Пагінація
    query = query.order_by(*order_clauses).offset((page - 1) * page_size).limit(page_size)
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
    max_per_feed: int = Query(15, ge=1, le=50, description="Максимальна кількість новин з кожного каналу"),
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

    is_bookmarked = False
    if current_user:
        b_res = await db.execute(
            select(Bookmark.id).where(Bookmark.user_id == current_user.id, Bookmark.article_id == article.id)
        )
        is_bookmarked = b_res.scalar_one_or_none() is not None

    # Схожі новини з тієї ж категорії
    sim_res = await db.execute(
        select(Article)
        .where(Article.category == article.category, Article.id != article.id)
        .order_by(Article.published_at.desc())
        .limit(3)
    )
    similar_articles = sim_res.scalars().all()

    # Генерація розгорнутого звіту XAI через конвеєр Trust Score V3
    from app.services.ingestion import calculate_multi_factor_trust

    calc_score, calc_verdict, details = await calculate_multi_factor_trust(
        title=article.title,
        text=article.full_text or article.summary or "",
        source=None,
        db=db,
        source_domain_override=article.domain,
    )

    breakdown = TrustScoreBreakdown(
        score=article.trust_score or calc_score,
        verdict=article.verdict or calc_verdict,
        stylometry_score=float(details.get("stylometry_score", 85.0)),
        source_reputation_score=float(details.get("source_reputation", 85.0)),
        ml_authenticity_score=float(details.get("ml_authenticity_score", 85.0)),
        corroboration_score=float(details.get("corroboration_score", 85.0)),
        fact_check_flag=bool(details.get("factcheck_debunked", False)),
        manipulation_markers=list(details.get("manipulation_markers", [])),
        explanation=str(details.get("explanation") or details.get("reason") or ""),
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
