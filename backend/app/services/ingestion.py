import asyncio
import html
import json
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

# Каталог надійних україномовних RSS-стрічок новин (рейтинги та статуси узгоджені 1-в-1 із reputation_service / ІМІ)
DEFAULT_FEEDS: List[Dict[str, Any]] = [
    {
        "name": "Українська правда",
        "domain": "pravda.com.ua",
        "homepage_url": "https://www.pravda.com.ua",
        "rss_url": "https://www.pravda.com.ua/rss/",
        "reliability_rating": 95.0,
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
        "reliability_rating": 94.0,
        "is_whitelisted": True,
        "language": "ua",
        "country": "UA",
    },
    {
        "name": "УНІАН",
        "domain": "unian.net",
        "homepage_url": "https://www.unian.ua",
        "rss_url": "https://rss.unian.net/site/news_ukr.rss",
        "reliability_rating": 70.0,
        "is_whitelisted": False,
        "language": "ua",
        "country": "UA",
    },
    {
        "name": "УНН Новини",
        "domain": "unn.ua",
        "homepage_url": "https://unn.ua",
        "rss_url": "https://unn.ua/rss/news_uk.xml",
        "reliability_rating": 70.0,
        "is_whitelisted": False,
        "language": "ua",
        "country": "UA",
    },
    {
        "name": "Факти ICTV",
        "domain": "fakty.ua",
        "homepage_url": "https://fakty.ua",
        "rss_url": "https://fakty.ua/rss_feed/all",
        "reliability_rating": 68.0,
        "is_whitelisted": False,
        "language": "ua",
        "country": "UA",
    },
    {
        "name": "LB.ua (Лівий Берег)",
        "domain": "lb.ua",
        "homepage_url": "https://lb.ua",
        "rss_url": "https://lb.ua/rss/ukr/news.xml",
        "reliability_rating": 93.0,
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
    # Українські спортивні медіа (категорія «Спорт»)
    {
        "name": "Sport.ua",
        "domain": "sport.ua",
        "homepage_url": "https://sport.ua",
        "rss_url": "https://sport.ua/uk/rss/all",
        "reliability_rating": 90.0,
        "is_whitelisted": True,
        "language": "ua",
        "country": "UA",
        "default_category": "Спорт",
    },
    {
        "name": "Чемпіон (УП Спорт)",
        "domain": "champion.com.ua",
        "homepage_url": "https://champion.com.ua",
        "rss_url": "https://champion.com.ua/ukr/rss/",
        "reliability_rating": 93.0,
        "is_whitelisted": True,
        "language": "ua",
        "country": "UA",
        "default_category": "Спорт",
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
    "Спорт": "https://images.unsplash.com/photo-1461896836934-ffe607ba8211?w=800&q=80",
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


def infer_category(
    title: str,
    tags: List[str],
    url: str,
    default_category: Optional[str] = None,
) -> str:
    """Визначення категорії новини українських медіа (включно з категоріями «Спорт» та «Світ»)."""
    url_lower = (url or "").lower()
    if default_category == "Спорт" or any(
        marker in url_lower
        for marker in (
            "sport.ua",
            "champion.com.ua",
            "/sport/",
            "/football/",
            "/boxing/",
            "/tennis/",
            "/biathlon/",
            "/basketball/",
            "/futsal/",
        )
    ):
        return "Спорт"

    text_to_check = f"{title} {' '.join(tags)} {url}".lower()
    tokens = set(re.findall(r"[\w']+", text_to_check))

    def has_any(stems: List[str], exact_words: set[str]) -> bool:
        if any(stem in text_to_check for stem in stems):
            return True
        return bool(tokens.intersection(exact_words))

    if has_any(
        [
            "футбол",
            "баскетбол",
            "волейбол",
            "теніс",
            "хокей",
            "біатлон",
            "боксер",
            "олімпіад",
            "олімпійськ",
            "чемпіонат",
            "ліга чемпіонів",
            "лізі чемпіонів",
            "ліга європи",
            "лізі європи",
            "динамо київ",
            "шахтар",
            "усик",
            "світолін",
            "костюк",
            "ястремськ",
            "трубін",
            "мудрик",
            "довбик",
            "циганков",
            "зінченко",
            "голкіпер",
            "бомбардир",
            "футзал",
            "формула-1",
            "гран-прі",
            "турнір",
            "тренер збірної",
            "збірна україни з",
        ],
        {
            "спорт",
            "спорту",
            "спорті",
            "спортсмен",
            "спортсмени",
            "бокс",
            "боксу",
            "матч",
            "матчі",
            "матчу",
            "матчів",
            "пенальті",
            "нокаут",
            "упл",
            "апл",
            "уєфа",
            "фіфа",
            "нба",
            "нхл",
        },
    ):
        return "Спорт"

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
        [
            "сша",
            "європ",
            "євросоюз",
            "єврокоміс",
            "байден",
            "трамп",
            "китай",
            "німеччин",
            "польщ",
            "британ",
            "франці",
            "ізраїл",
            "іран",
            "японі",
            "канад",
            "туреччин",
            "угорщин",
            "словаччин",
            "італі",
            "іспані",
            "молдов",
            "грузі",
            "вашингтон",
            "брюссел",
            "лондон",
            "берлін",
            "париж",
            "пекін",
            "держдеп",
            "пентагон",
            "білого дому",
            "саміт",
            "дипломат",
            "міжнародн",
            "/world/",
            "/svit/",
            "global",
            "diplomacy",
            "treaty",
            "foreign",
        ],
        {"світ", "світу", "світі", "єс", "нато", "оон", "g7", "g20", "world", "un"},
    ):
        return "Світ"
    return default_category or "Суспільство"


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
    exclude_article_id: Optional[int] = None,
    enable_cross_verification: bool = True,
    reference_published_at: Optional[datetime] = None,
) -> tuple[float, str, Dict[str, Any]]:
    """
    Повний багатофакторний розрахунок Trust Score V4 (Тиждень 4):
    1. Репутація домену (ІМІ White/Gray/Black list)
    2. Стилометричний аналіз (клікбейт, маніпуляції, CAPS LOCK, пунктуація)
    3. Мультимодельна нейромережева класифікація автентичності тексту (ukr-roberta-base + xlm-roberta-base + Hybrid Ensemble)
    4. Семантична крос-верифікація по незалежних ЗМІ в pgvector (CrossVerificationService)
    5. Семантична та лексична звірка з базою фактчеків (StopFake, VoxCheck, Google FactCheck)
    6. Пояснювальний ШІ (Explainable AI - XAI) з декомпозицією токенів та 5-кроковим аудитом.
    """
    from app.services.stylometry_service import stylometry_service
    from app.services.reputation_service import reputation_service
    from app.services.factcheck_service import fact_check_service
    from app.services.ml_classifier_service import ml_classifier_service
    from app.services.cross_verification_service import cross_verification_service

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

    # 1. Стилометрія та ML-інференс (ukr-roberta-base + xlm-roberta-base + Hybrid Ensemble)
    sty_res = stylometry_service.analyze(title, text)
    ml_res = ml_classifier_service.predict(title, text)

    xai_top_tokens = [
        {
            "token": t.token,
            "weight": round(t.weight, 4),
            "direction": t.direction,
            "category": t.category,
            "label": t.label,
            "reason": t.reason,
        }
        for t in ml_res.top_tokens
    ]
    models_breakdown = {k: round(float(v), 1) for k, v in (ml_res.models_breakdown or {}).items()}

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
        xai_steps = [
            {
                "step": 1,
                "component": "Репутація джерела (ІМІ)",
                "score": round(source_rating, 1),
                "status": "danger",
                "summary": reason,
            },
            {
                "step": 2,
                "component": "Стилометрія та емоційний тон",
                "score": round(sty_res.stylometry_trust_index, 1),
                "status": "warning" if sty_res.overall_penalty > 20 else "neutral",
                "summary": f"{sty_res.summary_verdict} ({sty_res.stylometry_trust_index:.0f}%).",
            },
            {
                "step": 3,
                "component": "Нейромережевий ансамбль (Dual-RoBERTa)",
                "score": round(ml_res.ml_authenticity_score, 1),
                "status": "danger" if ml_res.ml_authenticity_score < 50 else "warning",
                "summary": ml_res.explanation_summary,
            },
        ]
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
            "models_breakdown": models_breakdown,
            "xai_top_tokens": xai_top_tokens,
            "corroborating_articles": [],
            "corroboration_summary": "Джерело заблоковане у реєстрі дезінформації.",
            "matched_fact_checks": [],
            "xai_reasoning_steps": xai_steps,
            "sentence_analysis": ml_res.sentence_analysis,
            "attribution_analysis": sty_res.attribution_analysis,
        }

    # 3. Звірка з базою фактчеків (лексична + семантична в pgvector)
    fact_check_match = await fact_check_service.match_article(title, text, db)
    semantic_fc_matches: List[Any] = []
    if db is not None and enable_cross_verification:
        try:
            semantic_fc_matches = await cross_verification_service.find_semantic_factchecks(
                title=title, text_body=text, db=db, top_k=3
            )
        except Exception as e:
            logger.debug("Помилка семантичного пошуку фактчеків: %s", e)

    matched_fact_checks_dicts = [
        {
            "id": m.id,
            "claim_text": m.claim,
            "verdict": m.rating,
            "rating": m.rating,
            "explanation": m.explanation,
            "source_url": m.review_url,
            "fact_checker": m.fact_checker,
            "similarity": m.similarity,
        }
        for m in semantic_fc_matches
    ]
    if fact_check_match.is_debunked and fact_check_match.matched_claim:
        fc_claim = fact_check_match.matched_claim
        if not any(m.get("id") == fc_claim.id for m in matched_fact_checks_dicts):
            matched_fact_checks_dicts.insert(
                0,
                {
                    "id": fc_claim.id,
                    "claim_text": fc_claim.claim,
                    "verdict": fc_claim.rating,
                    "rating": fc_claim.rating,
                    "explanation": fc_claim.explanation,
                    "source_url": fc_claim.review_url,
                    "fact_checker": fc_claim.fact_checker,
                    "similarity": round(float(fact_check_match.confidence), 3),
                },
            )

    # Перевіряємо, чи сама стаття не є журналістським спростуванням фейку
    combined_low = f"{title} {text[:800]}".lower()
    is_journalistic_debunk = is_whitelisted and any(
        marker in combined_low
        for marker in (
            "спростувал",
            "виявився фейком",
            "не відповідає дійсності",
            "російський фейк",
            "російська пропаганда",
            "центр протидії дезінформації",
            "stopfake",
            "voxcheck",
        )
    )

    # Перевіряємо чи є пряме спростування або високоточний семантичний збіг із фейком
    # Для видань Білого списку ІМІ вимагаємо екстремально високу впевненість (>= 0.85), щоб уникати хибних спрацювань
    direct_debunk_confirmed = (
        fact_check_match.is_debunked
        and not is_journalistic_debunk
        and (not is_whitelisted or float(fact_check_match.confidence or 0.0) >= 0.85)
    )
    has_semantic_debunk = bool(
        semantic_fc_matches
        and semantic_fc_matches[0].similarity >= 0.78
        and not is_whitelisted
        and not is_journalistic_debunk
    )
    if direct_debunk_confirmed or has_semantic_debunk:
        top_fc = matched_fact_checks_dicts[0] if matched_fact_checks_dicts else None
        match_conf = max(
            float(fact_check_match.confidence or 0.0) if direct_debunk_confirmed else 0.0,
            float(top_fc["similarity"]) if top_fc else 0.0,
        )
        # Динамічний індекс ризику (11%–39%) залежно від впевненості збігу, ML та стилометрії (замість фіксованих 15%)
        base_debunk = 39.0 - (match_conf * 24.0)
        ml_adj = (ml_res.ml_authenticity_score - 50.0) * 0.14
        sty_adj = (sty_res.stylometry_trust_index - 50.0) * 0.10
        debunk_score = round(max(11.0, min(39.0, base_debunk + ml_adj + sty_adj)), 1)
        debunk_step_score = round(max(5.0, min(30.0, (1.0 - match_conf) * 45.0)), 1)

        reason = (
            fact_check_match.explanation
            if direct_debunk_confirmed and fact_check_match.explanation
            else (
                f"Виявлено семантичний збіг ({int(top_fc['similarity'] * 100)}%) зі спростованим фейком ({top_fc['fact_checker']}): «{top_fc['claim_text']}»."
                if top_fc
                else "Новина збігається з офіційно спростованим фейком."
            )
        )
        debunk_markers = (
            [f"Спростовано {top_fc['fact_checker']}: {top_fc['rating']}"]
            if top_fc
            else ["Збіг із базою спростованих фейків"]
        )
        xai_steps = [
            {
                "step": 1,
                "component": "База фактчеків (StopFake / VoxCheck + pgvector)",
                "score": debunk_step_score,
                "status": "danger",
                "summary": reason,
            },
            {
                "step": 2,
                "component": "Нейромережевий ансамбль (Dual-RoBERTa)",
                "score": round(ml_res.ml_authenticity_score, 1),
                "status": "danger" if ml_res.ml_authenticity_score < 50 else "warning",
                "summary": ml_res.explanation_summary,
            },
            {
                "step": 3,
                "component": "Стилометрія та маркери маніпуляцій",
                "score": round(sty_res.stylometry_trust_index, 1),
                "status": "warning" if sty_res.overall_penalty > 15 else "good",
                "summary": f"{sty_res.summary_verdict} ({sty_res.stylometry_trust_index:.0f}%).",
            },
        ]
        return debunk_score, "High Risk", {
            "source_reputation": source_rating,
            "stylometry_score": sty_res.stylometry_trust_index,
            "ml_authenticity_score": round(ml_res.ml_authenticity_score, 1),
            "corroboration_score": debunk_step_score,
            "factcheck_debunked": True,
            "fact_checker": top_fc["fact_checker"] if top_fc else None,
            "manipulation_markers": debunk_markers + markers[:4],
            "reason": reason,
            "explanation": reason,
            "ml_model_name": ml_res.model_name,
            "ml_latency_ms": ml_res.inference_latency_ms,
            "models_breakdown": models_breakdown,
            "xai_top_tokens": xai_top_tokens,
            "corroborating_articles": [],
            "corroboration_summary": reason,
            "matched_fact_checks": matched_fact_checks_dicts,
            "xai_reasoning_steps": xai_steps,
            "sentence_analysis": ml_res.sentence_analysis,
            "attribution_analysis": sty_res.attribution_analysis,
        }

    # Якщо статтю не позначено як спростовану — не показуємо хибні збіги у блоці фактчеків
    matched_fact_checks_dicts = []

    # 4. Ефективна оцінка ML та крос-верифікація між ЗМІ через pgvector
    effective_ml_score = ml_res.ml_authenticity_score
    if is_whitelisted and sty_res.overall_penalty <= 15.0:
        effective_ml_score = max(effective_ml_score, 85.0)

    corroborating_articles_dicts: List[Dict[str, Any]] = []
    corroboration_summary = ""
    if db is not None and enable_cross_verification:
        try:
            corr_res = await cross_verification_service.corroborate_article(
                title=title,
                text_body=text,
                source_domain=domain,
                is_whitelisted=is_whitelisted,
                ml_authenticity_score=effective_ml_score,
                stylometry_score=sty_res.stylometry_trust_index,
                db=db,
                exclude_article_id=exclude_article_id,
                max_related=6,
                reference_published_at=reference_published_at,
            )
            corroboration_score = corr_res.corroboration_score
            corroborating_articles_dicts = [
                {
                    "id": a.id,
                    "title": a.title,
                    "url": a.url,
                    "source_name": a.source_name,
                    "domain": a.domain,
                    "trust_score": a.trust_score,
                    "verdict": a.verdict,
                    "similarity": a.similarity,
                    "is_whitelisted": a.is_whitelisted_source,
                    "published_at": a.published_at.isoformat() if a.published_at else None,
                }
                for a in corr_res.related_articles
            ]
            corroboration_summary = corr_res.summary
        except Exception as e:
            logger.debug("Помилка крос-верифікації pgvector: %s", e)
            corroboration_score = round((source_rating * 0.6 + effective_ml_score * 0.4), 1)
            corroboration_summary = "Базова оцінка крос-верифікації за репутацією джерела та ML-профілем."
    else:
        corroboration_score = round((source_rating * 0.6 + effective_ml_score * 0.4), 1)
        corroboration_summary = "Швидка оцінка крос-верифікації при фоновій синхронізації."

    # 5. Композитна оцінка Trust Score V4 (Репутація + Стилометрія + ML Dual-RoBERTa + Крос-верифікація pgvector)
    if has_known_domain:
        trust_score = (
            (source_rating * 0.36)
            + (sty_res.stylometry_trust_index * 0.25)
            + (effective_ml_score * 0.24)
            + (corroboration_score * 0.15)
        )
    else:
        # Якщо перевіряється довільний текст без відомого домену — основну вагу мають Стилометрія, ML та Крос-верифікація
        trust_score = (
            (sty_res.stylometry_trust_index * 0.38)
            + (effective_ml_score * 0.38)
            + (corroboration_score * 0.16)
            + (source_rating * 0.08)
        )

    # Додаткове зниження при високій концентрації пропаганди чи клікбейту на не-білих джерелах
    if not is_whitelisted and sty_res.overall_penalty >= 55.0:
        trust_score = min(trust_score, 38.0)

    # Якщо анонімний/невідомий текст має вкрай низьку автентичність за нейромережею (< 30%) і 0 підтверджень у ЗМІ
    if not has_known_domain and effective_ml_score < 30.0 and not corroborating_articles_dicts:
        trust_score = min(trust_score, 39.0)

    trust_score = max(10.0, min(100.0, round(trust_score, 1)))

    if trust_score >= 80.0:
        verdict = "Verified"
    elif trust_score >= 50.0:
        verdict = "Caution"
    else:
        verdict = "High Risk"

    # 6. Побудова зрозумілого для читачів будь-якого віку XAI-пояснення та 5 кроків перевірки
    human_ml_summary = (
        f"Штучний інтелект підтверджує, що текст написано як справжню новину з фактами ({effective_ml_score:.0f}% правдивості)."
        if effective_ml_score >= 75
        else (
            f"Штучний інтелект радить поставитися з увагою ({effective_ml_score:.0f}%): деякі фрази схожі на оціночні судження або переказ чуток."
            if effective_ml_score >= 50
            else f"Увага: штучний інтелект виявив ознаки вигадки, пропаганди або неперевіреного вкиду (рівень правдивості тексту лише {effective_ml_score:.0f}%)."
        )
    )

    human_stylometry_summary = (
        f"Текст написано спокійно, без кричущих заголовків («ШОК!», «ТЕРМІНОВО!») чи залякування читачів ({sty_res.stylometry_trust_index:.0f}%)."
        if sty_res.stylometry_trust_index >= 80
        else f"Виявлено емоційний тиск або клікбейт ({sty_res.summary_verdict}, спокій мови: {sty_res.stylometry_trust_index:.0f}%)."
    )

    explanation_parts = []
    if has_known_domain:
        explanation_parts.append(
            f"Видання «{rep.name}» ({rep.imi_category}) має високий рівень надійності ({source_rating:.0f}%)."
            if source_rating >= 80
            else f"Джерело «{rep.name}» ({rep.imi_category}, рейтинг надійності {source_rating:.0f}%)."
        )
    explanation_parts.append(human_stylometry_summary)
    explanation_parts.append(human_ml_summary)
    if corroboration_summary:
        explanation_parts.append(corroboration_summary)

    xai_steps = [
        {
            "step": 1,
            "component": "Надійність сайту (Хто опублікував новину)",
            "score": round(source_rating, 1),
            "status": "good" if source_rating >= 80 else ("warning" if source_rating >= 55 else "danger"),
            "summary": (
                f"Видання «{rep.name}» ({rep.imi_category}, довіра {source_rating:.0f}%). Журналісти цього медіа перевіряють інформацію перед публікацією."
                if has_known_domain and source_rating >= 80
                else (
                    f"Джерело «{rep.name}» ({rep.imi_category}, рейтинг {source_rating:.0f}%)."
                    if has_known_domain
                    else f"Ви перевіряєте окремий текст без вказання відомого сайту, тому оцінюється насамперед зміст і тон матеріалу."
                )
            ),
        },
        {
            "step": 2,
            "component": "Спокійний тон та відсутність маніпуляцій емоціями",
            "score": round(sty_res.stylometry_trust_index, 1),
            "status": "good" if sty_res.stylometry_trust_index >= 80 else ("warning" if sty_res.stylometry_trust_index >= 55 else "danger"),
            "summary": human_stylometry_summary,
        },
        {
            "step": 3,
            "component": "Перевірка тексту штучним інтелектом на правдивість",
            "score": round(effective_ml_score, 1),
            "status": "good" if effective_ml_score >= 75 else ("warning" if effective_ml_score >= 50 else "danger"),
            "summary": human_ml_summary,
        },
        {
            "step": 4,
            "component": "Чи пишуть про цю подію інші незалежні ЗМІ",
            "score": round(corroboration_score, 1),
            "status": "good" if corroboration_score >= 78 else ("warning" if corroboration_score >= 50 else "danger"),
            "summary": corroboration_summary,
        },
        {
            "step": 5,
            "component": "Звірка зі списком вже викритих фейків (StopFake / VoxCheck)",
            "score": 100.0 if not matched_fact_checks_dicts else 65.0,
            "status": "good" if not matched_fact_checks_dicts else "warning",
            "summary": (
                "Ми звірили цей матеріал із базою офіційно спростованих фейків StopFake та VoxCheck — збігів з неправдою не знайдено."
                if not matched_fact_checks_dicts
                else f"Знайдено {len(matched_fact_checks_dicts)} схожих розборів у базі фактчекерів (схожість теми {int(matched_fact_checks_dicts[0]['similarity'] * 100)}%) — радимо ознайомитися нижче."
            ),
        },
    ]

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
        "models_breakdown": models_breakdown,
        "xai_top_tokens": xai_top_tokens,
        "corroborating_articles": corroborating_articles_dicts,
        "corroboration_summary": corroboration_summary,
        "matched_fact_checks": matched_fact_checks_dicts,
        "xai_reasoning_steps": xai_steps,
        "sentence_analysis": ml_res.sentence_analysis,
        "attribution_analysis": sty_res.attribution_analysis,
    }

    return trust_score, verdict, breakdown


