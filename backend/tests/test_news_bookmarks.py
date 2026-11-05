import pytest
from httpx import AsyncClient, ASGITransport
from app.main import app


@pytest.mark.asyncio
async def test_news_feed_and_bookmarks():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        # 1. Реєструємо користувача
        reg = await client.post("/api/v1/auth/register", json={
            "email": "reader@example.com",
            "password": "Password123!",
            "full_name": "Читач Новин"
        })
        token = reg.json()["access_token"]
        headers = {"Authorization": f"Bearer {token}"}

        # 2. Отримуємо стрічку новин
        feed_res = await client.get("/api/v1/news?page=1&page_size=10")
        assert feed_res.status_code == 200
        feed_data = feed_res.json()
        assert feed_data["total"] > 0
        assert len(feed_data["items"]) > 0
        first_article_id = feed_data["items"][0]["id"]

        # 3. Додаємо новину в закладки
        bm_res = await client.post(f"/api/v1/bookmarks/{first_article_id}", headers=headers)
        assert bm_res.status_code == 201

        # 4. Перевіряємо список закладок
        bm_list = await client.get("/api/v1/bookmarks", headers=headers)
        assert bm_list.status_code == 200
        assert len(bm_list.json()) >= 1
        assert bm_list.json()[0]["id"] == first_article_id

        # 5. Перевірка статусу збереження
        chk = await client.get(f"/api/v1/bookmarks/check/{first_article_id}", headers=headers)
        assert chk.status_code == 200
        assert chk.json()["is_bookmarked"] is True

        # 6. Перевірка тексту з записом в історію
        ver_res = await client.post("/api/v1/verify/text", json={
            "text": "Офіційне повідомлення про зміни в податковому законодавстві.",
            "title": "Податкові зміни"
        }, headers=headers)
        assert ver_res.status_code == 200
        assert ver_res.json()["trust_breakdown"]["score"] > 0

        # 7. Перевірка появи запису в історії
        hist_res = await client.get("/api/v1/history", headers=headers)
        assert hist_res.status_code == 200
        assert len(hist_res.json()) >= 1
