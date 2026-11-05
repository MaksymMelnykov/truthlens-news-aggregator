import logging
import re
from datetime import datetime, timezone
from typing import Dict, Any, List, Optional
from urllib.parse import urlparse, parse_qs, urlencode, urlunparse

import feedparser
import httpx
import trafilatura
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.models.article import Article
from app.models.source import Source

logger = logging.getLogger(__name__)

# Каталог надійних україномовних RSS-стрічок новин (перевірено через Feedspot)
DEFAULT_FEEDS: List[Dict[str, Any]] = [
    {
        "name": "Українська правда",
        "domain": "pravda.com.ua",
        "homepage_url": "https://www.pravda.com.ua",
        "rss_url": "https://www.pravda.com.ua/rss/",
        "reliability_rating": 94.0,
        "is_whitelisted": True,
        "language": "ua",
        "country": "UA",
    },
    {
        "name": "BBC News Україна",
        "domain": "bbc.com",
        "homepage_url": "https://www.bbc.com/ukrainian",
        "rss_url": "https://feeds.bbci.co.uk/ukrainian/rss.xml",
        "reliability_rating": 96.0,
        "is_whitelisted": True,
        "language": "ua",
        "country": "UA",
    },
    {
        "name": "Дзеркало тижня (ZN.UA)",
        "domain": "zn.ua",
        "homepage_url": "https://zn.ua",
        "rss_url": "https://zn.ua/ukr/rss/full.rss",
        "reliability_rating": 91.0,
        "is_whitelisted": True,
        "language": "ua",
        "country": "UA",
    },
    {
        "name": "УНІАН",
        "domain": "unian.net",
        "homepage_url": "https://www.unian.ua",
        "rss_url": "https://rss.unian.net/site/news_ukr.rss",
        "reliability_rating": 89.0,
        "is_whitelisted": True,
        "language": "ua",
        "country": "UA",
    },
    {
        "name": "УНН Новини",
        "domain": "unn.ua",
        "homepage_url": "https://unn.ua",
        "rss_url": "https://unn.ua/rss/news_uk.xml",
        "reliability_rating": 88.0,
        "is_whitelisted": True,
        "language": "ua",
        "country": "UA",
    },
    {
        "name": "Факти ICTV",
        "domain": "fakty.ua",
        "homepage_url": "https://fakty.ua",
        "rss_url": "https://fakty.ua/rss_feed/all",
        "reliability_rating": 90.0,
        "is_whitelisted": True,
        "language": "ua",
        "country": "UA",
    },
    {
        "name": "LB.ua (Лівий Берег)",
        "domain": "lb.ua",
        "homepage_url": "https://lb.ua",
        "rss_url": "https://lb.ua/rss/ukr/news.xml",
        "reliability_rating": 92.0,
        "is_whitelisted": True,
        "language": "ua",
        "country": "UA",
    },
    {
        "name": "Інтерфакс-Україна",
        "domain": "interfax.com.ua",
        "homepage_url": "https://interfax.com.ua",
        "rss_url": "https://interfax.com.ua/news/last.rss",
        "reliability_rating": 93.0,
        "is_whitelisted": True,
        "language": "ua",
        "country": "UA",
    },
    # Міжнародні авторитетні англомовні ЗМІ (International Media)
    {
        "name": "BBC World News",
        "domain": "bbc.com",
        "homepage_url": "https://www.bbc.com/news/world",
        "rss_url": "https://feeds.bbci.co.uk/news/world/rss.xml",
        "reliability_rating": 96.0,
        "is_whitelisted": True,
        "language": "en",
        "country": "GB",
    },
    {
        "name": "The Guardian World",
        "domain": "theguardian.com",
        "homepage_url": "https://www.theguardian.com/world",
        "rss_url": "https://www.theguardian.com/world/rss",
        "reliability_rating": 93.0,
        "is_whitelisted": True,
        "language": "en",
        "country": "GB",
    },
    {
        "name": "DW News (English)",
        "domain": "dw.com",
        "homepage_url": "https://www.dw.com/en",
        "rss_url": "https://rss.dw.com/rdf/rss-en-all",
        "reliability_rating": 94.0,
        "is_whitelisted": True,
        "language": "en",
        "country": "DE",
    },
    {
        "name": "Politico Europe",
        "domain": "politico.eu",
        "homepage_url": "https://www.politico.eu",
        "rss_url": "https://www.politico.eu/feed/",
        "reliability_rating": 91.0,
        "is_whitelisted": True,
        "language": "en",
        "country": "EU",
    },
    {
        "name": "NPR World News",
        "domain": "npr.org",
        "homepage_url": "https://www.npr.org/sections/world/",
        "rss_url": "https://feeds.npr.org/1004/rss.xml",
        "reliability_rating": 94.0,
        "is_whitelisted": True,
        "language": "en",
        "country": "US",
    },
    {
        "name": "CNN World News",
        "domain": "cnn.com",
        "homepage_url": "https://edition.cnn.com/world",
        "rss_url": "http://rss.cnn.com/rss/edition_world.rss",
        "reliability_rating": 89.0,
        "is_whitelisted": True,
        "language": "en",
        "country": "US",
    },
]