CLOUDFLARE_JUNK_MARKERS = (
    "enable javascript and cookies to continue",
    "just a moment...",
    "checking your browser before accessing",
    "attention required! | cloudflare",
    "cf-browser-verification",
)

# Домени, де RSS уже офіційно містить повний текст у <content:encoded>, а HTML-сторінки закриті Cloudflare
RSS_FULLTEXT_PRIMARY_DOMAINS = {"champion.com.ua"}


def _is_blocked_page_text(text: Optional[str]) -> bool:
    if not text:
        return True
    low = text.strip().lower()
    if len(low) < 25:
        return True
    return any(marker in low for marker in CLOUDFLARE_JUNK_MARKERS)


def extract_rss_content_text(entry: Any) -> str:
    """
    Витягує повний очищений текст із полів RSS <content:encoded> / entry.content,
    зберігаючи структуру абзаців і видаляючи HTML-теги, скрипти та подвійні HTML-сутності.
    Вирішує проблему порожніх статей для Чемпіон (УП Спорт), Української правди та ZN.UA.
    """
    content_list = getattr(entry, "content", None) or []
    raw_chunks: List[str] = []
    for item in content_list:
        val = item.get("value", "") if isinstance(item, dict) else getattr(item, "value", "")
        if val and isinstance(val, str):
            raw_chunks.append(val)
    if not raw_chunks:
        return ""

    raw = "\n\n".join(raw_chunks)
    # Прибираємо скрипти, стилі, iframe, вбудовані віджети соцмереж
    raw = re.sub(r"<(script|style|iframe|noscript)[^>]*>.*?</\1>", " ", raw, flags=re.IGNORECASE | re.DOTALL)
    # Зберігаємо розбиття на абзаци перед зняттям тегів
    raw = re.sub(r"</(?:p|div|li|h[1-6]|blockquote)>", "\n\n", raw, flags=re.IGNORECASE)
    raw = re.sub(r"<br\s*/?>", "\n", raw, flags=re.IGNORECASE)
    raw = re.sub(r"<[^>]+>", " ", raw)
    # Декодуємо HTML-сутності (двічі на випадок &amp;mdash; / &amp;quot; у champion.com.ua)
    raw = html.unescape(html.unescape(raw))
    raw = raw.replace("\r\n", "\n").replace("\r", "\n").replace("\xa0", " ").replace("\u200b", "")

    paragraphs: List[str] = []
    for block in re.split(r"\n{2,}", raw):
        lines = [re.sub(r"[ \t]+", " ", ln).strip() for ln in block.split("\n")]
        para = " ".join(ln for ln in lines if ln)
        if not para:
            continue
        # Прибираємо сирі Twitter/X embed-хвости на кшталт "— IIHF (@IIHFHockey) November 25, 2026"
        if "pic.twitter.com/" in para or ("https://t.co/" in para and "@" in para and len(para) < 350):
            continue
        paragraphs.append(para)

    return "\n\n".join(paragraphs).strip()[:12000]


