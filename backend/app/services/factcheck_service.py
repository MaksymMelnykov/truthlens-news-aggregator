import logging
import re
from datetime import datetime, timezone
from typing import List, Dict, Any, Optional
import httpx
import feedparser
from sqlalchemy import select, func, or_
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.models.claim import FactCheckClaim
from app.schemas.claim import FactCheckClaimCreate, FactCheckMatchResult, FactCheckClaimRead

logger = logging.getLogger(__name__)


class FactCheckService:
    """
    Сервіс агрегації фактчеків, пошуку спростувань та порівняння з новинами.
    Працює виключно зі справжніми даними зі StopFake, VoxCheck та Google Fact Check Tools API.
    """

    def __init__(self):
        self.google_api_key = settings.GOOGLE_FACT_CHECK_API_KEY
        self.stopfake_rss_url = "https://www.stopfake.org/uk/feed/"

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

                            title = entry.get("title", "").strip()
                            if not title:
                                continue

                            # Очищення заголовка від маркерів "Фейк:" чи "Маніпуляція:"
                            clean_title = re.sub(
                                r"^(Фейк|Маніпуляція|Неправда|Фотофейк|Відеофейк):\s*",
                                "",
                                title,
                                flags=re.IGNORECASE
                            ).strip()
                            rating = "Фейк"
                            if "маніпуляц" in title.lower():
                                rating = "Маніпуляція"

                            summary = entry.get("summary", "") or entry.get("description", "")
                            clean_summary = re.sub(r"<[^>]+>", " ", summary).strip()
                            explanation = clean_summary[:500] if clean_summary else None

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
                        title = entry.get("title", "").strip()
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
                        clean_summary = re.sub(r"<[^>]+>", " ", summary).strip()

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

        for claim_data in all_fresh:
            existing = await db.execute(
                select(FactCheckClaim).where(
                    or_(
                        FactCheckClaim.review_url == claim_data.review_url,
                        FactCheckClaim.claim.ilike(f"%{claim_data.claim[:40]}%")
                    )
                )
            )
            if not existing.scalar_one_or_none():
                db_claim = FactCheckClaim(**claim_data.model_dump())
                db.add(db_claim)
                added_count += 1

        if added_count > 0:
            await db.commit()

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

    async def match_article(
        self, title: str, text: str = "", db: Optional[AsyncSession] = None, threshold: float = 0.55
    ) -> FactCheckMatchResult:
        """
        Перевіряє статтю або запит на відповідність спростованим у базі фейкам.
        Застосовує багаторівневе зіставлення:
        1. Зіставлення заголовка (title) з твердженням (claim) — пріоритетне, оскільки суть фейку криється в заголовку.
        2. Пореченнєве зіставлення тіла новини (text) — слова фейку мають концентруватися в межах одного речення, а не бути розкиданими по всьому тексту.
        3. Зворотне зіставлення для коротких пошукових запитів користувача у віджеті перевірки.
        """
        title_keywords = self._extract_keywords(title)
        
        # Якщо вхідний текст дуже короткий (пошуковий запит користувача без тіла статті)
        is_short_query = len(title_keywords) <= 5 and not (text and len(text.strip()) > 30)

        # Отримуємо заяви з БД
        all_claims: List[Any] = []
        if db is not None:
            try:
                res = await db.execute(select(FactCheckClaim).order_by(FactCheckClaim.created_at.desc()).limit(200))
                all_claims = list(res.scalars().all())
            except Exception as e:
                logger.warning(f"Помилка читання фактчеків з БД: {e}")
        else:
            try:
                from app.db.session import async_session_maker
                async with async_session_maker() as temp_db:
                    res = await temp_db.execute(select(FactCheckClaim).order_by(FactCheckClaim.created_at.desc()).limit(200))
                    all_claims = list(res.scalars().all())
            except Exception as e:
                logger.warning(f"Не вдалося відкрити тимчасову сесію БД для перевірки фактчеків: {e}")

        if not all_claims:
            return FactCheckMatchResult(is_debunked=False, confidence=0.0)

        # Розбиваємо текст на окремі речення, щоб перевіряти локальну концентрацію слів
        sentences = [s.strip() for s in re.split(r"[.!?\n]+", text or "") if len(s.strip()) > 20]

        best_match: Optional[FactCheckClaim] = None
        highest_score: float = 0.0

        for fc in all_claims:
            claim_keywords = self._extract_keywords(fc.claim)
            if not claim_keywords:
                continue

            def get_matched(source_set: set[str], target_set: set[str]) -> set[str]:
                m = set()
                for s in source_set:
                    for t in target_set:
                        if s == t or (len(s) >= 5 and len(t) >= 5 and s[:5] == t[:5]):
                            m.add(s)
                            break
                return m

            # 1. Якщо це короткий пошуковий запит користувача у віджеті
            if is_short_query and title_keywords:
                matched_query = get_matched(title_keywords, claim_keywords)
                if len(matched_query) >= 2:
                    q_score = len(matched_query) / len(title_keywords)
                    if q_score > highest_score:
                        highest_score = q_score
                        best_match = fc
                continue

            # 2. Перевірка заголовка новини проти заяви
            matched_title = get_matched(claim_keywords, title_keywords)
            if len(matched_title) >= 3:
                t_score = len(matched_title) / len(claim_keywords)
                if t_score > highest_score:
                    highest_score = t_score
                    best_match = fc

            # 3. Якщо в заголовку збігу немає, перевіряємо кожне окреме речення тіла новини
            if highest_score < threshold and sentences:
                for sent in sentences:
                    sent_kws = self._extract_keywords(sent)
                    matched_sent = get_matched(claim_keywords, sent_kws)
                    # Для речення вимагаємо концентрацію щонайменше 4 слів заяви або >= 70% збігу
                    if len(matched_sent) >= 4:
                        s_score = len(matched_sent) / len(claim_keywords)
                        if s_score > highest_score:
                            highest_score = s_score
                            best_match = fc

        # Поріг відсікання
        effective_threshold = 0.50 if is_short_query else threshold
        if highest_score >= effective_threshold and best_match is not None:
            return FactCheckMatchResult(
                is_debunked=True,
                confidence=round(min(1.0, highest_score), 2),
                matched_claim=FactCheckClaimRead.model_validate(best_match),
                explanation=f"Знайдено спростування від {best_match.fact_checker} ({best_match.rating}): {best_match.explanation or best_match.claim}",
            )

        return FactCheckMatchResult(is_debunked=False, confidence=round(highest_score, 2))


fact_check_service = FactCheckService()
