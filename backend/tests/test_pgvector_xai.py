"""
Інтеграційні та модульні тести Тижня 4:
- 256-вимірні семантичні ембединги (EmbeddingService + pgvector)
- Семантична крос-верифікація між незалежними ЗМІ (CrossVerificationService)
- Семантичний пошук у базі фактчеків (StopFake / VoxCheck)
- Trust Score V4 та розгорнутий звіт Explainable AI (XAI) у /api/v1/verify/text та /api/v1/news/{id}.
"""

import math
import pytest
from httpx import AsyncClient, ASGITransport

from app.main import app
from app.services.embedding_service import EMBEDDING_DIM, embedding_service


def test_embedding_service_256_dim_and_similarity():
    """Перевіряє розмірність (256), L2-нормалізацію та семантичну близькість новин про одну подію."""
    vec_a = embedding_service.encode_article(
        "Євросоюз затвердив новий пакет фінансової та оборонної підтримки України на 50 мільярдів євро",
        "Лідери країн ЄС у Брюсселі одноголосно погодили макрофінансову допомогу Україні для зміцнення бюджету та енергетики.",
    )
    vec_b = embedding_service.encode_article(
        "У Брюсселі лідери ЄС схвалили програму макрофінансової допомоги Україні обсягом 50 млрд євро",
        "Європейська рада підтримала фінансовий та безпековий пакет підтримки української економіки.",
    )
    vec_unrelated = embedding_service.encode_article(
        "Синоптики попереджають про сильні грози та шквали вітру в Карпатах на вихідних",
        "Гідрометцентр прогнозує зміну погоди та короткочасні дощі в західних областях.",
    )

    assert len(vec_a) == EMBEDDING_DIM == 256
    assert len(vec_b) == EMBEDDING_DIM == 256

    norm_a = math.sqrt(sum(x * x for x in vec_a))
    assert abs(norm_a - 1.0) < 1e-4

    sim_same_event = embedding_service.cosine_similarity(vec_a, vec_b)
    sim_unrelated = embedding_service.cosine_similarity(vec_a, vec_unrelated)

    assert sim_same_event > 0.45
    assert sim_same_event > sim_unrelated + 0.25


@pytest.mark.asyncio
async def test_verify_text_returns_full_xai_v4_breakdown():
    """Перевіряє, що POST /api/v1/verify/text повертає розгорнутий звіт Trust Score V4 та всі поля XAI."""
    payload = {
        "title": "Національний банк України повідомив про стабільність міжнародних резервів",
        "text": (
            "За офіційними даними Національного банку України, золотовалютні резерви "
            "залишаються на достатньому рівні завдяки ритмічній міжнародній фінансовій допомозі "
            "від партнерів ЄС та Світового банку."
        ),
        "source_url": "https://suspilne.media/news/nbu-reserves-2026",
    }

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        res = await client.post("/api/v1/verify/text", json=payload)
        assert res.status_code == 200
        data = res.json()

        tb = data["trust_breakdown"]
        assert tb["score"] >= 80.0
        assert tb["verdict"] == "Verified"

        # Перевірка полів Trust Score V4 (Тиждень 4)
        assert "models_breakdown" in tb
        assert "ukr-roberta-base" in tb["models_breakdown"]
        assert "xlm-roberta-base" in tb["models_breakdown"]
        assert "TruthLens Hybrid Ensemble" in tb["models_breakdown"]

        assert isinstance(tb["xai_top_tokens"], list)
        assert len(tb["xai_top_tokens"]) > 0
        assert "token" in tb["xai_top_tokens"][0]
        assert "direction" in tb["xai_top_tokens"][0]

        assert isinstance(tb["xai_reasoning_steps"], list)
        assert len(tb["xai_reasoning_steps"]) >= 4
        assert tb["xai_reasoning_steps"][0]["step"] == 1

        assert isinstance(tb["corroborating_articles"], list)
        assert isinstance(tb["corroboration_summary"], str)
        assert len(tb["corroboration_summary"]) > 10


@pytest.mark.asyncio
async def test_news_detail_and_related_cross_verification_endpoints():
    """Перевіряє GET /api/v1/news/{id} та GET /api/v1/news/{id}/related з крос-верифікацією ЗМІ."""
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        feed_res = await client.get("/api/v1/news?page=1&page_size=5")
        assert feed_res.status_code == 200
        items = feed_res.json()["items"]
        assert len(items) > 0

        article_id = items[0]["id"]

        # 1. Детальна сторінка новини з XAI V4
        detail_res = await client.get(f"/api/v1/news/{article_id}")
        assert detail_res.status_code == 200
        detail_data = detail_res.json()
        assert "trust_breakdown" in detail_data
        assert "models_breakdown" in detail_data["trust_breakdown"]
        assert "xai_reasoning_steps" in detail_data["trust_breakdown"]
        assert "corroborating_articles" in detail_data["trust_breakdown"]

        # 2. Ендпоінт крос-верифікації /related
        rel_res = await client.get(f"/api/v1/news/{article_id}/related")
        assert rel_res.status_code == 200
        rel_data = rel_res.json()
        assert "corroboration_score" in rel_data
        assert "corroborating_articles" in rel_data
        assert "explanation" in rel_data
