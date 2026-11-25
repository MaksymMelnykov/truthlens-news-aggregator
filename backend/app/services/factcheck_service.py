import html
import logging
import re
import time
from datetime import datetime, timezone
from typing import List, Dict, Any, Optional, Tuple
import httpx
import feedparser
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.models.claim import FactCheckClaim
from app.schemas.claim import FactCheckClaimCreate, FactCheckMatchResult, FactCheckClaimRead

logger = logging.getLogger(__name__)


def clean_html_text(raw: Optional[str]) -> str:
    """Декодує HTML-сутності (&#160;, &#8230;, &quot;, &apos;), видаляє теги й нормалізує пробіли."""
    if not raw:
        return ""
    text_val = html.unescape(str(raw))
    text_val = re.sub(r"<[^>]+>", " ", text_val)
    text_val = text_val.replace("\xa0", " ").replace("[…]", "…")
    text_val = re.sub(r"\s+", " ", text_val).strip()
    return text_val


# Шаблони загальних аналітичних статей / дайджестів, які НЕ є окремими спростованими фейк-тезами
ANALYTICAL_NON_CLAIM_PATTERNS = (
    "про що брешуть",
    "як росія використовує",
    "як російська пропаганда",
    "дайджест",
    "підсумки тижня",
    "огляд дезінформац",
    "моделі інформаційного тиску",
    "підписав указ",
    "маша та ведмідь",
    "для імі",
)

# Загальноновинні високочастотні слова, які зустрічаються щодня в реальних новинах
# і самі по собі НЕ доводять збігу з конкретним фейком
GENERIC_NEWS_STEMS = {
    "україн", "росій", "росія", "кремл", "зелен", "прези", "волод", "путін",
    "трамп", "війн", "війсь", "фронт", "облас", "місто", "міста", "місті",
    "країн", "держа", "уряд", "влада", "влади", "медіа", "телег", "канал",
    "відео", "фото", "санкц", "удар", "атак", "ракет", "дрон", "обстр",
    "енерг", "світл", "елект", "окупа", "ворож", "ситуа", "рішен", "заяв",
    "повіл", "поясн", "офіці", "новин", "пропа", "маніп", "дезін", "фейк",
    "людей", "люди", "жител", "грома", "місце", "район", "сусід", "європ",
    "світ", "світу", "році", "року", "років", "тижня", "місяц", "серед",
}


def is_specific_debunked_claim(claim_text: str, explanation: str = "") -> bool:
    """Відрізняє конкретну спростовану фейк-тезу від загальних аналітичних оглядів StopFake / ІМІ."""
    low = (claim_text or "").strip().lower()
    if len(low) < 18:
        return False
    if any(pat in low for pat in ANALYTICAL_NON_CLAIM_PATTERNS):
        return False
    expl_low = (explanation or "").strip().lower()
    if expl_low.startswith("джерело:") and "для імі" in expl_low[:90]:
        return False
    return True


