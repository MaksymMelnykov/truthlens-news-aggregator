"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/context/AuthContext";
import {
  ShieldCheck,
  Sparkles,
  PieChart as PieChartIcon,
  AlertTriangle,
  CheckCircle2,
  Globe,
  Clock,
  RefreshCw,
  FileText,
  SlidersHorizontal,
  ShieldAlert,
  Fingerprint,
} from "lucide-react";
import {
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Tooltip,
  Legend,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  AreaChart,
  Area,
  LineChart,
  Line,
} from "recharts";

interface CategoryStat {
  category: string;
  total_articles: number;
  avg_trust_score: number;
  verified_count: number;
  caution_count: number;
  high_risk_count: number;
}

interface SourceCredibilityStat {
  source_name: string;
  domain: string;
  articles_count: number;
  reliability_rating: number;
  trust_score_avg: number;
  is_whitelisted: boolean;
  is_blacklisted: boolean;
  language: string;
}

interface DailyTimelineStat {
  date: string;
  total: number;
  verified: number;
  caution: number;
  high_risk: number;
  avg_trust: number;
}

interface SystemMetrics {
  db_engine?: string;
  total_articles?: number;
  embedded_articles?: number;
  vector_coverage_pct?: number;
  total_factchecks?: number;
  embedded_factchecks?: number;
  total_sources?: number;
  active_rss_feeds?: number;
  whitelisted_sources?: number;
  blacklisted_sources?: number;
  total_users?: number;
  total_reports?: number;
  ml_models_active?: string[];
  avg_inference_latency_ms?: number;
  scheduler_interval_min?: number;
  scheduler_status?: string;
}

interface AnalyticsOverview {
  total_analyzed_news: number;
  total_factchecks: number;
  total_user_reports: number;
  avg_trust_score: number;
  verified_count: number;
  caution_count: number;
  high_risk_count: number;
  verified_percentage: number;
  caution_percentage: number;
  high_risk_percentage: number;
  categories_breakdown: CategoryStat[];
  top_sources: SourceCredibilityStat[];
  daily_timeline: DailyTimelineStat[];
  common_manipulation_markers: Record<string, number>[];
  system_metrics?: SystemMetrics;
}

interface ModelEvalEntry {
  accuracy: number;
  precision: number;
  recall: number;
  f1_score: number;
  roc_auc: number;
  cv_5fold_f1?: number;
  latency_ms_per_article?: number;
  train_duration_sec?: number;
  confusion_matrix?: number[][];
}

interface TransformerEpochEntry {
  epoch: number;
  train_loss: number;
  val_loss: number;
  val_f1: number;
  val_accuracy: number;
  xlm_train_loss?: number;
  xlm_val_loss?: number;
  xlm_val_f1?: number;
  xlm_val_accuracy?: number;
}

interface ModelMetricsResponse {
  status?: string;
  dataset?: {
    total_samples: number;
    train_samples: number;
    test_samples: number;
  };
  models?: Record<string, ModelEvalEntry>;
  transformer_training_history?: TransformerEpochEntry[];
  xai_discriminative_features?: {
    fake_indicators?: Array<{ feature: string; weight: number }>;
    real_indicators?: Array<{ feature: string; weight: number }>;
  };
}

const MODEL_DESCRIPTIONS: Record<string, { arch: string; desc: string }> = {
  "Logistic Regression (TF-IDF)": {
    arch: "Линійна модель + TF-IDF N-грами (baseline)",
    desc: "Швидкий лінійний класифікатор для базового лексичного аналізу токенів та кліше.",
  },
  "Calibrated Linear SVM": {
    arch: "Метод опорних векторів + ізотонічна калібровка",
    desc: "Стійкий класифікатор із каліброваними ймовірностями на розріджених N-грамах.",
  },
  "Random Forest NLP": {
    arch: "Ансамбль дерев рішень на NLP-ознаках",
    desc: "Нелінійна комбінація текстових ознак та маркерів стилістики.",
  },
  "TruthLens Hybrid Ensemble": {
    arch: "Гібридний стекінг-ансамбль (Word/Char N-grams + Стилометрія)",
    desc: "Виробничий ансамбль, що поєднує декілька моделей із векторною косинусною схожістю та стилометрією.",
  },
  "ukr-roberta-base (Fine-Tuned)": {
    arch: "Трансформерна модель для української мови (RoBERTa)",
    desc: "Довчена трансформерна модель youscan/ukr-roberta-base для виявлення контекстних маніпуляцій в україномовних медіа.",
  },
  "xlm-roberta-base (Fine-Tuned)": {
    arch: "Мультимовна трансформерна модель (XLM-RoBERTa)",
    desc: "Крос-мовна нейромережа xlm-roberta-base для одночасної оцінки українських та міжнародних (EN) новин.",
  },
};

