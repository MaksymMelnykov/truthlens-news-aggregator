import pytest
from httpx import AsyncClient, ASGITransport
from app.main import app
from app.services.ml_classifier_service import ml_classifier_service


def test_ml_classifier_authentic_vs_fake():
    """Перевірка роботи MLClassifierService на достовірній новині та клікбейтному фейку."""
    real_res = ml_classifier_service.predict(
        title="Національний банк України зберіг облікову ставку для макрофінансової стабільності",
        text=(
            "Правління Національного банку України ухвалило рішення залишити облікову ставку без змін. "
            "За даними офіційного пресрелізу регулятора, міжнародні резерви перебувають на достатньому рівні."
        ),
    )
    assert real_res.ml_authenticity_score >= 70.0
    assert real_res.predicted_label == "Real"
    assert real_res.inference_latency_ms >= 0.0

    fake_res = ml_classifier_service.predict(
        title="ТЕРМІНОВО! ШОК! З понеділка всі банківські картки українців будуть ПОВНІСТЮ ЗАБЛОКОВАНІ?!",
        text=(
            "Ви не повірите, що приховують від народу фінансисти! Анонімні джерела повідомили, "
            "що готується тотальний крах і всі рахунки заморозять без попередження! У мережі спалахнула паніка!"
        ),
    )
    assert fake_res.ml_authenticity_score <= 40.0
    assert fake_res.predicted_label == "Fake"
    assert fake_res.fake_probability >= 0.60


@pytest.mark.asyncio
async def test_verify_text_endpoint_live_pipeline():
    """Наскрізна перевірка /api/v1/verify/text із живим ML-класифікатором, стилометрією та репутацією."""
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        # 1. Достовірний журналістський текст із авторитетного домену
        clean_payload = {
            "title": "Європейська Рада погодила черговий транш фінансової підтримки України",
            "text": (
                "Комітет постійних представників країн-членів Європейського Союзу у Брюсселі погодив "
                "виділення чергового траншу макрофінансової допомоги в межах програми Ukraine Facility. "
                "Кошти спрямують до державного бюджету після підтвердження виконання погоджених індикаторів."
            ),
            "source_url": "https://suspilne.media/news/eu-facility",
        }
        res_clean = await client.post("/api/v1/verify/text", json=clean_payload)
        assert res_clean.status_code == 200
        clean_data = res_clean.json()
        tb_clean = clean_data["trust_breakdown"]
        assert tb_clean["score"] >= 80.0
        assert tb_clean["verdict"] == "Verified"
        assert tb_clean["ml_authenticity_score"] >= 70.0
        assert tb_clean["source_reputation_score"] >= 90.0

        # 2. Маніпулятивний фейковий текст
        fake_payload = {
            "title": "ШОК! СЕНСАЦІЯ! Вчені приховували правду: сода з окропом лікує всі хвороби за 3 дні!!",
            "text": (
                "Ви не повірите, що приховують від народу! Як стверджують експерти з таємних лабораторій, "
                "достатньо пити цей секретний розчин щоранку! У мережі спалахнула паніка, терміново дивіться!"
            ),
        }
        res_fake = await client.post("/api/v1/verify/text", json=fake_payload)
        assert res_fake.status_code == 200
        fake_data = res_fake.json()
        tb_fake = fake_data["trust_breakdown"]
        assert tb_fake["score"] < 50.0
        assert tb_fake["verdict"] == "High Risk"
        assert tb_fake["ml_authenticity_score"] <= 45.0
        assert len(tb_fake["manipulation_markers"]) >= 2


@pytest.mark.asyncio
async def test_verify_url_endpoint_blacklisted():
    """Перевірка /api/v1/verify/url для домену з чорного списку дезінформації."""
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        res = await client.post(
            "/api/v1/verify/url",
            json={"url": "https://strana.today/news/fake-story.html"},
        )
        assert res.status_code == 200
        data = res.json()
        assert data["analyzed_domain"] == "strana.today"
        assert data["trust_breakdown"]["verdict"] == "High Risk"
        assert data["trust_breakdown"]["score"] <= 15.0


@pytest.mark.asyncio
async def test_model_metrics_endpoints():
    """Перевірка доступності метрик оцінювання ML-моделей через API."""
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        res = await client.get("/api/v1/analytics/model-metrics")
        assert res.status_code == 200
        data = res.json()
        assert "models" in data
        assert "TruthLens Hybrid Ensemble" in data["models"]
        assert "ukr-roberta-base (Fine-Tuned)" in data["models"]
        assert data["models"]["TruthLens Hybrid Ensemble"]["f1_score"] >= 0.90

