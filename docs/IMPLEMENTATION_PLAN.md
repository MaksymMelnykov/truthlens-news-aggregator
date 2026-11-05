# План реалізації: База даних, Користувачі/Автентифікація, Персоналізація та Ініціалізація Next.js Фронтенду

Цей план описує технічні зміни та впровадження розширеного функціоналу в проєкт **TruthLens** відповідно до оновлених вимог:
1. **База даних та моделі ORM (SQLAlchemy)**: `User`, `Source`, `Article`, `Bookmark`, `VerificationHistory`, `AnalysisReport`, `FactCheckClaim`.
2. **Безпека та автентифікація (FastAPI + JWT + Google OAuth2 + RBAC)**:
   - Реєстрація, логін, рефреш токенів (Access + Refresh JWT).
   - Підтримка Google OAuth2 входу.
   - Ролі користувачів: `User` (звичайний) та `Admin` (керування джерелами).
   - Ендпоінти для закладок (`/api/v1/bookmarks`), історії перевірок (`/api/v1/history`), профілю (`/api/v1/auth/me`).
   - Відповідність практикам `Anthropic-Cybersecurity-Skills` (захист від broken access control, безпечне хешування bcrypt, валідація токенів, захист від XSS та CSRF).
3. **Клієнтський застосунок (`frontend/`)**:
   - Ініціалізація проєкту на **Next.js 14/15** (App Router, TypeScript, Tailwind CSS, Lucide icons).
   - Дизайн-система за стандартами `ui-ux-pro-max-skill` та `impeccable`:
     - Сучасна типографіка та кольорова гама з підтримкою темної/світлої теми.
     - Адаптивний хедер зі зміною стану (Гість vs Авторизований користувач).
     - Форми входу (`/login`) та реєстрації (`/register`) з валідацією.
     - Головна сторінка новин з фільтрами та бейджами достовірності (Trust Score).
     - Розділи «Закладки» (`/bookmarks`) та «Історія перевірок» (`/history`).
     - Сторінка швидкої перевірки новини (`/verify`).

---

## Запропоновані зміни по компонентах

### 1. Бекенд: База даних, безпека та моделі (`backend/`)

#### [MODIFY] `backend/requirements.txt`
- Додати `pyjwt>=2.8.0`, `passlib[bcrypt]>=1.7.4`, `bcrypt>=4.0.1`

#### [MODIFY] `backend/app/core/config.py`
- Додати налаштування JWT: `SECRET_KEY`, `ALGORITHM`, `ACCESS_TOKEN_EXPIRE_MINUTES`, `REFRESH_TOKEN_EXPIRE_DAYS`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`.

#### [NEW] `backend/app/core/security.py`
- Функції хешування паролів (`verify_password`, `get_password_hash`).
- Генерація та декодування токенів (`create_access_token`, `create_refresh_token`, `decode_token`).

#### [NEW] `backend/app/models/`
- `user.py`: Модель `User` (id, email, hashed_password, full_name, role ['user', 'admin'], is_active, google_id, preferences, created_at).
- `source.py`: Модель `Source` (id, name, domain, reliability_rating, is_whitelisted, is_blacklisted, created_at).
- `article.py`: Модель `Article` (id, title, url, full_text, source_id, summary, author, language, category, published_at, image_url, trust_score, verdict, created_at).
- `analysis.py`: Модель `AnalysisReport` (id, article_id, url, input_text, user_id, trust_score, verdict, stylometry_score, source_reputation_score, ml_authenticity_score, corroboration_score, fact_check_flag, manipulation_markers, explanation, created_at).
- `bookmark.py`: Модель `Bookmark` (id, user_id, article_id, created_at).
- `history.py`: Модель `VerificationHistory` (id, user_id, analysis_id, created_at).
- `__init__.py`: Експорт усіх моделей.

#### [NEW] `backend/app/schemas/user.py`
- Pydantic-схеми: `UserCreate`, `UserLogin`, `UserRead`, `TokenResponse`, `RefreshTokenRequest`, `GoogleAuthRequest`, `UserPreferencesUpdate`.

#### [NEW] `backend/app/schemas/bookmark.py` & `backend/app/schemas/history.py`
- DTO-схеми для закладок та історії.

#### [NEW] `backend/app/api/deps.py`
- Залежності FastAPI: `get_current_user`, `get_current_active_user`, `get_current_admin`.

#### [NEW] `backend/app/api/v1/endpoints/auth.py`
- Ендпоінти: `POST /register`, `POST /login`, `POST /refresh`, `GET /me`, `POST /google`.

#### [NEW] `backend/app/api/v1/endpoints/bookmarks.py`
- Ендпоінти: `GET /bookmarks`, `POST /bookmarks/{article_id}`, `DELETE /bookmarks/{article_id}`.

#### [NEW] `backend/app/api/v1/endpoints/history.py`
- Ендпоінти: `GET /history`, `DELETE /history/{history_id}`.

#### [MODIFY] `backend/app/api/v1/router.py`
- Підключити роутери `auth`, `bookmarks`, `history`.

---

### 2. Клієнтський застосунок (`frontend/`)

#### [NEW] Структура Next.js (App Router):
- `package.json`, `tsconfig.json`, `tailwind.config.ts`, `postcss.config.js`, `next.config.js`.
- `src/app/layout.tsx` (глобальний макет, шрифт Inter, провайдер стану).
- `src/app/globals.css` (Tailwind стилі, кольорові токени, градієнти, dark mode).
- `src/context/AuthContext.tsx` (стан автентифікації: `user`, `login`, `logout`, `token`, збереження у localStorage/cookie).
- `src/components/Header.tsx` (навігація, логотип TruthLens, перемикач теми, статус входу: Login/Register або Avatar + Bookmarks + History + Logout).
- `src/components/NewsCard.tsx` (картка новини з кольоровими індикаторами Trust Score, кнопкою закладки).
- `src/components/TrustBadge.tsx` (стилізований бейдж довіри: Verified 80-100%, Caution 50-79%, High Risk 0-49%).
- `src/app/page.tsx` (головна стрічка новин, пошук, фільтрація за категоріями та рівнем ризику).
- `src/app/verify/page.tsx` (форма введення посилання або тексту для миттєвої перевірки).
- `src/app/login/page.tsx` & `src/app/register/page.tsx` (форми автентифікації).
- `src/app/bookmarks/page.tsx` (перегляд збережених новин користувача).
- `src/app/history/page.tsx` (перегляд історії перевірок користувача).

---

## План верифікації

### Автоматизовані тести бекенду
1. `pytest backend/tests/test_health.py` — перевірка ендпоінтів здоров'я API.
2. `pytest backend/tests/test_auth.py` — реєстрація, логін, отримання JWT, перевірка неправильного пароля, доступ до `/me`.
3. `pytest backend/tests/test_models.py` — створення моделей у БД, зв'язки Bookmark -> User -> Article.
4. `pytest backend/tests/test_bookmarks.py` — додавання новини в закладки та отримання списку.

### Верифікація фронтенду
1. Перевірка збірки або компіляції (`npm run build` або `npx tsc --noEmit`).
2. Перевірка роботи інтерфейсу, рендерингу стану для гостей та авторизованих користувачів.