def build_summary_from_text(full_text: str, max_len: int = 260) -> str:
    """
    Формує охайний 1–2-реченнєвий підпис (лід) для картки новини з початку повного тексту,
    якщо RSS <description> порожній або занадто короткий (< 35 символів).
    """
    if not full_text:
        return ""
    flat = re.sub(r"\s+", " ", full_text).strip()
    if not flat:
        return ""
    if len(flat) <= max_len:
        return flat

    # Пробуємо зібрати 1–2 повних речення в межах max_len
    sentences = re.split(r"(?<=[.!?…])\s+", flat)
    lead = ""
    for sent in sentences:
        candidate = f"{lead} {sent}".strip() if lead else sent
        if len(candidate) <= max_len:
            lead = candidate
            if len(lead) >= 120:
                break
        else:
            break

    if len(lead) >= 60:
        return lead

    # Інакше акуратно обрізаємо по межі слова
    cut = flat[: max_len - 1].rsplit(" ", 1)[0].rstrip(" ,;:-–—")
    return f"{cut}…" if cut else flat[:max_len]


def extract_author_from_html(html_text: str) -> Optional[str]:
    """
    Резервний витяг імені автора з JSON-LD (@type: Person), <meta name="author"> або rel="author",
    коли trafilatura.extract_metadata() повертає None.
    """
    if not html_text:
        return None

    # 1. JSON-LD блоки <script type="application/ld+json">
    for match in re.finditer(
        r'<script[^>]+type=["\']application/ld\+json["\'][^>]*>(.*?)</script>',
        html_text,
        flags=re.IGNORECASE | re.DOTALL,
    ):
        raw_json = match.group(1).strip()
        if not raw_json or '"author"' not in raw_json.lower():
            continue
        try:
            data = json.loads(raw_json)
        except Exception:
            continue

        nodes: List[Any] = []
        if isinstance(data, list):
            nodes.extend(data)
        elif isinstance(data, dict):
            nodes.append(data)
            if isinstance(data.get("@graph"), list):
                nodes.extend(data["@graph"])

        found_names: List[str] = []
        for node in nodes:
            if not isinstance(node, dict):
                continue
            auth = node.get("author")
            if not auth:
                continue
            auth_items = auth if isinstance(auth, list) else [auth]
            for item in auth_items:
                if isinstance(item, str) and item.strip():
                    found_names.append(item.strip())
                elif isinstance(item, dict):
                    atype = str(item.get("@type", "")).lower()
                    name = str(item.get("name", "")).strip()
                    if not name:
                        continue
                    # Віддаємо перевагу Person; пропускаємо Organization (для них буде охайний редакційний фолбек)
                    if "organization" in atype:
                        continue
                    found_names.append(name)
        if found_names:
            deduped = list(dict.fromkeys(found_names))
            return ", ".join(deduped[:3])

    # 2. <meta name="author" content="...">
    m_meta = re.search(
        r'<meta[^>]+name=["\']author["\'][^>]+content=["\']([^"\']{2,120})["\']',
        html_text,
        flags=re.IGNORECASE,
    )
    if not m_meta:
        m_meta = re.search(
            r'<meta[^>]+content=["\']([^"\']{2,120})["\'][^>]+name=["\']author["\']',
            html_text,
            flags=re.IGNORECASE,
        )
    if m_meta:
        val = html.unescape(m_meta.group(1)).strip()
        if val and not val.startswith(("http://", "https://", "@")):
            return val

    return None


