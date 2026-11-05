import pytest
from httpx import AsyncClient, ASGITransport
from app.main import app
from app.services.reputation_service import reputation_service
from app.services.stylometry_service import stylometry_service
from app.services.factcheck_service import fact_check_service
from app.services.ingestion import calculate_baseline_trust, calculate_multi_factor_trust
from app.models.source import Source


def test_domain_reputation_categories():
    """Тест перевірки Білого, Сірого та Чорного списків моніторингу ІМІ."""
    # Білий список (найвища довіра)
    suspilne = reputation_service.get_reputation("suspilne.media")
    assert suspilne.is_whitelisted is True
    assert suspilne.is_blacklisted is False
    assert suspilne.reliability_rating >= 95.0

    pravda = reputation_service.get_reputation("pravda.com.ua")
    assert pravda.is_whitelisted is True
    assert pravda.reliability_rating >= 90.0

    bbc = reputation_service.get_reputation("bbc.com")
    assert bbc.is_whitelisted is True
    assert bbc.reliability_rating >= 92.0

    # Сірий список (жовта преса / таблоїди / клікбейт)
    tsn = reputation_service.get_reputation("tsn.ua")
    assert tsn.is_whitelisted is False
    assert tsn.is_blacklisted is False
    assert 60.0 <= tsn.reliability_rating <= 75.0

    znaj = reputation_service.get_reputation("znaj.ua")
    assert znaj.reliability_rating <= 50.0

    # Чорний список (кремлівська пропаганда, підсанкційні медіа)
    strana = reputation_service.get_reputation("strana.today")
    assert strana.is_blacklisted is True
    assert strana.reliability_rating <= 15.0

    tass = reputation_service.get_reputation("tass.ru")
    assert tass.is_blacklisted is True
    assert tass.reliability_rating <= 10.0

    # Невідомий домен (нейтральний рейтинг за замовчуванням)
    unknown = reputation_service.get_reputation("unknown-regional-news-portal.ua")
    assert unknown.is_whitelisted is False
    assert unknown.is_blacklisted is False
    assert unknown.reliability_rating == 75.0


def test_stylometry_clean_news():
    """Стилометричний аналіз якісної нейтральної новини."""
    clean_title = "Кабінет Міністрів України ухвалив рішення про фінансування модернізації укриттів"
    clean_text = (
        "Сьогодні на засіданні уряду прем'єр-міністр повідомив про виділення коштів для регіонів. "
        "Згідно з офіційним повідомленням пресслужби Міністерства розвитку громад, кошти надійдуть до кінця місяця."
    )
    result = stylometry_service.analyze(clean_title, clean_text)
    assert result.stylometry_trust_index >= 90.0
    assert result.overall_penalty <= 10.0
    assert len(result.triggers) == 0


def test_stylometry_clickbait_and_caps():
    """Стилометричний аналіз клікбейту, сенсаційності та надмірної пунктуації."""
    clickbait_title = "НЕЙМОВІРНО! ШОК!!! ТАКЕ СТАЛОСЯ ВПЕРШЕ! ВИ НЕ ПОВІРИТЕ ЩО ВІДБУВАЄТЬСЯ!!!"
    result = stylometry_service.analyze(clickbait_title, "")
    assert result.clickbait_score > 30.0
    assert result.caps_lock_ratio >= 0.7
    assert result.stylometry_trust_index < 50.0
    assert any(t.category == "clickbait" for t in result.triggers)
    assert any(t.category == "typography" for t in result.triggers)


def test_stylometry_propaganda_and_manipulation():
    """Стилометричний аналіз виявлення пропагандистських наративів та мови ворожнечі."""
    propaganda_text = "Київський режим та укронацисти готують брудну бомбу за наказом англосаксів та біолабораторій НАТО."
    result = stylometry_service.analyze("Провокація на фронті", propaganda_text)
    assert result.manipulation_score > 40.0
    assert result.stylometry_trust_index < 40.0
    assert any(t.category == "propaganda" for t in result.triggers)


def test_stylometry_vague_attribution():
    """Стилометричний аналіз виявлення розмитої атрибуції джерел."""
    vague_text = "Як стверджують експерти та анонімні джерела, подейкують що найближчим часом все зміниться."
    result = stylometry_service.analyze("Зміни у системі", vague_text)
    assert any(t.category == "attribution" for t in result.triggers)


@pytest.mark.asyncio
async def test_factcheck_matching(async_db):
    """Тест алгоритму звірки статей із базою спростованих фейків (Stem & Prefix Overlap)."""
    from app.models.claim import FactCheckClaim

    # Додамо реальний фактчек StopFake до тестової сесії
    claim = FactCheckClaim(
        claim="Українців у Німеччині відправлятимуть назад в Україну воювати",
        claimant="Російські Telegram-канали",
        fact_checker="StopFake",
        review_url="https://www.stopfake.org/uk/manipulyatsiya-ukrayintsiv-u-nimechchini-vidpravlyatimut-nazad-v-ukrayinu-voyuvati/",
        rating="Маніпуляція",
        explanation="Поліція та уряд ФРН спростували заяви про депортацію українців для мобілізації.",
        language="ua",
    )
    async_db.add(claim)
    await async_db.commit()

    fake_title = "Українців у Німеччині масово відправлятимуть назад воювати"
    fake_text = "ЗМІ пишуть що українських біженців у Німеччині депортують."

    match_res = await fact_check_service.match_article(fake_title, fake_text, db=async_db)
    assert match_res.is_debunked is True
    assert match_res.confidence >= 0.30
    assert match_res.matched_claim is not None
    assert match_res.matched_claim.fact_checker == "StopFake"

    # Перевірка звичайної новини, яка не є фейком
    neutral_title = "Нова марка Укрпошти присвячена Дню захисників і захисниць України"
    neutral_res = await fact_check_service.match_article(neutral_title, "Укрпошта презентувала поштовий блок.", db=async_db)
    assert neutral_res.is_debunked is False