class FactCheckService:
    """
    Сервіс агрегації фактчеків, пошуку спростувань та порівняння з новинами.
    Працює виключно зі справжніми даними зі StopFake, VoxCheck та Google Fact Check Tools API.
    """

    CLAIMS_CACHE_TTL_SECONDS = 900.0  # 15 хвилин кешування для зменшення навантаження на Neon

    def __init__(self):
        self.google_api_key = settings.GOOGLE_FACT_CHECK_API_KEY
        self.stopfake_rss_url = "https://www.stopfake.org/uk/feed/"
        self._claims_cache: Dict[int, Tuple[float, List[FactCheckClaimRead]]] = {}

    def invalidate_claims_cache(self) -> None:
        """Скидає in-memory кеш фактчеків після додавання нових спростувань."""
        self._claims_cache.clear()

    async def _get_cached_claims(self, db: Optional[AsyncSession]) -> List[FactCheckClaimRead]:
        """Повертає до 200 останніх фактчеків із 15-хвилинним in-memory кешем (прив'язаним до engine)."""
        now = time.monotonic()

        if db is not None:
            cache_key = id(db.get_bind())
            cached = self._claims_cache.get(cache_key)
            if cached and (now - cached[0]) < self.CLAIMS_CACHE_TTL_SECONDS:
                return cached[1]
            try:
                res = await db.execute(
                    select(FactCheckClaim).order_by(FactCheckClaim.created_at.desc()).limit(200)
                )
                claims = [FactCheckClaimRead.model_validate(c) for c in res.scalars().all()]
                self._claims_cache[cache_key] = (now, claims)
                return claims
            except Exception as e:
                logger.warning(f"Помилка читання фактчеків з БД: {e}")
                return cached[1] if cached else []

        try:
            from app.db.session import async_session_maker, engine

            cache_key = id(engine)
            cached = self._claims_cache.get(cache_key)
            if cached and (now - cached[0]) < self.CLAIMS_CACHE_TTL_SECONDS:
                return cached[1]
            async with async_session_maker() as temp_db:
                res = await temp_db.execute(
                    select(FactCheckClaim).order_by(FactCheckClaim.created_at.desc()).limit(200)
                )
                claims = [FactCheckClaimRead.model_validate(c) for c in res.scalars().all()]
                self._claims_cache[cache_key] = (now, claims)
                return claims
        except Exception as e:
            logger.warning(f"Не вдалося відкрити тимчасову сесію БД для перевірки фактчеків: {e}")
            return []

    async def seed_initial_claims_if_empty(self, db: AsyncSession) -> int:
        """Наповнення бази реальними розслідуваннями StopFake та VoxCheck, якщо вона порожня."""
        count_res = await db.execute(select(func.count(FactCheckClaim.id)))
        count = count_res.scalar() or 0
        if count > 0:
            return count

        logger.info("База фактчеків порожня. Автоматичний збір живих розслідувань зі StopFake та VoxCheck...")
        stopfake_claims = await self.fetch_stopfake_rss(pages=5)
        vox_claims = await self.fetch_voxukraine_rss(limit=10)

        total_added = 0
        for item in stopfake_claims + vox_claims:
            claim_obj = FactCheckClaim(**item.model_dump())
            db.add(claim_obj)
            total_added += 1

        if total_added > 0:
            await db.commit()
            self.invalidate_claims_cache()
            logger.info(f"Успішно збережено {total_added} реальних фактчеків.")

        return total_added

    async def fetch_stopfake_rss(self, pages: int = 5, limit_per_page: int = 15) -> List[FactCheckClaimCreate]:
        """
        Отримання свіжих розслідувань та спростувань з пагінованої RSS-стрічки StopFake.
        Проходить по сторінках (?paged=1, 2, ...), збираючи десятки реальних публікацій.
        """
        claims: List[FactCheckClaimCreate] = []
        seen_urls = set()

        try:
            async with httpx.AsyncClient(timeout=15.0, follow_redirects=True) as client:
                for page in range(1, pages + 1):
                    feed_url = f"{self.stopfake_rss_url}?paged={page}" if page > 1 else self.stopfake_rss_url
                    try:
                        resp = await client.get(
                            feed_url,
                            headers={"User-Agent": "TruthLens FactCheck Scraper 1.0"}
                        )
                        if resp.status_code != 200:
                            logger.info(f"StopFake RSS сторінка {page} повернула код {resp.status_code}, завершення пагінації.")
                            break

                        feed = feedparser.parse(resp.text)
                        if not feed.entries:
                            break

                        for entry in feed.entries[:limit_per_page]:
                            link = entry.get("link", "").strip()
                            if not link or link in seen_urls:
                                continue
                            seen_urls.add(link)

                            title = clean_html_text(entry.get("title", ""))
                            if not title:
                                continue

                            # Пропускаємо загальні аналітичні статті/дайджести ІМІ, які не є спростуванням конкретного фейку
                            title_low = title.lower()
                            has_explicit_label = bool(
                                re.match(
                                    r"^(фейк|маніпуляція|неправда|фотофейк|відеофейк|дезінформація|фейк\s+\w+)",
                                    title_low,
                                )
                            )
                            summary = entry.get("summary", "") or entry.get("description", "")
                            clean_summary = clean_html_text(summary)
                            explanation = clean_summary[:500] if clean_summary else None

                            if not has_explicit_label and not is_specific_debunked_claim(title, explanation or ""):
                                continue

                            # Очищення заголовка від маркерів "Фейк:" чи "Маніпуляція:"
                            clean_title = re.sub(
                                r"^(Фейк|Маніпуляція|Неправда|Фотофейк|Відеофейк|Дезінформація):\s*",
                                "",
                                title,
                                flags=re.IGNORECASE
                            ).strip()
                            if not is_specific_debunked_claim(clean_title, explanation or ""):
                                continue

                            rating = "Фейк"
                            if "маніпуляц" in title_low:
                                rating = "Маніпуляція"

                            published_at = None
                            if hasattr(entry, "published_parsed") and entry.published_parsed:
                                published_at = datetime(*entry.published_parsed[:6], tzinfo=timezone.utc)

                            claims.append(
                                FactCheckClaimCreate(
                                    claim=clean_title,
                                    claimant="Дезінформаційні ресурси",
                                    fact_checker="StopFake",
                                    review_url=link,
                                    rating=rating,
                                    explanation=explanation,
                                    language="ua",
                                    published_at=published_at,
                                )
                            )
                    except Exception as page_err:
                        logger.warning(f"Помилка при завантаженні StopFake RSS сторінки {page}: {page_err}")
                        break
        except Exception as e:
            logger.error(f"Помилка парсингу StopFake RSS: {e}")

        return claims

    async def fetch_voxukraine_rss(self, limit: int = 15) -> List[FactCheckClaimCreate]:
        """Отримання розслідувань та спростувань фактчекерів з RSS VoxUkraine."""
        claims: List[FactCheckClaimCreate] = []
        try:
            async with httpx.AsyncClient(timeout=15.0, follow_redirects=True) as client:
                resp = await client.get(
                    "https://voxukraine.org/feed",
                    headers={"User-Agent": "TruthLens FactCheck Scraper 1.0"}
                )
                if resp.status_code == 200:
                    feed = feedparser.parse(resp.text)
                    for entry in feed.entries[:limit]:
                        title = clean_html_text(entry.get("title", ""))
                        link = entry.get("link", "").strip()
                        # Фільтруємо лише фактчекерські матеріали VoxCheck
                        if not any(k in title.lower() for k in ["фейк", "маніпуляц", "дезінформац"]):
                            continue

                        clean_title = re.sub(
                            r"^(Фейк|Маніпуляція|Неправда|Фотофейк|Відеофейк):\s*",
                            "",
                            title,
                            flags=re.IGNORECASE
                        ).strip()
                        rating = "Маніпуляція" if "маніпуляц" in title.lower() else "Фейк"
                        summary = entry.get("summary", "") or entry.get("description", "")
                        clean_summary = clean_html_text(summary)

                        published_at = None
                        if hasattr(entry, "published_parsed") and entry.published_parsed:
                            published_at = datetime(*entry.published_parsed[:6], tzinfo=timezone.utc)

                        claims.append(
                            FactCheckClaimCreate(
                                claim=clean_title,
                                claimant="Дезінформаційні ресурси",
                                fact_checker="VoxCheck",
                                review_url=link,
                                rating=rating,
                                explanation=clean_summary[:500] if clean_summary else None,
                                language="ua",
                                published_at=published_at,
                            )
                        )
        except Exception as e:
            logger.warning(f"Помилка завантаження VoxUkraine RSS: {e}")
        return claims

    async def search_google_fact_check(
        self, query: str, language_code: str = "uk"
    ) -> List[FactCheckClaimCreate]:
        """
        Пошук фактчеків через Google Fact Check Tools API.
        Працює лише якщо задано GOOGLE_FACT_CHECK_API_KEY. Якщо ключ відсутній - безпечно повертає порожній список.
        """
        if not self.google_api_key:
            logger.debug("GOOGLE_FACT_CHECK_API_KEY не задано, пропуск онлайн-запиту до Google API.")
            return []

        url = "https://factchecktools.googleapis.com/v1alpha1/claims:search"
        params = {
            "query": query,
            "languageCode": language_code,
            "key": self.google_api_key,
            "pageSize": 10,
        }

        claims: List[FactCheckClaimCreate] = []
        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                resp = await client.get(url, params=params)
                if resp.status_code == 200:
                    data = resp.json()
                    raw_claims = data.get("claims", [])
                    for c in raw_claims:
                        text = c.get("text", "")
                        claimant = c.get("claimant", "Невідомо")
                        reviews = c.get("claimReview", [])
                        if not text or not reviews:
                            continue

                        rev = reviews[0]
                        publisher = rev.get("publisher", {}).get("name", "Google FactCheck")
                        review_url = rev.get("url", "")
                        textual_rating = rev.get("textualRating", "False")
                        explanation = f"Оцінка: {textual_rating}. Спростування від {publisher}."

                        claims.append(
                            FactCheckClaimCreate(
                                claim=text,
                                claimant=claimant,
                                fact_checker=publisher,
                                review_url=review_url,
                                rating=textual_rating,
                                explanation=explanation,
                                language=language_code,
                            )
                        )
        except Exception as e:
            logger.error(f"Помилка звернення до Google Fact Check API: {e}")

        return claims

    async def sync_all_fact_checks(self, db: AsyncSession, pages: int = 5) -> Dict[str, Any]:
        """Синхронізація бази спростувань: збір реальних розслідувань StopFake та VoxCheck."""
        await self.seed_initial_claims_if_empty(db)

        # Отримуємо свіжі розслідування зі StopFake
        fresh_claims = await self.fetch_stopfake_rss(pages=pages)
        # Отримуємо свіжі фактчеки з VoxCheck
        vox_claims = await self.fetch_voxukraine_rss(limit=15)

        all_fresh = fresh_claims + vox_claims
        added_count = 0

        # Один легкий SQL-запит для дедуплікації замість десятків окремих SELECT у циклі
        existing_rows = (
            await db.execute(select(FactCheckClaim.review_url, FactCheckClaim.claim))
        ).all()
        existing_urls = {r[0] for r in existing_rows if r[0]}
        existing_claims_lower = [str(r[1]).lower() for r in existing_rows if r[1]]

        for claim_data in all_fresh:
            claim_prefix = claim_data.claim[:40].lower()
            is_dup = (
                (claim_data.review_url and claim_data.review_url in existing_urls)
                or any(claim_prefix in ex_c for ex_c in existing_claims_lower)
            )
            if not is_dup:
                db_claim = FactCheckClaim(**claim_data.model_dump())
                db.add(db_claim)
                if claim_data.review_url:
                    existing_urls.add(claim_data.review_url)
                existing_claims_lower.append(claim_data.claim.lower())
                added_count += 1

        if added_count > 0:
            await db.commit()
            self.invalidate_claims_cache()
            try:
                from app.services.embedding_service import embedding_service

                await embedding_service.backfill_null_embeddings(db)
            except Exception as emb_err:
                logger.debug("Помилка генерації pgvector ембедингів для нових фактчеків: %s", emb_err)

        total_res = await db.execute(select(func.count(FactCheckClaim.id)))
        total_count = total_res.scalar() or 0

        return {
            "status": "success",
            "new_claims_added": added_count,
            "total_claims": total_count,
        }

    def _extract_keywords(self, text: str) -> set[str]:
        """Витягує значущі слова з тексту для порівняння (довжина >= 4 символів)."""
        stop_words = {
            "який", "яка", "яке", "які", "цього", "через", "після", "також", "було", "буде", "були",
            "про", "для", "коли", "якщо", "тому", "щодо", "того", "вони", "його", "бути", "свої",
            "дуже", "лише", "тільки", "навіть", "стало", "може", "можуть", "повідомив", "заявив", "заявили",
            "this", "that", "with", "from", "have", "were", "been", "they", "their", "about", "will",
            "фейк", "маніпуляція", "неправда", "спростування", "повідомляє", "сьогодні", "вчора",
            "року", "році", "років", "новини", "новина", "новий", "нових", "словами", "словам"
        }
        # Видаляємо маркування спростувань на початку
        cleaned = re.sub(r"^(фейк|маніпуляція|неправда|фотофейк|відеофейк)\s*[:\-]\s*", "", text, flags=re.IGNORECASE)
        words = re.findall(r"[\w']+", cleaned.lower())
        return {w for w in words if len(w) >= 4 and w not in stop_words}

    def _extract_stems(self, text: str) -> set[str]:
        """Витягує унікальні корені значущих слів (перші 5-6 літер), виключаючи подвійний підрахунок."""
        kws = self._extract_keywords(text)
        return {w[:5] if len(w) >= 6 else w for w in kws}

    def _is_generic_stem(self, stem: str) -> bool:
        return stem in GENERIC_NEWS_STEMS or any(stem.startswith(g) for g in GENERIC_NEWS_STEMS if len(g) >= 5)

    async def match_article(
        self, title: str, text: str = "", db: Optional[AsyncSession] = None, threshold: float = 0.62
    ) -> FactCheckMatchResult:
        """
        Точна перевірка статті або пошукової тези на відповідність спростованим у базі фейкам:
        - Для короткого запиту користувача у віджеті (/factchecks): лексичний + нейромережевий MiniLM пошук.
        - Для повноцінної новини: суворий відбір конкретних спростувань (без загальних оглядів ІМІ),
          дедуплікація коренів, вимога мінімум 3 специфічних (не-фонових) збігів
          та обов'язкова семантична верифікація через MiniLM-L12-v2 (>= 0.72), щоб виключити хибні 15%.
        """
        from app.services.embedding_service import embedding_service

        clean_title_in = clean_html_text(title)
        clean_text_in = clean_html_text(text)
        title_stems = self._extract_stems(clean_title_in)

        # Якщо вхідний текст дуже короткий (пошуковий запит користувача без тіла статті)
        is_short_query = len(title_stems) <= 6 and not (clean_text_in and len(clean_text_in) > 45)

        # Отримуємо заяви з 15-хвилинного in-memory кешу (щоб не тягнути 200 рядків на кожну статтю)
        all_claims = await self._get_cached_claims(db)
        if not all_claims:
            return FactCheckMatchResult(is_debunked=False, confidence=0.0)

        # Для перевірки новинних статей ігноруємо загальні аналітичні статті/дайджести
        eligible_claims = (
            all_claims
            if is_short_query
            else [fc for fc in all_claims if is_specific_debunked_claim(fc.claim, fc.explanation or "")]
        )
        if not eligible_claims:
            return FactCheckMatchResult(is_debunked=False, confidence=0.0)

        # 1. Режим короткого запиту користувача на сторінці «База фактчеків»
        if is_short_query:
            scored_short: List[Tuple[float, FactCheckClaimRead]] = []
            for fc in eligible_claims:
                c_stems = self._extract_stems(fc.claim)
                if not c_stems:
                    continue
                inter = title_stems & c_stems
                if len(inter) >= 2:
                    q_score = len(inter) / max(1, len(title_stems))
                    scored_short.append((q_score, fc))

            # Додатково перевіряємо семантику MiniLM по топ-кандидатах або всіх заявах батчем
            q_vec = embedding_service.encode_minilm_384(clean_title_in)
            if q_vec is not None:
                c_vecs = embedding_service.encode_minilm_384_batch([fc.claim for fc in eligible_claims])
                if c_vecs is not None:
                    best_fc: Optional[FactCheckClaimRead] = None
                    best_combined = 0.0
                    for fc, c_vec in zip(eligible_claims, c_vecs):
                        if c_vec is None:
                            continue
                        nsim = max(0.0, min(1.0, float(c_vec @ q_vec)))
                        c_stems = self._extract_stems(fc.claim)
                        lex = len(title_stems & c_stems) / max(1, len(title_stems)) if title_stems else 0.0
                        combined = 0.65 * nsim + 0.35 * lex
                        if (nsim >= 0.62 or (lex >= 0.50 and nsim >= 0.45)) and combined > best_combined:
                            best_combined = combined
                            best_fc = fc
                    if best_fc is not None and best_combined >= 0.52:
                        clean_expl = clean_html_text(best_fc.explanation or best_fc.claim)
                        return FactCheckMatchResult(
                            is_debunked=True,
                            confidence=round(min(0.99, best_combined), 2),
                            matched_claim=best_fc,
                            explanation=f"Знайдено спростування від {best_fc.fact_checker} ({best_fc.rating}): {clean_expl}",
                        )

            if scored_short:
                scored_short.sort(key=lambda x: x[0], reverse=True)
                top_score, top_fc = scored_short[0]
                if top_score >= 0.50:
                    clean_expl = clean_html_text(top_fc.explanation or top_fc.claim)
                    return FactCheckMatchResult(
                        is_debunked=True,
                        confidence=round(min(0.99, top_score), 2),
                        matched_claim=top_fc,
                        explanation=f"Знайдено спростування від {top_fc.fact_checker} ({top_fc.rating}): {clean_expl}",
                    )

            return FactCheckMatchResult(is_debunked=False, confidence=0.0)

        # 2. Режим перевірки повноцінної новини (сувора перевірка без хибних спрацювань)
        sentences = [s.strip() for s in re.split(r"[.!?\n]+", clean_text_in) if len(s.strip()) > 25][:25]
        sent_stems_list = [(sent, self._extract_stems(sent)) for sent in sentences]

        # Перший прохід: швидкий лексичний відбір кандидатів зі специфічними (не-фоновими) збігами
        lexical_candidates: List[Tuple[float, str, FactCheckClaimRead, bool]] = []
        for fc in eligible_claims:
            c_stems = self._extract_stems(fc.claim)
            if len(c_stems) < 3:
                continue

            # a) Збіг по заголовку (пріоритетний)
            t_inter = title_stems & c_stems
            t_distinct = [s for s in t_inter if not self._is_generic_stem(s)]
            if len(t_inter) >= 3 and len(t_distinct) >= 2:
                t_ratio = len(t_inter) / len(c_stems)
                if t_ratio >= 0.50:
                    lexical_candidates.append((t_ratio, clean_title_in, fc, True))
                    continue

            # b) Збіг по конкретному реченню (лише при високій концентрації специфічних коренів)
            best_s_ratio = 0.0
            best_sent = ""
            for sent, s_stems in sent_stems_list:
                s_inter = s_stems & c_stems
                s_distinct = [s for s in s_inter if not self._is_generic_stem(s)]
                if len(s_inter) >= 4 and len(s_distinct) >= 3:
                    s_ratio = len(s_inter) / len(c_stems)
                    if s_ratio >= 0.62 and s_ratio > best_s_ratio:
                        best_s_ratio = s_ratio
                        best_sent = sent
            if best_sent:
                lexical_candidates.append((best_s_ratio, best_sent, fc, False))

        if not lexical_candidates:
            return FactCheckMatchResult(is_debunked=False, confidence=0.0)

        lexical_candidates.sort(key=lambda x: x[0], reverse=True)
        top_candidates = lexical_candidates[:6]

        best_match: Optional[FactCheckClaimRead] = None
        highest_score: float = 0.0

        # Другий прохід: обов'язкова нейромережева верифікація контексту через MiniLM-L12-v2
        title_vec = embedding_service.encode_minilm_384(clean_title_in)
        for lex_ratio, matched_snippet, fc, is_headline_match in top_candidates:
            if title_vec is not None:
                claim_vec = embedding_service.encode_minilm_384(fc.claim)
                snippet_vec = (
                    title_vec
                    if is_headline_match
                    else embedding_service.encode_minilm_384(matched_snippet)
                )
                if claim_vec is not None and snippet_vec is not None:
                    snippet_nsim = max(0.0, min(1.0, float(snippet_vec @ claim_vec)))
                    title_nsim = max(0.0, min(1.0, float(title_vec @ claim_vec)))

                    if is_headline_match:
                        # Заголовок має дійсно передавати той самий фейковий наратив
                        if snippet_nsim < 0.72:
                            continue
                        final_conf = 0.65 * snippet_nsim + 0.35 * lex_ratio
                    else:
                        # Якщо збіг лише в одному реченні тіла — вимагаємо дуже високої подібності речення І зв'язку з темою заголовка
                        if snippet_nsim < 0.78 or title_nsim < 0.52:
                            continue
                        final_conf = 0.60 * snippet_nsim + 0.25 * lex_ratio + 0.15 * title_nsim

                    if final_conf >= threshold and final_conf > highest_score:
                        highest_score = final_conf
                        best_match = fc
                    continue

            # Резервний режим без MiniLM: вимагаємо ще суворіший лексичний поріг
            fallback_thresh = 0.70 if is_headline_match else 0.78
            if lex_ratio >= fallback_thresh and lex_ratio > highest_score:
                highest_score = lex_ratio
                best_match = fc

        if best_match is not None and highest_score >= threshold:
            clean_expl = clean_html_text(best_match.explanation or best_match.claim)
            return FactCheckMatchResult(
                is_debunked=True,
                confidence=round(min(0.99, highest_score), 2),
                matched_claim=best_match,
                explanation=f"Знайдено спростування від {best_match.fact_checker} ({best_match.rating}): {clean_expl}",
            )

        return FactCheckMatchResult(is_debunked=False, confidence=round(highest_score, 2))


fact_check_service = FactCheckService()
