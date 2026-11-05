from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from app.db.session import get_db
from app.models.user import User
from app.core.config import settings
from app.schemas.user import (
    UserCreate,
    UserLogin,
    UserRead,
    TokenResponse,
    RefreshTokenRequest,
    GoogleAuthRequest,
    GoogleCallbackRequest,
    UserPreferencesUpdate
)
from app.core.security import (
    verify_password,
    get_password_hash,
    create_access_token,
    create_refresh_token,
    decode_token
)
from app.api.deps import get_current_user

router = APIRouter()


@router.post("/register", response_model=TokenResponse, status_code=status.HTTP_201_CREATED)
async def register(user_in: UserCreate, db: AsyncSession = Depends(get_db)):
    """Реєстрація нового користувача в системі."""
    # Перевірка наявності користувача з таким email
    existing = await db.execute(select(User).where(User.email == user_in.email.lower()))
    if existing.scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Користувач із цією електронною адресою вже зареєстрований"
        )
    
    # Якщо це перший користувач у системі — призначаємо роль admin, інакше user
    count_res = await db.execute(select(func.count(User.id)))
    total_users = count_res.scalar() or 0
    role = "admin" if total_users == 0 else "user"

    hashed_pw = get_password_hash(user_in.password)
    user = User(
        email=user_in.email.lower(),
        hashed_password=hashed_pw,
        full_name=user_in.full_name,
        role=role,
        is_active=True,
        preferences={
            "favorite_categories": [],
            "favorite_sources": [],
            "only_verified": False
        }
    )
    db.add(user)
    await db.commit()
    await db.refresh(user)

    access_token = create_access_token(subject=user.id, role=user.role)
    refresh_token = create_refresh_token(subject=user.id)

    return TokenResponse(
        access_token=access_token,
        refresh_token=refresh_token,
        token_type="bearer",
        user=UserRead.model_validate(user)
    )


@router.post("/login", response_model=TokenResponse)
async def login(login_data: UserLogin, db: AsyncSession = Depends(get_db)):
    """Авторизація користувача за email та паролем."""
    result = await db.execute(select(User).where(User.email == login_data.email.lower()))
    user = result.scalar_one_or_none()
    
    if not user or not user.hashed_password:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Невірний email або пароль"
        )
    
    if not verify_password(login_data.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Невірний email або пароль"
        )
    
    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Обліковий запис деактивовано"
        )

    access_token = create_access_token(subject=user.id, role=user.role)
    refresh_token = create_refresh_token(subject=user.id)

    return TokenResponse(
        access_token=access_token,
        refresh_token=refresh_token,
        token_type="bearer",
        user=UserRead.model_validate(user)
    )


@router.post("/refresh", response_model=TokenResponse)
async def refresh_token_endpoint(data: RefreshTokenRequest, db: AsyncSession = Depends(get_db)):
    """Оновлення JWT access токена за допомогою refresh токена."""
    payload = decode_token(data.refresh_token)
    if not payload or payload.get("type") != "refresh":
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Недійсний токен оновлення"
        )
    
    user_id = payload.get("sub")
    if not user_id:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Недійсний токен")
    
    result = await db.execute(select(User).where(User.id == int(user_id)))
    user = result.scalar_one_or_none()
    if not user or not user.is_active:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Користувача не знайдено або деактивовано")

    new_access_token = create_access_token(subject=user.id, role=user.role)
    new_refresh_token = create_refresh_token(subject=user.id)

    return TokenResponse(
        access_token=new_access_token,
        refresh_token=new_refresh_token,
        token_type="bearer",
        user=UserRead.model_validate(user)
    )


@router.get("/me", response_model=UserRead)
async def get_current_user_profile(current_user: User = Depends(get_current_user)):
    """Отримати профіль поточного авторизованого користувача."""
    return UserRead.model_validate(current_user)


