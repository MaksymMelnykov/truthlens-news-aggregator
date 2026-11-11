import logging
import re
from typing import List, Dict, Any, Optional
from pydantic import BaseModel

logger = logging.getLogger(__name__)


class StylometryTrigger(BaseModel):
    text: str
    category: str  # "clickbait", "typography", "emotional", "attribution"
    severity: str  # "low", "medium", "high"
    description: str


class StylometryAnalysisResult(BaseModel):
    clickbait_score: float  # 0 to 100 (вище = більше клікбейту)
    emotional_score: float  # 0 to 100 (вище = більше емоційного маніпулювання)
    manipulation_score: float  # 0 to 100 (вище = більше маніпулятивних маркерів)
    caps_lock_ratio: float = 0.0  # 0 to 1
    overall_penalty: float  # 0 to 100
    stylometry_trust_index: float  # 100 - overall_penalty (0 to 100)
    summary_verdict: str  # "Нейтральний", "Помірний ризик", "Висока маніпулятивність"
    triggers: List[StylometryTrigger]
    attribution_analysis: Dict[str, Any] = {}


# Словники клікбейту (українська + англійська)
CLICKBAIT_PHRASES = [
    (r"\bшок(!|\?)*\b", "ШОК!", "clickbait", "high", "Типовий клікбейт-маркер штучної сенсаційності"),
    (r"\bсенсація(!|\?)*\b", "СЕНСАЦІЯ!", "clickbait", "high", "Штучна сенсаційність для заманювання переходів"),
    (r"ви не повірите", "Ви не повірите", "clickbait", "high", "Клікбейт-заклик з маніпуляцією допитливістю"),
    (r"терміново дивіться", "Терміново дивіться", "clickbait", "high", "Штучне нагнітання терміновості"),
    (r"приховують від (народу|людей|громадян)", "Приховують від народу", "clickbait", "high", "Конспірологічний штамп про 'приховану правду'"),
    (r"ось що сталося", "Ось що сталося", "clickbait", "medium", "Інтригуючий кліфгенгер без суті новини"),
    (r"деталі вражають", "Деталі вражають", "clickbait", "medium", "Оціночний клікбейт замість фактів"),
    (r"вже з понеділка", "Вже з понеділка", "clickbait", "medium", "Популярний клікбейт-патерн фальшивих заборон"),
    (r"несподіваний поворот", "Несподіваний поворот", "clickbait", "low", "Драматизація новинного приводу"),
    (r"вся правда про", "Вся правда про", "clickbait", "medium", "Претензія на 'ексклюзивне викриття'"),
    (r"паніка в", "Паніка в...", "clickbait", "medium", "Спроба посіяти штучну тривожність"),
    (r"почалося(!|\?)*", "Почалося!", "clickbait", "high", "Алярмістський клікбейт без конкретики"),
    (r"\bshocking\b", "Shocking", "clickbait", "high", "Sensationalist clickbait indicator"),
    (r"you won't believe", "You won't believe", "clickbait", "high", "Clickbait curiosity gap"),
    (r"miracle cure", "Miracle cure", "clickbait", "high", "Pseudoscience clickbait claim"),
    (r"secret revealed", "Secret revealed", "clickbait", "medium", "Sensationalist reveal teaser"),
]

# Пропагандистські наративи та кремлівські штампи
PROPAGANDA_MARKERS = [
    (r"київськ(ий|ого|ому|им) режим(у|ом)?", "Київський режим", "propaganda", "high", "Кремлівський пропагандистський штамп"),
    (r"\bукронацист(и|ів|ам|ами)?\b", "Укронацисти", "propaganda", "high", "Кремлівська мова ворожнечі та дегуманізація"),
    (r"біолабораторі(ї|ях|й) нато", "Біолабораторії НАТО", "propaganda", "high", "Конспірологічний дезінформаційний наратив"),
    (r"\bанглосакс(и|ів|ам|ами)?\b", "Англосакси", "propaganda", "high", "Антизахідний конспірологічний ярлик"),
    (r"\bбрудн(а|ої|у) бомб(а|и|у)\b", "Брудна бомба", "propaganda", "high", "Дезінформація про радіаційну загрозу"),
    (r"\bзовнішн(є|ього) управлінн(я|ям)\b", "Зовнішнє управління", "propaganda", "medium", "Наратив про втрату суверенітету"),
    (r"\bкарател(і|ів|ям)\b", "Карателі", "propaganda", "high", "Дегуманізуючий пропагандистський термін"),
    (r"\bхунт(а|и|і|ою)\b", "Хунта", "propaganda", "high", "Пропагандистський штамп делегітимізації влади"),
]