RUSSIAN_LETTERS = set("ыэъёЫЭЪЁ")
UKRAINIAN_LETTERS = set("іїєґІЇЄҐ")


def is_clean_ukrainian_content(title: str, text: str = "") -> bool:
    """
    Сувора перевірка на відповідність українській мові:
    Відхиляє будь-який матеріал із специфічними російськими літерами (ы, э, ъ, ё).
    """
    combined = f"{title} {text}"
    if any(c in RUSSIAN_LETTERS for c in combined):
        return False
    if any(c in UKRAINIAN_LETTERS for c in combined):
        return True
    return any('\u0400' <= c <= '\u04FF' for c in combined)


def is_valid_article_content(title: str, text: str = "", language: str = "ua") -> bool:
    """
    Універсальна перевірка контенту:
    - Безкомпромісно відсікає російськомовні маркери ('ы', 'э', 'ъ', 'ё') для будь-якої мови.
    - Для українських новин ('ua') перевіряє наявність кирилиці/українських літер.
    - Для міжнародних новин ('en') перевіряє латиницю.
    """
    combined = f"{title} {text}"
    # Категорично блокуємо російські літери
    if any(c in RUSSIAN_LETTERS for c in combined):
        return False

    if language == "en":
        # Перевірка наявності латинських символів
        has_latin = any(('a' <= c <= 'z') or ('A' <= c <= 'Z') for c in combined)
        return has_latin

    return is_clean_ukrainian_content(title, text)

# Категорійні зображення Unsplash для елегантного фолбеку, якщо стаття не має зображення
FALLBACK_IMAGES: Dict[str, str] = {
    "Політика": "https://images.unsplash.com/photo-1540910419892-4a36d2c3266c?w=800&q=80",
    "Технології": "https://images.unsplash.com/photo-1518770660439-4636190af475?w=800&q=80",
    "Економіка": "https://images.unsplash.com/photo-1611974789855-9c2a0a7236a3?w=800&q=80",
    "Суспільство": "https://images.unsplash.com/photo-1577495508048-b635879837f1?w=800&q=80",
    "Світ": "https://images.unsplash.com/photo-1526304640581-d334cdbbf45e?w=800&q=80",
    "Здоров'я": "https://images.unsplash.com/photo-1505751172876-fa1923c5c528?w=800&q=80",
    "Загальне": "https://images.unsplash.com/photo-1504711434969-e33886168f5c?w=800&q=80",
}


