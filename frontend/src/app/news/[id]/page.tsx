"use client";

import React, { useEffect, useState, useMemo, useCallback, useRef } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { motion } from "motion/react";
import { toast } from "sonner";
import { useAuth } from "@/context/AuthContext";
import { useGuestLimit } from "@/context/GuestLimitContext";
import { ArticleDetail, XAITokenContribution } from "@/types";
import { TrustBadge } from "@/components/TrustBadge";
import { NewsCard } from "@/components/NewsCard";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
} from "@/components/ui/tooltip";
import { EmptyState, ErrorState } from "@/components/ui/state-displays";
import {
  ArrowLeft,
  Bookmark,
  ExternalLink,
  Fingerprint,
  Sparkles,
  ShieldCheck,
  AlertTriangle,
  CheckCircle2,
  PieChart,
  Search,
  Globe,
  Clock,
  Eye,
  FileText,
  Lock,
  ListChecks,
  Scale,
  User as UserIcon,
} from "lucide-react";

type HighlightMode = "all" | "heatmap" | "fake" | "real" | "none";
type InspectorTab = "models" | "protocol";

interface HighlightRule {
  phrase: string;
  type: "manipulation_phrase" | "fake_token" | "real_token";
  badgeLabel: string;
  reason: string;
  weight?: number;
}