# Емоційна та поляризуюча лексика (мова ворожнечі, паніка)
EMOTIONAL_MANIPULATION_PHRASES = [
    (r"\bбіомас(а|и|ою)\b", "Біомаса", "emotional", "high", "Зневажлива дегуманізація населення"),
    (r"тотальна катастрофа", "Тотальна катастрофа", "emotional", "medium", "Гіперболізоване нагнітання паніки"),
    (r"\bапокаліпсис\b", "Апокаліпсис", "emotional", "medium", "Есхатологічне залякування аудиторії"),
    (r"неминуча загибель", "Неминуча загибель", "emotional", "high", "Фаталістичне навіювання безпорадності"),
    (r"тотальний (крах|дефолт|голод)", "Тотальний крах/голод", "emotional", "high", "Штучна катастрофізація ситуації"),
    (r"суцільна зрада", "Суцільна зрада", "emotional", "low", "Поляризація суспільних настроїв"),
    (r"ганьба століття", "Ганьба століття", "emotional", "low", "Суб'єктивна емоційна оцінка замість фактів"),
]

# Анонімна або розмита атрибуція (відсутність фактів, псевдоцитати)
VAGUE_ATTRIBUTION_PHRASES = [
    (r"як стверджують експерти", "Як стверджують експерти", "attribution", "medium", "Розмита атрибуція без зазначення імен експертів"),
    (r"анонімні джерела( повідомили| заявили| кажуть| розповіли)?", "Анонімні джерела", "attribution", "medium", "Відсутність верифікованого авторства"),
    (r"у мережі спалахнула паніка", "У мережі спалахнула паніка", "attribution", "medium", "Узагальнення настроїв без репрезентативних даних"),
    (r"всім очевидно(,| що)?", "Всім очевидно", "attribution", "low", "Когнітивне спотворення (апеляція до псевдоочевидності)"),
    (r"інсайдери (розкрили|повідомили|кажуть|заявили)", "Інсайдери розкрили", "attribution", "medium", "Псевдоінсайдерство без документальних свідчень"),
    (r"секретні дані", "Секретні дані", "attribution", "medium", "Маніпулювання грифом секретності для довіри"),
    (r"британські вчені (довели|з'ясували|виявили)", "Британські вчені", "attribution", "medium", "Типовий псевдонауковий кліше-штамп без посилання на журнал"),
    (r"(в|у) кулуарах (кажуть|говорять|обговорюють|повідомили)", "Джерело в кулуарах", "attribution", "medium", "Чутки без офіційного підтвердження"),
    (r"(анонімні )?телеграм-канали (пишуть|повідомляють|розганяють)", "Анонімні телеграм-канали", "attribution", "medium", "Посилання на неперевірені анонімні канали"),
    (r"подейкують(,| що)?", "Подейкують", "attribution", "low", "Переказ неперевірених чуток замість фактів"),
    (r"таємний наказ", "Таємний наказ", "attribution", "high", "Конспірологічне посилання на неіснуючий закритий документ"),
]

# Офіційні інституції, відомства та верифіковані маркери цитування (NER-евристика)
VERIFIED_INSTITUTION_PATTERNS = [
    (r"\b(нбу|національн(ий|ого) банк(у)? україни)\b", "Національний банк України (НБУ)"),
    (r"\b(кабмін|кабінет(у)? міністрів)\b", "Кабінет Міністрів України"),
    (r"\b(верховн(а|ої|ій) рад(а|и|і)|парламент(у|ом)?)\b", "Верховна Рада України"),
    (r"\b(президент(а|ом)? україни|офіс(у)? президента)\b", "Офіс Президента України"),
    (r"\b(генштаб(у)?|генеральн(ий|ого) штаб(у)? зсу|збройн(і|их) сил(и)? україни)\b", "Генеральний штаб ЗСУ"),
    (r"\b(повітрян(і|их) сил(и)?)\b", "Повітряні Сили ЗСУ"),
    (r"\b(сбу|служб(а|и) безпеки україни)\b", "Служба безпеки України (СБУ)"),
    (r"\b(дснс|державн(а|ої) служб(а|и) з надзвичайних ситуацій)\b", "ДСНС України"),
    (r"\b(моз|міністерств(о|а) охорони здоров'я)\b", "МОЗ України"),
    (r"\b(мон|міністерств(о|а) освіти)\b", "МОН України"),
    (r"\b(міненерго|укренерго|нафтогаз)\b", "Енергетичне відомство / НЕК Укренерго"),
    (r"\b(мінфін|міністерств(о|а) фінансів|держстат)\b", "Міністерство фінансів / Держстат"),
    (r"\b(мінцифр(а|и)|застосунк(у)? дія)\b", "Мінцифри України"),
    (r"\b(мзс|міністерств(о|а) закордонних справ)\b", "МЗС України"),
    (r"\b(набу|дбр|сап|офіс(у)? генерального прокурора|нацполіці(я|ї))\b", "Правоохоронні органи України"),
    (r"\b(єврокомісі(я|ї)|європейськ(а|ої) рад(а|и)|європарламент)\b", "Інституції Європейського Союзу"),
    (r"\b(світов(ий|ого) банк(у)?|мвф|міжнародн(ий|ого) валютн(ий|ого) фонд(у)?|єбі)\b", "Міжнародні фінансові інституції"),
    (r"\b(оон|нато|магате|вооз|reuters|associated press|bbc|суспільне|укрінформ)\b", "Міжнародні організації та інформагентства"),
    (r"\b(законопроєкт(у)?|постанов(а|и)|офіційн(ий|ого) пресреліз(у)?|пресслужб(а|и))\b", "Офіційний документ / пресреліз"),
]