def clean_author_name(raw_author: Optional[str], source_name: str = "") -> Optional[str]:
    """
    Очищає і нормалізує рядок автора:
    - Видаляє редакційні хвости на кшталт '; «Факти', '; Спеціально Для «Фактів', email-адреси, URL та Twitter-хендли.
    - Нормалізує ALL-CAPS прізвища ('Ірина АЛЕКСЄЄВА' -> 'Ірина Алексєєва').
    - Повертає чесну редакційну атрибуцію 'Редакція «<Видання>»', якщо стаття не має персонального підпису журналіста.
    """
    fallback = f"Редакція «{source_name.strip()}»" if source_name and source_name.strip() else None

    if not raw_author:
        return fallback

    cleaned = html.unescape(str(raw_author)).replace("\xa0", " ").strip()
    if not cleaned:
        return fallback

    # Email-рядки на кшталт "info@lb.ua (LB.ua)" або URL
    if "@" in cleaned or "http://" in cleaned.lower() or "https://" in cleaned.lower():
        return fallback

    # Розбиваємо на частини за ';' або ',' і вичищаємо редакційні/технічні хвости
    raw_parts = re.split(r"\s*[;,]\s*", cleaned)
    clean_parts: List[str] = []
    junk_re = re.compile(
        r"^(?:«?факти?»?|спеціально\s+для.*|відділ\s+новин|редакція.*|кореспондент.*|getty\s*images|укрінформ|уніан|lb\.ua|zn\.ua|bbc.*|interfax.*)$",
        flags=re.IGNORECASE,
    )

    for part in raw_parts:
        p = part.strip(" «»\"'.,;:-–—")
        if not p or len(p) < 3:
            continue
        if junk_re.match(p):
            continue
        # Нормалізуємо прізвища у верхньому регістрі (наприклад 'Ірина АЛЕКСЄЄВА' -> 'Ірина Алексєєва')
        words = p.split()
        norm_words = []
        for w in words:
            if len(w) >= 4 and w.isupper() and any("\u0400" <= ch <= "\u04ff" for ch in w):
                norm_words.append(w[0].upper() + w[1:].lower())
            else:
                norm_words.append(w)
        norm = " ".join(norm_words).strip()
        if norm and norm not in clean_parts:
            clean_parts.append(norm)

    if not clean_parts:
        return fallback

    result = ", ".join(clean_parts[:3])
    return result[:255]