function ArticleDetailSkeleton() {
  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8 flex flex-col gap-7">
      <div className="flex items-center justify-between gap-4">
        <Skeleton className="h-9 w-44 rounded-xl" />
        <div className="flex items-center gap-2.5">
          <Skeleton className="h-9 w-40 rounded-xl" />
          <Skeleton className="h-9 w-44 rounded-xl" />
        </div>
      </div>

      <div className="rounded-2xl border border-border/80 bg-card p-6 sm:p-8 flex flex-col gap-6">
        <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-6">
          <div className="flex flex-col gap-3 flex-1">
            <div className="flex items-center gap-2">
              <Skeleton className="h-6 w-24 rounded-full" />
              <Skeleton className="h-5 w-48" />
            </div>
            <Skeleton className="h-9 w-11/12" />
            <Skeleton className="h-9 w-3/4" />
            <Skeleton className="h-4 w-60" />
          </div>
          <Skeleton className="h-24 w-56 rounded-xl" />
        </div>
        <div className="pt-5 border-t border-border/60">
          <Skeleton className="h-14 w-full rounded-xl" />
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        <div className="lg:col-span-7 xl:col-span-8 rounded-2xl border border-border/80 bg-card p-6 sm:p-8 flex flex-col gap-5">
          <div className="flex items-center justify-between gap-3">
            <Skeleton className="h-6 w-44" />
            <Skeleton className="h-8 w-72 rounded-xl" />
          </div>
          <Skeleton className="w-full aspect-video rounded-xl" />
          <Skeleton className="h-5 w-full" />
          <Skeleton className="h-5 w-11/12" />
          <Skeleton className="h-5 w-5/6" />
          <Skeleton className="h-5 w-full" />
        </div>
        <div className="lg:col-span-5 xl:col-span-4 flex flex-col gap-5">
          <div className="rounded-2xl border border-border/80 bg-card p-6 flex flex-col gap-4">
            <Skeleton className="h-6 w-48" />
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-12 w-full rounded-lg" />
            ))}
          </div>
          <div className="rounded-2xl border border-border/80 bg-card p-6 flex flex-col gap-4">
            <Skeleton className="h-8 w-full rounded-xl" />
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-14 w-full rounded-lg" />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function ArticleDetailPage() {
  const params = useParams();
  const articleId = params?.id as string;
  const { user, token, isLoading: authLoading, apiUrl } = useAuth();
  const { isReady: guestReady, consumeArticleDetail, openLimitModal } = useGuestLimit();

  const [article, setArticle] = useState<ArticleDetail | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [guestLimitBlocked, setGuestLimitBlocked] = useState<boolean>(false);
  const [isBookmarked, setIsBookmarked] = useState<boolean>(false);
  const [updatingBookmark, setUpdatingBookmark] = useState<boolean>(false);
  const [highlightMode, setHighlightMode] = useState<HighlightMode>("all");
  const [inspectorTab, setInspectorTab] = useState<InspectorTab>("models");
  const [imgFailed, setImgFailed] = useState<boolean>(false);

  const checkedArticleIdRef = useRef<string | null>(null);
  const loadedKeyRef = useRef<string | null>(null);
  const userId = user?.id ?? null;

  const fetchDetail = useCallback(async () => {
    if (!articleId) return;
    setLoading(true);
    setError(null);
    setImgFailed(false);
    try {
      const headers: Record<string, string> = {};
      if (token) headers["Authorization"] = `Bearer ${token}`;

      const res = await fetch(`${apiUrl}/news/${articleId}`, {
        headers,
        cache: "no-store",
      });
      if (!res.ok) {
        throw new Error("Не вдалося завантажити сторінку детального розбору статті.");
      }
      const data: ArticleDetail = await res.json();
      setArticle(data);
      setIsBookmarked(Boolean(data.is_bookmarked));
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Помилка завантаження статті");
    } finally {
      setLoading(false);
    }
  }, [articleId, apiUrl, token]);

  useEffect(() => {
    if (!articleId || authLoading || !guestReady) return;

    const loadKey = `${articleId}:${userId ?? "guest"}:${token ?? ""}`;
    if (loadedKeyRef.current === loadKey) return;

    if (userId !== null) {
      loadedKeyRef.current = loadKey;
      setGuestLimitBlocked(false);
      void fetchDetail();
      return;
    }

    if (checkedArticleIdRef.current !== articleId) {
      checkedArticleIdRef.current = articleId;
      const numericId = Number(articleId);
      const allowed = consumeArticleDetail(Number.isFinite(numericId) ? numericId : -1);
      if (!allowed) {
        loadedKeyRef.current = loadKey;
        setGuestLimitBlocked(true);
        setLoading(false);
        return;
      }
    }

    loadedKeyRef.current = loadKey;
    setGuestLimitBlocked(false);
    void fetchDetail();
  }, [articleId, authLoading, guestReady, userId, token, consumeArticleDetail, fetchDetail]);

  const toggleBookmark = async () => {
    if (!article) return;
    if (!user || !token) {
      window.location.href = "/login";
      return;
    }
    setUpdatingBookmark(true);
    try {
      const method = isBookmarked ? "DELETE" : "POST";
      const res = await fetch(`${apiUrl}/bookmarks/${article.id}`, {
        method,
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const nextState = !isBookmarked;
        setIsBookmarked(nextState);
        toast.success(
          nextState ? "Статтю збережено у закладки" : "Статтю видалено із закладок"
        );
      }
    } catch {
      toast.error("Не вдалося оновити статус закладки");
    } finally {
      setUpdatingBookmark(false);
    }
  };

  const highlightRules = useMemo<HighlightRule[]>(() => {
    if (!article?.trust_breakdown) return [];
    const tb = article.trust_breakdown;
    const rules: HighlightRule[] = [];
    const seen = new Set<string>();

    // Основне джерело: доказово-семантичні XAI-маркери з точними категоріями й поясненнями від бекенду
    for (const tok of (tb.xai_top_tokens || []) as XAITokenContribution[]) {
      const cleanTok = (tok.token || "").trim();
      if (cleanTok.length < 2) continue;
      const key = cleanTok.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);

      const isFake = tok.direction === "fake_indicator";
      const isHardManipulation = tok.category === "manipulation";
      const ruleType: HighlightRule["type"] = isHardManipulation
        ? "manipulation_phrase"
        : isFake
        ? "fake_token"
        : "real_token";

      rules.push({
        phrase: cleanTok,
        type: ruleType,
        badgeLabel:
          tok.label ||
          (isHardManipulation
            ? "Маніпуляція / клікбейт"
            : isFake
            ? "Емоційне забарвлення"
            : "Фактична опора"),
        reason:
          tok.reason ||
          (isFake
            ? "Стилістичний маркер емоційного тиску або розмитої атрибуції"
            : "Конкретне верифіковане джерело, документ або числовий факт"),
        weight: tok.weight,
      });
    }

    // Додаткові явні стилістичні тригери, якщо їх не було в xai_top_tokens
    for (const marker of tb.manipulation_markers || []) {
      const quoted = marker.match(/[«"']([^»"']{3,40})[»"']/);
      if (quoted && quoted[1]) {
        const cleanPhrase = quoted[1].trim();
        const key = cleanPhrase.toLowerCase();
        if (!seen.has(key)) {
          seen.add(key);
          rules.push({
            phrase: cleanPhrase,
            type: "manipulation_phrase",
            badgeLabel: "Маніпулятивний зворот",
            reason: marker,
          });
        }
      }
    }

    rules.sort((a, b) => b.phrase.length - a.phrase.length);
    return rules;
  }, [article]);

  const renderHighlightedParagraph = (textBlock: string) => {
    if (!textBlock || highlightMode === "none" || highlightRules.length === 0) {
      return textBlock;
    }

    const activeRules = highlightRules.filter((r) => {
      if (highlightMode === "all") return true;
      if (highlightMode === "fake")
        return r.type === "manipulation_phrase" || r.type === "fake_token";
      if (highlightMode === "real") return r.type === "real_token";
      return true;
    });

    if (activeRules.length === 0) return textBlock;

    const escapedPatterns = activeRules.map((r) =>
      r.phrase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
    );
    // Суворі Unicode-межі слів, щоб «шок» не підсвічував середину слова «мішок»,
    // але коректно працював для «$15 млн», «14%», «НБУ», «Укренерго»
    const regex = new RegExp(
      `(?<![A-Za-zА-Яа-яІіЇїЄєҐґ0-9_])(${escapedPatterns.join("|")})(?![A-Za-zА-Яа-яІіЇїЄєҐґ0-9_])`,
      "gi"
    );
    const parts = textBlock.split(regex);

    return parts.map((part, idx) => {
      // У String.split з однією групою захоплення збіги завжди мають непарний індекс (1, 3, 5...)
      if (idx % 2 === 0) {
        return <React.Fragment key={idx}>{part}</React.Fragment>;
      }
      const lower = part.toLowerCase();
      const matchedRule = activeRules.find((r) => r.phrase.toLowerCase() === lower);
      if (!matchedRule) {
        return <React.Fragment key={idx}>{part}</React.Fragment>;
      }

      const isRisk =
        matchedRule.type === "manipulation_phrase" || matchedRule.type === "fake_token";

      const badgeVariant =
        matchedRule.type === "manipulation_phrase"
          ? "destructive"
          : isRisk
          ? "warning"
          : "verified";

      return (
        <Tooltip key={idx} delayDuration={80}>
          <TooltipTrigger asChild>
            <span
              tabIndex={0}
              className={`inline rounded-md px-1 py-0.5 font-medium transition-colors cursor-help border-b focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                matchedRule.type === "manipulation_phrase"
                  ? "bg-destructive/20 text-foreground border-destructive hover:bg-destructive/30"
                  : isRisk
                  ? "bg-warning/15 text-foreground border-warning hover:bg-warning/25"
                  : "bg-verified/15 text-foreground border-verified/80 hover:bg-verified/25"
              }`}
            >
              {part}
            </span>
          </TooltipTrigger>
          <TooltipContent side="top" className="flex flex-col gap-1.5 p-3 max-w-xs">
            <div className="flex items-center justify-between gap-2">
              <Badge variant={badgeVariant} className="text-[10px] px-2 py-0">
                {matchedRule.badgeLabel}
              </Badge>
            </div>
            <p className="text-xs text-popover-foreground leading-snug">
              {matchedRule.reason}
            </p>
          </TooltipContent>
        </Tooltip>
      );
    });
  };

  if (guestLimitBlocked && !user) {
    return (
      <div className="max-w-xl mx-auto px-4 py-16">
        <EmptyState
          icon={Lock}
          title="Вичерпано гостьовий ліміт переглядів (2 з 2)"
          description="Увійдіть або створіть безкоштовний акаунт TruthLens, щоб без обмежень переглядати повні XAI-розбори та деталі всіх новин."
          actionLabel="Увійти в акаунт"
          actionHref="/login"
          secondaryActionLabel="Повернутися до стрічки"
          onSecondaryAction={() => {
            window.location.href = "/";
          }}
        />
        <div className="mt-4 text-center">
          <Button variant="ghost" size="sm" onClick={() => openLimitModal("xai_details")}>
            Детальніше про умови доступу
          </Button>
        </div>
      </div>
    );
  }

  if (loading) {
    return <ArticleDetailSkeleton />;
  }

  if (error || !article) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-16">
        <ErrorState
          title={error || "Статтю не знайдено"}
          message="Перевірте посилання або поверніться до головної стрічки новин."
          onRetry={fetchDetail}
        />
      </div>
    );
  }

  const tb = article.trust_breakdown;
  const paragraphs = (article.full_text || article.summary || "")
    .split(/\n+/)
    .map((p) => p.trim())
    .filter(Boolean);

  const formattedDate = new Date(article.published_at).toLocaleString("uk-UA", {
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

  const realTokens = (tb.xai_top_tokens || []).filter(
    (t) => t.direction === "real_indicator"
  );
  const fakeTokens = (tb.xai_top_tokens || []).filter(
    (t) => t.direction === "fake_indicator"
  );

  const sortedCorroborating = [...(tb.corroborating_articles || [])].sort(
    (a, b) => b.similarity - a.similarity
  );

  const verdictTone =
    tb.score >= 80
      ? "verified"
      : tb.score >= 50
      ? "warning"
      : "destructive";

  const factorRows = [
    {
      label: "Надійність джерела (ІМІ)",
      weight: "36%",
      score: tb.source_reputation_score,
      hint: "Редакційні стандарти та репутація домену",
      barClass:
        tb.source_reputation_score >= 80
          ? "bg-verified"
          : tb.source_reputation_score >= 55
          ? "bg-warning"
          : "bg-destructive",
      valClass:
        tb.source_reputation_score >= 80
          ? "text-verified"
          : tb.source_reputation_score >= 55
          ? "text-accent"
          : "text-destructive",
    },
    {
      label: "Спокійний тон і стилометрія",
      weight: "25%",
      score: tb.stylometry_score,
      hint: "Відсутність клікбейту, капслоку й емоційного тиску",
      barClass:
        tb.stylometry_score >= 75
          ? "bg-primary"
          : tb.stylometry_score >= 50
          ? "bg-warning"
          : "bg-destructive",
      valClass:
        tb.stylometry_score >= 75
          ? "text-primary"
          : tb.stylometry_score >= 50
          ? "text-accent"
          : "text-destructive",
    },
    {
      label: "Автентичність тексту (ШІ)",
      weight: "24%",
      score: tb.ml_authenticity_score,
      hint: "Ансамбль ukr-roberta, XLM-RoBERTa та Hybrid NLP",
      barClass:
        tb.ml_authenticity_score >= 75
          ? "bg-verified"
          : tb.ml_authenticity_score >= 50
          ? "bg-warning"
          : "bg-destructive",
      valClass:
        tb.ml_authenticity_score >= 75
          ? "text-verified"
          : tb.ml_authenticity_score >= 50
          ? "text-accent"
          : "text-destructive",
    },
    {
      label: "Публікації в інших ЗМІ",
      weight: "15%",
      score: tb.corroboration_score,
      hint: "Зіставлення схожих матеріалів у незалежних редакціях",
      barClass:
        tb.corroboration_score >= 75
          ? "bg-primary"
          : tb.corroboration_score >= 50
          ? "bg-warning"
          : "bg-destructive",
      valClass:
        tb.corroboration_score >= 75
          ? "text-primary"
          : tb.corroboration_score >= 50
          ? "text-accent"
          : "text-destructive",
    },
  ];

  const modelEntries = Object.entries(tb.models_breakdown || {});
  const reasoningSteps = tb.xai_reasoning_steps || [];

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
      className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8 flex flex-col gap-7"
    >
      {/* Верхня навігаційна панель */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Button variant="outline" size="sm" asChild className="whitespace-nowrap">
          <Link href="/">
            <ArrowLeft className="size-4 text-primary" data-icon="inline-start" />
            Назад до стрічки
          </Link>
        </Button>

        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant={isBookmarked ? "default" : "outline"}
            size="sm"
            onClick={toggleBookmark}
            disabled={updatingBookmark}
            className="whitespace-nowrap"
          >
            <Bookmark
              className={`size-4 ${isBookmarked ? "fill-current" : ""}`}
              data-icon="inline-start"
            />
            {isBookmarked ? "У закладках" : "Зберегти"}
          </Button>

          <Button variant="secondary" size="sm" asChild className="whitespace-nowrap">
            <a href={article.url} target="_blank" rel="noopener noreferrer">
              Читати на сайті видання
              <ExternalLink className="size-4" data-icon="inline-end" />
            </a>
          </Button>
        </div>
      </div>

      {/* 1. Редакційна шапка новини та підсумковий висновок */}
      <header className="rounded-2xl border border-border/85 bg-card overflow-hidden">
        <div className="p-6 sm:p-8 flex flex-col lg:flex-row lg:items-start justify-between gap-6">
          <div className="flex flex-col gap-3.5 min-w-0 flex-1 max-w-4xl">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs text-muted-foreground">
              <Badge variant="default">{article.category}</Badge>
              <span className="inline-flex items-center gap-1.5 min-w-0">
                <Globe className="size-3.5 text-primary shrink-0" />
                <strong className="text-foreground font-semibold">{article.source_name}</strong>
                <span className="font-mono text-muted-foreground">({article.domain})</span>
              </span>
              <span className="inline-flex items-center gap-1.5 tabular-nums">
                <Clock className="size-3.5 shrink-0" />
                {formattedDate}
              </span>
              {article.author && (
                <span className="inline-flex items-center gap-1.5">
                  <UserIcon className="size-3.5 shrink-0" />
                  <span className="text-foreground/90 font-medium">{article.author}</span>
                </span>
              )}
            </div>

            <h1 className="text-2xl sm:text-3xl lg:text-[2rem] font-extrabold text-foreground leading-[1.2] tracking-[-0.025em] text-balance">
              {renderHighlightedParagraph(article.title)}
            </h1>
          </div>

          <div className="flex flex-row lg:flex-col items-center lg:items-end justify-between gap-3 shrink-0 rounded-xl bg-secondary/50 border border-border/75 px-5 py-4 lg:min-w-[220px]">
            <div className="flex flex-col lg:items-end gap-0.5">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                Індекс довіри
              </span>
              <span className="text-[11px] text-muted-foreground/80">
                Trust Score V4
              </span>
            </div>
            <TrustBadge score={tb.score} verdict={tb.verdict} size="lg" />
          </div>
        </div>

        {/* Інтегрована смуга висновку без вкладеного подвійного блоку */}
        <div
          className={`px-6 sm:px-8 py-4 border-t flex flex-col gap-2.5 ${
            verdictTone === "destructive"
              ? "bg-destructive/8 border-destructive/25"
              : verdictTone === "warning"
              ? "bg-warning/8 border-warning/25"
              : "bg-primary/6 border-border/70"
          }`}
        >
          <div className="flex items-start gap-3">
            <Fingerprint
              className={`size-4 mt-0.5 shrink-0 ${
                verdictTone === "destructive"
                  ? "text-destructive"
                  : verdictTone === "warning"
                  ? "text-accent"
                  : "text-primary"
              }`}
            />
            <div className="min-w-0 flex-1">
              <span className="text-xs font-semibold text-foreground block mb-0.5">
                Висновок системи простими словами
              </span>
              <p className="text-sm text-foreground/90 leading-relaxed max-w-[82ch]">
                {tb.explanation}
              </p>
            </div>
          </div>

          {tb.fact_check_flag &&
            tb.matched_fact_checks &&
            tb.matched_fact_checks.length > 0 && (
              <div className="pl-7 flex flex-wrap items-center gap-2 pt-1">
                {tb.matched_fact_checks.slice(0, 2).map((fc, idx) => (
                  <div
                    key={fc.id ?? idx}
                    className="inline-flex flex-wrap items-center gap-2 rounded-lg bg-background/70 border border-destructive/30 px-3 py-1.5 text-xs max-w-full"
                  >
                    <Badge variant="destructive" className="text-[10px]">
                      {fc.fact_checker} • {fc.rating || fc.verdict}
                    </Badge>
                    <span className="text-foreground/90 break-words">
                      {fc.claim_text}
                    </span>
                    {fc.source_url && (
                      <a
                        href={fc.source_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-primary hover:underline font-medium shrink-0"
                      >
                        Спростування
                        <ExternalLink className="size-3" />
                      </a>
                    )}
                  </div>
                ))}
              </div>
            )}
        </div>
      </header>

      {/* 2. Основна асиметрична сітка: Читання зліва + Липкий XAI-інспектор справа */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-7 items-start">
        {/* ЛІВА КОЛОНКА: Текст статті, теплова карта, токени та NER-атрибуція */}
        <article className="lg:col-span-7 xl:col-span-8 min-w-0 rounded-2xl border border-border/85 bg-card overflow-hidden">
          {/* Панель режиму підсвітки */}
          <div className="px-6 sm:px-8 py-4 border-b border-border/75 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-2.5 min-w-0">
              <FileText className="size-4 text-primary shrink-0" />
              <h2 className="text-base font-bold text-foreground tracking-tight">
                Текст матеріалу та XAI-підсвітка
              </h2>
            </div>

            <div
              role="group"
              aria-label="Режим підсвічування тексту"
              className="inline-flex flex-wrap p-1 rounded-xl bg-secondary/75 border border-border/80 gap-1"
            >
              {(
                [
                  { id: "all", label: "Усі мітки" },
                  { id: "heatmap", label: "Теплова карта" },
                  { id: "real", label: "Факти" },
                  { id: "fake", label: "Ризики" },
                  { id: "none", label: "Чистий текст" },
                ] as const
              ).map((modeItem) => (
                <Button
                  key={modeItem.id}
                  type="button"
                  variant={highlightMode === modeItem.id ? "default" : "ghost"}
                  size="xs"
                  onClick={() => setHighlightMode(modeItem.id)}
                  className="h-7 px-2.5 text-[11px] whitespace-nowrap"
                >
                  {modeItem.label}
                </Button>
              ))}
            </div>
          </div>

          <div className="p-6 sm:p-8 flex flex-col gap-6">
            {/* Компактна легенда підсвітки */}
            {highlightMode !== "none" && highlightMode !== "heatmap" && (
              <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-muted-foreground pb-3 border-b border-border/50">
                <span className="inline-flex items-center gap-1.5">
                  <span className="size-2.5 rounded-sm bg-verified/35 border border-verified" />
                  <span className="text-foreground/85">Фактаж і джерела</span>
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <span className="size-2.5 rounded-sm bg-warning/35 border border-warning" />
                  <span className="text-foreground/85">Емоційні слова</span>
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <span className="size-2.5 rounded-sm bg-destructive/35 border border-destructive" />
                  <span className="text-foreground/85">Маніпуляції / клікбейт</span>
                </span>
                <span className="text-[11px] text-muted-foreground/80 sm:ml-auto">
                  Наведіть на виділене слово для пояснення
                </span>
              </div>
            )}

            {/* Обкладинка статті */}
            {article.image_url && !imgFailed && (
              <div className="relative w-full aspect-video rounded-xl overflow-hidden bg-secondary border border-border/70">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={article.image_url}
                  alt={article.title}
                  onError={() => setImgFailed(true)}
                  className="w-full h-full object-cover"
                />
              </div>
            )}

            {/* Основний текст або теплова карта речень */}
            {highlightMode === "heatmap" &&
            tb.sentence_analysis &&
            tb.sentence_analysis.length > 0 ? (
              <div className="flex flex-col gap-3">
                <p className="text-xs text-muted-foreground flex items-center gap-2 pb-1">
                  <Sparkles className="size-3.5 text-primary shrink-0" />
                  <span>
                    Кожне речення оцінено окремо за контекстом, тональністю та посиланнями на джерела.
                  </span>
                </p>

                <div className="divide-y divide-border/60 rounded-xl border border-border/75 overflow-hidden">
                  {tb.sentence_analysis.map((item) => {
                    const isGood = item.status === "factual";
                    const isBad = item.status === "manipulative";
                    return (
                      <div
                        key={item.index}
                        className={`p-4 flex flex-col gap-1.5 transition-colors ${
                          isGood
                            ? "bg-verified/5"
                            : isBad
                            ? "bg-destructive/8"
                            : "bg-warning/6"
                        }`}
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                            {item.is_headline
                              ? "Заголовок"
                              : `Речення ${item.index}`}
                          </span>
                          <Badge
                            variant={
                              isGood ? "verified" : isBad ? "destructive" : "warning"
                            }
                            className="font-mono tabular-nums"
                          >
                            {isGood
                              ? "Фактаж"
                              : isBad
                              ? "Ризик маніпуляції"
                              : "Нейтрально"}{" "}
                            • {Number(item.score).toFixed(0)}%
                          </Badge>
                        </div>
                        <p className="text-sm sm:text-[15px] text-foreground leading-relaxed max-w-[68ch]">
                          {item.sentence}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {item.reason}
                        </p>
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : paragraphs.length > 0 ? (
              <div className="flex flex-col gap-4 text-[15px] sm:text-base text-foreground/95 leading-[1.8] max-w-[68ch]">
                {paragraphs.map((para, index) => (
                  <p key={index} className="break-words">
                    {renderHighlightedParagraph(para)}
                  </p>
                ))}
              </div>
            ) : (
              <div className="rounded-xl border border-border/75 bg-secondary/40 p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <p className="text-sm text-muted-foreground leading-relaxed">
                  Першоджерело обмежило автоматичне завантаження повного тексту цієї публікації.
                  Ви можете ознайомитися з оригіналом напряму на сайті видання.
                </p>
                <Button variant="secondary" size="sm" asChild className="shrink-0 whitespace-nowrap">
                  <a href={article.url} target="_blank" rel="noopener noreferrer">
                    Відкрити оригінал
                    <ExternalLink className="size-4" data-icon="inline-end" />
                  </a>
                </Button>
              </div>
            )}

            {/* Секція детального лінгвістичного аудиту під текстом */}
            <div className="pt-6 mt-2 border-t border-border/75 flex flex-col gap-6">
              {/* Виявлені стилістичні тригери */}
              {tb.manipulation_markers && tb.manipulation_markers.length > 0 && (
                <div className="rounded-xl bg-destructive/8 border border-destructive/25 p-4 flex flex-col gap-2.5 min-w-0">
                  <h3 className="text-xs font-bold text-destructive-foreground flex items-center gap-2">
                    <AlertTriangle className="size-4 text-destructive shrink-0" />
                    <span>Виявлені стилістичні та емоційні тригери</span>
                  </h3>
                  <div className="flex flex-wrap gap-2">
                    {tb.manipulation_markers.map((m, i) => (
                      <Badge
                        key={i}
                        variant="destructive"
                        className="whitespace-normal text-left h-auto py-1 px-2.5 leading-snug max-w-full break-words"
                      >
                        {m}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}

              {/* Ключові токени XAI */}
              {(realTokens.length > 0 || fakeTokens.length > 0) && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="min-w-0 overflow-hidden rounded-xl bg-secondary/40 border border-border/75 p-4 flex flex-col gap-2.5">
                    <h3 className="text-xs font-bold text-verified flex items-center gap-1.5">
                      <CheckCircle2 className="size-4 shrink-0" />
                      <span>Фактичні та документальні опори</span>
                    </h3>
                    {realTokens.length > 0 ? (
                      <div className="flex flex-wrap gap-1.5">
                        {realTokens.map((t, i) => (
                          <Badge
                            key={i}
                            variant="verified"
                            title={t.reason || t.label}
                            className="whitespace-normal text-left h-auto py-1 px-2.5 leading-snug max-w-full break-words"
                          >
                            <span>«{t.token}»</span>
                            {t.label && (
                              <span className="opacity-75 text-[10px] font-normal">
                                · {t.label}
                              </span>
                            )}
                          </Badge>
                        ))}
                      </div>
                    ) : (
                      <p className="text-xs text-muted-foreground leading-relaxed">
                        Прямих згадок офіційних інституцій, документів чи кількісних метрик не зафіксовано.
                      </p>
                    )}
                  </div>

                  <div className="min-w-0 overflow-hidden rounded-xl bg-secondary/40 border border-border/75 p-4 flex flex-col gap-2.5">
                    <h3 className="text-xs font-bold text-destructive flex items-center gap-1.5">
                      <Sparkles className="size-4 shrink-0" />
                      <span>Маркери ризику та маніпуляцій</span>
                    </h3>
                    {fakeTokens.length > 0 ? (
                      <div className="flex flex-wrap gap-1.5">
                        {fakeTokens.map((t, i) => (
                          <Badge
                            key={i}
                            variant={t.category === "manipulation" ? "destructive" : "warning"}
                            title={t.reason || t.label}
                            className="whitespace-normal text-left h-auto py-1 px-2.5 leading-snug max-w-full break-words"
                          >
                            <span>«{t.token}»</span>
                            {t.label && (
                              <span className="opacity-80 text-[10px] font-normal">
                                · {t.label}
                              </span>
                            )}
                          </Badge>
                        ))}
                      </div>
                    ) : (
                      <p className="text-xs text-muted-foreground leading-relaxed">
                        Клікбейту, пропагандистських штампів або анонімних вкидів не виявлено.
                      </p>
                    )}
                  </div>
                </div>
              )}

              {/* NER-детектор атрибуції (повністю захищено від переповнення) */}
              {tb.attribution_analysis && (
                <div className="flex flex-col gap-3 pt-2 border-t border-border/60">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h3 className="text-sm font-bold text-foreground flex items-center gap-2">
                      <Scale className="size-4 text-primary shrink-0" />
                      <span>Перевірка цитат і першоджерел (NER-атрибуція)</span>
                    </h3>
                    <Badge variant="secondary" className="font-mono tabular-nums">
                      Атрибуція:{" "}
                      {Number(tb.attribution_analysis.attribution_score || 70).toFixed(0)}%
                    </Badge>
                  </div>

                  <p className="text-xs text-muted-foreground leading-relaxed max-w-[72ch]">
                    {tb.attribution_analysis.summary}
                  </p>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="min-w-0 overflow-hidden rounded-xl bg-secondary/40 border border-border/75 p-4 flex flex-col gap-2.5">
                      <span className="text-xs font-semibold text-verified">
                        Офіційні відомства та джерела
                      </span>
                      {tb.attribution_analysis.verified_entities &&
                      tb.attribution_analysis.verified_entities.length > 0 ? (
                        <div className="flex flex-wrap gap-2">
                          {tb.attribution_analysis.verified_entities.map((ent, idx) => (
                            <Badge
                              key={idx}
                              variant="verified"
                              className="whitespace-normal text-left h-auto py-1 px-2.5 leading-snug max-w-full break-words items-start"
                            >
                              <CheckCircle2 className="size-3.5 mt-0.5 shrink-0" />
                              <span>{ent}</span>
                            </Badge>
                          ))}
                        </div>
                      ) : (
                        <p className="text-xs text-muted-foreground leading-relaxed">
                          Прямих назв державних чи міжнародних інституцій у тексті не знайдено.
                        </p>
                      )}
                    </div>

                    <div className="min-w-0 overflow-hidden rounded-xl bg-secondary/40 border border-border/75 p-4 flex flex-col gap-2.5">
                      <span className="text-xs font-semibold text-accent">
                        Псевдоцитати й анонімні посилання
                      </span>
                      {tb.attribution_analysis.unverified_claims &&
                      tb.attribution_analysis.unverified_claims.length > 0 ? (
                        <div className="flex flex-wrap gap-2">
                          {tb.attribution_analysis.unverified_claims.map((claim, idx) => (
                            <Badge
                              key={idx}
                              variant="destructive"
                              className="whitespace-normal text-left h-auto py-1 px-2.5 leading-snug max-w-full break-words items-start"
                            >
                              <AlertTriangle className="size-3.5 mt-0.5 shrink-0" />
                              <span>{claim}</span>
                            </Badge>
                          ))}
                        </div>
                      ) : (
                        <p className="text-xs text-muted-foreground leading-relaxed">
                          Маніпулятивних посилань на «анонімних інсайдерів» чи чутки не виявлено.
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </article>

        {/* ПРАВА КОЛОНКА (ЛИПКА): Компактний XAI-інспектор без стіни карток */}
        <aside className="lg:col-span-5 xl:col-span-4 min-w-0 lg:sticky lg:top-24 flex flex-col gap-5">
          {/* Панель 1: Складники Trust Score V4 (чіткі рядки через divide-y) */}
          <section className="rounded-2xl border border-border/85 bg-card overflow-hidden">
            <div className="px-5 py-4 border-b border-border/75 flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 min-w-0">
                <ShieldCheck className="size-4 text-primary shrink-0" />
                <h2 className="text-sm font-bold text-foreground">
                  Фактори Trust Score V4
                </h2>
              </div>
              <span className="text-xs font-mono font-bold tabular-nums text-foreground">
                {tb.score.toFixed(1)}%
              </span>
            </div>

            <div className="divide-y divide-border/60">
              {factorRows.map((row) => (
                <div key={row.label} className="px-5 py-3.5 flex flex-col gap-1.5">
                  <div className="flex items-baseline justify-between gap-2 text-xs">
                    <span className="font-semibold text-foreground">
                      {row.label}
                      <span className="text-muted-foreground font-normal ml-1.5">
                        ({row.weight})
                      </span>
                    </span>
                    <span
                      className={`font-mono font-bold tabular-nums shrink-0 ${row.valClass}`}
                    >
                      {row.score.toFixed(0)}%
                    </span>
                  </div>
                  <div className="w-full bg-secondary h-1.5 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all ${row.barClass}`}
                      style={{ width: `${Math.min(100, Math.max(4, row.score))}%` }}
                    />
                  </div>
                  <p className="text-[11px] text-muted-foreground leading-snug">
                    {row.hint}
                  </p>
                </div>
              ))}

              {/* Статус звірки з базою фактчекерів */}
              <div
                className={`px-5 py-3.5 flex flex-col gap-1.5 ${
                  tb.fact_check_flag ? "bg-destructive/8" : "bg-verified/5"
                }`}
              >
                <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                  <span className="font-semibold text-foreground">
                    База фактчеків (StopFake / VoxCheck)
                  </span>
                  <Badge variant={tb.fact_check_flag ? "destructive" : "verified"}>
                    {tb.fact_check_flag ? "Є спростування" : "Фейків не знайдено"}
                  </Badge>
                </div>
                <p className="text-[11px] text-muted-foreground leading-snug">
                  {tb.fact_check_flag
                    ? "Твердження матеріалу збігається з офіційним спростуванням фактчекерів."
                    : "У базі спростованих фейків StopFake та VoxCheck збігів не виявлено."}
                </p>
              </div>
            </div>
          </section>

          {/* Панель 2: Вкладки «ШІ-моделі» та «XAI-протокол» */}
          {(modelEntries.length > 0 || reasoningSteps.length > 0) && (
            <section className="rounded-2xl border border-border/85 bg-card overflow-hidden">
              <div className="px-4 py-3 border-b border-border/75 bg-secondary/35">
                <div
                  role="tablist"
                  aria-label="Деталі XAI-аудиту"
                  className="grid grid-cols-2 gap-1 p-1 rounded-xl bg-background/70 border border-border/75"
                >
                  <button
                    type="button"
                    role="tab"
                    aria-selected={inspectorTab === "models"}
                    onClick={() => setInspectorTab("models")}
                    className={`inline-flex items-center justify-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors whitespace-nowrap ${
                      inspectorTab === "models"
                        ? "bg-primary text-primary-foreground shadow-xs"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    <PieChart className="size-3.5 shrink-0" />
                    <span>ШІ-моделі ({modelEntries.length})</span>
                  </button>
                  <button
                    type="button"
                    role="tab"
                    aria-selected={inspectorTab === "protocol"}
                    onClick={() => setInspectorTab("protocol")}
                    className={`inline-flex items-center justify-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors whitespace-nowrap ${
                      inspectorTab === "protocol"
                        ? "bg-primary text-primary-foreground shadow-xs"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    <ListChecks className="size-3.5 shrink-0" />
                    <span>Протокол ({reasoningSteps.length})</span>
                  </button>
                </div>
              </div>

              {inspectorTab === "models" ? (
                <div className="divide-y divide-border/60">
                  {modelEntries.map(([modelKey, scoreVal]) => {
                    const numScore = Number(scoreVal);
                    const friendlyTitle =
                      modelKey === "ukr_roberta_base" || modelKey === "ukr-roberta-base"
                        ? "Український ШІ (ukr-roberta)"
                        : modelKey === "xlm_roberta_base" || modelKey === "xlm-roberta-base"
                        ? "Багатомовний ШІ (XLM-RoBERTa)"
                        : "Гібридний класифікатор (Ensemble)";

                    const friendlyDesc =
                      modelKey === "ukr_roberta_base" || modelKey === "ukr-roberta-base"
                        ? "Нейромережа, донавчена на корпусі українських новин і фейків"
                        : modelKey === "xlm_roberta_base" || modelKey === "xlm-roberta-base"
                        ? "Трансформерна оцінка структури тексту та стилістики"
                        : "Статистичний ансамбль лексичних і стилометричних ознак";

                    return (
                      <div key={modelKey} className="px-5 py-3.5 flex flex-col gap-1.5">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-xs font-semibold text-foreground">
                            {friendlyTitle}
                          </span>
                          <span className="text-xs font-mono font-bold tabular-nums text-primary">
                            {numScore.toFixed(1)}%
                          </span>
                        </div>
                        <div className="w-full bg-secondary h-1.5 rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full ${
                              numScore >= 75
                                ? "bg-verified"
                                : numScore >= 50
                                ? "bg-warning"
                                : "bg-destructive"
                            }`}
                            style={{ width: `${Math.min(100, Math.max(5, numScore))}%` }}
                          />
                        </div>
                        <p className="text-[11px] text-muted-foreground leading-snug">
                          {friendlyDesc}
                        </p>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="divide-y divide-border/60 max-h-[460px] overflow-y-auto">
                  {reasoningSteps.map((step) => {
                    const badgeVariant =
                      step.status === "good"
                        ? "verified"
                        : step.status === "warning"
                        ? "warning"
                        : "destructive";
                    return (
                      <div key={step.step} className="px-5 py-3.5 flex flex-col gap-1.5">
                        <div className="flex items-start justify-between gap-2">
                          <span className="text-xs font-semibold text-foreground leading-snug">
                            {step.step}. {step.component}
                          </span>
                          <Badge
                            variant={badgeVariant}
                            className="font-mono tabular-nums shrink-0"
                          >
                            {Number(step.score).toFixed(0)}%
                          </Badge>
                        </div>
                        <p className="text-xs text-muted-foreground leading-relaxed">
                          {step.summary}
                        </p>
                      </div>
                    );
                  })}
                </div>
              )}
            </section>
          )}
        </aside>
      </div>

      {/* 3. Широкий блок споріднених публікацій в інших ЗМІ (за спаданням % схожості) */}
      <section className="rounded-2xl border border-border/85 bg-card overflow-hidden">
        <div className="px-6 sm:px-8 py-5 border-b border-border/75 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex flex-col gap-1 min-w-0">
            <h2 className="text-lg font-bold text-foreground flex items-center gap-2 tracking-tight">
              <Search className="size-5 text-primary shrink-0" />
              <span>Публікації на цю тему в інших ЗМІ</span>
            </h2>
            <p className="text-xs text-muted-foreground">
              Споріднені матеріали з незалежних редакцій, відсортовано за спаданням схожості
            </p>
          </div>
          <Badge variant="default" className="tabular-nums self-start sm:self-center">
            Незалежних ЗМІ: {sortedCorroborating.length}
          </Badge>
        </div>

        <div className="p-6 sm:p-8 flex flex-col gap-5">
          {tb.corroboration_summary && (
            <p className="text-sm text-foreground/90 leading-relaxed max-w-[82ch]">
              {tb.corroboration_summary}
            </p>
          )}

          {sortedCorroborating.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {sortedCorroborating.map((corr) => {
                const simPct = Math.round(corr.similarity * 100);
                const corrDate = corr.published_at
                  ? new Date(corr.published_at).toLocaleString("uk-UA", {
                      day: "numeric",
                      month: "short",
                      hour: "2-digit",
                      minute: "2-digit",
                    })
                  : null;

                return (
                  <div
                    key={corr.id}
                    className="min-w-0 rounded-xl bg-secondary/40 border border-border/75 hover:border-primary/45 transition-colors p-4 flex flex-col justify-between gap-3.5"
                  >
                    <div className="flex flex-col gap-2.5 min-w-0">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex flex-wrap items-center gap-1.5 min-w-0">
                          <span className="text-xs font-bold text-primary truncate">
                            {corr.source_name}
                          </span>
                          {corr.is_whitelisted && (
                            <Badge
                              variant="verified"
                              className="text-[10px] px-1.5 py-0"
                            >
                              ІМІ
                            </Badge>
                          )}
                        </div>
                        <Badge
                          variant={simPct >= 65 ? "verified" : "secondary"}
                          className="font-mono tabular-nums shrink-0"
                        >
                          {simPct}% схожості
                        </Badge>
                      </div>

                      <h3 className="text-sm font-semibold text-foreground leading-snug line-clamp-3 break-words">
                        {corr.title}
                      </h3>

                      {corrDate && (
                        <span className="text-[11px] text-muted-foreground tabular-nums inline-flex items-center gap-1">
                          <Clock className="size-3 shrink-0" />
                          {corrDate}
                        </span>
                      )}
                    </div>

                    <div className="pt-3 border-t border-border/65 flex items-center justify-between gap-2 text-xs tabular-nums">
                      <span className="text-muted-foreground">
                        Довіра:{" "}
                        <strong className="text-verified">
                          {corr.trust_score.toFixed(0)}%
                        </strong>
                      </span>
                      <div className="flex items-center gap-1.5">
                        <Button variant="secondary" size="xs" asChild className="whitespace-nowrap">
                          <Link href={`/news/${corr.id}`}>
                            <Eye className="size-3.5" data-icon="inline-start" />
                            Розбір
                          </Link>
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon-xs"
                          asChild
                          aria-label="Читати оригінал"
                        >
                          <a href={corr.url} target="_blank" rel="noopener noreferrer">
                            <ExternalLink className="size-3.5" />
                          </a>
                        </Button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <EmptyState
              icon={Search}
              title="Споріднених публікацій в інших ЗМІ поки не знайдено"
              description="Це може бути свіжа або ексклюзивна публікація, на яку ще немає матеріалів в інших редакціях."
            />
          )}
        </div>
      </section>

      {/* 4. Схожі новини з цієї ж рубрики */}
      {article.similar_articles && article.similar_articles.length > 0 && (
        <section className="flex flex-col gap-4 pt-1">
          <h2 className="text-lg font-bold text-foreground tracking-tight">
            Інші новини рубрики «{article.category}»
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {article.similar_articles.map((sim) => (
              <NewsCard key={sim.id} article={sim} />
            ))}
          </div>
        </section>
      )}
    </motion.div>
  );
}
