# TruthLens — Агрегатор новин з функцією виявлення неправдивої інформації
> **Кваліфікаційна магістерська робота (КМР) / Master's Thesis Project**  
> Тема: «Агрегатор новин з функцією виявлення неправдивої інформації» (*News Aggregator with False Information Detection Function*)

[![FastAPI](https://img.shields.io/badge/FastAPI-0.110+-009688.svg?style=flat&logo=FastAPI&logoColor=white)](https://fastapi.tiangolo.com)
[![Next.js](https://img.shields.io/badge/Next.js-14%2F15-black.svg?style=flat&logo=next.js&logoColor=white)](https://nextjs.org/)
[![TailwindCSS](https://img.shields.io/badge/Tailwind_CSS-3.4+-38B2AC.svg?style=flat&logo=tailwind-css&logoColor=white)](https://tailwindcss.com/)
[![License](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

---

## 📌 Про проєкт
**TruthLens** — це сучасний інтелектуальний новинний агрегатор, розроблений для автоматичного моніторингу новинного простору, аналізу маніпуляцій та оцінки рівня достовірності матеріалів за допомогою методів обробки природної мови (NLP) та пояснювального штучного інтелекту (Explainable AI).

### Основні можливості:
1. **Автоматична агрегація новин:** збір RSS-стрічок провідних українських та міжнародних ЗМІ (Суспільне, Українська правда, BBC, Reuters тощо) з витягом повного тексту та очищенням від шуму.
2. **Гібридний конвеєр перевірки достовірності:**
   - **Стилометричний аналіз:** виявлення клікбейту, сенсаційності та надмірної емоційної поляризації.
   - **Індекс надійності джерела (Domain Credibility):** оцінка репутації веб-ресурсу за білими/чорними списками медіаекспертів.
   - **Нейромережева класифікація (Transformers):** моделі на базі `ukr-roberta` / `XLM-RoBERTa`.
   - **Семантична крос-верифікація (`pgvector`):** кластеризація публікацій різних медіа на ту саму тему та звірка з базами фактчекерів (StopFake, VoxCheck).
   - **Пояснювальний ШІ (XAI):** генерація підсумкового **Trust Score (0–100%)** з детальним поясненням, чому новина викликає сумнів чи схвалення.
3. **Модуль ручної перевірки (URL / Text Checker):** швидкий аналіз будь-якого введеного тексту чи посилання.
4. **Аналітичний дашборд:** візуалізація трендів дезінформації, категорій та рейтингу джерел для наукового розділу дипломної роботи.

---

## 📂 Структура репозиторію

```text
NewsAggregatorApp/
├── backend/            # Python FastAPI бекенд, моделі БД, парсери, NLP інференс
│   ├── app/
│   │   ├── api/        # REST API маршрути (v1: news, verify, analytics, health)
│   │   ├── core/       # Налаштування (config, logging)
│   │   ├── db/         # SQLAlchemy підключення та сесії
│   │   ├── models/     # Моделі бази даних (ORM)
│   │   ├── schemas/    # Pydantic DTO схеми
│   │   ├── services/   # Парсери новин, фактчекери, ML пайплайн
│   │   └── main.py     # Точка входу FastAPI застосунку
│   ├── requirements.txt
│   └── .env.example
├── frontend/           # Next.js 14/15 клієнтський застосунок (TypeScript, Tailwind, shadcn/ui)
├── docs/               # Документація, діаграми та матеріали дипломної роботи
│   └── MASTER_PLAN.md  # Детальний потижневий та поденний майстер-план КМР
└── README.md
```

---

## 🚀 Швидкий запуск

### 1. Запуск бекенду (FastAPI):
```bash
cd backend
python -m venv venv
# Для Windows:
.\venv\Scripts\activate
# Для Linux/macOS:
source venv/bin/activate

pip install -r requirements.txt
cp .env.example .env
uvicorn app.main:app --reload --port 8000
```
* **Swagger UI документація:** `http://localhost:8000/docs`
* **ReDoc:** `http://localhost:8000/redoc`

### 2. Запуск фронтенду (Next.js):
*(Буде налаштовано в рамках Тижня 5)*
```bash
cd frontend
npm install
npm run dev
```
* **Клієнтський інтерфейс:** `http://localhost:3000`

---

## 📅 Графік виконання (11 тижнів)
Повний деталізований графік виконання проєкту та написання розділів пояснювальної записки міститься у файлі [`docs/MASTER_PLAN.md`](docs/MASTER_PLAN.md).