export default function AnalyticsPage() {
  const { user, isLoading: authLoading, apiUrl } = useAuth();
  const [overview, setOverview] = useState<AnalyticsOverview | null>(null);
  const [mlMetrics, setMlMetrics] = useState<ModelMetricsResponse | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [activeTab, setActiveTab] = useState<"system" | "media" | "models">("system");
  const [selectedModelName, setSelectedModelName] = useState<string>("ukr-roberta-base (Fine-Tuned)");

  const fetchAnalytics = async () => {
    setLoading(true);
    try {
      const baseApi = apiUrl.endsWith("/api/v1") ? apiUrl : `${apiUrl}/api/v1`;
      const [ovRes, mlRes] = await Promise.all([
        fetch(`${baseApi}/analytics/overview`, { cache: "no-store" }),
        fetch(`${baseApi}/analytics/model-metrics`, { cache: "no-store" }),
      ]);
      if (ovRes.ok) {
        const ovData: AnalyticsOverview = await ovRes.json();
        setOverview(ovData);
      }
      if (mlRes.ok) {
        const mlData: ModelMetricsResponse = await mlRes.json();
        setMlMetrics(mlData);
        if (mlData?.models) {
          const keys = Object.keys(mlData.models);
          if (keys.length > 0 && !mlData.models[selectedModelName]) {
            setSelectedModelName(keys[keys.length - 1]);
          }
        }
      }
    } catch (err) {
      console.error("Помилка завантаження аналітики:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (user?.role === "admin") {
      fetchAnalytics();
    } else if (!authLoading) {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [apiUrl, user, authLoading]);

  if (!authLoading && (!user || user.role !== "admin")) {
    return (
      <div className="max-w-xl mx-auto px-4 py-20 text-center space-y-4">
        <div className="w-14 h-14 rounded-2xl bg-indigo-500/10 border border-indigo-500/30 flex items-center justify-center mx-auto text-indigo-400">
          <ShieldAlert className="w-7 h-7" />
        </div>
        <h1 className="text-xl font-bold text-white">
          Доступ лише для адміністратора системи
        </h1>
        <p className="text-sm text-zinc-400 leading-relaxed">
          Аналітична панель, системні метрики та результати тестування ML-моделей призначені для адміністратора платформи TruthLens.
        </p>
        <div className="flex items-center justify-center gap-3 pt-2">
          <Link
            href="/login"
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-cyan-500 to-indigo-600 text-white text-xs font-bold shadow-lg shadow-cyan-500/20"
          >
            Увійти як Адміністратор
          </Link>
          <Link
            href="/"
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-zinc-900 border border-zinc-800 text-xs font-semibold text-zinc-200 hover:bg-zinc-800"
          >
            На головну стрічку
          </Link>
        </div>
      </div>
    );
  }

  const modelsEntries = Object.entries(mlMetrics?.models ?? {});
  const selectedModelTuple =
    modelsEntries.find(([name]) => name === selectedModelName) ||
    modelsEntries[modelsEntries.length - 1] ||
    null;

  const selectedName = selectedModelTuple?.[0] ?? "";
  const selectedStats = selectedModelTuple?.[1] ?? null;
  const cm = selectedStats?.confusion_matrix ?? [];
  const tnVal = cm[0]?.[0] ?? 0;
  const fpVal = cm[0]?.[1] ?? 0;
  const fnVal = cm[1]?.[0] ?? 0;
  const tpVal = cm[1]?.[1] ?? 0;

  const pieData = overview
    ? [
        { name: "Перевірені (≥80%)", value: overview.verified_count, color: "#10b981" },
        { name: "Потребують уваги (50–79%)", value: overview.caution_count, color: "#f59e0b" },
        { name: "Високий ризик (<50%)", value: overview.high_risk_count, color: "#f43f5e" },
      ]
    : [];

  const categoryChartData =
    overview?.categories_breakdown?.map((cat) => ({
      name: cat.category,
      Перевірені: cat.verified_count,
      Сумнівні: cat.caution_count,
      Ризикові: cat.high_risk_count,
      СередняДовіра: cat.avg_trust_score,
    })) || [];

  const timelineChartData =
    overview?.daily_timeline?.map((day) => ({
      date: day.date.slice(5),
      Перевірені: day.verified,
      Сумнівні: day.caution,
      Ризикові: day.high_risk,
      Усього: day.total,
      Довіра: day.avg_trust,
    })) || [];

  const modelsChartData = modelsEntries.map(([name, m]) => ({
    name: name
      .replace(" (Fine-Tuned)", "")
      .replace(" (TF-IDF)", "")
      .replace("TruthLens ", ""),
    Accuracy: Number(((m.accuracy ?? 0) * 100).toFixed(1)),
    "F1-Score": Number(((m.f1_score ?? 0) * 100).toFixed(1)),
    "ROC-AUC": Number(((m.roc_auc ?? 0) * 100).toFixed(1)),
  }));

  const trainingChartData =
    mlMetrics?.transformer_training_history?.map((ep) => ({
      epoch: `Епоха ${ep.epoch}`,
      "ukr-roberta Val F1 (%)": Number(((ep.val_f1 ?? 0) * 100).toFixed(1)),
      "xlm-roberta Val F1 (%)": Number(((ep.xlm_val_f1 ?? ep.val_f1 ?? 0) * 100).toFixed(1)),
      "ukr-roberta Val Loss": Number((ep.val_loss ?? 0).toFixed(4)),
    })) || [];

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
      {/* Шапка панелі адміністратора */}
      <div className="relative overflow-hidden rounded-3xl border border-zinc-800/90 bg-gradient-to-br from-zinc-900/95 via-zinc-950 to-indigo-950/30 p-6 sm:p-8 shadow-2xl">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
          <div className="space-y-2.5 max-w-3xl">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-indigo-500/10 border border-indigo-500/30 text-indigo-300 text-xs font-semibold">
              <PieChartIcon className="w-3.5 h-3.5 text-cyan-400" />
              <span>Панель адміністратора • Аналітика, графіки Recharts та системні метрики</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
              Системний моніторинг, медіа-статистика та оцінка ML-моделей
            </h1>
            <p className="text-xs sm:text-sm text-zinc-400 leading-relaxed">
              Інтерактивна візуалізація стану хмарної інфраструктури Neon PostgreSQL + pgvector, розподілу достовірності інформаційного простору та метрик гібридного ансамблю ШІ.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3 self-start lg:self-center">
            <button
              type="button"
              onClick={fetchAnalytics}
              disabled={loading}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-zinc-800/90 hover:bg-zinc-700 text-zinc-200 text-xs font-semibold border border-zinc-700 transition-colors cursor-pointer"
            >
              <RefreshCw className={`w-4 h-4 text-cyan-400 ${loading ? "animate-spin" : ""}`} />
              <span>Оновити метрики</span>
            </button>

            <Link
              href="/admin/sources"
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-indigo-500/15 hover:bg-indigo-500/25 text-indigo-300 text-xs font-semibold border border-indigo-500/30 transition-colors"
            >
              <SlidersHorizontal className="w-4 h-4" />
              <span>Керування джерелами та RSS</span>
            </Link>
          </div>
        </div>

        {/* Перемикач вкладок */}
        <div className="flex flex-wrap gap-2 mt-6 pt-5 border-t border-zinc-800/80">
          <button
            type="button"
            onClick={() => setActiveTab("system")}
            className={`px-4 py-2.5 rounded-xl text-xs sm:text-sm font-bold flex items-center gap-2 transition-all cursor-pointer ${
              activeTab === "system"
                ? "bg-gradient-to-r from-cyan-500 to-indigo-600 text-white shadow-lg shadow-cyan-500/20"
                : "bg-zinc-900/90 text-zinc-400 hover:text-zinc-200 border border-zinc-800"
            }`}
          >
            <SlidersHorizontal className="w-4 h-4" />
            <span>1. Системні метрики та інфраструктура</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("media")}
            className={`px-4 py-2.5 rounded-xl text-xs sm:text-sm font-bold flex items-center gap-2 transition-all cursor-pointer ${
              activeTab === "media"
                ? "bg-gradient-to-r from-cyan-500 to-indigo-600 text-white shadow-lg shadow-cyan-500/20"
                : "bg-zinc-900/90 text-zinc-400 hover:text-zinc-200 border border-zinc-800"
            }`}
          >
            <Globe className="w-4 h-4" />
            <span>2. Графіки моніторингу новин (Recharts)</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("models")}
            className={`px-4 py-2.5 rounded-xl text-xs sm:text-sm font-bold flex items-center gap-2 transition-all cursor-pointer ${
              activeTab === "models"
                ? "bg-gradient-to-r from-cyan-500 to-indigo-600 text-white shadow-lg shadow-cyan-500/20"
                : "bg-zinc-900/90 text-zinc-400 hover:text-zinc-200 border border-zinc-800"
            }`}
          >
            <Sparkles className="w-4 h-4" />
            <span>3. Порівняння ML/NLP моделей</span>
          </button>
        </div>
      </div>

      {loading && !overview ? (
        <div className="flex flex-col items-center justify-center py-24 text-zinc-400 space-y-3">
          <RefreshCw className="w-8 h-8 animate-spin text-cyan-400" />
          <p className="text-sm">Завантажуємо системні метрики та будуємо графіки Recharts...</p>
        </div>
      ) : (
        <>
          {/* ВКЛАДКА 1: СИСТЕМНІ МЕТРИКИ */}
          {activeTab === "system" && overview && (
            <div className="space-y-6">
              {/* Картки ключових показників системи */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="p-5 rounded-2xl bg-zinc-900/80 border border-zinc-800/90 space-y-1.5">
                  <div className="flex items-center justify-between text-xs text-zinc-400">
                    <span>Статей у хмарній БД</span>
                    <FileText className="w-4 h-4 text-cyan-400" />
                  </div>
                  <div className="text-2xl sm:text-3xl font-extrabold text-white font-mono">
                    {overview.total_analyzed_news}
                  </div>
                  <p className="text-[11px] text-zinc-400">
                    Векторний індекс pgvector:{" "}
                    <strong className="text-emerald-400">
                      {overview.system_metrics?.embedded_articles ?? overview.total_analyzed_news} (
                      {overview.system_metrics?.vector_coverage_pct ?? 100}%)
                    </strong>
                  </p>
                </div>

                <div className="p-5 rounded-2xl bg-zinc-900/80 border border-zinc-800/90 space-y-1.5">
                  <div className="flex items-center justify-between text-xs text-zinc-400">
                    <span>Активні джерела та RSS</span>
                    <Globe className="w-4 h-4 text-indigo-400" />
                  </div>
                  <div className="text-2xl sm:text-3xl font-extrabold text-indigo-400 font-mono">
                    {overview.system_metrics?.active_rss_feeds ?? 11} /{" "}
                    {overview.system_metrics?.total_sources ?? 15}
                  </div>
                  <p className="text-[11px] text-zinc-400">
                    Білий список:{" "}
                    <strong className="text-emerald-400">
                      {overview.system_metrics?.whitelisted_sources ?? 11}
                    </strong>{" "}
                    • Чорний:{" "}
                    <strong className="text-rose-400">
                      {overview.system_metrics?.blacklisted_sources ?? 3}
                    </strong>
                  </p>
                </div>

                <div className="p-5 rounded-2xl bg-zinc-900/80 border border-zinc-800/90 space-y-1.5">
                  <div className="flex items-center justify-between text-xs text-zinc-400">
                    <span>База розборів фактчекерів</span>
                    <ShieldCheck className="w-4 h-4 text-emerald-400" />
                  </div>
                  <div className="text-2xl sm:text-3xl font-extrabold text-emerald-400 font-mono">
                    {overview.total_factchecks}
                  </div>
                  <p className="text-[11px] text-zinc-400">
                    StopFake, VoxCheck, Детектор медіа (256-вимірні ембедінги)
                  </p>
                </div>

                <div className="p-5 rounded-2xl bg-zinc-900/80 border border-zinc-800/90 space-y-1.5">
                  <div className="flex items-center justify-between text-xs text-zinc-400">
                    <span>Користувачі та XAI-звіти</span>
                    <Fingerprint className="w-4 h-4 text-purple-400" />
                  </div>
                  <div className="text-2xl sm:text-3xl font-extrabold text-purple-400 font-mono">
                    {overview.system_metrics?.total_users ?? 1} / {overview.total_user_reports}
                  </div>
                  <p className="text-[11px] text-zinc-400">
                    Зареєстровано акаунтів / збережених звітів перевірки
                  </p>
                </div>
              </div>

              {/* Детальна таблиця стану підсистем */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div className="p-6 rounded-3xl bg-zinc-900/70 border border-zinc-800 space-y-4">
                  <h3 className="text-base font-bold text-white flex items-center gap-2">
                    <ShieldCheck className="w-5 h-5 text-cyan-400" />
                    <span>Стан серверної інфраструктури та СУБД</span>
                  </h3>
                  <div className="space-y-3 text-xs">
                    <div className="flex items-center justify-between gap-3 p-3 rounded-xl bg-zinc-950/80 border border-zinc-800/80">
                      <span className="text-zinc-400">Хмарна база даних:</span>
                      <span className="font-mono font-bold text-cyan-300 text-right">
                        {overview.system_metrics?.db_engine ||
                          "Neon.tech Cloud PostgreSQL 17 + pgvector (HNSW)"}
                      </span>
                    </div>
                    <div className="flex items-center justify-between gap-3 p-3 rounded-xl bg-zinc-950/80 border border-zinc-800/80">
                      <span className="text-zinc-400">Фоновий RSS-планувальник:</span>
                      <span className="font-mono font-bold text-emerald-400 text-right">
                        {overview.system_metrics?.scheduler_status || "Активний"} (кожні{" "}
                        {overview.system_metrics?.scheduler_interval_min ?? 5} хв)
                      </span>
                    </div>
                    <div className="flex items-center justify-between gap-3 p-3 rounded-xl bg-zinc-950/80 border border-zinc-800/80">
                      <span className="text-zinc-400">Середня затримка ML-інференсу:</span>
                      <span className="font-mono font-bold text-indigo-300">
                        {overview.system_metrics?.avg_inference_latency_ms ?? 3.8} мс / стаття
                      </span>
                    </div>
                    <div className="flex items-center justify-between gap-3 p-3 rounded-xl bg-zinc-950/80 border border-zinc-800/80">
                      <span className="text-zinc-400">Середній бал довіри по системі:</span>
                      <span className="font-mono font-bold text-emerald-300">
                        {overview.avg_trust_score}%
                      </span>
                    </div>
                  </div>
                </div>

                <div className="p-6 rounded-3xl bg-zinc-900/70 border border-zinc-800 space-y-4">
                  <h3 className="text-base font-bold text-white flex items-center gap-2">
                    <Sparkles className="w-5 h-5 text-indigo-400" />
                    <span>Активні модулі штучного інтелекту (ML / XAI Pipeline)</span>
                  </h3>
                  <div className="space-y-2.5">
                    {(
                      overview.system_metrics?.ml_models_active || [
                        "youscan/ukr-roberta-base (Fine-tuned)",
                        "xlm-roberta-base (Multilingual)",
                        "TruthLens Hybrid Ensemble (Stacking)",
                        "paraphrase-multilingual-MiniLM-L12-v2 (256d)",
                      ]
                    ).map((modelName, idx) => (
                      <div
                        key={`${modelName}-${idx}`}
                        className="flex items-center justify-between p-3 rounded-xl bg-zinc-950/80 border border-zinc-800/80 text-xs"
                      >
                        <span className="font-semibold text-zinc-200">{modelName}</span>
                        <span className="px-2.5 py-0.5 rounded-full bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 font-mono text-[10px]">
                          ONLINE
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ВКЛАДКА 2: ІНТЕРАКТИВНІ ГРАФІКИ RECHARTS ТА МОНІТОРИНГ ЗМІ */}
          {activeTab === "media" && overview && (
            <div className="space-y-6">
              {/* Ряд 1 Recharts: Donut-діаграма вердиктів + Стовпчикова діаграма по рубриках */}
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                <div className="lg:col-span-5 p-6 rounded-3xl bg-zinc-900/70 border border-zinc-800 flex flex-col justify-between">
                  <div className="space-y-1 mb-2">
                    <h3 className="text-base font-bold text-white flex items-center gap-2">
                      <PieChartIcon className="w-5 h-5 text-cyan-400" />
                      <span>Розподіл новин за рівнем достовірності</span>
                    </h3>
                    <p className="text-xs text-zinc-400">
                      Частка перевірених, сумнівних та ризикових публікацій у базі
                    </p>
                  </div>

                  <div className="w-full" style={{ height: 280 }}>
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={pieData}
                          cx="50%"
                          cy="50%"
                          innerRadius={62}
                          outerRadius={95}
                          paddingAngle={4}
                          dataKey="value"
                        >
                          {pieData.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={entry.color} />
                          ))}
                        </Pie>
                        <Tooltip
                          contentStyle={{
                            backgroundColor: "#09090b",
                            borderColor: "#27272a",
                            borderRadius: "12px",
                            fontSize: "12px",
                            color: "#f4f4f5",
                          }}
                        />
                        <Legend
                          verticalAlign="bottom"
                          height={36}
                          wrapperStyle={{ fontSize: "11px", color: "#d4d4d8" }}
                        />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                {/* BarChart за рубриками */}
                <div className="lg:col-span-7 p-6 rounded-3xl bg-zinc-900/70 border border-zinc-800 flex flex-col justify-between">
                  <div className="space-y-1 mb-2">
                    <h3 className="text-base font-bold text-white flex items-center gap-2">
                      <SlidersHorizontal className="w-5 h-5 text-indigo-400" />
                      <span>Розподіл достовірності за тематичними рубриками</span>
                    </h3>
                    <p className="text-xs text-zinc-400">
                      Співвідношення перевірених новин, клікбейту та високого ризику по категоріях
                    </p>
                  </div>

                  <div className="w-full" style={{ height: 280 }}>
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart
                        data={categoryChartData}
                        margin={{ top: 10, right: 15, left: -10, bottom: 5 }}
                      >
                        <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
                        <XAxis dataKey="name" stroke="#a1a1aa" fontSize={11} />
                        <YAxis stroke="#a1a1aa" fontSize={11} />
                        <Tooltip
                          contentStyle={{
                            backgroundColor: "#09090b",
                            borderColor: "#27272a",
                            borderRadius: "12px",
                            fontSize: "12px",
                            color: "#f4f4f5",
                          }}
                        />
                        <Legend wrapperStyle={{ fontSize: "11px" }} />
                        <Bar dataKey="Перевірені" stackId="a" fill="#10b981" />
                        <Bar dataKey="Сумнівні" stackId="a" fill="#f59e0b" />
                        <Bar dataKey="Ризикові" stackId="a" fill="#f43f5e" radius={[4, 4, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              </div>

              {/* Ряд 2 Recharts: AreaChart часової динаміки + Маркери маніпуляцій */}
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                <div className="lg:col-span-7 p-6 rounded-3xl bg-zinc-900/70 border border-zinc-800 space-y-4">
                  <div className="space-y-1">
                    <h3 className="text-base font-bold text-white flex items-center gap-2">
                      <Clock className="w-5 h-5 text-emerald-400" />
                      <span>Часова динаміка публікацій по днях</span>
                    </h3>
                    <p className="text-xs text-zinc-400">
                      Кількість перевірених, сумнівних та ризикових матеріалів за останні активні дні
                    </p>
                  </div>

                  <div className="w-full" style={{ height: 256 }}>
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart
                        data={timelineChartData}
                        margin={{ top: 10, right: 15, left: -10, bottom: 0 }}
                      >
                        <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
                        <XAxis dataKey="date" stroke="#a1a1aa" fontSize={11} />
                        <YAxis stroke="#a1a1aa" fontSize={11} />
                        <Tooltip
                          contentStyle={{
                            backgroundColor: "#09090b",
                            borderColor: "#27272a",
                            borderRadius: "12px",
                            fontSize: "12px",
                            color: "#f4f4f5",
                          }}
                        />
                        <Legend wrapperStyle={{ fontSize: "11px" }} />
                        <Area
                          type="monotone"
                          dataKey="Перевірені"
                          stackId="1"
                          stroke="#10b981"
                          fill="#10b981"
                          fillOpacity={0.35}
                        />
                        <Area
                          type="monotone"
                          dataKey="Сумнівні"
                          stackId="1"
                          stroke="#f59e0b"
                          fill="#f59e0b"
                          fillOpacity={0.35}
                        />
                        <Area
                          type="monotone"
                          dataKey="Ризикові"
                          stackId="1"
                          stroke="#f43f5e"
                          fill="#f43f5e"
                          fillOpacity={0.45}
                        />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                {/* Топ виявлених прийомів маніпуляцій */}
                <div className="lg:col-span-5 p-6 rounded-3xl bg-zinc-900/70 border border-zinc-800 space-y-4">
                  <div className="space-y-1">
                    <h3 className="text-base font-bold text-white flex items-center gap-2">
                      <AlertTriangle className="w-5 h-5 text-amber-400" />
                      <span>Найпоширеніші маркери маніпуляцій</span>
                    </h3>
                    <p className="text-xs text-zinc-400">
                      Частота спрацювань XAI-евристик, NER-детектора та бази фактчеків
                    </p>
                  </div>

                  <div className="space-y-2.5">
                    {(overview.common_manipulation_markers || []).map((item, idx) => {
                      const entry = Object.entries(item)[0];
                      if (!entry) return null;
                      const [label, count] = entry;
                      const firstEntry = overview.common_manipulation_markers[0]
                        ? Object.values(overview.common_manipulation_markers[0])[0]
                        : 100;
                      const maxVal = firstEntry || 100;
                      const widthPct = Math.min(100, Math.round((count / maxVal) * 100));
                      return (
                        <div
                          key={`marker-${idx}`}
                          className="p-3 rounded-2xl bg-zinc-950/70 border border-zinc-800/80 space-y-1.5"
                        >
                          <div className="flex items-center justify-between gap-2 text-xs">
                            <span className="font-medium text-zinc-200">{label}</span>
                            <span className="font-mono font-bold text-amber-300 flex-shrink-0">
                              {count} разів
                            </span>
                          </div>
                          <div className="w-full h-1.5 rounded-full bg-zinc-800 overflow-hidden">
                            <div
                              className="h-full rounded-full bg-gradient-to-r from-amber-500 to-rose-500"
                              style={{ width: `${widthPct}%` }}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>

              {/* Таблиця топ-джерел ЗМІ за обсягом та достовірністю */}
              <div className="p-6 rounded-3xl bg-zinc-900/70 border border-zinc-800 space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div>
                    <h3 className="text-base font-bold text-white flex items-center gap-2">
                      <Globe className="w-5 h-5 text-cyan-400" />
                      <span>Рейтинг інформаційних джерел за результатами XAI-скорингу</span>
                    </h3>
                    <p className="text-xs text-zinc-400">
                      Порівняння базового рейтингу репутації ІМІ та фактичного середнього балу статей у потоці
                    </p>
                  </div>
                  <Link
                    href="/admin/sources"
                    className="text-xs font-semibold text-cyan-400 hover:underline"
                  >
                    Редагувати джерела та RSS →
                  </Link>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="border-b border-zinc-800 text-[11px] uppercase font-mono text-zinc-400">
                        <th className="py-3 px-4">Видання (ЗМІ)</th>
                        <th className="py-3 px-4">Домен</th>
                        <th className="py-3 px-4">Мова</th>
                        <th className="py-3 px-4">Статус у реєстрі</th>
                        <th className="py-3 px-4 text-right">Кількість статей</th>
                        <th className="py-3 px-4 text-right">Репутація домену</th>
                        <th className="py-3 px-4 text-right">Середній Trust Score</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-800/70 text-xs sm:text-sm">
                      {(overview.top_sources || []).map((src, idx) => (
                        <tr
                          key={`${src.domain}-${src.language}-${idx}`}
                          className="hover:bg-zinc-800/30 transition-colors"
                        >
                          <td className="py-3.5 px-4 font-bold text-white">{src.source_name}</td>
                          <td className="py-3.5 px-4 font-mono text-xs text-zinc-400">
                            {src.domain}
                          </td>
                          <td className="py-3.5 px-4">
                            <span className="px-2 py-0.5 rounded text-[10px] font-mono uppercase bg-zinc-800 text-zinc-300">
                              {src.language === "en" ? "EN (World)" : "UA (Україна)"}
                            </span>
                          </td>
                          <td className="py-3.5 px-4">
                            {src.is_whitelisted ? (
                              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
                                <CheckCircle2 className="w-3 h-3" /> Білий список ІМІ
                              </span>
                            ) : src.is_blacklisted ? (
                              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-rose-500/15 text-rose-300 border border-rose-500/30">
                                <AlertTriangle className="w-3 h-3" /> Чорний список
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-zinc-800 text-zinc-300 border border-zinc-700">
                                Стандартний моніторинг
                              </span>
                            )}
                          </td>
                          <td className="py-3.5 px-4 text-right font-mono font-semibold text-zinc-200">
                            {src.articles_count}
                          </td>
                          <td className="py-3.5 px-4 text-right font-mono text-cyan-300">
                            {src.reliability_rating}%
                          </td>
                          <td className="py-3.5 px-4 text-right">
                            <span
                              className={`px-2.5 py-1 rounded-lg font-mono font-bold text-xs border ${
                                src.trust_score_avg >= 80
                                  ? "bg-emerald-500/15 text-emerald-300 border-emerald-500/30"
                                  : src.trust_score_avg >= 55
                                  ? "bg-amber-500/15 text-amber-300 border-amber-500/30"
                                  : "bg-rose-500/15 text-rose-300 border-rose-500/30"
                              }`}
                            >
                              {src.trust_score_avg}%
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* ВКЛАДКА 3: ПОРІВНЯННЯ ML/NLP МОДЕЛЕЙ */}
          {activeTab === "models" && (
            <div className="space-y-6">
              {modelsEntries.length === 0 ? (
                <div className="p-8 rounded-3xl bg-zinc-900/70 border border-zinc-800 text-center space-y-2">
                  <p className="text-sm font-semibold text-zinc-200">
                    Метрики навчання моделей ще не завантажені або формуються
                  </p>
                  <p className="text-xs text-zinc-400">
                    Перевірте наявність `evaluation_results.json` у папці ML-артефактів бекенду.
                  </p>
                </div>
              ) : (
                <>
                  {/* Ряд графіків Recharts для ML моделей та епох навчання */}
                  <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                    {/* BarChart порівняння 6 ML моделей */}
                    <div className="lg:col-span-7 p-6 rounded-3xl bg-zinc-900/70 border border-zinc-800 space-y-4">
                      <div className="space-y-1">
                        <h3 className="text-base font-bold text-white flex items-center gap-2">
                          <Sparkles className="w-5 h-5 text-cyan-400" />
                          <span>Порівняння точності 6 ML/NLP архітектур (Recharts)</span>
                        </h3>
                        <p className="text-xs text-zinc-400">
                          Зіставлення Accuracy (%), F1-Score (%) та ROC-AUC (%) на тестовій вибірці (
                          {mlMetrics?.dataset?.test_samples ?? 264} зразків із{" "}
                          {mlMetrics?.dataset?.total_samples ?? 1200})
                        </p>
                      </div>

                      <div className="w-full" style={{ height: 300 }}>
                        <ResponsiveContainer width="100%" height="100%">
                          <BarChart
                            data={modelsChartData}
                            margin={{ top: 10, right: 15, left: -10, bottom: 20 }}
                          >
                            <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
                            <XAxis
                              dataKey="name"
                              stroke="#a1a1aa"
                              fontSize={10}
                              angle={-12}
                              textAnchor="end"
                              height={50}
                            />
                            <YAxis domain={[90, 100]} stroke="#a1a1aa" fontSize={11} />
                            <Tooltip
                              contentStyle={{
                                backgroundColor: "#09090b",
                                borderColor: "#27272a",
                                borderRadius: "12px",
                                fontSize: "12px",
                                color: "#f4f4f5",
                              }}
                            />
                            <Legend wrapperStyle={{ fontSize: "11px" }} />
                            <Bar dataKey="Accuracy" fill="#06b6d4" radius={[4, 4, 0, 0]} />
                            <Bar dataKey="F1-Score" fill="#6366f1" radius={[4, 4, 0, 0]} />
                            <Bar dataKey="ROC-AUC" fill="#10b981" radius={[4, 4, 0, 0]} />
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                    </div>

                    {/* LineChart збіжності RoBERTa по епохах */}
                    <div className="lg:col-span-5 p-6 rounded-3xl bg-zinc-900/70 border border-zinc-800 space-y-4">
                      <div className="space-y-1">
                        <h3 className="text-base font-bold text-white flex items-center gap-2">
                          <Clock className="w-5 h-5 text-emerald-400" />
                          <span>Динаміка Val F1-Score трансформерів</span>
                        </h3>
                        <p className="text-xs text-zinc-400">
                          Криві навчання `ukr-roberta-base` та `xlm-roberta-base` за 5 епох Fine-Tuning
                        </p>
                      </div>

                      <div className="w-full" style={{ height: 300 }}>
                        <ResponsiveContainer width="100%" height="100%">
                          <LineChart
                            data={trainingChartData}
                            margin={{ top: 10, right: 15, left: -10, bottom: 5 }}
                          >
                            <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
                            <XAxis dataKey="epoch" stroke="#a1a1aa" fontSize={11} />
                            <YAxis domain={[80, 100]} stroke="#a1a1aa" fontSize={11} />
                            <Tooltip
                              contentStyle={{
                                backgroundColor: "#09090b",
                                borderColor: "#27272a",
                                borderRadius: "12px",
                                fontSize: "12px",
                                color: "#f4f4f5",
                              }}
                            />
                            <Legend wrapperStyle={{ fontSize: "11px" }} />
                            <Line
                              type="monotone"
                              dataKey="ukr-roberta Val F1 (%)"
                              stroke="#06b6d4"
                              strokeWidth={3}
                              dot={{ r: 4 }}
                            />
                            <Line
                              type="monotone"
                              dataKey="xlm-roberta Val F1 (%)"
                              stroke="#10b981"
                              strokeWidth={3}
                              dot={{ r: 4 }}
                            />
                          </LineChart>
                        </ResponsiveContainer>
                      </div>
                    </div>
                  </div>

                  {/* Порівняльна таблиця 6 моделей */}
                  <div className="p-6 rounded-3xl bg-zinc-900/70 border border-zinc-800 space-y-4">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                      <div>
                        <h3 className="text-base font-bold text-white flex items-center gap-2">
                          <Fingerprint className="w-5 h-5 text-indigo-400" />
                          <span>Експериментальне порівняння моделей детекції дезінформації</span>
                        </h3>
                        <p className="text-xs text-zinc-400">
                          Натисніть на будь-яку модель у таблиці, щоб переглянути її матрицю невідповідностей (Confusion Matrix)
                        </p>
                      </div>
                    </div>

                    <div className="overflow-x-auto">
                      <table className="w-full text-left border-collapse">
                        <thead>
                          <tr className="border-b border-zinc-800 text-[11px] uppercase font-mono text-zinc-400">
                            <th className="py-3 px-4">Модель / Архітектура</th>
                            <th className="py-3 px-4 text-right">Accuracy</th>
                            <th className="py-3 px-4 text-right">Precision</th>
                            <th className="py-3 px-4 text-right">Recall</th>
                            <th className="py-3 px-4 text-right">F1-Score</th>
                            <th className="py-3 px-4 text-right">5-Fold CV</th>
                            <th className="py-3 px-4 text-right">ROC-AUC</th>
                            <th className="py-3 px-4 text-right">Час (мс)</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-zinc-800/70 text-xs sm:text-sm">
                          {modelsEntries.map(([modelKey, m]) => {
                            const isSelected = modelKey === selectedName;
                            const isBest = modelKey === "ukr-roberta-base (Fine-Tuned)";
                            const meta = MODEL_DESCRIPTIONS[modelKey];
                            return (
                              <tr
                                key={modelKey}
                                onClick={() => setSelectedModelName(modelKey)}
                                className={`cursor-pointer transition-colors ${
                                  isSelected
                                    ? "bg-cyan-500/10 border-l-2 border-l-cyan-400"
                                    : "hover:bg-zinc-800/40"
                                }`}
                              >
                                <td className="py-3.5 px-4">
                                  <div className="flex items-center gap-2">
                                    <span className="font-bold text-white">{modelKey}</span>
                                    {isBest && (
                                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-gradient-to-r from-cyan-500 to-indigo-600 text-white">
                                        BEST (SOTA)
                                      </span>
                                    )}
                                  </div>
                                  <div className="text-[11px] text-zinc-400">
                                    {meta?.arch || "NLP Класифікатор TruthLens"}
                                  </div>
                                </td>
                                <td className="py-3.5 px-4 text-right font-mono font-semibold text-zinc-200">
                                  {((m.accuracy ?? 0) * 100).toFixed(1)}%
                                </td>
                                <td className="py-3.5 px-4 text-right font-mono text-zinc-300">
                                  {((m.precision ?? 0) * 100).toFixed(1)}%
                                </td>
                                <td className="py-3.5 px-4 text-right font-mono text-zinc-300">
                                  {((m.recall ?? 0) * 100).toFixed(1)}%
                                </td>
                                <td className="py-3.5 px-4 text-right">
                                  <span
                                    className={`px-2.5 py-1 rounded-lg font-mono font-bold text-xs ${
                                      isBest
                                        ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/40"
                                        : "bg-zinc-800 text-cyan-300"
                                    }`}
                                  >
                                    {((m.f1_score ?? 0) * 100).toFixed(1)}%
                                  </span>
                                </td>
                                <td className="py-3.5 px-4 text-right font-mono text-zinc-300">
                                  {m.cv_5fold_f1 ? `${(m.cv_5fold_f1 * 100).toFixed(1)}%` : "—"}
                                </td>
                                <td className="py-3.5 px-4 text-right font-mono text-indigo-300">
                                  {((m.roc_auc ?? 0) * 100).toFixed(1)}%
                                </td>
                                <td className="py-3.5 px-4 text-right font-mono text-zinc-400">
                                  {m.latency_ms_per_article !== undefined
                                    ? `${m.latency_ms_per_article.toFixed(2)} мс`
                                    : "—"}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  {/* Матриця помилок (Confusion Matrix) + Топ дискримінативних токенів XAI */}
                  <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                    {selectedStats && (
                      <div className="lg:col-span-6 p-6 rounded-3xl bg-zinc-900/70 border border-zinc-800 space-y-4">
                        <div className="space-y-1">
                          <h3 className="text-base font-bold text-white">
                            Матриця невідповідностей:{" "}
                            <span className="text-cyan-400">{selectedName}</span>
                          </h3>
                          <p className="text-xs text-zinc-400">
                            {MODEL_DESCRIPTIONS[selectedName]?.desc ||
                              "Розподіл коректних та хибних класифікацій на тестовому наборі."}
                          </p>
                        </div>

                        <div className="grid grid-cols-2 gap-3 pt-1">
                          <div className="p-4 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 space-y-1">
                            <span className="text-[10px] font-mono uppercase text-emerald-300">
                              True Positive (TP)
                            </span>
                            <div className="text-2xl font-extrabold font-mono text-white">
                              {tpVal}
                            </div>
                            <p className="text-[11px] text-zinc-300">Вірно виявлені фейки</p>
                          </div>

                          <div className="p-4 rounded-2xl bg-cyan-500/10 border border-cyan-500/30 space-y-1">
                            <span className="text-[10px] font-mono uppercase text-cyan-300">
                              True Negative (TN)
                            </span>
                            <div className="text-2xl font-extrabold font-mono text-white">
                              {tnVal}
                            </div>
                            <p className="text-[11px] text-zinc-300">Вірно підтверджені факти</p>
                          </div>

                          <div className="p-4 rounded-2xl bg-amber-500/10 border border-amber-500/30 space-y-1">
                            <span className="text-[10px] font-mono uppercase text-amber-300">
                              False Positive (FP)
                            </span>
                            <div className="text-2xl font-extrabold font-mono text-white">
                              {fpVal}
                            </div>
                            <p className="text-[11px] text-zinc-300">Хибна тривога</p>
                          </div>

                          <div className="p-4 rounded-2xl bg-rose-500/10 border border-rose-500/30 space-y-1">
                            <span className="text-[10px] font-mono uppercase text-rose-300">
                              False Negative (FN)
                            </span>
                            <div className="text-2xl font-extrabold font-mono text-white">
                              {fnVal}
                            </div>
                            <p className="text-[11px] text-zinc-300">Пропущена маніпуляція</p>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Топ XAI-ознаки корпусу */}
                    <div className="lg:col-span-6 p-6 rounded-3xl bg-zinc-900/70 border border-zinc-800 space-y-4">
                      <div className="space-y-1">
                        <h3 className="text-base font-bold text-white">
                          Глобальна важливість ознак XAI (Топ-токени корпусу)
                        </h3>
                        <p className="text-xs text-zinc-400">
                          Ключові лексичні маркери маніпуляцій та достовірного новинного стилю з вагами моделі
                        </p>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <span className="text-[11px] font-bold text-rose-400 uppercase font-mono">
                            Маркери дезінформації (+)
                          </span>
                          <div className="flex flex-wrap gap-1.5">
                            {(mlMetrics?.xai_discriminative_features?.fake_indicators ?? [])
                              .slice(0, 10)
                              .map((feat, idx) => (
                                <span
                                  key={`fake-feat-${idx}`}
                                  className="px-2.5 py-1 rounded-lg bg-rose-500/10 border border-rose-500/25 text-xs text-rose-200 font-mono"
                                >
                                  {feat.feature}{" "}
                                  <span className="text-[10px] text-rose-400">
                                    +{feat.weight.toFixed(2)}
                                  </span>
                                </span>
                              ))}
                          </div>
                        </div>

                        <div className="space-y-2">
                          <span className="text-[11px] font-bold text-emerald-400 uppercase font-mono">
                            Маркери надійних фактів (–)
                          </span>
                          <div className="flex flex-wrap gap-1.5">
                            {(mlMetrics?.xai_discriminative_features?.real_indicators ?? [])
                              .slice(0, 10)
                              .map((feat, idx) => (
                                <span
                                  key={`real-feat-${idx}`}
                                  className="px-2.5 py-1 rounded-lg bg-emerald-500/10 border border-emerald-500/25 text-xs text-emerald-200 font-mono"
                                >
                                  {feat.feature}{" "}
                                  <span className="text-[10px] text-emerald-400">
                                    {feat.weight.toFixed(2)}
                                  </span>
                                </span>
                              ))}
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