class NewsIngestionService:
    """Сервіс асинхронного збору та обробки новин з RSS-джерел."""

    def __init__(self):
        self.headers = {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
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
                rss_url=feed_config.get("rss_url"),
                reliability_rating=feed_config.get("reliability_rating", 80.0),
                is_whitelisted=feed_config.get("is_whitelisted", False),
                language=feed_config.get("language", "ua"),
                country=feed_config.get("country", "UA"),
            )
            db.add(source)
            await db.flush()
        elif not source.rss_url and feed_config.get("rss_url"):
            source.rss_url = feed_config.get("rss_url")
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
        """Витяг повного тексту статті та метаданих за допомогою trafilatura, JSON-LD та OpenGraph."""
        details: Dict[str, Any] = {
            "full_text": None,
            "description": None,
            "image_url": None,
            "author": None,
            "date": None,
        }
        try:
            async with httpx.AsyncClient(headers=self.headers, follow_redirects=True, timeout=8.0) as client:
                res = await client.get(url)
                if res.status_code == 200 and res.text:
                    page_html = res.text
                    extracted_text = trafilatura.extract(
                        page_html,
                        include_comments=False,
                        include_tables=False,
                        no_fallback=False,
                    )
                    if extracted_text and not _is_blocked_page_text(extracted_text):
                        details["full_text"] = extracted_text.strip()[:12000]

                    meta = trafilatura.extract_metadata(page_html)
                    if meta:
                        if meta.image:
                            details["image_url"] = meta.image
                        if meta.author:
                            details["author"] = meta.author
                        if meta.date:
                            details["date"] = meta.date
                        if meta.description:
                            details["description"] = html.unescape(str(meta.description)).strip()

                    # Резервний пошук автора у JSON-LD та <meta name="author">
                    if not details["author"]:
                        details["author"] = extract_author_from_html(page_html)

                    # Резервний пошук og:description для короткого підпису картки
                    if not details["description"]:
                        og_desc = re.search(
                            r'<meta[^>]+(?:property|name)=["\'](?:og:description|description)["\'][^>]+content=["\']([^"\']+)["\']',
                            page_html,
                            re.IGNORECASE,
                        )
                        if not og_desc:
                            og_desc = re.search(
                                r'<meta[^>]+content=["\']([^"\']+)["\'][^>]+(?:property|name)=["\'](?:og:description|description)["\']',
                                page_html,
                                re.IGNORECASE,
                            )
                        if og_desc:
                            details["description"] = html.unescape(og_desc.group(1)).strip()

                    # Якщо trafilatura не знайшла картинку, шукаємо og:image та twitter:image напряму в HTML
                    if not details["image_url"]:
                        og_match = re.search(r'<meta[^>]+(?:property|name)=["\'](?:og:image|twitter:image)["\'][^>]+content=["\']([^"\']+)["\']', page_html, re.IGNORECASE)
                        if not og_match:
                            og_match = re.search(r'<meta[^>]+content=["\']([^"\']+)["\'][^>]+(?:property|name)=["\'](?:og:image|twitter:image)["\']', page_html, re.IGNORECASE)
                        if og_match:
                            details["image_url"] = og_match.group(1).strip()
        except Exception as e:
            logger.debug(f"Не вдалося виконати повний витяг тексту для {url}: {e}")

        return details

    async def ingest_feed(self, db: AsyncSession, feed_config: Dict[str, Any], max_items: int = 100) -> int:
        """Обробка однієї RSS-стрічки та додавання всіх нових статей до бази з паралельним витягом текстів."""
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

        # 1. Попередній відбір валідних кандидатів і дедуплікація в межах стрічки
        candidates: List[tuple[Any, str, str]] = []
        seen_in_feed: set[str] = set()
        for entry in parsed_feed.entries[:max_items]:
            raw_url = getattr(entry, "link", None)
            from app.services.factcheck_service import clean_html_text

            title = clean_html_text(getattr(entry, "title", ""))
            if not raw_url or not title:
                continue

            if not is_valid_article_content(title, language=feed_language):
                logger.info(f"Пропущено статтю через невідповідність мови: {title}")
                continue

            article_url = normalize_url(raw_url)
            if not article_url or article_url in seen_in_feed:
                continue
            seen_in_feed.add(article_url)
            candidates.append((entry, title, article_url))

        if not candidates:
            return 0

        # 2. Пакетна перевірка дедуплікації в БД одним SQL-запитом
        candidate_urls = [url for _, _, url in candidates]
        existing_res = await db.execute(
            select(Article.url).where(Article.url.in_(candidate_urls))
        )
        existing_urls = set(existing_res.scalars().all())
        new_candidates = [
            (entry, title, url) for entry, title, url in candidates if url not in existing_urls
        ]

        if not new_candidates:
            return 0

        # 3. Паралельне завантаження повного тексту та обкладинок для нових статей
        # Пропускаємо зайвий HTML-запит, якщо RSS уже віддав повний <content:encoded> + картинку + автора (або домен RSS-only)
        sem = asyncio.Semaphore(4)
        source_domain_low = (source.domain or "").lower().strip()

        def _extract_rss_image(entry_obj: Any, raw_sum: str) -> Optional[str]:
            if hasattr(entry_obj, "media_thumbnail") and entry_obj.media_thumbnail:
                if entry_obj.media_thumbnail[0].get("url"):
                    return entry_obj.media_thumbnail[0].get("url")
            if hasattr(entry_obj, "media_content") and entry_obj.media_content:
                for mc in entry_obj.media_content:
                    if mc.get("url"):
                        return mc.get("url")
            if hasattr(entry_obj, "enclosures") and entry_obj.enclosures:
                for enc in entry_obj.enclosures:
                    href = enc.get("href", "")
                    if "image" in enc.get("type", "") or href.split("?")[0].lower().endswith((".jpg", ".jpeg", ".png", ".webp", ".gif")):
                        return href
            if raw_sum:
                m_img = re.search(r'<img[^>]+src=["\']([^"\']+)["\']', raw_sum, re.IGNORECASE)
                if m_img:
                    return m_img.group(1).strip()
            if hasattr(entry_obj, "content") and entry_obj.content:
                for c in entry_obj.content:
                    val = c.get("value", "") if isinstance(c, dict) else ""
                    m_img = re.search(r'<img[^>]+src=["\']([^"\']+)["\']', val, re.IGNORECASE)
                    if m_img:
                        return m_img.group(1).strip()
            return None

        pre_extracted: List[Dict[str, Any]] = []
        for entry, title, article_url in new_candidates:
            raw_sum = getattr(entry, "summary", "") or getattr(entry, "description", "")
            rss_content = extract_rss_content_text(entry)
            rss_img = _extract_rss_image(entry, raw_sum)
            rss_author = getattr(entry, "author", None) or getattr(entry, "dc_creator", None)
            needs_html = True
            if source_domain_low in RSS_FULLTEXT_PRIMARY_DOMAINS and len(rss_content) >= 120:
                needs_html = False
            elif len(rss_content) >= 260 and rss_img and rss_author:
                needs_html = False
            pre_extracted.append({
                "raw_summary": raw_sum,
                "rss_content": rss_content,
                "rss_image": rss_img,
                "rss_author": rss_author,
                "needs_html": needs_html,
            })

        async def _fetch_details_guarded(target_url: str, need_html: bool) -> Dict[str, Any]:
            if not need_html:
                return {"full_text": None, "description": None, "image_url": None, "author": None, "date": None}
            async with sem:
                return await self.extract_article_details(target_url)

        details_list = await asyncio.gather(
            *(_fetch_details_guarded(url, pre["needs_html"]) for (_, _, url), pre in zip(new_candidates, pre_extracted))
        )

        new_articles_count = 0

        for (entry, title, article_url), pre, details in zip(new_candidates, pre_extracted, details_list):
            raw_summary = pre["raw_summary"]
            rss_content = pre["rss_content"]
            image_url = pre["rss_image"]

            # Очищення summary від HTML тегів та сутностей після витягу картинок
            from app.services.factcheck_service import clean_html_text

            rss_summary = clean_html_text(raw_summary) if raw_summary else ""
            html_text = (details.get("full_text") or "").strip()
            html_desc = clean_html_text(details.get("description") or "") if details.get("description") else ""

            # 2. Вибір найповнішого тексту: HTML (trafilatura) vs RSS <content:encoded> vs summary
            candidates_text = [t for t in (html_text, rss_content, rss_summary, html_desc) if t and not _is_blocked_page_text(t)]
            full_text = max(candidates_text, key=len) if candidates_text else ""

            # Формуємо змістовний підпис для картки (summary): RSS summary -> og:description -> перші 1–2 речення full_text
            if len(rss_summary) >= 35:
                summary = rss_summary
            elif len(html_desc) >= 35:
                summary = html_desc
            elif full_text:
                summary = build_summary_from_text(full_text, max_len=260)
            else:
                summary = rss_summary

            # Захист від порожніх «пустушок» без тексту й опису (наприклад, коли RSS порожній, а сайт повернув 403)
            if len(full_text.strip()) < 25 and len(summary.strip()) < 25:
                logger.info(f"[{source.name}] Пропущено статтю без тексту й опису: {title}")
                continue

            # Якщо зображення ще не знайдено — беремо зі сторінки через OpenGraph / trafilatura
            if not image_url:
                image_url = details.get("image_url")

            # Повторна перевірка витягнутого тексту на мову
            if full_text and not is_valid_article_content(title, full_text, language=feed_language):
                logger.info(f"Пропущено статтю через російські маркери в тілі тексту: {title}")
                continue

            tags = [t.term for t in getattr(entry, "tags", []) if hasattr(t, "term")]
            category = infer_category(
                title,
                tags,
                article_url,
                default_category=feed_config.get("default_category"),
            )
            author = clean_author_name(details.get("author") or pre["rss_author"], source.name)

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
                db=db,
                reference_published_at=published_at,
            )

            article = Article(
                title=title,
                url=article_url,
                source_id=source.id,
                domain=source.domain,
                source_name=source.name,
                summary=summary[:1000] if summary else build_summary_from_text(full_text, max_len=260),
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
            try:
                from app.services.embedding_service import embedding_service

                await embedding_service.backfill_null_embeddings(db, limit=1000)
            except Exception as emb_err:
                logger.debug("Помилка генерації pgvector ембедингів після імпорту RSS: %s", emb_err)
            logger.info(f"[{source.name}] Успішно додано {new_articles_count} нових статей.")

        return new_articles_count

    async def sync_all_feeds(self, db: AsyncSession, max_per_feed: int = 100) -> Dict[str, Any]:
        """Синхронізація всіх зареєстрованих RSS стрічок (базових + доданих адміністратором у БД)."""
        start_time = datetime.now()
        total_new = 0
        feed_results = []

        # Об'єднуємо базові канали та кастомні RSS-канали, додані адміністратором у таблицю sources
        feeds_to_sync = list(DEFAULT_FEEDS)
        known_rss_urls = {f["rss_url"].strip() for f in DEFAULT_FEEDS if f.get("rss_url")}
        try:
            custom_sources = (
                await db.execute(
                    select(Source).where(
                        Source.rss_url.is_not(None),
                        Source.is_blacklisted == False,
                        Source.language == "ua",
                    )
                )
            ).scalars().all()
            for cs in custom_sources:
                if cs.rss_url and cs.rss_url.strip() and cs.rss_url.strip() not in known_rss_urls:
                    known_rss_urls.add(cs.rss_url.strip())
                    feeds_to_sync.append(
                        {
                            "name": cs.name,
                            "domain": cs.domain,
                            "homepage_url": cs.homepage_url or f"https://{cs.domain}",
                            "rss_url": cs.rss_url.strip(),
                            "reliability_rating": cs.reliability_rating,
                            "is_whitelisted": cs.is_whitelisted,
                            "language": cs.language or "ua",
                            "country": cs.country or "UA",
                        }
                    )
        except Exception as e:
            logger.debug("Помилка завантаження кастомних RSS-джерел із БД: %s", e)

        for feed_config in feeds_to_sync:
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
            "feeds_count": len(feeds_to_sync),
            "duration_seconds": round(duration, 2),
            "details": feed_results,
        }


# Глобальний інстанс сервісу
news_ingestion_service = NewsIngestionService()
