import pytest
from httpx import AsyncClient, ASGITransport
from app.main import app


@pytest.mark.asyncio
async def test_auth_flow():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        # 1. Реєстрація нового користувача
        register_payload = {
            "email": "testuser@example.com",
            "password": "SecretPassword123!",
            "full_name": "Тестовий Користувач"
        }
        res = await client.post("/api/v1/auth/register", json=register_payload)
        assert res.status_code == 201, res.text
        data = res.json()
        assert "access_token" in data
        assert "refresh_token" in data
        assert data["user"]["email"] == "testuser@example.com"
        access_token = data["access_token"]
        refresh_token = data["refresh_token"]

        # 2. Перевірка дублікату реєстрації
        res_dup = await client.post("/api/v1/auth/register", json=register_payload)
        assert res_dup.status_code == 400

        # 3. Вхід з правильним паролем
        login_res = await client.post("/api/v1/auth/login", json={
            "email": "testuser@example.com",
            "password": "SecretPassword123!"
        })
        assert login_res.status_code == 200
        assert "access_token" in login_res.json()

        # 4. Вхід з неправильним паролем
        wrong_res = await client.post("/api/v1/auth/login", json={
            "email": "testuser@example.com",
            "password": "WrongPassword!"
        })
        assert wrong_res.status_code == 401

        # 5. Отримання профілю /me з токеном
        headers = {"Authorization": f"Bearer {access_token}"}
        me_res = await client.get("/api/v1/auth/me", headers=headers)
        assert me_res.status_code == 200
        assert me_res.json()["email"] == "testuser@example.com"

        # 6. Оновлення рефреш токена
        ref_res = await client.post("/api/v1/auth/refresh", json={"refresh_token": refresh_token})
        assert ref_res.status_code == 200
        assert "access_token" in ref_res.json()


@pytest.mark.asyncio
async def test_auth_me_unauthorized():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        res = await client.get("/api/v1/auth/me")
        assert res.status_code == 401


@pytest.mark.asyncio
async def test_google_auth_gmail_validation():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        # 1. Відхилення не-gmail пошти
        bad_res = await client.post("/api/v1/auth/google", json={
            "credential": "token_123",
            "email": "user@ukr.net",
            "full_name": "Test User"
        })
        assert bad_res.status_code == 400
        assert "підтримує лише акаунти @gmail.com" in bad_res.json()["detail"]

        # 2. Успішний вхід з валідним @gmail.com
        good_res = await client.post("/api/v1/auth/google", json={
            "credential": "token_valid_google_123",
            "email": "realuser.truthlens@gmail.com",
            "full_name": "Максим Мельников"
        })
        assert good_res.status_code == 200
        data = good_res.json()
        assert "access_token" in data
        assert data["user"]["email"] == "realuser.truthlens@gmail.com"