@router.put("/me/preferences", response_model=UserRead)
async def update_preferences(
    prefs: UserPreferencesUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Оновити налаштування персональної стрічки новин користувача."""
    from sqlalchemy.orm.attributes import flag_modified

    current_prefs = dict(current_user.preferences or {})
    if prefs.favorite_categories is not None:
        current_prefs["favorite_categories"] = prefs.favorite_categories
    if prefs.favorite_sources is not None:
        current_prefs["favorite_sources"] = prefs.favorite_sources
    if prefs.only_verified is not None:
        current_prefs["only_verified"] = prefs.only_verified
    
    current_user.preferences = current_prefs
    flag_modified(current_user, "preferences")
    db.add(current_user)
    await db.commit()
    await db.refresh(current_user)
    return UserRead.model_validate(current_user)


@router.post("/google", response_model=TokenResponse)
async def google_login(data: GoogleAuthRequest, db: AsyncSession = Depends(get_db)):
    """Вхід / реєстрація через Google OAuth2."""
    email = (data.email or "").lower().strip()
    if not email:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Google акаунт не надав email адресу"
        )
    
    if not (email.endswith("@gmail.com") or email.endswith("@googlemail.com")):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Вхід через Google підтримує лише акаунти @gmail.com"
        )
    
    result = await db.execute(select(User).where(User.email == email))
    user = result.scalar_one_or_none()

    if not user:
        count_res = await db.execute(select(func.count(User.id)))
        total = count_res.scalar() or 0
        user = User(
            email=email,
            full_name=data.full_name or email.split("@")[0],
            role="admin" if total == 0 else "user",
            google_id=data.credential[:64],
            is_active=True,
            preferences={
                "favorite_categories": [],
                "favorite_sources": [],
                "only_verified": False
            }
        )
        db.add(user)
        await db.commit()
        await db.refresh(user)
    elif not user.google_id:
        user.google_id = data.credential[:64]
        db.add(user)
        await db.commit()
        await db.refresh(user)

    access_token = create_access_token(subject=user.id, role=user.role)
    refresh_token = create_refresh_token(subject=user.id)

    return TokenResponse(
        access_token=access_token,
        refresh_token=refresh_token,
        token_type="bearer",
        user=UserRead.model_validate(user)
    )


@router.get("/google/url")
async def get_google_auth_url(redirect_uri: Optional[str] = None):
    """
    Отримати URL для переходу на Google OAuth2 Account Chooser.
    Параметр prompt=select_account гарантує відображення списку всіх акаунтів Google користувача.
    """
    from app.core.config import Settings
    current_settings = Settings()
    client_id = current_settings.GOOGLE_CLIENT_ID or settings.GOOGLE_CLIENT_ID
    redir = redirect_uri or "http://localhost:3000/auth/callback/google"
    if not client_id:
        return {
            "configured": False,
            "url": None,
            "message": "GOOGLE_CLIENT_ID не налаштовано в backend/.env"
        }
    
    url = (
        f"https://accounts.google.com/o/oauth2/v2/auth?"
        f"client_id={client_id}&"
        f"redirect_uri={redir}&"
        f"response_type=code&"
        f"scope=openid%20email%20profile&"
        f"prompt=select_account&"
        f"access_type=offline"
    )
    return {
        "configured": True,
        "url": url,
        "client_id": client_id
    }


import time

# Кеш останніх успішних обмінів кодів авторизації Google для запобігання помилки invalid_grant
# при дублюючих запитах (наприклад, React StrictMode або повторний клік)
# code -> (timestamp, TokenResponse)
_recent_google_codes: dict[str, tuple[float, TokenResponse]] = {}


@router.post("/google/callback", response_model=TokenResponse)
async def google_callback(data: GoogleCallbackRequest, db: AsyncSession = Depends(get_db)):
    """
    Обробка повернення з Google після вибору акаунта на accounts.google.com.
    Обмінює код авторизації на токен та профіль Google, створює або авторизує користувача.
    """
    now = time.time()
    # Очищення застарілих записів (> 60 сек)
    for c in list(_recent_google_codes.keys()):
        if now - _recent_google_codes[c][0] > 60:
            _recent_google_codes.pop(c, None)

    # Якщо цей самий код уже був успішно обміняний за останні 60 секунд (наприклад, дубль від StrictMode)
    if data.code in _recent_google_codes:
        return _recent_google_codes[data.code][1]

    from app.core.config import Settings
    current_settings = Settings()
    client_id = current_settings.GOOGLE_CLIENT_ID or settings.GOOGLE_CLIENT_ID
    client_secret = current_settings.GOOGLE_CLIENT_SECRET or settings.GOOGLE_CLIENT_SECRET

    if not client_id or not client_secret:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Google OAuth2 не налаштовано на сервері (відсутній GOOGLE_CLIENT_ID або GOOGLE_CLIENT_SECRET)"
        )
    
    redir = data.redirect_uri or "http://localhost:3000/auth/callback/google"
    
    import httpx
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            token_resp = await client.post(
                "https://oauth2.googleapis.com/token",
                data={
                    "client_id": client_id,
                    "client_secret": client_secret,
                    "code": data.code,
                    "grant_type": "authorization_code",
                    "redirect_uri": redir,
                }
            )
            if token_resp.status_code != 200:
                if "invalid_grant" in token_resp.text:
                    raise HTTPException(
                        status_code=status.HTTP_400_BAD_REQUEST,
                        detail="Код авторизації Google вже було використано або його термін дії закінчився. Будь ласка, натисніть Увійти через Google знову."
                    )
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"Не вдалося обміняти код на токен Google: {token_resp.text}"
                )
            
            token_data = token_resp.json()
            access_token_google = token_data.get("access_token")
            
            user_resp = await client.get(
                "https://www.googleapis.com/oauth2/v3/userinfo",
                headers={"Authorization": f"Bearer {access_token_google}"}
            )
            if user_resp.status_code != 200:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Не вдалося отримати дані профілю від Google"
                )
            
            google_profile = user_resp.json()
    except httpx.RequestError as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Помилка зв'язку з серверами Google: {str(exc)}"
        )
    
    email = (google_profile.get("email") or "").lower().strip()
    if not email:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Google акаунт не надав email адресу"
        )
    
    if not (email.endswith("@gmail.com") or email.endswith("@googlemail.com")):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Вхід через Google підтримує лише акаунти @gmail.com"
        )
    
    result = await db.execute(select(User).where(User.email == email))
    user = result.scalar_one_or_none()
    
    google_sub = str(google_profile.get("sub") or "")
    full_name = google_profile.get("name") or email.split("@")[0]
    
    if not user:
        count_res = await db.execute(select(func.count(User.id)))
        total = count_res.scalar() or 0
        user = User(
            email=email,
            full_name=full_name,
            role="admin" if total == 0 else "user",
            google_id=google_sub[:64],
            is_active=True,
            preferences={
                "favorite_categories": [],
                "favorite_sources": [],
                "only_verified": False
            }
        )
        db.add(user)
        await db.commit()
        await db.refresh(user)
    elif not user.google_id:
        user.google_id = google_sub[:64]
        db.add(user)
        await db.commit()
        await db.refresh(user)

    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Обліковий запис деактивовано"
        )
    
    access_token = create_access_token(subject=user.id, role=user.role)
    refresh_token = create_refresh_token(subject=user.id)
    
    token_response = TokenResponse(
        access_token=access_token,
        refresh_token=refresh_token,
        token_type="bearer",
        user=UserRead.model_validate(user)
    )
    # Зберігаємо в кеш для захисту від повторного виклику
    _recent_google_codes[data.code] = (now, token_response)
    return token_response