def normalize_url(url: str) -> str:
    """Очищення URL від UTM-міток, fbclid та трекінгових параметрів для надійної дедуплікації."""
    if not url:
        return ""
    parsed = urlparse(url.strip())
    query = parse_qs(parsed.query)
    # Видалення трекінгових параметрів
    filtered_query = {
        k: v for k, v in query.items()
        if not k.startswith("utm_") and k not in {"fbclid", "gclid", "yclid", "ref"}
    }
    cleaned_url = urlunparse((
        parsed.scheme,
        parsed.netloc.lower(),
        parsed.path.rstrip("/"),
        parsed.params,
        urlencode(filtered_query, doseq=True),
        ""  # прибираємо #fragment
    ))
    return cleaned_url


def infer_category(title: str, tags: List[str], url: str) -> str:
    """Визначення категорії новини на основі метаданих або ключових слів (UA + EN)."""
    text_to_check = f"{title} {' '.join(tags)} {url}".lower()
    tokens = set(re.findall(r"[\w']+", text_to_check))

    def has_any(stems: List[str], exact_words: set[str]) -> bool:
        if any(stem in text_to_check for stem in stems):
            return True
        return bool(tokens.intersection(exact_words))

    if has_any(
        ["війн", "воєн", "зсу", "фронт", "оборон", "президент", "парламент", "уряд", "рада", "вибор", "politics", "defense", "military", "government", "election", "senate", "congress", "minister"],
        {"war", "wars", "nato", "eu"}
    ):
        return "Політика"
    if has_any(
        ["штучн", "інтелект", "нейромереж", "технолог", "кібер", "смартфон", "інновац", "гаджет", "програм", "комп'ютер", "software", "cyber", "apple", "google", "meta", "nvidia", "hardware"],
        {"ai", "it", "tech", "digital"}
    ):
        return "Технології"
    if has_any(
        ["гривн", "долар", "бюджет", "банк", "інфляц", "експорт", "бізнес", "подат", "акці", "ринок", "finance", "economy", "market", "trade", "inflation", "tariff", "stock"],
        {"gdp", "imf", "fed"}
    ):
        return "Економіка"
    if has_any(
        ["лікар", "медицин", "захворюван", "вакцин", "здоров", "вірус", "covid", "health", "hospital", "disease", "vaccine", "doctor", "medical", "cancer"],
        {"who"}
    ):
        return "Здоров'я"
    if has_any(
        ["сша", "європа", "байден", "трамп", "китай", "німеччин", "польщ", "британі", "global", "diplomacy", "treaty", "foreign"],
        {"world", "un"}
    ):
        return "Світ"
    return "Суспільство"


def calculate_baseline_trust(title: str, source: Source) -> tuple[float, str]:
    """
    Базовий підрахунок довіри з урахуванням репутації джерела та стилометрії:
    Враховує авторитетність джерела за списками ІМІ та стилометричний аналіз (клікбейт/CAPS).
    """
    from app.services.stylometry_service import stylometry_service
    from app.services.reputation_service import reputation_service

    domain = getattr(source, "domain", "")
    rep = reputation_service.get_reputation(domain)
    base_rating = float(getattr(source, "reliability_rating", rep.reliability_rating))
    if getattr(source, "is_whitelisted", False) or rep.is_whitelisted:
        base_rating = max(base_rating, 90.0)

    if getattr(source, "is_blacklisted", False) or rep.is_blacklisted:
        return 15.0, "High Risk"

    sty_res = stylometry_service.analyze(title, "")
    penalties = sty_res.overall_penalty

    final_score = max(10.0, min(100.0, base_rating - (penalties * 0.7)))

    if final_score >= 80.0:
        verdict = "Verified"
    elif final_score >= 50.0:
        verdict = "Caution"
    else:
        verdict = "High Risk"

    return round(final_score, 1), verdict


