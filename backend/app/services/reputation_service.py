import logging
from typing import Dict, Any, Optional, Tuple
from urllib.parse import urlparse
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.source import Source

logger = logging.getLogger(__name__)


class DomainReputationResult(BaseModel):
    domain: str
    name: str
    reliability_rating: float
    status: str  # "whitelisted", "graylisted", "blacklisted", "unknown"
    imi_category: str
    description: str
    is_whitelisted: bool
    is_blacklisted: bool


# База репутації доменів згідно з офіційним моніторингом Інституту Масової Інформації (ІМІ)
# та міжнародними стандартами журналістики (IFCN / Reporters Without Borders)
DOMAIN_REPUTATION_DATABASE: Dict[str, Dict[str, Any]] = {
    # =========================================================================
    # БІЛИЙ СПИСОК ІМІ (White List) - Високий рівень дотримання стандартів (90-98%)
    # =========================================================================
    "suspilne.media": {
        "name": "Суспільне Новини",
        "reliability_rating": 98.0,
        "status": "whitelisted",
        "imi_category": "Білий список ІМІ (Лідер довіри)",
        "description": "Суспільний мовник України. Найвищий рівень дотримання балансу думок, достовірності та відокремлення фактів від коментарів за моніторингами ІМІ.",
        "is_whitelisted": True,
        "is_blacklisted": False,
    },
    "ukrinform.ua": {
        "name": "Укрінформ",
        "reliability_rating": 96.0,
        "status": "whitelisted",
        "imi_category": "Білий список ІМІ",
        "description": "Національне інформаційне агентство України. Високі стандарти офіційної верифікації фактів та цитування першоджерел.",
        "is_whitelisted": True,
        "is_blacklisted": False,
    },
    "pravda.com.ua": {
        "name": "Українська правда",
        "reliability_rating": 95.0,
        "status": "whitelisted",
        "imi_category": "Білий список ІМІ",
        "description": "Провідне незалежне суспільно-політичне інтернет-видання України. Регулярний учасник Білого списку якісних медіа ІМІ.",
        "is_whitelisted": True,
        "is_blacklisted": False,
    },
    "zn.ua": {
        "name": "Дзеркало тижня (ZN.UA)",
        "reliability_rating": 94.0,
        "status": "whitelisted",
        "imi_category": "Білий список ІМІ",
        "description": "Авторитетне видання аналітичної та розслідувальної журналістики. Висока експертність матеріалів.",
        "is_whitelisted": True,
        "is_blacklisted": False,
    },
    "babel.ua": {
        "name": "Бабель",
        "reliability_rating": 95.0,
        "status": "whitelisted",
        "imi_category": "Білий список ІМІ",
        "description": "Незалежне суспільно-політичне медіа. Високі стандарти фактчекінгу, відсутність джинси за моніторингами ІМІ.",
        "is_whitelisted": True,
        "is_blacklisted": False,
    },
    "radiosvoboda.org": {
        "name": "Радіо Свобода",
        "reliability_rating": 96.0,
        "status": "whitelisted",
        "imi_category": "Білий список ІМІ",
        "description": "Українська служба RFE/RL. Еталон журналістських стандартів, глибинні розслідування («Схеми»).",
        "is_whitelisted": True,
        "is_blacklisted": False,
    },
    "hromadske.ua": {
        "name": "Громадське",
        "reliability_rating": 95.0,
        "status": "whitelisted",
        "imi_category": "Білий список ІМІ",
        "description": "Громадське телебачення. Незалежне фінансування, суворе дотримання етичного кодексу журналіста.",
        "is_whitelisted": True,
        "is_blacklisted": False,
    },
    "espreso.tv": {
        "name": "Еспресо",
        "reliability_rating": 92.0,
        "status": "whitelisted",
        "imi_category": "Білий список ІМІ",
        "description": "Інформаційний телеканал та портал новин. Регулярно входить до моніторингових списків перевірених медіа.",
        "is_whitelisted": True,
        "is_blacklisted": False,
    },
    "lb.ua": {
        "name": "LB.ua (Лівий берег)",
        "reliability_rating": 93.0,
        "status": "whitelisted",
        "imi_category": "Білий список ІМІ",
        "description": "Якісне суспільно-політичне видання з акцентом на державну політику та аналіз реформ.",
        "is_whitelisted": True,
        "is_blacklisted": False,
    },
    "interfax.com.ua": {
        "name": "Інтерфакс-Україна",
        "reliability_rating": 93.0,
        "status": "whitelisted",
        "imi_category": "Білий список ІМІ",
        "description": "Інформаційне агентство з акцентом на ділові, фінансові та політичні новини. Мінімальний рівень суб'єктивності.",
        "is_whitelisted": True,
        "is_blacklisted": False,
    },
    # Міжнародні еталонні ЗМІ
    "bbc.com": {
        "name": "BBC News",
        "reliability_rating": 96.0,
        "status": "whitelisted",
        "imi_category": "Міжнародні медіа (Еталон стандартів)",
        "description": "Британська мовна корпорація. Суворі міжнародні редакційні настанови, висока репутація достовірності.",
        "is_whitelisted": True,
        "is_blacklisted": False,
    },
    "theguardian.com": {
        "name": "The Guardian",
        "reliability_rating": 94.0,
        "status": "whitelisted",
        "imi_category": "Міжнародні якісні медіа",
        "description": "Одне з найвпливовіших видань Великої Британії та світу. Глибокі розслідування, висока достовірність фактів.",
        "is_whitelisted": True,
        "is_blacklisted": False,
    },
    "dw.com": {
        "name": "Deutsche Welle",
        "reliability_rating": 95.0,
        "status": "whitelisted",
        "imi_category": "Міжнародні якісні медіа",
        "description": "Німецька державна міжнародна телерадіокомпанія. Суворий фактчекінг та дотримання журналістських стандартів.",
        "is_whitelisted": True,
        "is_blacklisted": False,
    },
    "reuters.com": {
        "name": "Reuters",
        "reliability_rating": 98.0,
        "status": "whitelisted",
        "imi_category": "Міжнародне інформаційне агентство",
        "description": "Глобальне інформаційне агентство, сертифікований фактчекер IFCN. Золотий стандарт новинної журналістики.",
        "is_whitelisted": True,
        "is_blacklisted": False,
    },
    "apnews.com": {
        "name": "Associated Press",
        "reliability_rating": 98.0,
        "status": "whitelisted",
        "imi_category": "Міжнародне інформаційне агентство",
        "description": "Найбільше американське інформаційне агентство з бездоганною репутацією фактчекінгу.",
        "is_whitelisted": True,
        "is_blacklisted": False,
    },
    "politico.eu": {
        "name": "Politico Europe",
        "reliability_rating": 92.0,
        "status": "whitelisted",
        "imi_category": "Міжнародні якісні медіа",
        "description": "Спеціалізоване видання європейської політики та інституцій ЄС.",
        "is_whitelisted": True,
        "is_blacklisted": False,
    },
    "npr.org": {
        "name": "NPR",
        "reliability_rating": 94.0,
        "status": "whitelisted",
        "imi_category": "Міжнародні якісні медіа",
        "description": "Національне громадське радіо США. Високий рівень достовірності та об'єктивності.",
        "is_whitelisted": True,
        "is_blacklisted": False,
    },

    # =========================================================================
    # СІРИЙ СПИСОК (Gray List) - Помірний ризик (клікбейт, джинса, таблоїдність, 50-75%)
    # =========================================================================
    "tsn.ua": {
        "name": "ТСН (1+1)",
        "reliability_rating": 68.0,
        "status": "graylisted",
        "imi_category": "Сірий список (Клікбейт / Емоційність)",
        "description": "Висока відвідуваність, проте часте використання клікбейтних заголовків та емоційної гіперболізації новин.",
        "is_whitelisted": False,
        "is_blacklisted": False,
    },
    "rbc.ua": {
        "name": "РБК-Україна",
        "reliability_rating": 72.0,
        "status": "graylisted",
        "imi_category": "Сірий список (Комерційні матеріали)",
        "description": "Оперативне новинне агентство, проте періодично фіксуються комерційні немарковані публікації.",
        "is_whitelisted": False,
        "is_blacklisted": False,
    },
    "obozrevatel.com": {
        "name": "Обозреватель",
        "reliability_rating": 62.0,
        "status": "graylisted",
        "imi_category": "Сірий список (Таблоїдизація)",
        "description": "Висока концентрація клікбейту, сенсаційних заголовків та неперевірених чуток із соцмереж.",
        "is_whitelisted": False,
        "is_blacklisted": False,
    },
    "unian.net": {
        "name": "УНІАН",
        "reliability_rating": 70.0,
        "status": "graylisted",
        "imi_category": "Сірий список (Клікбейт)",
        "description": "Висока швидкість стрічки новин, однак за даними ІМІ часто присутні маніпулятивні клікбейтні заголовки.",
        "is_whitelisted": False,
        "is_blacklisted": False,
    },
    "fakty.ua": {
        "name": "Факти ICTV",
        "reliability_rating": 68.0,
        "status": "graylisted",
        "imi_category": "Сірий список (Помірний клікбейт)",
        "description": "Масове медіа холдингу Starlight, часті емоційні подачі матеріалу в онлайн-версії.",
        "is_whitelisted": False,
        "is_blacklisted": False,
    },
    "unn.ua": {
        "name": "УНН",
        "reliability_rating": 70.0,
        "status": "graylisted",
        "imi_category": "Сірий список",
        "description": "Українські Національні Новини. Часті немарковані комерційні релізи за моніторингами ІМІ.",
        "is_whitelisted": False,
        "is_blacklisted": False,
    },
    "politeka.net": {
        "name": "Politeka",
        "reliability_rating": 45.0,
        "status": "graylisted",
        "imi_category": "Сірий список (Агресивний клікбейт)",
        "description": "Високий рівень маніпуляцій, фальшиві інтригуючі заголовки без зв'язку зі змістом статті.",
        "is_whitelisted": False,
        "is_blacklisted": False,
    },
    "znaj.ua": {
        "name": "Знай.ua",
        "reliability_rating": 45.0,
        "status": "graylisted",
        "imi_category": "Сірий список (Таблоїд / Маніпуляції)",
        "description": "Систематичні порушення стандартів, виривання слів із контексту заради штучного трафіку.",
        "is_whitelisted": False,
        "is_blacklisted": False,
    },
    "clickbait-news.net": {
        "name": "Сумнівне Медіа Таблоїд",
        "reliability_rating": 25.0,
        "status": "graylisted",
        "imi_category": "Демонстраційна сміттярка",
        "description": "Тестовий домен маніпулятивного таблоїду з клікбейтом.",
        "is_whitelisted": False,
        "is_blacklisted": True,
    },

    # =========================================================================
    # ЧОРНИЙ СПИСОК (Black List) - Підсанкційні ресурси, пропаганда РФ (10-25%)
    # =========================================================================
    "strana.ua": {
        "name": "Страна.ua",
        "reliability_rating": 15.0,
        "status": "blacklisted",
        "imi_category": "Чорний список (Санкції РНБО / Пропаганда)",
        "description": "Ресурс під санкціями РНБО України за систематичне поширення кремлівських наративів та дезінформації.",
        "is_whitelisted": False,
        "is_blacklisted": True,
    },
    "strana.today": {
        "name": "Страна.today (Дзеркало)",
        "reliability_rating": 15.0,
        "status": "blacklisted",
        "imi_category": "Чорний список (Санкції РНБО)",
        "description": "Дзеркало заблокованого ресурсу Страна.ua.",
        "is_whitelisted": False,
        "is_blacklisted": True,
    },
    "sharij.net": {
        "name": "Шарій.net",
        "reliability_rating": 15.0,
        "status": "blacklisted",
        "imi_category": "Чорний список (Санкції РНБО)",
        "description": "Пропагандистський дезінформаційний сайт, заблокований згідно з рішенням РНБО України.",
        "is_whitelisted": False,
        "is_blacklisted": True,
    },
    "vesti.ua": {
        "name": "Вєсті",
        "reliability_rating": 25.0,
        "status": "blacklisted",
        "imi_category": "Чорний список (Маніпулятивне медіа)",
        "description": "Медіахолдинг ексміністра доходів і зборів часів Януковича О. Клименка. Систематичні проросійські маніпуляції.",
        "is_whitelisted": False,
        "is_blacklisted": True,
    },
    "ria.ru": {
        "name": "РИА Новости",
        "reliability_rating": 5.0,
        "status": "blacklisted",
        "imi_category": "Чорний список (Державна пропаганда РФ)",
        "description": "Офіційне інформагентство уряду РФ. Ключовий інструмент інформаційної війни та воєнної пропаганди.",
        "is_whitelisted": False,
        "is_blacklisted": True,
    },
    "tass.ru": {
        "name": "ТАСС",
        "reliability_rating": 5.0,
        "status": "blacklisted",
        "imi_category": "Чорний список (Державна пропаганда РФ)",
        "description": "Державне агентство РФ, що транслює цензуровані кремлівські директиви.",
        "is_whitelisted": False,
        "is_blacklisted": True,
    },
    "rt.com": {
        "name": "Russia Today (RT)",
        "reliability_rating": 5.0,
        "status": "blacklisted",
        "imi_category": "Чорний список (Санкції ЄС та США)",
        "description": "Заборонений у країнах ЄС та Великобританії державний канал міжнародної дезінформації РФ.",
        "is_whitelisted": False,
        "is_blacklisted": True,
    },
    "tsargrad.tv": {
        "name": "Царьград",
        "reliability_rating": 5.0,
        "status": "blacklisted",
        "imi_category": "Чорний список (Екстремістська пропаганда)",
        "description": "Ультранаціоналістичний пропагандистський ресурс олігарха К. Малофєєва.",
        "is_whitelisted": False,
        "is_blacklisted": True,
    },
    "readovka.news": {
        "name": "Readovka",
        "reliability_rating": 5.0,
        "status": "blacklisted",
        "imi_category": "Чорний список (Воєнна пропаганда РФ)",
        "description": "Z-мілітаристський дезінформаційний канал, поширення фальсифікацій про війну.",
        "is_whitelisted": False,
        "is_blacklisted": True,
    },
}


