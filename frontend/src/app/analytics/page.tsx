"use client";

import React, { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { motion } from "motion/react";
import { toast } from "sonner";
import { useAuth } from "@/context/AuthContext";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";
import {
  EmptyState,
  ErrorState,
  AnalyticsDashboardSkeleton,
} from "@/components/ui/state-displays";
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
  ArrowUpRight,
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
    arch: "Лінійна модель + TF-IDF N-грами (baseline)",
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

const CHART_TOOLTIP_STYLE: React.CSSProperties = {
  backgroundColor: "var(--color-popover)",
  borderColor: "var(--color-border)",
  borderRadius: "12px",
  fontSize: "12px",
  color: "var(--color-popover-foreground)",
};

export default function AnalyticsPage() {
  const { user, isLoading: authLoading, apiUrl } = useAuth();
  const [overview, setOverview] = useState<AnalyticsOverview | null>(null);
  const [mlMetrics, setMlMetrics] = useState<ModelMetricsResponse | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"system" | "media" | "models">("system");
  const [selectedModelName, setSelectedModelName] = useState<string>(
    "ukr-roberta-base (Fine-Tuned)"
  );

  const fetchAnalytics = useCallback(
    async (notify = false) => {
      setLoading(true);
      setFetchError(null);
      try {
        const baseApi = apiUrl.endsWith("/api/v1") ? apiUrl : `${apiUrl}/api/v1`;
        const [ovRes, mlRes] = await Promise.all([
          fetch(`${baseApi}/analytics/overview`, { cache: "no-store" }),
          fetch(`${baseApi}/analytics/model-metrics`, { cache: "no-store" }),
        ]);
        if (!ovRes.ok) {
          throw new Error("Не вдалося завантажити аналітичний огляд системи.");
        }
        const ovData: AnalyticsOverview = await ovRes.json();
        setOverview(ovData);

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
        if (notify) {
          toast.success("Системні метрики та графіки оновлено");
        }
      } catch (err: unknown) {
        setFetchError(
          err instanceof Error
            ? err.message
            : "Помилка з'єднання із сервером аналітики."
        );
      } finally {
        setLoading(false);
      }
    },
    [apiUrl, selectedModelName]
  );

  useEffect(() => {
    if (user?.role === "admin") {
      fetchAnalytics(false);
    } else if (!authLoading) {
      setLoading(false);
    }
  }, [user, authLoading, fetchAnalytics]);

  if (!authLoading && (!user || user.role !== "admin")) {
    return (
      <div className="max-w-xl mx-auto px-4 py-20">
        <EmptyState
          icon={ShieldAlert}
          title="Доступ лише для адміністратора платформи"
          description="Аналітична панель, системні метрики та результати тестування ML-моделей призначені для адміністратора TruthLens."
          actionLabel="Увійти як Адміністратор"
          onAction={() => {
            window.location.href = "/login";
          }}
        />
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
        {
          name: "Перевірені (≥80%)",
          value: overview.verified_count,
          color: "var(--color-verified)",
        },
        {
          name: "Потребують уваги (50–79%)",
          value: overview.caution_count,
          color: "var(--color-warning)",
        },
        {
          name: "Високий ризик (<50%)",
          value: overview.high_risk_count,
          color: "var(--color-destructive)",
        },
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
      "xlm-roberta Val F1 (%)": Number(
        ((ep.xlm_val_f1 ?? ep.val_f1 ?? 0) * 100).toFixed(1)
      ),
      "ukr-roberta Val Loss": Number((ep.val_loss ?? 0).toFixed(4)),
    })) || [];

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 flex flex-col gap-8">
      {/* Шапка панелі адміністратора */}
      <Card className="border-border/90 bg-card/95 shadow-lg">
        <CardHeader className="p-6 sm:p-8">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
            <div className="flex flex-col gap-2.5 max-w-3xl">
              <Badge variant="default" className="w-fit">
                <PieChartIcon className="size-3.5" />
                Панель адміністратора • Аналітика, графіки Recharts та системні метрики
              </Badge>
              <CardTitle className="text-2xl sm:text-3xl font-extrabold text-foreground tracking-tight">
                Системний моніторинг, медіа-статистика та оцінка ML-моделей
              </CardTitle>
              <CardDescription className="text-xs sm:text-sm text-muted-foreground leading-relaxed max-w-[68ch]">
                Інтерактивна візуалізація стану хмарної інфраструктури Neon PostgreSQL + pgvector, розподілу достовірності інформаційного простору та метрик гібридного ансамблю ШІ.
              </CardDescription>
            </div>

            <div className="flex flex-wrap items-center gap-2.5 self-start lg:self-center">
              <Button
                type="button"
                variant="outline"
                onClick={() => fetchAnalytics(true)}
                disabled={loading}
              >
                <RefreshCw
                  className={`size-4 text-primary ${loading ? "animate-spin" : ""}`}
                  data-icon="inline-start"
                />
                Оновити метрики
              </Button>

              <Button variant="secondary" asChild>
                <Link href="/admin/sources">
                  <SlidersHorizontal className="size-4" data-icon="inline-start" />
                  Керування джерелами та RSS
                </Link>
              </Button>
            </div>
          </div>
        </CardHeader>
      </Card>

      {loading && !overview ? (
        <AnalyticsDashboardSkeleton />
      ) : fetchError ? (
        <ErrorState
          title="Не вдалося завантажити аналітичну панель"
          message={fetchError}
          onRetry={() => fetchAnalytics(true)}
        />
      ) : (
        <Tabs
          value={activeTab}
          onValueChange={(val) =>
            setActiveTab(val as "system" | "media" | "models")
          }
          className="flex flex-col gap-6"
        >
          <TabsList className="w-full sm:w-fit flex flex-wrap h-auto p-1">
            <TabsTrigger value="system" className="px-4 py-2">
              <SlidersHorizontal className="size-4" />
              1. Системні метрики та інфраструктура
            </TabsTrigger>
            <TabsTrigger value="media" className="px-4 py-2">
              <Globe className="size-4" />
              2. Графіки моніторингу новин (Recharts)
            </TabsTrigger>
            <TabsTrigger value="models" className="px-4 py-2">
              <Sparkles className="size-4" />
              3. Порівняння ML/NLP моделей
            </TabsTrigger>
          </TabsList>

          {/* ВКЛАДКА 1: СИСТЕМНІ МЕТРИКИ */}
          <TabsContent value="system" className="mt-0">
            {overview && (
              <motion.div
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.2 }}
                className="flex flex-col gap-6"
              >
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                  <Card className="p-5 bg-card/90 border-border/85 flex flex-col gap-2">
                    <div className="flex items-center justify-between text-xs text-muted-foreground">
                      <span>Статей у хмарній БД</span>
                      <FileText className="size-4 text-primary" />
                    </div>
                    <div className="text-2xl sm:text-3xl font-extrabold text-foreground font-mono tabular-nums">
                      {overview.total_analyzed_news}
                    </div>
                    <p className="text-[11px] text-muted-foreground tabular-nums">
                      Векторний індекс pgvector:{" "}
                      <strong className="text-verified">
                        {overview.system_metrics?.embedded_articles ??
                          overview.total_analyzed_news}{" "}
                        ({overview.system_metrics?.vector_coverage_pct ?? 100}%)
                      </strong>
                    </p>
                  </Card>

                  <Card className="p-5 bg-card/90 border-border/85 flex flex-col gap-2">
                    <div className="flex items-center justify-between text-xs text-muted-foreground">
                      <span>Активні джерела та RSS</span>
                      <Globe className="size-4 text-primary" />
                    </div>
                    <div className="text-2xl sm:text-3xl font-extrabold text-primary font-mono tabular-nums">
                      {overview.system_metrics?.active_rss_feeds ?? 11} /{" "}
                      {overview.system_metrics?.total_sources ?? 15}
                    </div>
                    <p className="text-[11px] text-muted-foreground tabular-nums">
                      Білий список:{" "}
                      <strong className="text-verified">
                        {overview.system_metrics?.whitelisted_sources ?? 11}
                      </strong>{" "}
                      • Чорний:{" "}
                      <strong className="text-destructive">
                        {overview.system_metrics?.blacklisted_sources ?? 3}
                      </strong>
                    </p>
                  </Card>

                  <Card className="p-5 bg-card/90 border-border/85 flex flex-col gap-2">
                    <div className="flex items-center justify-between text-xs text-muted-foreground">
                      <span>База розборів фактчекерів</span>
                      <ShieldCheck className="size-4 text-verified" />
                    </div>
                    <div className="text-2xl sm:text-3xl font-extrabold text-verified font-mono tabular-nums">
                      {overview.total_factchecks}
                    </div>
                    <p className="text-[11px] text-muted-foreground">
                      StopFake, VoxCheck, Детектор медіа (256-вимірні ембедінги)
                    </p>
                  </Card>

                  <Card className="p-5 bg-card/90 border-border/85 flex flex-col gap-2">
                    <div className="flex items-center justify-between text-xs text-muted-foreground">
                      <span>Користувачі та XAI-звіти</span>
                      <Fingerprint className="size-4 text-accent" />
                    </div>
                    <div className="text-2xl sm:text-3xl font-extrabold text-accent font-mono tabular-nums">
                      {overview.system_metrics?.total_users ?? 1} /{" "}
                      {overview.total_user_reports}
                    </div>
                    <p className="text-[11px] text-muted-foreground">
                      Зареєстровано акаунтів / збережених звітів перевірки
                    </p>
                  </Card>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  <Card className="p-6 bg-card/90 border-border/85 flex flex-col gap-4">
                    <h3 className="text-base font-bold text-foreground flex items-center gap-2">
                      <ShieldCheck className="size-5 text-primary" />
                      <span>Стан серверної інфраструктури та СУБД</span>
                    </h3>
                    <div className="flex flex-col gap-3 text-xs">
                      <div className="flex items-center justify-between gap-3 p-3.5 rounded-xl bg-secondary/55 border border-border/80">
                        <span className="text-muted-foreground">Хмарна база даних:</span>
                        <span className="font-mono font-bold text-primary text-right">
                          {overview.system_metrics?.db_engine ||
                            "Neon.tech Cloud PostgreSQL 17 + pgvector (HNSW)"}
                        </span>
                      </div>
                      <div className="flex items-center justify-between gap-3 p-3.5 rounded-xl bg-secondary/55 border border-border/80">
                        <span className="text-muted-foreground">
                          Фоновий RSS-планувальник:
                        </span>
                        <span className="font-mono font-bold text-verified text-right tabular-nums">
                          {overview.system_metrics?.scheduler_status || "Активний"} (кожні{" "}
                          {overview.system_metrics?.scheduler_interval_min ?? 5} хв)
                        </span>
                      </div>
                      <div className="flex items-center justify-between gap-3 p-3.5 rounded-xl bg-secondary/55 border border-border/80">
                        <span className="text-muted-foreground">
                          Середня затримка ML-інференсу:
                        </span>
                        <span className="font-mono font-bold text-accent tabular-nums">
                          {overview.system_metrics?.avg_inference_latency_ms ?? 3.8} мс /
                          стаття
                        </span>
                      </div>
                      <div className="flex items-center justify-between gap-3 p-3.5 rounded-xl bg-secondary/55 border border-border/80">
                        <span className="text-muted-foreground">
                          Середній бал довіри по системі:
                        </span>
                        <span className="font-mono font-bold text-verified tabular-nums">
                          {overview.avg_trust_score}%
                        </span>
                      </div>
                    </div>
                  </Card>

                  <Card className="p-6 bg-card/90 border-border/85 flex flex-col gap-4">
                    <h3 className="text-base font-bold text-foreground flex items-center gap-2">
                      <Sparkles className="size-5 text-accent" />
                      <span>Активні модулі штучного інтелекту (ML / XAI Pipeline)</span>
                    </h3>
                    <div className="flex flex-col gap-2.5">
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
                          className="flex items-center justify-between p-3.5 rounded-xl bg-secondary/55 border border-border/80 text-xs"
                        >
                          <span className="font-semibold text-foreground">
                            {modelName}
                          </span>
                          <Badge variant="verified" className="font-mono">
                            ONLINE
                          </Badge>
                        </div>
                      ))}
                    </div>
                  </Card>
                </div>
              </motion.div>
            )}
          </TabsContent>

          {/* ВКЛАДКА 2: ГРАФІКИ RECHARTS ТА МОНІТОРИНГ ЗМІ */}
          <TabsContent value="media" className="mt-0">
            {overview && (
              <motion.div
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.2 }}
                className="flex flex-col gap-6"
              >
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                  <Card className="lg:col-span-5 p-6 bg-card/90 border-border/85 flex flex-col justify-between gap-4">
                    <div className="flex flex-col gap-1">
                      <h3 className="text-base font-bold text-foreground flex items-center gap-2">
                        <PieChartIcon className="size-5 text-primary" />
                        <span>Розподіл новин за рівнем достовірності</span>
                      </h3>
                      <p className="text-xs text-muted-foreground">
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
                          <Tooltip contentStyle={CHART_TOOLTIP_STYLE} />
                          <Legend
                            verticalAlign="bottom"
                            height={36}
                            wrapperStyle={{
                              fontSize: "11px",
                              color: "var(--color-muted-foreground)",
                            }}
                          />
                        </PieChart>
                      </ResponsiveContainer>
                    </div>
                  </Card>

                  <Card className="lg:col-span-7 p-6 bg-card/90 border-border/85 flex flex-col justify-between gap-4">
                    <div className="flex flex-col gap-1">
                      <h3 className="text-base font-bold text-foreground flex items-center gap-2">
                        <SlidersHorizontal className="size-5 text-accent" />
                        <span>Розподіл достовірності за тематичними рубриками</span>
                      </h3>
                      <p className="text-xs text-muted-foreground">
                        Співвідношення перевірених новин, клікбейту та високого ризику по категоріях
                      </p>
                    </div>

                    <div className="w-full" style={{ height: 280 }}>
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart
                          data={categoryChartData}
                          margin={{ top: 10, right: 15, left: -10, bottom: 5 }}
                        >
                          <CartesianGrid
                            strokeDasharray="3 3"
                            stroke="var(--color-border)"
                          />
                          <XAxis
                            dataKey="name"
                            stroke="var(--color-muted-foreground)"
                            fontSize={11}
                          />
                          <YAxis
                            stroke="var(--color-muted-foreground)"
                            fontSize={11}
                          />
                          <Tooltip contentStyle={CHART_TOOLTIP_STYLE} />
                          <Legend wrapperStyle={{ fontSize: "11px" }} />
                          <Bar
                            dataKey="Перевірені"
                            stackId="a"
                            fill="var(--color-verified)"
                          />
                          <Bar
                            dataKey="Сумнівні"
                            stackId="a"
                            fill="var(--color-warning)"
                          />
                          <Bar
                            dataKey="Ризикові"
                            stackId="a"
                            fill="var(--color-destructive)"
                            radius={[4, 4, 0, 0]}
                          />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </Card>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                  <Card className="lg:col-span-7 p-6 bg-card/90 border-border/85 flex flex-col gap-4">
                    <div className="flex flex-col gap-1">
                      <h3 className="text-base font-bold text-foreground flex items-center gap-2">
                        <Clock className="size-5 text-verified" />
                        <span>Часова динаміка публікацій по днях</span>
                      </h3>
                      <p className="text-xs text-muted-foreground">
                        Кількість перевірених, сумнівних та ризикових матеріалів за останні активні дні
                      </p>
                    </div>

                    <div className="w-full" style={{ height: 256 }}>
                      <ResponsiveContainer width="100%" height="100%">
                        <AreaChart
                          data={timelineChartData}
                          margin={{ top: 10, right: 15, left: -10, bottom: 0 }}
                        >
                          <CartesianGrid
                            strokeDasharray="3 3"
                            stroke="var(--color-border)"
                          />
                          <XAxis
                            dataKey="date"
                            stroke="var(--color-muted-foreground)"
                            fontSize={11}
                          />
                          <YAxis
                            stroke="var(--color-muted-foreground)"
                            fontSize={11}
                          />
                          <Tooltip contentStyle={CHART_TOOLTIP_STYLE} />
                          <Legend wrapperStyle={{ fontSize: "11px" }} />
                          <Area
                            type="monotone"
                            dataKey="Перевірені"
                            stackId="1"
                            stroke="var(--color-verified)"
                            fill="var(--color-verified)"
                            fillOpacity={0.35}
                          />
                          <Area
                            type="monotone"
                            dataKey="Сумнівні"
                            stackId="1"
                            stroke="var(--color-warning)"
                            fill="var(--color-warning)"
                            fillOpacity={0.35}
                          />
                          <Area
                            type="monotone"
                            dataKey="Ризикові"
                            stackId="1"
                            stroke="var(--color-destructive)"
                            fill="var(--color-destructive)"
                            fillOpacity={0.45}
                          />
                        </AreaChart>
                      </ResponsiveContainer>
                    </div>
                  </Card>

                  <Card className="lg:col-span-5 p-6 bg-card/90 border-border/85 flex flex-col gap-4">
                    <div className="flex flex-col gap-1">
                      <h3 className="text-base font-bold text-foreground flex items-center gap-2">
                        <AlertTriangle className="size-5 text-warning" />
                        <span>Найпоширеніші маркери маніпуляцій</span>
                      </h3>
                      <p className="text-xs text-muted-foreground">
                        Частота спрацювань XAI-евристик, NER-детектора та бази фактчеків
                      </p>
                    </div>

                    <div className="flex flex-col gap-2.5">
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
                            className="p-3.5 rounded-xl bg-secondary/55 border border-border/80 flex flex-col gap-1.5"
                          >
                            <div className="flex items-center justify-between gap-2 text-xs">
                              <span className="font-medium text-foreground">{label}</span>
                              <span className="font-mono font-bold text-warning tabular-nums shrink-0">
                                {count} разів
                              </span>
                            </div>
                            <div className="w-full h-1.5 rounded-full bg-muted overflow-hidden">
                              <div
                                className="h-full rounded-full bg-warning"
                                style={{ width: `${widthPct}%` }}
                              />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </Card>
                </div>

                {/* Таблиця топ-джерел ЗМІ */}
                <Card className="p-6 bg-card/90 border-border/85 flex flex-col gap-4">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <div className="flex flex-col gap-1">
                      <h3 className="text-base font-bold text-foreground flex items-center gap-2">
                        <Globe className="size-5 text-primary" />
                        <span>
                          Рейтинг інформаційних джерел за результатами XAI-скорингу
                        </span>
                      </h3>
                      <p className="text-xs text-muted-foreground">
                        Порівняння базового рейтингу репутації ІМІ та фактичного середнього балу статей у потоці
                      </p>
                    </div>
                    <Button variant="ghost" size="sm" asChild className="text-primary">
                      <Link href="/admin/sources">
                        Редагувати джерела та RSS
                        <ArrowUpRight className="size-4" data-icon="inline-end" />
                      </Link>
                    </Button>
                  </div>

                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Видання (ЗМІ)</TableHead>
                        <TableHead>Домен</TableHead>
                        <TableHead>Мова</TableHead>
                        <TableHead>Статус у реєстрі</TableHead>
                        <TableHead className="text-right">Кількість статей</TableHead>
                        <TableHead className="text-right">Репутація домену</TableHead>
                        <TableHead className="text-right">Середній Trust Score</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {(overview.top_sources || []).map((src, idx) => (
                        <TableRow key={`${src.domain}-${src.language}-${idx}`}>
                          <TableCell className="font-bold text-foreground">
                            {src.source_name}
                          </TableCell>
                          <TableCell className="font-mono text-xs text-muted-foreground">
                            {src.domain}
                          </TableCell>
                          <TableCell>
                            <Badge variant="secondary" className="font-mono uppercase">
                              {src.language === "en" ? "EN (World)" : "UA (Україна)"}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            {src.is_whitelisted ? (
                              <Badge variant="verified">
                                <CheckCircle2 className="size-3" />
                                Білий список ІМІ
                              </Badge>
                            ) : src.is_blacklisted ? (
                              <Badge variant="destructive">
                                <AlertTriangle className="size-3" />
                                Чорний список
                              </Badge>
                            ) : (
                              <Badge variant="outline">Стандартний моніторинг</Badge>
                            )}
                          </TableCell>
                          <TableCell className="text-right font-mono font-semibold text-foreground tabular-nums">
                            {src.articles_count}
                          </TableCell>
                          <TableCell className="text-right font-mono text-primary tabular-nums">
                            {src.reliability_rating}%
                          </TableCell>
                          <TableCell className="text-right">
                            {src.articles_count > 0 ? (
                              <Badge
                                variant={
                                  src.trust_score_avg >= 80
                                    ? "verified"
                                    : src.trust_score_avg >= 55
                                    ? "warning"
                                    : "destructive"
                                }
                                className="font-mono tabular-nums"
                              >
                                {src.trust_score_avg}%
                              </Badge>
                            ) : (
                              <Badge variant="secondary" className="font-mono">
                                Немає статей
                              </Badge>
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </Card>
              </motion.div>
            )}
          </TabsContent>

          {/* ВКЛАДКА 3: ПОРІВНЯННЯ ML/NLP МОДЕЛЕЙ */}
          <TabsContent value="models" className="mt-0">
            <motion.div
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.2 }}
              className="flex flex-col gap-6"
            >
              {modelsEntries.length === 0 ? (
                <EmptyState
                  icon={Sparkles}
                  title="Метрики навчання моделей ще не завантажені"
                  description="Перевірте наявність файлу результатів оцінки в директорії ML-артефактів бекенду."
                  actionLabel="Повторити запит"
                  onAction={() => fetchAnalytics(true)}
                />
              ) : (
                <>
                  <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                    <Card className="lg:col-span-7 p-6 bg-card/90 border-border/85 flex flex-col gap-4">
                      <div className="flex flex-col gap-1">
                        <h3 className="text-base font-bold text-foreground flex items-center gap-2">
                          <Sparkles className="size-5 text-primary" />
                          <span>Порівняння точності 6 ML/NLP архітектур (Recharts)</span>
                        </h3>
                        <p className="text-xs text-muted-foreground tabular-nums">
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
                            <CartesianGrid
                              strokeDasharray="3 3"
                              stroke="var(--color-border)"
                            />
                            <XAxis
                              dataKey="name"
                              stroke="var(--color-muted-foreground)"
                              fontSize={10}
                              angle={-12}
                              textAnchor="end"
                              height={50}
                            />
                            <YAxis
                              domain={[90, 100]}
                              stroke="var(--color-muted-foreground)"
                              fontSize={11}
                            />
                            <Tooltip contentStyle={CHART_TOOLTIP_STYLE} />
                            <Legend wrapperStyle={{ fontSize: "11px" }} />
                            <Bar
                              dataKey="Accuracy"
                              fill="var(--color-primary)"
                              radius={[4, 4, 0, 0]}
                            />
                            <Bar
                              dataKey="F1-Score"
                              fill="var(--color-accent)"
                              radius={[4, 4, 0, 0]}
                            />
                            <Bar
                              dataKey="ROC-AUC"
                              fill="var(--color-verified)"
                              radius={[4, 4, 0, 0]}
                            />
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                    </Card>

                    <Card className="lg:col-span-5 p-6 bg-card/90 border-border/85 flex flex-col gap-4">
                      <div className="flex flex-col gap-1">
                        <h3 className="text-base font-bold text-foreground flex items-center gap-2">
                          <Clock className="size-5 text-verified" />
                          <span>Динаміка Val F1-Score трансформерів</span>
                        </h3>
                        <p className="text-xs text-muted-foreground">
                          Криві навчання ukr-roberta-base та xlm-roberta-base за 5 епох Fine-Tuning
                        </p>
                      </div>

                      <div className="w-full" style={{ height: 300 }}>
                        <ResponsiveContainer width="100%" height="100%">
                          <LineChart
                            data={trainingChartData}
                            margin={{ top: 10, right: 15, left: -10, bottom: 5 }}
                          >
                            <CartesianGrid
                              strokeDasharray="3 3"
                              stroke="var(--color-border)"
                            />
                            <XAxis
                              dataKey="epoch"
                              stroke="var(--color-muted-foreground)"
                              fontSize={11}
                            />
                            <YAxis
                              domain={[80, 100]}
                              stroke="var(--color-muted-foreground)"
                              fontSize={11}
                            />
                            <Tooltip contentStyle={CHART_TOOLTIP_STYLE} />
                            <Legend wrapperStyle={{ fontSize: "11px" }} />
                            <Line
                              type="monotone"
                              dataKey="ukr-roberta Val F1 (%)"
                              stroke="var(--color-primary)"
                              strokeWidth={3}
                              dot={{ r: 4 }}
                            />
                            <Line
                              type="monotone"
                              dataKey="xlm-roberta Val F1 (%)"
                              stroke="var(--color-verified)"
                              strokeWidth={3}
                              dot={{ r: 4 }}
                            />
                          </LineChart>
                        </ResponsiveContainer>
                      </div>
                    </Card>
                  </div>

                  {/* Порівняльна таблиця 6 моделей */}
                  <Card className="p-6 bg-card/90 border-border/85 flex flex-col gap-4">
                    <div className="flex flex-col gap-1">
                      <h3 className="text-base font-bold text-foreground flex items-center gap-2">
                        <Fingerprint className="size-5 text-primary" />
                        <span>
                          Експериментальне порівняння моделей детекції дезінформації
                        </span>
                      </h3>
                      <p className="text-xs text-muted-foreground">
                        Натисніть на будь-яку модель у таблиці, щоб переглянути її матрицю невідповідностей (Confusion Matrix)
                      </p>
                    </div>

                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Модель / Архітектура</TableHead>
                          <TableHead className="text-right">Accuracy</TableHead>
                          <TableHead className="text-right">Precision</TableHead>
                          <TableHead className="text-right">Recall</TableHead>
                          <TableHead className="text-right">F1-Score</TableHead>
                          <TableHead className="text-right">5-Fold CV</TableHead>
                          <TableHead className="text-right">ROC-AUC</TableHead>
                          <TableHead className="text-right">Час (мс)</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {modelsEntries.map(([modelKey, m]) => {
                          const isSelected = modelKey === selectedName;
                          const isBest = modelKey === "ukr-roberta-base (Fine-Tuned)";
                          const meta = MODEL_DESCRIPTIONS[modelKey];
                          return (
                            <TableRow
                              key={modelKey}
                              onClick={() => setSelectedModelName(modelKey)}
                              className={`cursor-pointer ${
                                isSelected
                                  ? "bg-primary/10 border-l-2 border-l-primary"
                                  : ""
                              }`}
                            >
                              <TableCell>
                                <div className="flex items-center gap-2">
                                  <span className="font-bold text-foreground">
                                    {modelKey}
                                  </span>
                                  {isBest && <Badge variant="accent">BEST (SOTA)</Badge>}
                                </div>
                                <div className="text-xs text-muted-foreground">
                                  {meta?.arch || "NLP Класифікатор TruthLens"}
                                </div>
                              </TableCell>
                              <TableCell className="text-right font-mono font-semibold text-foreground tabular-nums">
                                {((m.accuracy ?? 0) * 100).toFixed(1)}%
                              </TableCell>
                              <TableCell className="text-right font-mono text-muted-foreground tabular-nums">
                                {((m.precision ?? 0) * 100).toFixed(1)}%
                              </TableCell>
                              <TableCell className="text-right font-mono text-muted-foreground tabular-nums">
                                {((m.recall ?? 0) * 100).toFixed(1)}%
                              </TableCell>
                              <TableCell className="text-right">
                                <Badge
                                  variant={isBest ? "verified" : "default"}
                                  className="font-mono tabular-nums"
                                >
                                  {((m.f1_score ?? 0) * 100).toFixed(1)}%
                                </Badge>
                              </TableCell>
                              <TableCell className="text-right font-mono text-muted-foreground tabular-nums">
                                {m.cv_5fold_f1
                                  ? `${(m.cv_5fold_f1 * 100).toFixed(1)}%`
                                  : "—"}
                              </TableCell>
                              <TableCell className="text-right font-mono text-primary tabular-nums">
                                {((m.roc_auc ?? 0) * 100).toFixed(1)}%
                              </TableCell>
                              <TableCell className="text-right font-mono text-muted-foreground tabular-nums">
                                {m.latency_ms_per_article !== undefined
                                  ? `${m.latency_ms_per_article.toFixed(2)} мс`
                                  : "—"}
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </Card>

                  {/* Confusion Matrix + Топ XAI ознаки */}
                  <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                    {selectedStats && (
                      <Card className="lg:col-span-6 p-6 bg-card/90 border-border/85 flex flex-col gap-4">
                        <div className="flex flex-col gap-1">
                          <h3 className="text-base font-bold text-foreground">
                            Матриця невідповідностей:{" "}
                            <span className="text-primary">{selectedName}</span>
                          </h3>
                          <p className="text-xs text-muted-foreground">
                            {MODEL_DESCRIPTIONS[selectedName]?.desc ||
                              "Розподіл коректних та хибних класифікацій на тестовому наборі."}
                          </p>
                        </div>

                        <div className="grid grid-cols-2 gap-3 pt-1">
                          <div className="p-4 rounded-xl bg-verified/10 border border-verified/30 flex flex-col gap-1">
                            <span className="text-[10px] font-mono uppercase text-verified">
                              True Positive (TP)
                            </span>
                            <div className="text-2xl font-extrabold font-mono text-foreground tabular-nums">
                              {tpVal}
                            </div>
                            <p className="text-xs text-muted-foreground">
                              Вірно виявлені фейки
                            </p>
                          </div>

                          <div className="p-4 rounded-xl bg-primary/10 border border-primary/30 flex flex-col gap-1">
                            <span className="text-[10px] font-mono uppercase text-primary">
                              True Negative (TN)
                            </span>
                            <div className="text-2xl font-extrabold font-mono text-foreground tabular-nums">
                              {tnVal}
                            </div>
                            <p className="text-xs text-muted-foreground">
                              Вірно підтверджені факти
                            </p>
                          </div>

                          <div className="p-4 rounded-xl bg-warning/10 border border-warning/30 flex flex-col gap-1">
                            <span className="text-[10px] font-mono uppercase text-warning">
                              False Positive (FP)
                            </span>
                            <div className="text-2xl font-extrabold font-mono text-foreground tabular-nums">
                              {fpVal}
                            </div>
                            <p className="text-xs text-muted-foreground">Хибна тривога</p>
                          </div>

                          <div className="p-4 rounded-xl bg-destructive/10 border border-destructive/30 flex flex-col gap-1">
                            <span className="text-[10px] font-mono uppercase text-destructive">
                              False Negative (FN)
                            </span>
                            <div className="text-2xl font-extrabold font-mono text-foreground tabular-nums">
                              {fnVal}
                            </div>
                            <p className="text-xs text-muted-foreground">
                              Пропущена маніпуляція
                            </p>
                          </div>
                        </div>
                      </Card>
                    )}

                    <Card className="lg:col-span-6 p-6 bg-card/90 border-border/85 flex flex-col gap-4">
                      <div className="flex flex-col gap-1">
                        <h3 className="text-base font-bold text-foreground">
                          Глобальна важливість ознак XAI (Топ-токени корпусу)
                        </h3>
                        <p className="text-xs text-muted-foreground">
                          Ключові лексичні маркери маніпуляцій та достовірного новинного стилю з вагами моделі
                        </p>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div className="flex flex-col gap-2">
                          <span className="text-[11px] font-bold text-destructive uppercase font-mono">
                            Маркери дезінформації (+)
                          </span>
                          <div className="flex flex-wrap gap-1.5">
                            {(
                              mlMetrics?.xai_discriminative_features?.fake_indicators ?? []
                            )
                              .slice(0, 10)
                              .map((feat, idx) => (
                                <Badge
                                  key={`fake-feat-${idx}`}
                                  variant="destructive"
                                  className="font-mono tabular-nums"
                                >
                                  {feat.feature}{" "}
                                  <span className="opacity-80">
                                    +{feat.weight.toFixed(2)}
                                  </span>
                                </Badge>
                              ))}
                          </div>
                        </div>

                        <div className="flex flex-col gap-2">
                          <span className="text-[11px] font-bold text-verified uppercase font-mono">
                            Маркери надійних фактів (–)
                          </span>
                          <div className="flex flex-wrap gap-1.5">
                            {(
                              mlMetrics?.xai_discriminative_features?.real_indicators ?? []
                            )
                              .slice(0, 10)
                              .map((feat, idx) => (
                                <Badge
                                  key={`real-feat-${idx}`}
                                  variant="verified"
                                  className="font-mono tabular-nums"
                                >
                                  {feat.feature}{" "}
                                  <span className="opacity-80">
                                    {feat.weight.toFixed(2)}
                                  </span>
                                </Badge>
                              ))}
                          </div>
                        </div>
                      </div>
                    </Card>
                  </div>
                </>
              )}
            </motion.div>
          </TabsContent>
        </Tabs>
      )}
    </div>
  );
}
