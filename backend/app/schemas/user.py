from datetime import datetime
from typing import Optional, List, Dict, Any
from pydantic import BaseModel, EmailStr, Field, ConfigDict


class UserPreferencesUpdate(BaseModel):
    favorite_categories: Optional[List[str]] = Field(default=None, description="Список обраних категорій")
    favorite_sources: Optional[List[str]] = Field(default=None, description="Список обраних доменів джерел")
    only_verified: Optional[bool] = Field(default=False, description="Показувати тільки перевірені новини")


class UserBase(BaseModel):
    email: EmailStr
    full_name: Optional[str] = None


class UserCreate(UserBase):
    password: str = Field(..., min_length=6, description="Пароль щонайменше 6 символів")


class UserLogin(BaseModel):
    email: EmailStr
    password: str


class UserRead(UserBase):
    id: int
    role: str = "user"
    is_active: bool = True
    preferences: Optional[Dict[str, Any]] = None
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class TokenResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    user: UserRead


class RefreshTokenRequest(BaseModel):
    refresh_token: str


class GoogleAuthRequest(BaseModel):
    credential: str = Field(..., description="Google ID Token (JWT) або OAuth токен")
    email: Optional[EmailStr] = None
    full_name: Optional[str] = None


class GoogleCallbackRequest(BaseModel):
    code: str = Field(..., description="Authorization code від Google OAuth2")
    redirect_uri: Optional[str] = Field(default=None, description="Redirect URI, використаний при запиті")

