"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/context/AuthContext";
import {
  ShieldCheck,
  Sparkles,
  PieChart,
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

interface CategoryStat {
  category: string;
  total_articles: number;
  avg_trust_score: number;
  verified_count: number;
  caution_count: number;
  high_risk_count: number;
}

interface SourceStat {
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
  top_sources: SourceStat[];
  daily_timeline: DailyTimelineStat[];
  common_manipulation_markers: Array<Record<string, number>>;
}

interface ModelEvalEntry {
  accuracy: number;
  precision: number;
  recall: number;
  f1_score: number;
  roc_auc: number;
  cv_5fold_f1: number;
  latency_ms_per_article: number;
  train_duration_sec: number;
  confusion_matrix: [[number, number], [number, number]];
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
  dataset?: {
    total_samples: number;
    train_samples: number;
    test_samples: number;
  };
  models?: Record<string, ModelEvalEntry>;
  transformer_epochs?: TransformerEpochEntry[];
  xai_top_features?: {
    fake_indicators: Array<{ feature: string; weight: number }>;
    real_indicators: Array<{ feature: string; weight: number }>;
  };
}

export default function AnalyticsPage() {
  const { user, apiUrl } = useAuth();
  const [overview, setOverview] = useState<AnalyticsOverview | null>(null);
  const [modelMetrics, setModelMetrics] = useState<ModelMetricsResponse | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedModelName, setSelectedModelName] = useState<string>("TruthLens Hybrid Ensemble");

  const fetchAllAnalytics = async () => {
    setLoading(true);
    setError(null);
    try {
      const [ovRes, mlRes] = await Promise.all([
        fetch(`${apiUrl}/analytics/overview`, { cache: "no-store" }),
        fetch(`${apiUrl}/analytics/model-metrics`, { cache: "no-store" }),
      ]);

      if (!ovRes.ok) {
        throw new Error("Не вдалося завантажити зведену аналітику медіапростору");
      }

      const ovData: AnalyticsOverview = await ovRes.json();
      setOverview(ovData);

      if (mlRes.ok) {
        const mlData: ModelMetricsResponse = await mlRes.json();
        setModelMetrics(mlData);
        if (mlData.models && !mlData.models[selectedModelName]) {
          const firstKey = Object.keys(mlData.models)[0];
          if (firstKey) setSelectedModelName(firstKey);
        }
      }
    } catch (err: any) {
      setError(err.message || "Помилка завантаження аналітики");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAllAnalytics();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [apiUrl]);

  if (loading) {
    return (
      <div className="max-w-7xl mx-auto px-4 py-24 flex flex-col items-center justify-center text-zinc-400 space-y-4">
        <RefreshCw className="w-9 h-9 animate-spin text-cyan-400" />
        <p className="text-sm font-medium">
          Агрегуємо реальну статистику медіапростору з хмарної БД Neon.tech та метрики ML-ансамблю...
        </p>
      </div>
    );
  }

  if (error || !overview) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-20 text-center space-y-4">
        <div className="w-12 h-12 rounded-2xl bg-rose-500/10 border border-rose-500/20 mx-auto flex items-center justify-center text-rose-400">
          <AlertTriangle className="w-6 h-6" />
        </div>
        <h2 className="text-xl font-bold text-white">
          {error || "Не вдалося отримати аналітичні дані"}
        </h2>
        <button
          type="button"
          onClick={fetchAllAnalytics}
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-zinc-950 text-sm font-bold transition-colors"
        >
          <RefreshCw className="w-4 h-4" />
          Спробувати знову
        </button>
      </div>
    );
  }

  const maxDailyTotal = Math.max(
    1,
    ...(overview.daily_timeline || []).map((d) => d.total)
  );

  const maxMarkerCount = Math.max(
    1,
    ...(overview.common_manipulation_markers || []).map((obj) => Object.values(obj)[0] || 0)
  );

  const modelsEntries = Object.entries(modelMetrics?.models || {});
  const activeModelData =
    modelMetrics?.models?.[selectedModelName] ||
    (modelsEntries.length > 0 ? modelsEntries[0][1] : null);

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-10">
      {/* Шапка сторінки аналітики */}
      <section className="rounded-3xl border border-zinc-800 bg-gradient-to-br from-zinc-900/90 via-zinc-900/70 to-indigo-950/30 p-6 sm:p-8 shadow-2xl space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="space-y-2 max-w-3xl">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-indigo-500/10 border border-indigo-500/30 text-indigo-300 text-xs font-semibold">
              <PieChart className="w-3.5 h-3.5" />
              <span>Аналітичний центр дезінформації та бенчмарк моделей ШІ</span>
            </div>
            <h1 className="text-2xl sm:text-4xl font-extrabold text-white tracking-tight">
              Аналітика медіапростору та ефективність ML-моделей
            </h1>
            <p className="text-sm text-zinc-300 leading-relaxed">
              Живий моніторинг достовірності українських та світових новин із хмарної бази{" "}
              <strong className="text-cyan-300">Neon.tech PostgreSQL 17 (pgvector)</strong>, а також
              експериментальні показники точності 6 моделей машинного навчання на корпусі з{" "}
              <strong className="text-indigo-300">
                {modelMetrics?.dataset?.total_samples || 1200} розмічених публікацій
              </strong>
              .
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3 self-start lg:self-center">
            <button
              type="button"
              onClick={fetchAllAnalytics}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-zinc-800/90 hover:bg-zinc-700 border border-zinc-700 text-xs sm:text-sm font-semibold text-zinc-100 transition-colors"
            >
              <RefreshCw className="w-4 h-4 text-cyan-400" />
              <span>Оновити дані</span>
            </button>

            {user?.role === "admin" && (
              <Link
                href="/admin/sources"
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-indigo-500/20 hover:bg-indigo-500/30 border border-indigo-500/40 text-xs sm:text-sm font-semibold text-indigo-200 transition-colors"
              >
                <SlidersHorizontal className="w-4 h-4 text-indigo-300" />
                <span>Керування джерелами (Admin)</span>
              </Link>
            )}
          </div>
        </div>
      </section>

      {/* 1. Картки головних показників (KPI) */}
      <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="rounded-3xl border border-zinc-800 bg-zinc-900/75 p-5 space-y-2">
          <div className="flex items-center justify-between text-xs text-zinc-400">
            <span className="font-semibold">Проаналізовано новин у БД</span>
            <Globe className="w-4 h-4 text-cyan-400" />
          </div>
          <div className="text-3xl font-extrabold text-white font-mono">
            {overview.total_analyzed_news.toLocaleString("uk-UA")}
          </div>
          <p className="text-xs text-zinc-400">
            Середній індекс довіри:{" "}
            <strong className="text-cyan-300">{overview.avg_trust_score.toFixed(1)}%</strong>
          </p>
        </div>

        <div className="rounded-3xl border border-emerald-500/25 bg-emerald-500/5 p-5 space-y-2">
          <div className="flex items-center justify-between text-xs text-emerald-300">
            <span className="font-semibold">Перевірені новини (Verified)</span>
            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-3xl font-extrabold text-emerald-400 font-mono">
              {overview.verified_percentage.toFixed(1)}%
            </span>
            <span className="text-xs text-zinc-400">
              ({overview.verified_count.toLocaleString("uk-UA")} статей)
            </span>
          </div>
          <p className="text-xs text-zinc-400">
            Висока надійність джерела (ІМІ) та спокійний виклад фактів
          </p>
        </div>

        <div className="rounded-3xl border border-amber-500/25 bg-amber-500/5 p-5 space-y-2">
          <div className="flex items-center justify-between text-xs text-amber-300">
            <span className="font-semibold">Потребують уваги (Caution)</span>
            <AlertTriangle className="w-4 h-4 text-amber-400" />
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-3xl font-extrabold text-amber-400 font-mono">
              {overview.caution_percentage.toFixed(1)}%
            </span>
            <span className="text-xs text-zinc-400">
              ({overview.caution_count.toLocaleString("uk-UA")} статей)
            </span>
          </div>
          <p className="text-xs text-zinc-400">
            Ознаки клікбейту, емоційності або неповного підтвердження
          </p>
        </div>

        <div className="rounded-3xl border border-rose-500/25 bg-rose-500/5 p-5 space-y-2">
          <div className="flex items-center justify-between text-xs text-rose-300">
            <span className="font-semibold">Високий ризик & База фейків</span>
            <ShieldAlert className="w-4 h-4 text-rose-400" />
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-3xl font-extrabold text-rose-400 font-mono">
              {overview.high_risk_percentage.toFixed(1)}%
            </span>
            <span className="text-xs text-zinc-400">
              ({overview.high_risk_count} ризикових + {overview.total_factchecks} спростувань)
            </span>
          </div>
          <p className="text-xs text-zinc-400">
            Викриті фейки StopFake / VoxCheck та маніпулятивні вкиди
          </p>
        </div>
      </section>

      {/* 2. Баланс достовірності та Топ маніпулятивних прийомів */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* Ліва частина: Розподіл за категоріями */}
        <section className="lg:col-span-7 rounded-3xl border border-zinc-800 bg-zinc-900/75 p-6 sm:p-7 space-y-5">
          <div className="space-y-1 border-b border-zinc-800 pb-4">
            <h2 className="text-lg font-bold text-white flex items-center gap-2">
              <FileText className="w-5 h-5 text-cyan-400" />
              Рівень довіри та ризиків за рубриками новин
            </h2>
            <p className="text-xs text-zinc-400">
              Які тематичні категорії містять найбільше перевірених фактів, а в яких найчастіше трапляються маніпуляції
            </p>
          </div>

          {/* Складена шкала загального балансу */}
          <div className="p-4 rounded-2xl bg-zinc-950/80 border border-zinc-800 space-y-2.5">
            <div className="flex items-center justify-between text-xs">
              <span className="font-semibold text-zinc-200">
                Загальна структура інформаційного потоку
              </span>
              <span className="text-zinc-400 font-mono">
                100% ({overview.total_analyzed_news} публікацій)
              </span>
            </div>
            <div className="w-full h-4 rounded-full overflow-hidden flex bg-zinc-800">
              <div
                style={{ width: `${Math.max(2, overview.verified_percentage)}%` }}
                className="bg-emerald-500 h-full transition-all"
                title={`Перевірено: ${overview.verified_percentage}%`}
              />
              <div
                style={{ width: `${Math.max(2, overview.caution_percentage)}%` }}
                className="bg-amber-500 h-full transition-all"
                title={`Потребує уваги: ${overview.caution_percentage}%`}
              />
              <div
                style={{ width: `${Math.max(1, overview.high_risk_percentage)}%` }}
                className="bg-rose-500 h-full transition-all"
                title={`Високий ризик: ${overview.high_risk_percentage}%`}
              />
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-zinc-400 pt-1">
              <span className="inline-flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
                Надійні ({overview.verified_percentage}%)
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-amber-500" />
                Емоційні / Сумнівні ({overview.caution_percentage}%)
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-rose-500" />
                Маніпуляції / Фейки ({overview.high_risk_percentage}%)
              </span>
            </div>
          </div>

          {/* Список категорій */}
          <div className="space-y-3.5">
            {overview.categories_breakdown.map((cat) => {
              const total = Math.max(1, cat.total_articles);
              const verPct = (cat.verified_count / total) * 100;
              const cautPct = (cat.caution_count / total) * 100;
              const riskPct = (cat.high_risk_count / total) * 100;

              return (
                <div
                  key={cat.category}
                  className="p-4 rounded-2xl bg-zinc-950/60 border border-zinc-800/90 space-y-2"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-bold text-white">{cat.category}</span>
                      <span className="px-2 py-0.5 rounded-md text-[11px] font-mono bg-zinc-800 text-zinc-300">
                        {cat.total_articles} статей
                      </span>
                    </div>
                    <div className="flex items-center gap-3 text-xs">
                      <span className="text-zinc-400">
                        Середній TrustScore:{" "}
                        <strong
                          className={`font-mono ${
                            cat.avg_trust_score >= 80
                              ? "text-emerald-400"
                              : cat.avg_trust_score >= 60
                              ? "text-amber-400"
                              : "text-rose-400"
                          }`}
                        >
                          {cat.avg_trust_score.toFixed(1)}%
                        </strong>
                      </span>
                      {cat.high_risk_count > 0 && (
                        <span className="px-2 py-0.5 rounded-md text-[11px] font-semibold bg-rose-500/15 text-rose-300 border border-rose-500/30">
                          Ризикових: {cat.high_risk_count}
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="w-full h-2.5 rounded-full overflow-hidden flex bg-zinc-800">
                    <div
                      style={{ width: `${verPct}%` }}
                      className="bg-emerald-500 h-full"
                      title={`Перевірені: ${cat.verified_count}`}
                    />
                    <div
                      style={{ width: `${cautPct}%` }}
                      className="bg-amber-500 h-full"
                      title={`Потребують уваги: ${cat.caution_count}`}
                    />
                    <div
                      style={{ width: `${riskPct}%` }}
                      className="bg-rose-500 h-full"
                      title={`Високий ризик: ${cat.high_risk_count}`}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        {/* Права частина: Найпоширеніші прийоми маніпуляцій та Динаміка по днях */}
        <div className="lg:col-span-5 space-y-6">
          <section className="rounded-3xl border border-zinc-800 bg-zinc-900/75 p-6 space-y-4">
            <div className="space-y-1 border-b border-zinc-800 pb-3">
              <h2 className="text-base sm:text-lg font-bold text-white flex items-center gap-2">
                <AlertTriangle className="w-5 h-5 text-amber-400" />
                Найпоширеніші прийоми маніпуляцій
              </h2>
              <p className="text-xs text-zinc-400">
                Типові тригери, які найчастіше фіксує стилометричний аналізатор та база фактчеків
              </p>
            </div>

            <div className="space-y-3">
              {overview.common_manipulation_markers.map((item, idx) => {
                const [label, count] = Object.entries(item)[0] || ["Невідомий тригер", 0];
                const barWidth = Math.min(100, Math.max(8, (count / maxMarkerCount) * 100));
                return (
                  <div
                    key={idx}
                    className="p-3.5 rounded-2xl bg-zinc-950/70 border border-zinc-800/80 space-y-1.5"
                  >
                    <div className="flex items-center justify-between gap-2 text-xs">
                      <span className="font-medium text-zinc-200 line-clamp-1">{label}</span>
                      <span className="font-mono font-bold text-amber-300 flex-shrink-0">
                        {count} вип.
                      </span>
                    </div>
                    <div className="w-full bg-zinc-800 h-1.5 rounded-full overflow-hidden">
                      <div
                        className="bg-gradient-to-r from-amber-500 to-rose-500 h-full rounded-full"
                        style={{ width: `${barWidth}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </section>

          {/* Часова динаміка по днях */}
          {overview.daily_timeline && overview.daily_timeline.length > 0 && (
            <section className="rounded-3xl border border-zinc-800 bg-zinc-900/75 p-6 space-y-4">
              <div className="space-y-1 border-b border-zinc-800 pb-3">
                <h2 className="text-base sm:text-lg font-bold text-white flex items-center gap-2">
                  <Clock className="w-5 h-5 text-cyan-400" />
                  Динаміка потоку новин по днях
                </h2>
                <p className="text-xs text-zinc-400">
                  Кількість зібраних публікацій та середній індекс достовірності за останні дні
                </p>
              </div>

              <div className="space-y-2.5">
                {overview.daily_timeline.map((day) => {
                  const pctWidth = Math.max(6, (day.total / maxDailyTotal) * 100);
                  return (
                    <div key={day.date} className="space-y-1">
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-mono text-zinc-300">{day.date}</span>
                        <span className="text-zinc-400">
                          <strong className="text-white">{day.total}</strong> новин • довіра{" "}
                          <strong className="text-emerald-400">{day.avg_trust.toFixed(1)}%</strong>
                        </span>
                      </div>
                      <div className="w-full bg-zinc-950 h-2.5 rounded-full overflow-hidden border border-zinc-800">
                        <div
                          className="h-full bg-gradient-to-r from-cyan-500 to-emerald-500 rounded-full"
                          style={{ width: `${pctWidth}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          )}
        </div>
      </div>

      {/* 3. Рейтинг надійності інформаційних джерел (ІМІ + середній TrustScore) */}
      <section className="rounded-3xl border border-zinc-800 bg-zinc-900/75 p-6 sm:p-8 space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-zinc-800 pb-4">
          <div className="space-y-1">
            <h2 className="text-lg sm:text-xl font-bold text-white flex items-center gap-2">
              <ShieldCheck className="w-5 h-5 text-emerald-400" />
              Рейтинг надійності інформаційних агентств у базі TruthLens
            </h2>
            <p className="text-xs text-zinc-400">
              Порівняння базового індексу репутації домену (за моніторингом ІМІ) та фактичного середнього TrustScore статей
            </p>
          </div>
          <span className="px-3 py-1 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-xs font-semibold text-emerald-300 self-start sm:self-center">
            Активних медіа-джерел: {overview.top_sources.length}
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-zinc-800 text-[11px] uppercase tracking-wider text-zinc-400">
                <th className="py-3 px-4">Видання</th>
                <th className="py-3 px-4">Домен</th>
                <th className="py-3 px-4">Мова</th>
                <th className="py-3 px-4">Статус ІМІ</th>
                <th className="py-3 px-4 text-right">Кількість статей</th>
                <th className="py-3 px-4 text-right">Репутація домену</th>
                <th className="py-3 px-4 text-right">Середній TrustScore</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800/70 text-xs sm:text-sm">
              {overview.top_sources.map((src) => (
                <tr key={`${src.source_name}-${src.domain}`} className="hover:bg-zinc-800/30 transition-colors">
                  <td className="py-3.5 px-4 font-bold text-white">{src.source_name}</td>
                  <td className="py-3.5 px-4 font-mono text-xs text-zinc-400">{src.domain}</td>
                  <td className="py-3.5 px-4">
                    <span className="px-2 py-0.5 rounded text-xs font-semibold bg-zinc-800 text-zinc-300">
                      {src.language === "en" ? "EN 🌍" : "UA 🇺🇦"}
                    </span>
                  </td>
                  <td className="py-3.5 px-4">
                    {src.is_whitelisted ? (
                      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-lg text-xs font-semibold bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
                        ✓ Білий список ІМІ
                      </span>
                    ) : src.is_blacklisted ? (
                      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-lg text-xs font-semibold bg-rose-500/15 text-rose-300 border border-rose-500/30">
                        ✕ Чорний список
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-lg text-xs font-semibold bg-zinc-800 text-zinc-300">
                        Загальний моніторинг
                      </span>
                    )}
                  </td>
                  <td className="py-3.5 px-4 text-right font-mono text-zinc-200">
                    {src.articles_count}
                  </td>
                  <td className="py-3.5 px-4 text-right font-mono font-bold text-cyan-400">
                    {src.reliability_rating.toFixed(1)}%
                  </td>
                  <td className="py-3.5 px-4 text-right">
                    <span
                      className={`font-mono font-bold px-2.5 py-1 rounded-lg ${
                        src.trust_score_avg >= 80
                          ? "bg-emerald-500/15 text-emerald-300"
                          : src.trust_score_avg >= 60
                          ? "bg-amber-500/15 text-amber-300"
                          : "bg-rose-500/15 text-rose-300"
                      }`}
                    >
                      {src.trust_score_avg.toFixed(1)}%
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* 4. НАУКОВО-ЕКСПЕРИМЕНТАЛЬНИЙ БЛОК: Порівняння 6 ML/NLP моделей (Розділ 4 КМР) */}
      {modelMetrics?.models && (
        <section className="rounded-3xl border border-indigo-500/30 bg-zinc-900/80 p-6 sm:p-8 space-y-6 shadow-2xl">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-zinc-800 pb-5">
            <div className="space-y-1">
              <div className="inline-flex items-center gap-1.5 text-xs font-bold text-indigo-400 uppercase tracking-wider">
                <Fingerprint className="w-4 h-4" />
                <span>Експериментальне дослідження моделей (Розділ 4 КМР)</span>
              </div>
              <h2 className="text-xl sm:text-2xl font-extrabold text-white">
                Порівняльний аналіз 6 моделей виявлення неправдивої інформації
              </h2>
              <p className="text-xs sm:text-sm text-zinc-400">
                Результати крос-валідації та тестування на збалансованому корпусі{" "}
                <strong className="text-zinc-200">
                  {modelMetrics.dataset?.total_samples || 1200} публікацій
                </strong>{" "}
                (навчальна вибірка: {modelMetrics.dataset?.train_samples || 936}, тестова вибірка:{" "}
                {modelMetrics.dataset?.test_samples || 264}, 50% Real / 50% Fake).
              </p>
            </div>
          </div>

          {/* Порівняльна таблиця всіх 6 моделей */}
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-zinc-800 text-[11px] uppercase tracking-wider text-zinc-400">
                  <th className="py-3 px-3">Архітектура моделі</th>
                  <th className="py-3 px-3 text-right">Accuracy</th>
                  <th className="py-3 px-3 text-right">Precision</th>
                  <th className="py-3 px-3 text-right">Recall</th>
                  <th className="py-3 px-3 text-right">F1-Score</th>
                  <th className="py-3 px-3 text-right">ROC-AUC</th>
                  <th className="py-3 px-3 text-right">5-Fold CV F1</th>
                  <th className="py-3 px-3 text-right">Час інференсу</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800/70 text-xs sm:text-sm">
                {modelsEntries.map(([mName, mVal]) => {
                  const isSelected = mName === selectedModelName;
                  const isTransformer = mName.toLowerCase().includes("roberta");
                  return (
                    <tr
                      key={mName}
                      onClick={() => setSelectedModelName(mName)}
                      className={`cursor-pointer transition-colors ${
                        isSelected
                          ? "bg-indigo-500/15 border-l-4 border-l-indigo-400"
                          : "hover:bg-zinc-800/40"
                      }`}
                    >
                      <td className="py-3.5 px-3 font-bold text-white flex items-center gap-2">
                        <span>{mName}</span>
                        {isTransformer && (
                          <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                            Deep Transformer
                          </span>
                        )}
                      </td>
                      <td className="py-3.5 px-3 text-right font-mono text-zinc-200">
                        {(mVal.accuracy * 100).toFixed(2)}%
                      </td>
                      <td className="py-3.5 px-3 text-right font-mono text-zinc-200">
                        {(mVal.precision * 100).toFixed(2)}%
                      </td>
                      <td className="py-3.5 px-3 text-right font-mono text-zinc-200">
                        {(mVal.recall * 100).toFixed(2)}%
                      </td>
                      <td className="py-3.5 px-3 text-right font-mono font-bold text-emerald-400">
                        {(mVal.f1_score * 100).toFixed(2)}%
                      </td>
                      <td className="py-3.5 px-3 text-right font-mono font-bold text-cyan-400">
                        {(mVal.roc_auc * 100).toFixed(2)}%
                      </td>
                      <td className="py-3.5 px-3 text-right font-mono text-indigo-300">
                        {(mVal.cv_5fold_f1 * 100).toFixed(2)}%
                      </td>
                      <td className="py-3.5 px-3 text-right font-mono text-zinc-300">
                        {mVal.latency_ms_per_article.toFixed(2)} мс
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Деталізація обраної моделі: Confusion Matrix + Динаміка епох трансформерів */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 pt-2">
            {/* Матриця помилок (Confusion Matrix) обраної моделі */}
            {activeModelData && (
              <div className="lg:col-span-5 p-5 rounded-2xl bg-zinc-950/80 border border-zinc-800 space-y-4">
                <div className="flex items-center justify-between gap-2">
                  <h3 className="text-sm font-bold text-white">
                    Матриця помилок (Confusion Matrix):
                  </h3>
                  <span className="px-2.5 py-1 rounded-lg text-xs font-bold bg-indigo-500/15 text-indigo-300 border border-indigo-500/30">
                    {selectedModelName}
                  </span>
                </div>
                <p className="text-xs text-zinc-400">
                  Натисніть на будь-який рядок у таблиці вище, щоб переглянути матрицю класифікації цієї моделі.
                </p>

                <div className="grid grid-cols-2 gap-3 text-center">
                  <div className="p-4 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 space-y-1">
                    <div className="text-[11px] font-semibold text-emerald-300 uppercase">
                      True Negative (TN)
                    </div>
                    <div className="text-2xl font-extrabold font-mono text-white">
                      {activeModelData.confusion_matrix?.[0]?.[0] ?? 0}
                    </div>
                    <div className="text-[11px] text-zinc-400">
                      Правдиві новини, вірно визначені як Real
                    </div>
                  </div>

                  <div className="p-4 rounded-2xl bg-amber-500/10 border border-amber-500/30 space-y-1">
                    <div className="text-[11px] font-semibold text-amber-300 uppercase">
                      False Positive (FP)
                    </div>
                    <div className="text-2xl font-extrabold font-mono text-white">
                      {activeModelData.confusion_matrix?.[0]?.[1] ?? 0}
                    </div>
                    <div className="text-[11px] text-zinc-400">
                      Правдиві новини, хибно позначені як Fake
                    </div>
                  </div>

                  <div className="p-4 rounded-2xl bg-rose-500/10 border border-rose-500/30 space-y-1">
                    <div className="text-[11px] font-semibold text-rose-300 uppercase">
                      False Negative (FN)
                    </div>
                    <div className="text-2xl font-extrabold font-mono text-white">
                      {activeModelData.confusion_matrix?.[1]?.[0] ?? 0}
                    </div>
                    <div className="text-[11px] text-zinc-400">
                      Пропущені фейки (помилка II роду)
                    </div>
                  </div>

                  <div className="p-4 rounded-2xl bg-cyan-500/10 border border-cyan-500/30 space-y-1">
                    <div className="text-[11px] font-semibold text-cyan-300 uppercase">
                      True Positive (TP)
                    </div>
                    <div className="text-2xl font-extrabold font-mono text-white">
                      {activeModelData.confusion_matrix?.[1]?.[1] ?? 0}
                    </div>
                    <div className="text-[11px] text-zinc-400">
                      Фейки, безпомилково викриті моделлю
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Динаміка збіжності трансформерів по епохах + Топ XAI токенів */}
            <div className="lg:col-span-7 p-5 rounded-2xl bg-zinc-950/80 border border-zinc-800 space-y-4">
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-cyan-400" />
                Найбільш значущі лексичні маркери класифікатора (Global XAI Features)
              </h3>
              <p className="text-xs text-zinc-400">
                Слова та біграми з найбільшими за модулем ваговими коефіцієнтами, вивчені на корпусі з 1 200 українських та міжнародних публікацій:
              </p>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="p-3.5 rounded-xl bg-emerald-500/5 border border-emerald-500/20 space-y-2">
                  <span className="text-xs font-bold text-emerald-300 block">
                    Маркери достовірних новин (Real &lt; 0):
                  </span>
                  <div className="flex flex-wrap gap-1.5">
                    {(modelMetrics.xai_top_features?.real_indicators || [])
                      .slice(0, 10)
                      .map((item, idx) => (
                        <span
                          key={idx}
                          className="px-2.5 py-1 rounded-lg text-xs font-medium bg-emerald-500/10 text-emerald-200 border border-emerald-500/30"
                        >
                          «{item.feature}»{" "}
                          <span className="font-mono text-[10px] opacity-80">
                            ({item.weight.toFixed(2)})
                          </span>
                        </span>
                      ))}
                  </div>
                </div>

                <div className="p-3.5 rounded-xl bg-rose-500/5 border border-rose-500/20 space-y-2">
                  <span className="text-xs font-bold text-rose-300 block">
                    Маркери фейків та клікбейту (Fake &gt; 0):
                  </span>
                  <div className="flex flex-wrap gap-1.5">
                    {(modelMetrics.xai_top_features?.fake_indicators || [])
                      .slice(0, 10)
                      .map((item, idx) => (
                        <span
                          key={idx}
                          className="px-2.5 py-1 rounded-lg text-xs font-medium bg-rose-500/10 text-rose-200 border border-rose-500/30"
                        >
                          «{item.feature}»{" "}
                          <span className="font-mono text-[10px] opacity-80">
                            (+{item.weight.toFixed(2)})
                          </span>
                        </span>
                      ))}
                  </div>
                </div>
              </div>

              {/* Таблиця епох файн-тюнінгу трансформерів */}
              {modelMetrics.transformer_epochs && modelMetrics.transformer_epochs.length > 0 && (
                <div className="pt-3 border-t border-zinc-800 space-y-2">
                  <span className="text-xs font-bold text-indigo-300 block">
                    Динаміка файн-тюнінгу трансформерів ukr-roberta-base та xlm-roberta-base (Epoch 1–5):
                  </span>
                  <div className="grid grid-cols-5 gap-2">
                    {modelMetrics.transformer_epochs.map((ep) => (
                      <div
                        key={ep.epoch}
                        className="p-2.5 rounded-xl bg-zinc-900 border border-zinc-800 text-center space-y-1"
                      >
                        <div className="text-[10px] font-bold uppercase text-zinc-400">
                          Епоха #{ep.epoch}
                        </div>
                        <div className="text-xs font-mono font-bold text-emerald-400">
                          F1: {(ep.val_f1 * 100).toFixed(1)}%
                        </div>
                        <div className="text-[10px] font-mono text-zinc-400">
                          Loss: {ep.val_loss.toFixed(4)}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </section>
      )}
    </div>
  );
}