async def calculate_multi_factor_trust(
    title: str,
    text: str,
    source: Optional[Source] = None,
    db: Optional[AsyncSession] = None,
    source_domain_override: Optional[str] = None,
) -> tuple[float, str, Dict[str, Any]]:
    """
    Повний багатофакторний розрахунок Trust Score V3 (Тиждень 3):
    - Репутація домену (ІМІ White/Gray/Black list)
    - Стилометричний аналіз (клікбейт, маніпуляції, CAPS LOCK, пунктуація)
    - Нейромережева / ML-класифікація автентичності тексту (MLClassifierService)
    - База спростувань (VoxCheck, StopFake, Google FactCheck)
    - Пояснювальний ШІ (Explainable AI - XAI)
    """
    from app.services.stylometry_service import stylometry_service
    from app.services.reputation_service import reputation_service
    from app.services.factcheck_service import fact_check_service
    from app.services.ml_classifier_service import ml_classifier_service

    domain = source_domain_override if source_domain_override is not None else getattr(source, "domain", "")
    rep = reputation_service.get_reputation(domain)
    has_known_domain = bool(domain and rep.status != "unknown")

    if source is not None and getattr(source, "reliability_rating", None) is not None:
        source_rating = float(source.reliability_rating)
    else:
        source_rating = float(rep.reliability_rating)

    is_whitelisted = bool((source and getattr(source, "is_whitelisted", False)) or rep.is_whitelisted)
    is_blacklisted = bool((source and getattr(source, "is_blacklisted", False)) or rep.is_blacklisted)

    if is_whitelisted:
        source_rating = max(source_rating, 90.0)

    # 1. Стилометрія та ML-інференс
    sty_res = stylometry_service.analyze(title, text)
    ml_res = ml_classifier_service.predict(title, text)

    markers: List[str] = [f"{t.text} ({t.description})" for t in sty_res.triggers]
    if ml_res.ml_authenticity_score < 50.0:
        for tok in ml_res.top_tokens:
            if tok.direction == "fake_indicator" and len(markers) < 8:
                marker_label = f"ML-маркер ризику: «{tok.token}»"
                if marker_label not in markers:
                    markers.append(marker_label)

    # 2. Чорний список -> негайний вердикт High Risk
    if is_blacklisted:
        reason = f"Джерело {domain or rep.name} знаходиться в чорному списку пропагандистських / підсанкційних ресурсів."
        return 15.0, "High Risk", {
            "source_reputation": source_rating,
            "stylometry_score": sty_res.stylometry_trust_index,
            "ml_authenticity_score": ml_res.ml_authenticity_score,
            "corroboration_score": 15.0,
            "factcheck_debunked": False,
            "manipulation_markers": markers or ["Джерело з чорного списку дезінформації"],
            "reason": reason,
            "explanation": f"{reason} {ml_res.explanation_summary}",
            "ml_model_name": ml_res.model_name,
            "ml_latency_ms": ml_res.inference_latency_ms,
        }

    # 3. Звірка з базою фактчеків
    fact_check_match = await fact_check_service.match_article(title, text, db)
    if fact_check_match.is_debunked:
        if not is_whitelisted or fact_check_match.confidence >= 0.95:
            reason = fact_check_match.explanation or "Новина збігається з офіційно спростованим фейком."
            debunk_markers = [f"Спростовано {fact_check_match.matched_claim.fact_checker}: {fact_check_match.matched_claim.rating}"] if fact_check_match.matched_claim else ["Збіг із базою спростованих фейків"]
            return 15.0, "High Risk", {
                "source_reputation": source_rating,
                "stylometry_score": sty_res.stylometry_trust_index,
                "ml_authenticity_score": min(ml_res.ml_authenticity_score, 25.0),
                "corroboration_score": 10.0,
                "factcheck_debunked": True,
                "fact_checker": fact_check_match.matched_claim.fact_checker if fact_check_match.matched_claim else None,
                "manipulation_markers": debunk_markers + markers[:4],
                "reason": reason,
                "explanation": reason,
                "ml_model_name": ml_res.model_name,
                "ml_latency_ms": ml_res.inference_latency_ms,
            }

    # 4. Композитна оцінка Trust Score V3 (Репутація + Стилометрія + ML-модель)
    effective_ml_score = ml_res.ml_authenticity_score
    if is_whitelisted and sty_res.overall_penalty <= 15.0:
        effective_ml_score = max(effective_ml_score, 85.0)

    if has_known_domain:
        trust_score = (
            (source_rating * 0.42)
            + (sty_res.stylometry_trust_index * 0.30)
            + (effective_ml_score * 0.28)
        )
    else:
        # Якщо перевіряється довільний текст без відомого домену — основну вагу мають Стилометрія та ML-класифікатор
        trust_score = (
            (sty_res.stylometry_trust_index * 0.45)
            + (effective_ml_score * 0.45)
            + (source_rating * 0.10)
        )

    # Додаткове зниження при високій концентрації пропаганди чи клікбейту на не-білих джерелах
    if not is_whitelisted and sty_res.overall_penalty >= 55.0:
        trust_score = min(trust_score, 38.0)

    trust_score = max(10.0, min(100.0, round(trust_score, 1)))

    if trust_score >= 80.0:
        verdict = "Verified"
    elif trust_score >= 50.0:
        verdict = "Caution"
    else:
        verdict = "High Risk"

    corroboration_score = round((source_rating * 0.6 + effective_ml_score * 0.4), 1)

    explanation_parts = []
    if has_known_domain:
        explanation_parts.append(f"Джерело «{rep.name}» ({rep.imi_category}, рейтинг {source_rating:.0f}%).")
    explanation_parts.append(f"Стилометрія: {sty_res.summary_verdict} ({sty_res.stylometry_trust_index:.0f}%).")
    explanation_parts.append(ml_res.explanation_summary)

    breakdown = {
        "source_reputation": round(source_rating, 1),
        "stylometry_score": round(sty_res.stylometry_trust_index, 1),
        "ml_authenticity_score": round(effective_ml_score, 1),
        "corroboration_score": corroboration_score,
        "clickbait_penalty": sty_res.clickbait_score,
        "emotional_penalty": sty_res.emotional_score,
        "manipulation_penalty": sty_res.manipulation_score,
        "triggers_count": len(sty_res.triggers),
        "factcheck_debunked": False,
        "manipulation_markers": markers,
        "explanation": " ".join(explanation_parts),
        "ml_model_name": ml_res.model_name,
        "ml_latency_ms": ml_res.inference_latency_ms,
    }

    return trust_score, verdict, breakdown


