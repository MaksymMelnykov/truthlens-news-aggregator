import pytest
from httpx import AsyncClient, ASGITransport
from app.main import app


@pytest.mark.asyncio
async def test_sources_and_rbac():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        # 1. Створюємо першого користувача (він стає admin)
        admin_reg = await client.post("/api/v1/auth/register", json={
            "email": "admin@truthlens.ua",
            "password": "AdminPassword123!",
            "full_name": "Головний Модератор"
        })
        admin_token = admin_reg.json()["access_token"]
        admin_headers = {"Authorization": f"Bearer {admin_token}"}

        # 2. Створюємо другого користувача (він стає звичайним user)
        user_reg = await client.post("/api/v1/auth/register", json={
            "email": "regular@truthlens.ua",
            "password": "UserPassword123!",
            "full_name": "Звичайний Читач"
        })
        user_token = user_reg.json()["access_token"]
        user_headers = {"Authorization": f"Bearer {user_token}"}

        # 3. Звичайний користувач намагається додати джерело -> має отримати 403
        bad_add = await client.post("/api/v1/sources", json={
            "name": "Нове Джерело",
            "domain": "new-source.com",
            "reliability_rating": 85.0
        }, headers=user_headers)
        assert bad_add.status_code == 403

        # 4. Адміністратор додає джерело -> успіх 201
        ok_add = await client.post("/api/v1/sources", json={
            "name": "Радіо Свобода",
            "domain": "radiosvoboda.org",
            "homepage_url": "https://www.radiosvoboda.org",
            "reliability_rating": 94.0,
            "is_whitelisted": True,
            "is_blacklisted": False
        }, headers=admin_headers)
        assert ok_add.status_code == 201
        source_id = ok_add.json()["id"]

        # 5. Адміністратор оновлює рейтинг
        upd = await client.put(f"/api/v1/sources/{source_id}", json={
            "name": "Радіо Свобода (UA)",
            "domain": "radiosvoboda.org",
            "homepage_url": "https://www.radiosvoboda.org",
            "reliability_rating": 96.0,
            "is_whitelisted": True,
            "is_blacklisted": False
        }, headers=admin_headers)
        assert upd.status_code == 200
        assert upd.json()["reliability_rating"] == 96.0

        # 6. Отримання списку джерел публічно
        pub_list = await client.get("/api/v1/sources")
        assert pub_list.status_code == 200
        domains = [s["domain"] for s in pub_list.json()]
        assert "radiosvoboda.org" in domains
