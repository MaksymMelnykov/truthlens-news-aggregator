import pytest
from httpx import AsyncClient, ASGITransport
from app.main import app
from app.services.ingestion import (
    normalize_url,
    infer_category,
    calculate_baseline_trust,
    is_clean_ukrainian_content,
    DEFAULT_FEEDS,
    NewsIngestionService,
)
from app.models.source import Source


def test_normalize_url():
    """Перевірка нормалізації URL та очищення від трекінгових параметрів."""
    url = "https://www.pravda.com.ua/news/2026/09/19/12345/?utm_source=telegram&utm_medium=channel&fbclid=abc123xyz#comments"
    normalized = normalize_url(url)
    assert "utm_source" not in normalized
    assert "fbclid" not in normalized
    assert "#comments" not in normalized
    assert normalized == "https://www.pravda.com.ua/news/2026/09/19/12345"


def test_infer_category():
    """Перевірка евристичного визначення категорії новин."""
    cat1 = infer_category("Президент провів переговори з лідерами ЄС щодо оборонної підтримки", [], "")
    assert cat1 == "Політика"

    cat2 = infer_category("Новий прорив у сфері генеративного штучного інтелекту та нейромереж", [], "")
    assert cat2 == "Технології"

    cat3 = infer_category("Курс гривні та інфляція в умовах світової економічної кризи", [], "")
    assert cat3 == "Економіка"


def test_calculate_baseline_trust():
    """Перевірка базового розрахунку довіри та виявлення клікбейту."""
    source = Source(name="Суспільне", domain="suspilne.media", reliability_rating=96.0, is_whitelisted=True)

    # Звичайна якісна новина
    score, verdict = calculate_baseline_trust("Уряд затвердив план відновлення енергетичної системи", source)
    assert score >= 90.0
    assert verdict == "Verified"

    # Клікбейтний заголовок із сенсаційними маркерами та знаками оклику
    clickbait_title = "ШОК!!! ВИ НЕ ПОВІРИТЕ, ЩО ПРИХОВУЮТЬ ЧИНОВНИКИ?!"
    bad_score, bad_verdict = calculate_baseline_trust(clickbait_title, source)
    assert bad_score < score
    assert bad_verdict in ["Caution", "High Risk"]


@pytest.mark.asyncio
async def test_sync_endpoint():
    """Перевірка роботи ендпоінта ручної синхронізації /api/v1/news/sync."""
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        res = await client.post("/api/v1/news/sync?max_per_feed=2")
        assert res.status_code == 200
        data = res.json()
        assert data["status"] == "success"
        assert "total_new_articles" in data
        assert "feeds_count" in data
        assert data["feeds_count"] == len(DEFAULT_FEEDS)


def test_language_filter():
    """Перевірка суворого відсікання російськомовного контенту та валідації мов."""
    from app.services.ingestion import is_valid_article_content

    # 1. Справжній український текст (має українські літери)
    assert is_clean_ukrainian_content("Сили оборони України звільнили черговий населений пункт") is True
    assert is_clean_ukrainian_content("Новини економіки та фінансів", "Національний банк повідомив про зміни") is True
    assert is_valid_article_content("Сили оборони України діють успішно", language="ua") is True

    # 2. Російський текст (має літери ы, э, ъ, ё) — обов'язково False для будь-якої мови!
    assert is_clean_ukrainian_content("Срочные новости: в России произошел взрыв на заводе") is False
    assert is_clean_ukrainian_content("Заголовок без спецбукв", "Но в тексте статьи есть буква ы и это русский текст") is False
    assert is_clean_ukrainian_content("Это не украинский текст") is False
    assert is_valid_article_content("Срочные новости в России", language="ua") is False
    assert is_valid_article_content("Срочные новости в России", language="en") is False

    # 3. Англомовний контент для міжнародних стрічок
    assert is_valid_article_content("Global economy faces new challenges as inflation drops", language="en") is True
    assert is_valid_article_content("AI breakthrough helps medical researchers model proteins", language="en") is True


def test_ukrainian_feeds_and_sport_world_categories():
    """Перевірка виключно україномовного каталогу стрічок (включно зі спортом) та категорій «Спорт» і «Світ»."""
    assert all(f["language"] == "ua" for f in DEFAULT_FEEDS)
    assert any("Sport.ua" in f["name"] for f in DEFAULT_FEEDS)
    assert any("Чемпіон" in f["name"] for f in DEFAULT_FEEDS)

    # Перевірка категорії «Спорт»
    assert infer_category("Збірна України здобула перемогу в матчі Ліги чемпіонів", [], "") == "Спорт"
    assert infer_category("Олександр Усик проведе захист титулу в Лондоні", [], "") == "Спорт"
    assert infer_category("Будь-яка новина", [], "https://sport.ua/uk/news/123") == "Спорт"

    # Перевірка категорії «Світ» (новини українських ЗМІ про міжнародні події)
    assert infer_category("У Вашингтоні обговорили новий договір між США та ЄС", [], "") == "Світ"
    assert infer_category("У Берліні та Парижі відбувся саміт лідерів Євросоюзу", [], "") == "Світ"


@pytest.mark.asyncio
async def test_time_and_sort_filters():
    """Перевірка фільтрації за часом, мовою та сортування в ендпоінті новин."""
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        # Тест сортування за рівнем довіри (найвищі спочатку)
        res_sort = await client.get("/api/v1/news?sort_by=trust_desc&page_size=5")
        assert res_sort.status_code == 200
        items = res_sort.json()["items"]
        if len(items) >= 2:
            assert items[0]["trust_score"] >= items[1]["trust_score"]

        # Тест фільтрації за часом (24h)
        res_24h = await client.get("/api/v1/news?time_range=24h")
        assert res_24h.status_code == 200
        assert "total" in res_24h.json()

        # Тест фільтрації за мовою (ua, en, all)
        res_ua = await client.get("/api/v1/news?language=ua")
        assert res_ua.status_code == 200

        res_en = await client.get("/api/v1/news?language=en")
        assert res_en.status_code == 200

        res_all = await client.get("/api/v1/news?language=all")
        assert res_all.status_code == 200