class NewsIngestionService:
    """Сервіс асинхронного збору та обробки новин з RSS-джерел."""

    def __init__(self):
        self.headers = {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36 TruthLens/1.0",
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
            "Accept-Language": "uk-UA,uk;q=0.9,en-US;q=0.8,en;q=0.7",
        }

    async def get_or_create_source(self, db: AsyncSession, feed_config: Dict[str, Any]) -> Source:
        """Пошук існуючого джерела за доменом або створення нового в базі."""
        domain = feed_config["domain"]
        result = await db.execute(select(Source).where(Source.domain == domain))
        source = result.scalar_one_or_none()
        if not source:
            source = Source(
                name=feed_config["name"],
                domain=domain,
                homepage_url=feed_config.get("homepage_url", f"https://{domain}"),
                reliability_rating=feed_config.get("reliability_rating", 80.0),
                is_whitelisted=feed_config.get("is_whitelisted", False),
                language=feed_config.get("language", "ua"),
                country=feed_config.get("country", "UA"),
            )
            db.add(source)
            await db.flush()
        return source

    async def fetch_rss_xml(self, url: str) -> Optional[str]:
        """Асинхронне отримання вмісту RSS стрічки через httpx."""
        try:
            async with httpx.AsyncClient(headers=self.headers, follow_redirects=True, timeout=15.0) as client:
                response = await client.get(url)
                if response.status_code == 200:
                    return response.text
                logger.warning(f"Не вдалося завантажити RSS {url}: HTTP {response.status_code}")
        except Exception as e:
            logger.error(f"Помилка з'єднання при завантаженні RSS {url}: {e}")
        return None

    async def extract_article_details(self, url: str) -> Dict[str, Any]:
        """Витяг повного тексту статті та метаданих за допомогою trafilatura та OpenGraph."""
        details: Dict[str, Any] = {
            "full_text": None,
            "image_url": None,
            "author": None,
            "date": None,
        }
        try:
            async with httpx.AsyncClient(headers=self.headers, follow_redirects=True, timeout=12.0) as client:
                res = await client.get(url)
                if res.status_code == 200:
                    html = res.text
                    extracted_text = trafilatura.extract(
                        html,
                        include_comments=False,
                        include_tables=False,
                        no_fallback=False
                    )
                    details["full_text"] = extracted_text

                    meta = trafilatura.extract_metadata(html)
                    if meta:
                        if meta.image:
                            details["image_url"] = meta.image
                        if meta.author:
                            details["author"] = meta.author
                        if meta.date:
                            details["date"] = meta.date

                    # Якщо trafilatura не знайшла картинку, шукаємо og:image та twitter:image напряму в HTML
                    if not details["image_url"]:
                        og_match = re.search(r'<meta[^>]+(?:property|name)=["\'](?:og:image|twitter:image)["\'][^>]+content=["\']([^"\']+)["\']', html, re.IGNORECASE)
                        if not og_match:
                            og_match = re.search(r'<meta[^>]+content=["\']([^"\']+)["\'][^>]+(?:property|name)=["\'](?:og:image|twitter:image)["\']', html, re.IGNORECASE)
                        if og_match:
                            details["image_url"] = og_match.group(1).strip()
        except Exception as e:
            logger.debug(f"Не вдалося виконати повний витяг тексту для {url}: {e}")

        return details

    async def ingest_feed(self, db: AsyncSession, feed_config: Dict[str, Any], max_items: int = 15) -> int:
        """Обробка однієї RSS-стрічки та додавання нових статей до бази з витягом обкладинок."""
        source = await self.get_or_create_source(db, feed_config)
        rss_url = feed_config["rss_url"]
        feed_language = feed_config.get("language", "ua")
        xml_data = await self.fetch_rss_xml(rss_url)
        if not xml_data:
            return 0

        parsed_feed = feedparser.parse(xml_data)
        if not parsed_feed.entries:
            logger.info(f"Стрічка {feed_config['name']} не містить записів або недоступна.")
            return 0

        new_articles_count = 0

        for entry in parsed_feed.entries[:max_items]:
            raw_url = getattr(entry, "link", None)
            title = getattr(entry, "title", "").strip()
            if not raw_url or not title:
                continue

            # Сувора перевірка на мову (відсікаємо російськомовний контент)
            if not is_valid_article_content(title, language=feed_language):
                logger.info(f"Пропущено статтю через невідповідність мови: {title}")
                continue

            article_url = normalize_url(raw_url)

            # Перевірка дедуплікації в базі
            existing_article = await db.execute(select(Article.id).where(Article.url == article_url))
            if existing_article.scalar_one_or_none():
                continue

            raw_summary = getattr(entry, "summary", "") or getattr(entry, "description", "")

            # 1. Пошук зображення безпосередньо в елементі RSS стрічки
            image_url = None

            # a) media_thumbnail
            if hasattr(entry, "media_thumbnail") and entry.media_thumbnail:
                image_url = entry.media_thumbnail[0].get("url")
            # b) media_content
            if not image_url and hasattr(entry, "media_content") and entry.media_content:
                for mc in entry.media_content:
                    if mc.get("url"):
                        image_url = mc.get("url")
                        break
            # c) enclosures
            if not image_url and hasattr(entry, "enclosures") and entry.enclosures:
                for enc in entry.enclosures:
                    href = enc.get("href", "")
                    if "image" in enc.get("type", "") or href.split("?")[0].lower().endswith((".jpg", ".jpeg", ".png", ".webp", ".gif")):
                        image_url = href
                        break
            # d) теги <img> всередині raw_summary або entry.content
            if not image_url and raw_summary:
                img_match = re.search(r'<img[^>]+src=["\']([^"\']+)["\']', raw_summary, re.IGNORECASE)
                if img_match:
                    image_url = img_match.group(1).strip()
            if not image_url and hasattr(entry, "content") and entry.content:
                for c in entry.content:
                    val = c.get("value", "")
                    img_match = re.search(r'<img[^>]+src=["\']([^"\']+)["\']', val, re.IGNORECASE)
                    if img_match:
                        image_url = img_match.group(1).strip()
                        break

            # Очищення summary від базових HTML тегів після витягу картинок
            summary = re.sub(r"<[^>]+>", "", raw_summary).strip() if raw_summary else ""

            # 2. Витяг повного тексту та метаданих
            details = await self.extract_article_details(article_url)
            full_text = details.get("full_text") or summary

            # Якщо зображення ще не знайдено — беремо зі сторінки через OpenGraph / trafilatura
            if not image_url:
                image_url = details.get("image_url")

            # Повторна перевірка витягнутого тексту на мову
            if full_text and not is_valid_article_content(title, full_text, language=feed_language):
                logger.info(f"Пропущено статтю через російські маркери в тілі тексту: {title}")
                continue

            tags = [t.term for t in getattr(entry, "tags", []) if hasattr(t, "term")]
            category = infer_category(title, tags, article_url)
            author = details.get("author") or getattr(entry, "author", None)

            # 3. Якщо після всіх кроків зображення відсутнє — елегантний категорійний Unsplash fallback
            if not image_url:
                image_url = FALLBACK_IMAGES.get(category, FALLBACK_IMAGES["Загальне"])

            # Дата публікації
            published_at = datetime.now(timezone.utc)
            if hasattr(entry, "published_parsed") and entry.published_parsed:
                try:
                    published_at = datetime(*entry.published_parsed[:6], tzinfo=timezone.utc)
                except Exception:
                    pass

            trust_score, verdict, _ = await calculate_multi_factor_trust(
                title=title,
                text=full_text,
                source=source,
                db=db
            )

            article = Article(
                title=title,
                url=article_url,
                source_id=source.id,
                domain=source.domain,
                source_name=source.name,
                summary=summary[:1000] if summary else (full_text[:300] if full_text else ""),
                full_text=full_text,
                author=author[:255] if author else None,
                language=feed_language,
                category=category,
                published_at=published_at,
                image_url=image_url,
                trust_score=trust_score,
                verdict=verdict,
            )
            db.add(article)
            new_articles_count += 1

        if new_articles_count > 0:
            await db.commit()
            logger.info(f"[{source.name}] Успішно додано {new_articles_count} нових статей.")

        return new_articles_count

    async def sync_all_feeds(self, db: AsyncSession, max_per_feed: int = 15) -> Dict[str, Any]:
        """Синхронізація всіх зареєстрованих RSS стрічок."""
        start_time = datetime.now()
        total_new = 0
        feed_results = []

        for feed_config in DEFAULT_FEEDS:
            try:
                count = await self.ingest_feed(db, feed_config, max_items=max_per_feed)
                total_new += count
                feed_results.append({"name": feed_config["name"], "new_articles": count, "status": "ok"})
            except Exception as e:
                logger.error(f"Помилка при синхронізації {feed_config['name']}: {e}")
                feed_results.append({"name": feed_config["name"], "error": str(e), "status": "failed"})

        duration = (datetime.now() - start_time).total_seconds()
        return {
            "status": "success",
            "total_new_articles": total_new,
            "feeds_count": len(DEFAULT_FEEDS),
            "duration_seconds": round(duration, 2),
            "details": feed_results,
        }


# Глобальний інстанс сервісу
news_ingestion_service = NewsIngestionService()