class DomainReputationService:
    """Сервіс перевірки та аналізу репутації доменів згідно з моніторингами ІМІ."""

    def normalize_domain(self, domain_or_url: str) -> str:
        """Очищення та нормалізація домену з URL чи рядка."""
        if not domain_or_url:
            return ""
        domain_str = domain_or_url.strip().lower()
        if "://" in domain_str:
            parsed = urlparse(domain_str)
            domain_str = parsed.netloc or parsed.path
        # Видалення port
        if ":" in domain_str:
            domain_str = domain_str.split(":")[0]
        # Видалення www.
        if domain_str.startswith("www."):
            domain_str = domain_str[4:]
        # Видалення слешів
        domain_str = domain_str.split("/")[0]
        return domain_str

    def get_reputation(self, domain_or_url: str) -> DomainReputationResult:
        """Отримання рейтингу довіри та статусу домену за базою ІМІ."""
        normalized = self.normalize_domain(domain_or_url)

        # Точний збіг
        if normalized in DOMAIN_REPUTATION_DATABASE:
            info = DOMAIN_REPUTATION_DATABASE[normalized]
            return DomainReputationResult(
                domain=normalized,
                name=info["name"],
                reliability_rating=info["reliability_rating"],
                status=info["status"],
                imi_category=info["imi_category"],
                description=info["description"],
                is_whitelisted=info["is_whitelisted"],
                is_blacklisted=info["is_blacklisted"],
            )

        # Пошук за кореневим доменом (наприклад, news.bbc.com -> bbc.com)
        parts = normalized.split(".")
        if len(parts) > 2:
            root_domain = ".".join(parts[-2:])
            if root_domain in DOMAIN_REPUTATION_DATABASE:
                info = DOMAIN_REPUTATION_DATABASE[root_domain]
                return DomainReputationResult(
                    domain=normalized,
                    name=info["name"],
                    reliability_rating=info["reliability_rating"],
                    status=info["status"],
                    imi_category=info["imi_category"],
                    description=info["description"],
                    is_whitelisted=info["is_whitelisted"],
                    is_blacklisted=info["is_blacklisted"],
                )

        # Невідомий домен за замовчуванням
        return DomainReputationResult(
            domain=normalized,
            name=normalized,
            reliability_rating=75.0,  # Нейтральний стартовий бал для невідомих сайтів
            status="unknown",
            imi_category="Не оцінено в моніторингу ІМІ",
            description="Домен відсутній у моніторингових реєстрах ІМІ. Застосовується базовий нейтральний рейтинг з обов'язковою перевіркою стилометрії.",
            is_whitelisted=False,
            is_blacklisted=False,
        )

    async def sync_sources_with_reputation(self, db: AsyncSession) -> int:
        """Синхронізує таблицю sources у PostgreSQL з базою репутації ІМІ."""
        updated = 0
        for domain, info in DOMAIN_REPUTATION_DATABASE.items():
            res = await db.execute(select(Source).where(Source.domain == domain))
            source = res.scalar_one_or_none()
            if source:
                source.reliability_rating = info["reliability_rating"]
                source.is_whitelisted = info["is_whitelisted"]
                source.is_blacklisted = info["is_blacklisted"]
                updated += 1
            else:
                new_source = Source(
                    name=info["name"],
                    domain=domain,
                    homepage_url=f"https://{domain}",
                    reliability_rating=info["reliability_rating"],
                    is_whitelisted=info["is_whitelisted"],
                    is_blacklisted=info["is_blacklisted"],
                    language="ua" if not domain.endswith((".com", ".org", ".eu")) else "en",
                    country="UA" if not domain.endswith((".de", ".co.uk")) else "INTL",
                )
                db.add(new_source)
                updated += 1

        await db.commit()
        return updated


reputation_service = DomainReputationService()