@pytest.mark.asyncio
async def test_multi_factor_trust_v2_blacklisted():
    """Тест жорсткого обмеження довіри для джерел із чорного списку (<= 15 балів, High Risk)."""
    black_source = Source(name="Страна", domain="strana.today", reliability_rating=10.0, is_blacklisted=True)
    score, verdict, breakdown = await calculate_multi_factor_trust(
        title="Звичайна новина про погоду в Україні",
        text="Синоптики прогнозують теплий тиждень.",
        source=black_source
    )
    assert score <= 15.0
    assert verdict == "High Risk"
    assert "чорному списку" in breakdown.get("reason", "")


@pytest.mark.asyncio
async def test_multi_factor_trust_v2_debunked_claim(async_db):
    """Тест жорсткого обмеження довіри для новини, що збігається зі спростованим фейком (<= 15 балів, High Risk)."""
    from app.models.claim import FactCheckClaim

    claim = FactCheckClaim(
        claim="Українців у Німеччині відправлятимуть назад в Україну воювати",
        claimant="Російські Telegram-канали",
        fact_checker="StopFake",
        review_url="https://www.stopfake.org/uk/manipulyatsiya-ukrayintsiv-u-nimechchini-vidpravlyatimut-nazad-v-ukrayinu-voyuvati/",
        rating="Маніпуляція",
        explanation="Поліція та уряд ФРН спростували заяви.",
        language="ua",
    )
    async_db.add(claim)
    await async_db.commit()

    source = Source(name="Суспільне", domain="suspilne.media", reliability_rating=96.0, is_whitelisted=True)
    score, verdict, breakdown = await calculate_multi_factor_trust(
        title="Українців у Німеччині відправлятимуть назад в Україну воювати",
        text="Польська влада передає Україні військовозобов'язаних.",
        source=source,
        db=async_db
    )
    assert score <= 15.0
    assert verdict == "High Risk"
    assert breakdown.get("factcheck_debunked") is True


@pytest.mark.asyncio
async def test_multi_factor_trust_v2_clean_verified():
    """Тест розрахунку довіри для якісної новини з авторитетного білого списку (>= 85 балів, Verified)."""
    source = Source(name="Суспільне", domain="suspilne.media", reliability_rating=96.0, is_whitelisted=True)
    score, verdict, breakdown = await calculate_multi_factor_trust(
        title="Уряд затвердив план відновлення енергетичної інфраструктури",
        text="Прем'єр-міністр представив масштабну стратегію децентралізації генерації енергії.",
        source=source
    )
    assert score >= 85.0
    assert verdict == "Verified"
    assert breakdown.get("factcheck_debunked") is False


@pytest.mark.asyncio
async def test_factcheck_api_endpoints(async_db):
    """Перевірка роботи API /api/v1/factchecks та /api/v1/factchecks/check."""
    from app.models.claim import FactCheckClaim

    claim = FactCheckClaim(
        claim="Українців у Німеччині відправлятимуть назад в Україну воювати",
        claimant="Російські Telegram-канали",
        fact_checker="StopFake",
        review_url="https://www.stopfake.org/uk/manipulyatsiya-ukrayintsiv-u-nimechchini-vidpravlyatimut-nazad-v-ukrayinu-voyuvati/",
        rating="Маніпуляція",
        explanation="Спростовано урядом Німеччини.",
        language="ua",
    )
    async_db.add(claim)
    await async_db.commit()

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        # 1. Отримання списку фактчеків
        res = await client.get("/api/v1/factchecks?limit=10")
        assert res.status_code == 200
        data = res.json()
        assert "items" in data
        assert "total" in data

        # 2. Перевірка довільного тексту через API
        check_payload = {
            "title": "Українців у Німеччині відправлятимуть назад в Україну воювати",
            "text": "Масова депортація з Німеччини"
        }
        check_res = await client.post("/api/v1/factchecks/check", json=check_payload)
        assert check_res.status_code == 200
        check_data = check_res.json()
        assert "is_debunked" in check_data
        assert "confidence" in check_data
        assert check_data["is_debunked"] is True


@pytest.mark.asyncio
async def test_reputation_api_endpoints():
    """Перевірка роботи API /api/v1/sources/check-reputation."""
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        # Білий список
        res = await client.get("/api/v1/sources/check-reputation?domain=suspilne.media")
        assert res.status_code == 200
        data = res.json()
        assert data["domain"] == "suspilne.media"
        assert data["is_whitelisted"] is True
        assert data["status"] == "whitelisted"

        # Чорний список
        res_black = await client.get("/api/v1/sources/check-reputation?domain=ria.ru")
        assert res_black.status_code == 200
        black_data = res_black.json()
        assert black_data["is_blacklisted"] is True
        assert black_data["status"] == "blacklisted"