REPORTING_VERBS_PATTERN = re.compile(
    r"\b(повідомив|повідомила|повідомили|заявив|заявила|заявили|зазначив|зазначила|зазначили|"
    r"наголосив|наголосила|поінформував|поінформували|оприлюднив|оприлюднили|ухвалив|ухвалила|"
    r"за словами|за даними|згідно з|відповідно до|прокоментував|підтвердив|підтвердили)\b",
    flags=re.IGNORECASE,
)

# Загальноприйняті абревіатури, які не вважаються надмірним CAPS LOCK
STANDARD_ACRONYMS = {
    "ЗСУ", "НАТО", "США", "ЄС", "РНБО", "ООН", "ГУР", "СБУ", "ППО", "ТЦК", "ДБР", "НАБУ", "МВС",
    "МОЗ", "МАГАТЕ", "МВФ", "ВПО", "УП", "ZN", "BBC", "CNN", "NPR", "DW", "AP", "AFP", "USA", "EU", "NATO", "UN", "IMF", "WHO"
}


class StylometryService:
    """Аналізатор стилометричних характеристик тексту, клікбейту та емоційних маніпуляцій."""

    def analyze(self, title: str, text: str = "") -> StylometryAnalysisResult:
        """Повний стилометричний аналіз заголовка та тексту новини."""
        triggers: List[StylometryTrigger] = []
        combined_text = f"{title}. {text}".strip()

        # 1. Аналіз клікбейт-фраз у заголовку та ліді
        clickbait_hits = 0
        for pattern, label, cat, sev, desc in CLICKBAIT_PHRASES:
            if re.search(pattern, title, flags=re.IGNORECASE):
                clickbait_hits += 1
                triggers.append(StylometryTrigger(text=label, category=cat, severity=sev, description=desc))

        # 2. Аналіз пропагандистських маркерів
        propaganda_hits = 0
        for pattern, label, cat, sev, desc in PROPAGANDA_MARKERS:
            if re.search(pattern, combined_text, flags=re.IGNORECASE):
                propaganda_hits += 1
                triggers.append(StylometryTrigger(text=label, category=cat, severity=sev, description=desc))

        # 3. Аналіз емоційної поляризації
        emotional_hits = 0
        for pattern, label, cat, sev, desc in EMOTIONAL_MANIPULATION_PHRASES:
            if re.search(pattern, combined_text, flags=re.IGNORECASE):
                emotional_hits += 1
                triggers.append(StylometryTrigger(text=label, category=cat, severity=sev, description=desc))

        # 4. Аналіз розмитої атрибуції
        attribution_hits = 0
        for pattern, label, cat, sev, desc in VAGUE_ATTRIBUTION_PHRASES:
            if re.search(pattern, combined_text, flags=re.IGNORECASE):
                attribution_hits += 1
                triggers.append(StylometryTrigger(text=label, category=cat, severity=sev, description=desc))

        # 5. Аналіз графічних та пунктуаційних аномалій (CAPS LOCK & !/?)
        excessive_punct = re.findall(r"(!{2,}|\?{2,}|\?!|!\?|\.{4,})", title)
        if excessive_punct:
            triggers.append(
                StylometryTrigger(
                    text="".join(excessive_punct),
                    category="typography",
                    severity="high" if any(len(p) >= 3 for p in excessive_punct) else "medium",
                    description="Аномальне використання знаків оклику/питання в заголовку для штучного нагнітання емоцій",
                )
            )

        # CAPS LOCK у заголовку
        words = re.findall(r"\b[A-Za-zА-Яа-яІіЇїЄєҐґ']+\b", title)
        upper_words = [w for w in words if len(w) >= 3 and w.isupper() and w not in STANDARD_ACRONYMS]
        caps_ratio = len(upper_words) / max(1, len(words))

        if len(upper_words) >= 2 or caps_ratio >= 0.25:
            triggers.append(
                StylometryTrigger(
                    text=", ".join(upper_words[:3]),
                    category="typography",
                    severity="high" if caps_ratio >= 0.4 else "medium",
                    description=f"Надмірний CAPS LOCK у заголовку ({len(upper_words)} слів), що порушує журналістські стандарти нейтральності",
                )
            )

        # Розрахунок балів (0 to 100)
        clickbait_score = min(100.0, clickbait_hits * 30.0 + (len(excessive_punct) * 20.0))
        emotional_score = min(100.0, emotional_hits * 35.0)
        manipulation_score = min(100.0, (propaganda_hits * 40.0) + (attribution_hits * 25.0) + (caps_ratio * 100.0 * 0.5))

        # Загальний штрафний бал з посиленим штрафом за ворожу пропаганду
        base_penalty = (clickbait_score * 0.40) + (emotional_score * 0.30) + (manipulation_score * 0.40)
        if propaganda_hits > 0:
            base_penalty += (propaganda_hits * 15.0)

        penalty = min(100.0, base_penalty)

        trust_index = max(0.0, round(100.0 - penalty, 1))

        if penalty <= 15.0:
            summary = "Нейтральний журналістський стиль"
        elif penalty <= 45.0:
            summary = "Помірні маніпулятивні ознаки (клікбейт/емоційність)"
        else:
            summary = "Високий ризик дезінформації та маніпуляцій"

        attribution_analysis = self.analyze_attribution(title, text)

        return StylometryAnalysisResult(
            clickbait_score=round(clickbait_score, 1),
            emotional_score=round(emotional_score, 1),
            manipulation_score=round(manipulation_score, 1),
            caps_lock_ratio=round(caps_ratio, 2),
            overall_penalty=round(penalty, 1),
            stylometry_trust_index=trust_index,
            summary_verdict=summary,
            triggers=triggers,
            attribution_analysis=attribution_analysis,
        )

    def analyze_attribution(self, title: str, text: str = "") -> Dict[str, Any]:
        """NER та евристичний аналіз перевірки цитат, офіційних відомств та анонімних вкидів."""
        combined_text = f"{title}. {text}".strip()

        verified_entities: List[str] = []
        for pattern, label in VERIFIED_INSTITUTION_PATTERNS:
            if re.search(pattern, combined_text, flags=re.IGNORECASE):
                if label not in verified_entities:
                    verified_entities.append(label)

        unverified_claims: List[str] = []
        for pattern, label, _cat, _sev, desc in VAGUE_ATTRIBUTION_PHRASES:
            if re.search(pattern, combined_text, flags=re.IGNORECASE):
                entry = f"{label} ({desc})"
                if entry not in unverified_claims:
                    unverified_claims.append(entry)

        # Прямі цитати («...» або "...") та дієслова повідомлення
        direct_quotes = re.findall(r"(«[^»]{12,250}»|\"[^\"]{12,250}\")", combined_text)
        reporting_verbs = REPORTING_VERBS_PATTERN.findall(combined_text)

        base_attr_score = 65.0
        base_attr_score += min(30.0, len(verified_entities) * 12.0 + min(10.0, len(direct_quotes) * 4.0) + min(8.0, len(reporting_verbs) * 3.0))
        base_attr_score -= len(unverified_claims) * 22.0
        attribution_score = round(max(5.0, min(99.0, base_attr_score)), 1)

        if unverified_claims and not verified_entities:
            status = "unverified"
            summary = "Виявлено посилання на анонімні або неперевірені джерела без офіційного підтвердження."
        elif verified_entities and not unverified_claims:
            status = "verified"
            summary = f"Текст спирається на офіційні відомства або документальні джерела ({len(verified_entities)} од.)."
        elif verified_entities and unverified_claims:
            status = "mixed"
            summary = "У тексті згадуються офіційні органи, але водночас присутні неперевірені або анонімні твердження."
        else:
            status = "neutral"
            summary = "Прямих посилань на офіційні реєстри чи анонімні інсайди не виявлено (описовий виклад)."

        return {
            "status": status,
            "attribution_score": attribution_score,
            "verified_entities": verified_entities[:6],
            "unverified_claims": unverified_claims[:6],
            "direct_quotes_count": len(direct_quotes),
            "reporting_verbs_count": len(reporting_verbs),
            "summary": summary,
        }


stylometry_service = StylometryService()
