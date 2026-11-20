"use client";

import React, { useEffect, useState, useMemo, useCallback } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { motion } from "motion/react";
import { toast } from "sonner";
import { useAuth } from "@/context/AuthContext";
import { ArticleDetail, XAITokenContribution } from "@/types";
import { TrustBadge } from "@/components/TrustBadge";
import { NewsCard } from "@/components/NewsCard";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@/components/ui/card";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";
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
  Flag,
  Clock,
  Eye,
  FileText,
} from "lucide-react";

type HighlightMode = "all" | "heatmap" | "fake" | "real" | "none";

interface HighlightRule {
  phrase: string;
  type: "manipulation_phrase" | "fake_token" | "real_token";
  label: string;
  weight?: number;
}

const BUILTIN_MANIPULATION_PHRASES: Array<{ phrase: string; label: string }> = [
  { phrase: "терміново", label: "Штучне нагнітання терміновості (клікбейт)" },
  { phrase: "сенсація", label: "Штучна сенсаційність для привернення уваги" },
  { phrase: "шок", label: "Емоційний клікбейт-тригер" },
  { phrase: "шокуючі", label: "Емоційне перебільшення" },
  { phrase: "приховують", label: "Конспірологічний прийом про «приховану правду»" },
  { phrase: "спалахнула паніка", label: "Нагнітання штучної тривожності" },
  { phrase: "паніка", label: "Емоційний тиск на читача" },
  { phrase: "ви не повірите", label: "Клікбейт-пастка допитливості" },
  { phrase: "анонімні джерела", label: "Відсутність перевіреного джерела інформації" },
  { phrase: "інсайдери розкрили", label: "Непідтверджене посилання на анонімів" },
  { phrase: "тотальна катастрофа", label: "Гіперболізація та залякування" },
  { phrase: "зрада", label: "Емоційна поляризація" },
];

function ArticleDetailSkeleton() {
  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8 flex flex-col gap-8">
      <div className="flex items-center justify-between gap-4">
        <Skeleton className="h-9 w-48 rounded-xl" />
        <div className="flex items-center gap-2.5">
          <Skeleton className="h-9 w-40 rounded-xl" />
          <Skeleton className="h-9 w-44 rounded-xl" />
        </div>
      </div>

      <Card className="p-6 sm:p-8 flex flex-col gap-6">
        <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-6 pb-6 border-b border-border/70">
          <div className="flex flex-col gap-3 flex-1">
            <div className="flex items-center gap-2">
              <Skeleton className="h-6 w-28 rounded-full" />
              <Skeleton className="h-6 w-24 rounded-full" />
              <Skeleton className="h-5 w-44" />
            </div>
            <Skeleton className="h-9 w-11/12" />
            <Skeleton className="h-9 w-3/4" />
            <Skeleton className="h-4 w-52" />
          </div>
          <Skeleton className="h-24 w-48 rounded-2xl" />
        </div>
        <Skeleton className="h-20 w-full rounded-xl" />
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        <div className="lg:col-span-7">
          <Card className="p-6 flex flex-col gap-4">
            <Skeleton className="h-7 w-64" />
            <Skeleton className="w-full aspect-video rounded-xl" />
            <Skeleton className="h-5 w-full" />
            <Skeleton className="h-5 w-11/12" />
            <Skeleton className="h-5 w-4/5" />
            <Skeleton className="h-5 w-full" />
          </Card>
        </div>
        <div className="lg:col-span-5 flex flex-col gap-6">
          <Card className="p-6 flex flex-col gap-4">
            <Skeleton className="h-6 w-56" />
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-16 w-full rounded-xl" />
            ))}
          </Card>
        </div>
      </div>
    </div>
  );
}

export default function ArticleDetailPage() {
  const params = useParams();
  const articleId = params?.id as string;
  const { user, token, apiUrl } = useAuth();

  const [article, setArticle] = useState<ArticleDetail | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [isBookmarked, setIsBookmarked] = useState<boolean>(false);
  const [updatingBookmark, setUpdatingBookmark] = useState<boolean>(false);
  const [highlightMode, setHighlightMode] = useState<HighlightMode>("all");
  const [imgFailed, setImgFailed] = useState<boolean>(false);

  const fetchDetail = useCallback(async () => {
    if (!articleId) return;
    setLoading(true);
    setError(null);
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
    fetchDetail();
  }, [fetchDetail]);

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

    for (const item of BUILTIN_MANIPULATION_PHRASES) {
      const key = item.phrase.toLowerCase();
      if (!seen.has(key)) {
        seen.add(key);
        rules.push({
          phrase: item.phrase,
          type: "manipulation_phrase",
          label: item.label,
        });
      }
    }

    for (const marker of tb.manipulation_markers || []) {
      const quoted = marker.match(/[«"']([^»"']{3,35})[»"']/);
      if (quoted && quoted[1]) {
        const cleanPhrase = quoted[1].trim();
        const key = cleanPhrase.toLowerCase();
        if (!seen.has(key)) {
          seen.add(key);
          rules.push({
            phrase: cleanPhrase,
            type: "manipulation_phrase",
            label: marker,
          });
        }
      }
    }

    for (const tok of (tb.xai_top_tokens || []) as XAITokenContribution[]) {
      const cleanTok = (tok.token || "").trim();
      if (cleanTok.length < 3) continue;
      const key = cleanTok.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);

      const isFake = tok.direction === "fake_indicator";
      rules.push({
        phrase: cleanTok,
        type: isFake ? "fake_token" : "real_token",
        label: isFake
          ? "Слово, характерне для емоційних або сумнівних повідомлень"
          : "Слово, характерне для перевірених фактів та офіційних джерел",
        weight: tok.weight,
      });
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
    const regex = new RegExp(`(${escapedPatterns.join("|")})`, "gi");
    const parts = textBlock.split(regex);

    return parts.map((part, idx) => {
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

      const badgeLabel =
        matchedRule.type === "manipulation_phrase"
          ? "Маніпулятивний зворот"
          : isRisk
          ? "Емоційний тригер"
          : "Ознака фактажу";

      return (
        <Tooltip key={idx} delayDuration={80}>
          <TooltipTrigger asChild>
            <span
              tabIndex={0}
              className={`inline-block px-1.5 py-0.5 mx-0.5 rounded-md font-medium transition-colors cursor-help border-b-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                matchedRule.type === "manipulation_phrase"
                  ? "bg-destructive/20 text-foreground border-destructive hover:bg-destructive/30"
                  : isRisk
                  ? "bg-warning/15 text-foreground border-warning hover:bg-warning/25"
                  : "bg-verified/15 text-foreground border-verified hover:bg-verified/25"
              }`}
            >
              {part}
            </span>
          </TooltipTrigger>
          <TooltipContent side="top" className="flex flex-col gap-1.5 p-3 max-w-xs">
            <div className="flex items-center justify-between gap-2">
              <Badge variant={badgeVariant} className="text-[10px] px-2 py-0">
                {badgeLabel}
              </Badge>
              {typeof matchedRule.weight === "number" && (
                <span className="font-mono text-[10px] text-muted-foreground tabular-nums">
                  вага: {matchedRule.weight > 0 ? `+${matchedRule.weight.toFixed(2)}` : matchedRule.weight.toFixed(2)}
                </span>
              )}
            </div>
            <p className="text-xs text-popover-foreground leading-snug">
              {matchedRule.label}
            </p>
          </TooltipContent>
        </Tooltip>
      );
    });
  };

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

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.22 }}
      className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8 flex flex-col gap-8"
    >
      {/* Верхня навігаційна панель */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Button variant="outline" size="sm" asChild>
          <Link href="/">
            <ArrowLeft className="size-4 text-primary" data-icon="inline-start" />
            Назад до стрічки новин
          </Link>
        </Button>

        <div className="flex flex-wrap items-center gap-2.5">
          <Button
            variant={isBookmarked ? "default" : "outline"}
            size="sm"
            onClick={toggleBookmark}
            disabled={updatingBookmark}
          >
            <Bookmark
              className={`size-4 ${isBookmarked ? "fill-current" : ""}`}
              data-icon="inline-start"
            />
            {isBookmarked ? "У закладках" : "Зберегти в закладки"}
          </Button>

          <Button variant="secondary" size="sm" asChild>
            <a href={article.url} target="_blank" rel="noopener noreferrer">
              Читати на сайті видання
              <ExternalLink className="size-4" data-icon="inline-end" />
            </a>
          </Button>
        </div>
      </div>

      {/* 1. Головна шапка новини та підсумковий висновок Trust Score V4 */}
      <Card className="border-border/90 bg-card/95 shadow-lg">
        <CardHeader className="p-6 sm:p-8 pb-6 border-b border-border/75">
          <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-6">
            <div className="flex flex-col gap-3 max-w-3xl">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="default">
                  {article.language === "en" ? (
                    <>
                      <Globe className="size-3.5" />
                      Світ (EN)
                    </>
                  ) : (
                    <>
                      <Flag className="size-3.5" />
                      Україна (UA)
                    </>
                  )}
                </Badge>
                <Badge variant="secondary">{article.category}</Badge>
                <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Globe className="size-3.5 text-muted-foreground" />
                  <strong className="text-foreground">{article.source_name}</strong> (
                  <span className="font-mono">{article.domain}</span>)
                </span>
              </div>

              <CardTitle className="text-2xl sm:text-3xl font-extrabold text-foreground leading-tight tracking-tight">
                {renderHighlightedParagraph(article.title)}
              </CardTitle>

              <div className="flex flex-wrap items-center gap-4 text-xs text-muted-foreground pt-1 tabular-nums">
                <span className="inline-flex items-center gap-1.5">
                  <Clock className="size-3.5 text-muted-foreground" />
                  {formattedDate}
                </span>
                {article.author && (
                  <span className="inline-flex items-center gap-1.5">
                    Автор: <strong className="text-foreground">{article.author}</strong>
                  </span>
                )}
              </div>
            </div>

            <div className="flex flex-col sm:flex-row lg:flex-col items-start sm:items-center lg:items-end justify-between gap-3 shrink-0 bg-secondary/55 p-4 rounded-xl border border-border/80">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                Підсумковий індекс довіри
              </span>
              <TrustBadge score={tb.score} verdict={tb.verdict} size="lg" />
            </div>
          </div>
        </CardHeader>

        <CardContent className="p-6 sm:p-8 pt-6">
          <Alert variant="default" className="bg-primary/8 border-primary/25">
            <Fingerprint className="size-4 text-primary" />
            <AlertTitle className="text-primary">
              Висновок системи простими словами
            </AlertTitle>
            <AlertDescription className="text-sm text-foreground leading-relaxed mt-1">
              {tb.explanation}
            </AlertDescription>
          </Alert>
        </CardContent>
      </Card>

      {/* Основна двоколонкова сітка */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* ЛІВА КОЛОНКА (7 з 12): Повний текст статті з інтерактивним підсвічуванням */}
        <div className="lg:col-span-7 flex flex-col gap-6">
          <Card className="border-border/90 bg-card/90">
            <CardHeader className="p-6 sm:p-7 pb-4 border-b border-border/75">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex flex-col gap-1">
                  <CardTitle className="text-base sm:text-lg font-bold text-foreground flex items-center gap-2">
                    <FileText className="size-5 text-primary" />
                    Повний текст статті з XAI-підсвічуванням
                  </CardTitle>
                  <CardDescription className="text-xs text-muted-foreground">
                    Наведіть курсор на виділене слово або фразу, щоб переглянути пояснення ШІ
                  </CardDescription>
                </div>

                <div className="inline-flex flex-wrap p-1 rounded-xl bg-secondary/80 border border-border gap-1">
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
                      className="h-7 px-2.5 text-[11px]"
                    >
                      {modeItem.label}
                    </Button>
                  ))}
                </div>
              </div>
            </CardHeader>

            <CardContent className="p-6 sm:p-7 flex flex-col gap-5">
              {/* Легенда підсвічування */}
              {highlightMode !== "none" && highlightMode !== "heatmap" && (
                <div className="flex flex-wrap items-center gap-3 p-3 rounded-xl bg-secondary/50 border border-border/80 text-xs">
                  <span className="inline-flex items-center gap-1.5 text-verified">
                    <span className="size-3 rounded bg-verified/30 border-b-2 border-verified" />
                    Маркери фактажу та офіційних відомств
                  </span>
                  <span className="inline-flex items-center gap-1.5 text-warning">
                    <span className="size-3 rounded bg-warning/30 border-b-2 border-warning" />
                    Емоційне або сенсаційне забарвлення
                  </span>
                  <span className="inline-flex items-center gap-1.5 text-destructive">
                    <span className="size-3 rounded bg-destructive/30 border-b-2 border-destructive" />
                    Маніпулятивні звороти / клікбейт
                  </span>
                </div>
              )}

              {/* Зображення статті */}
              {article.image_url && !imgFailed && (
                <div className="relative w-full aspect-video rounded-xl overflow-hidden bg-secondary border border-border">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={article.image_url}
                    alt={article.title}
                    onError={() => setImgFailed(true)}
                    className="w-full h-full object-cover"
                  />
                </div>
              )}

              {/* Текст статті або Пореченкова теплова карта */}
              {highlightMode === "heatmap" &&
              tb.sentence_analysis &&
              tb.sentence_analysis.length > 0 ? (
                <div className="flex flex-col gap-3">
                  <Alert variant="default" className="bg-primary/8 border-primary/25">
                    <Sparkles className="size-4 text-primary" />
                    <AlertDescription className="text-xs text-foreground">
                      <strong>Пореченкова теплова карта достовірності:</strong> кожне речення оцінено окремо з урахуванням контексту та посилань на джерела.
                    </AlertDescription>
                  </Alert>

                  {tb.sentence_analysis.map((item) => {
                    const isGood = item.status === "factual";
                    const isBad = item.status === "manipulative";
                    return (
                      <div
                        key={item.index}
                        className={`p-3.5 rounded-xl border-l-4 border transition-colors flex flex-col gap-1.5 ${
                          isGood
                            ? "bg-verified/6 border-verified/25 border-l-verified"
                            : isBad
                            ? "bg-destructive/10 border-destructive/30 border-l-destructive"
                            : "bg-warning/8 border-warning/25 border-l-warning"
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                            {item.is_headline
                              ? "Заголовок матеріалу"
                              : `Речення #${item.index}`}
                          </span>
                          <Badge
                            variant={
                              isGood ? "verified" : isBad ? "destructive" : "warning"
                            }
                            className="font-mono tabular-nums"
                          >
                            {isGood
                              ? "Достовірно"
                              : isBad
                              ? "Ризик маніпуляції"
                              : "Нейтрально"}{" "}
                            • {Number(item.score).toFixed(0)}%
                          </Badge>
                        </div>
                        <p className="text-sm sm:text-base text-foreground leading-relaxed max-w-[68ch]">
                          {item.sentence}
                        </p>
                        <p className="text-xs text-muted-foreground italic">
                          Пояснення ШІ: {item.reason}
                        </p>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="flex flex-col gap-4 text-sm sm:text-base text-foreground leading-relaxed max-w-[68ch]">
                  {paragraphs.map((para, index) => (
                    <p key={index} className="leading-7">
                      {renderHighlightedParagraph(para)}
                    </p>
                  ))}
                </div>
              )}

              {/* Виявлені прийоми маніпуляцій */}
              {tb.manipulation_markers && tb.manipulation_markers.length > 0 && (
                <Alert variant="destructive">
                  <AlertTriangle className="size-4" />
                  <AlertTitle>
                    Виявлені стилістичні та емоційні тригери в тексті
                  </AlertTitle>
                  <AlertDescription className="mt-2 flex flex-wrap gap-2">
                    {tb.manipulation_markers.map((m, i) => (
                      <Badge key={i} variant="destructive">
                        {m}
                      </Badge>
                    ))}
                  </AlertDescription>
                </Alert>
              )}

              {/* Токени впливу */}
              {(realTokens.length > 0 || fakeTokens.length > 0) && (
                <div className="pt-4 border-t border-border/75 grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="p-4 rounded-xl bg-verified/6 border border-verified/25 flex flex-col gap-2">
                    <h4 className="text-xs font-bold text-verified flex items-center gap-1.5">
                      <CheckCircle2 className="size-4" />
                      Ознаки чесної новини (контекст фактів)
                    </h4>
                    {realTokens.length > 0 ? (
                      <div className="flex flex-wrap gap-1.5">
                        {realTokens.map((t, i) => (
                          <Badge key={i} variant="verified">
                            «{t.token}»
                          </Badge>
                        ))}
                      </div>
                    ) : (
                      <p className="text-xs text-muted-foreground">
                        Виражених офіційних маркерів не зафіксовано.
                      </p>
                    )}
                  </div>

                  <div className="p-4 rounded-xl bg-destructive/6 border border-destructive/25 flex flex-col gap-2">
                    <h4 className="text-xs font-bold text-destructive flex items-center gap-1.5">
                      <Sparkles className="size-4" />
                      Слова, що насторожують (ознаки емоцій/ризику)
                    </h4>
                    {fakeTokens.length > 0 ? (
                      <div className="flex flex-wrap gap-1.5">
                        {fakeTokens.map((t, i) => (
                          <Badge key={i} variant="destructive">
                            «{t.token}»
                          </Badge>
                        ))}
                      </div>
                    ) : (
                      <p className="text-xs text-muted-foreground">
                        Підозрілих або маніпулятивних слів не виявлено.
                      </p>
                    )}
                  </div>
                </div>
              )}

              {/* NER-детектор атрибуції */}
              {tb.attribution_analysis && (
                <div className="pt-4 border-t border-border/75 flex flex-col gap-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h4 className="text-xs sm:text-sm font-bold text-foreground flex items-center gap-2">
                      <ShieldCheck className="size-4 text-primary" />
                      Перевірка цитат і посилань на першоджерела (NER-детектор атрибуції)
                    </h4>
                    <Badge variant="default" className="font-mono tabular-nums">
                      Достовірність атрибуції:{" "}
                      {Number(tb.attribution_analysis.attribution_score || 70).toFixed(0)}%
                    </Badge>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {tb.attribution_analysis.summary}
                  </p>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="p-3.5 rounded-xl bg-secondary/50 border border-border flex flex-col gap-2">
                      <span className="text-[11px] font-bold text-verified">
                        Офіційні відомства та документальні джерела:
                      </span>
                      {tb.attribution_analysis.verified_entities &&
                      tb.attribution_analysis.verified_entities.length > 0 ? (
                        <div className="flex flex-wrap gap-1.5">
                          {tb.attribution_analysis.verified_entities.map((ent, idx) => (
                            <Badge key={idx} variant="verified">
                              <CheckCircle2 className="size-3" />
                              {ent}
                            </Badge>
                          ))}
                        </div>
                      ) : (
                        <p className="text-[11px] text-muted-foreground">
                          Прямих назв державних чи міжнародних інституцій у тексті не знайдено.
                        </p>
                      )}
                    </div>

                    <div className="p-3.5 rounded-xl bg-secondary/50 border border-border flex flex-col gap-2">
                      <span className="text-[11px] font-bold text-warning">
                        Псевдоцитати або анонімні посилання:
                      </span>
                      {tb.attribution_analysis.unverified_claims &&
                      tb.attribution_analysis.unverified_claims.length > 0 ? (
                        <div className="flex flex-wrap gap-1.5">
                          {tb.attribution_analysis.unverified_claims.map((claim, idx) => (
                            <Badge key={idx} variant="destructive">
                              <AlertTriangle className="size-3" />
                              {claim}
                            </Badge>
                          ))}
                        </div>
                      ) : (
                        <p className="text-[11px] text-muted-foreground">
                          Маніпулятивних посилань на «анонімних інсайдерів» чи чутки не виявлено.
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* ПРАВА КОЛОНКА (5 з 12): 5 факторів Trust Score V4 + Декомпозиція ШІ-моделей */}
        <div className="lg:col-span-5 flex flex-col gap-6">
          <Card className="border-border/90 bg-card/90">
            <CardHeader className="p-6 pb-4">
              <CardTitle className="text-base sm:text-lg font-bold text-foreground flex items-center gap-2">
                <ShieldCheck className="size-5 text-primary" />
                5 факторів оцінки Trust Score V4
              </CardTitle>
              <CardDescription className="text-xs text-muted-foreground tabular-nums">
                Внесок кожного критерію у підсумковий індекс довіри ({tb.score.toFixed(1)}%)
              </CardDescription>
            </CardHeader>

            <CardContent className="p-6 pt-0 flex flex-col gap-3.5">
              {/* Фактор 1 */}
              <div className="p-3.5 rounded-xl bg-secondary/55 border border-border/80 flex flex-col gap-1.5">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-semibold text-foreground">
                    1. Надійність сайту-джерела{" "}
                    <span className="text-muted-foreground">(вага 25%)</span>
                  </span>
                  <span className="font-mono font-bold tabular-nums text-verified">
                    {tb.source_reputation_score.toFixed(0)}%
                  </span>
                </div>
                <div className="w-full bg-muted h-2 rounded-full overflow-hidden">
                  <div
                    className="bg-verified h-full rounded-full"
                    style={{ width: `${tb.source_reputation_score}%` }}
                  />
                </div>
                <p className="text-[11px] text-muted-foreground">
                  Репутація видання за моніторингом Інституту масової інформації (ІМІ)
                </p>
              </div>

              {/* Фактор 2 */}
              <div className="p-3.5 rounded-xl bg-secondary/55 border border-border/80 flex flex-col gap-1.5">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-semibold text-foreground">
                    2. Спокійний тон без клікбейту{" "}
                    <span className="text-muted-foreground">(вага 20%)</span>
                  </span>
                  <span className="font-mono font-bold tabular-nums text-primary">
                    {tb.stylometry_score.toFixed(0)}%
                  </span>
                </div>
                <div className="w-full bg-muted h-2 rounded-full overflow-hidden">
                  <div
                    className="bg-primary h-full rounded-full"
                    style={{ width: `${tb.stylometry_score}%` }}
                  />
                </div>
                <p className="text-[11px] text-muted-foreground">
                  Відсутність кричущих заголовків, капслоку та емоційного залякування
                </p>
              </div>

              {/* Фактор 3 */}
              <div className="p-3.5 rounded-xl bg-secondary/55 border border-border/80 flex flex-col gap-1.5">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-semibold text-foreground">
                    3. Перевірка змісту ШІ{" "}
                    <span className="text-muted-foreground">(вага 35%)</span>
                  </span>
                  <span className="font-mono font-bold tabular-nums text-accent">
                    {tb.ml_authenticity_score.toFixed(0)}%
                  </span>
                </div>
                <div className="w-full bg-muted h-2 rounded-full overflow-hidden">
                  <div
                    className="bg-accent h-full rounded-full"
                    style={{ width: `${tb.ml_authenticity_score}%` }}
                  />
                </div>
                <p className="text-[11px] text-muted-foreground">
                  Спільна оцінка трьох мовних моделей на схожість із правдивими новинами
                </p>
              </div>

              {/* Фактор 4 */}
              <div className="p-3.5 rounded-xl bg-secondary/55 border border-border/80 flex flex-col gap-1.5">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-semibold text-foreground">
                    4. Підтвердження в інших ЗМІ{" "}
                    <span className="text-muted-foreground">(вага 20%)</span>
                  </span>
                  <span className="font-mono font-bold tabular-nums text-primary">
                    {tb.corroboration_score.toFixed(0)}%
                  </span>
                </div>
                <div className="w-full bg-muted h-2 rounded-full overflow-hidden">
                  <div
                    className="bg-primary h-full rounded-full"
                    style={{ width: `${tb.corroboration_score}%` }}
                  />
                </div>
                <p className="text-[11px] text-muted-foreground">
                  Крос-верифікація події в інших незалежних редакціях через pgvector
                </p>
              </div>

              {/* Фактор 5 */}
              <div
                className={`p-3.5 rounded-xl border flex flex-col gap-1 ${
                  tb.fact_check_flag
                    ? "bg-destructive/10 border-destructive/30"
                    : "bg-verified/8 border-verified/25"
                }`}
              >
                <div className="flex items-center justify-between text-xs">
                  <span className="font-semibold text-foreground">
                    5. База фактчекерів (StopFake / VoxCheck)
                  </span>
                  <Badge variant={tb.fact_check_flag ? "destructive" : "verified"}>
                    {tb.fact_check_flag ? "Виявлено спростування" : "Фейків не знайдено"}
                  </Badge>
                </div>
                <p className="text-[11px] text-muted-foreground">
                  {tb.fact_check_flag
                    ? "У базі українських фактчекерів знайдено спростування схожого твердження."
                    : "Твердження статті не збігаються з жодним відомим фейком у базі спростувань."}
                </p>
              </div>
            </CardContent>
          </Card>

          {/* 3. Декомпозиція моделей ШІ */}
          {tb.models_breakdown && Object.keys(tb.models_breakdown).length > 0 && (
            <Card className="border-border/90 bg-card/90">
              <CardHeader className="p-6 pb-4">
                <CardTitle className="text-base sm:text-lg font-bold text-foreground flex items-center gap-2">
                  <PieChart className="size-5 text-primary" />
                  Декомпозиція оцінок ШІ-моделей
                </CardTitle>
                <CardDescription className="text-xs text-muted-foreground">
                  Як кожен із трьох незалежних ШІ-експертів оцінив достовірність тексту
                </CardDescription>
              </CardHeader>

              <CardContent className="p-6 pt-0 flex flex-col gap-3">
                {Object.entries(tb.models_breakdown).map(([modelKey, scoreVal]) => {
                  const numScore = Number(scoreVal);
                  const friendlyTitle =
                    modelKey === "ukr_roberta_base" || modelKey === "ukr-roberta-base"
                      ? "Український мовний ШІ (ukr-roberta)"
                      : modelKey === "xlm_roberta_base" || modelKey === "xlm-roberta-base"
                      ? "Міжнародний мовний ШІ (XLM-RoBERTa)"
                      : "Гібридний детектор фейків (Ensemble)";

                  const friendlyDesc =
                    modelKey === "ukr_roberta_base" || modelKey === "ukr-roberta-base"
                      ? "Спеціалізована нейромережа, навчена на корпусі українських новин та вкидів"
                      : modelKey === "xlm_roberta_base" || modelKey === "xlm-roberta-base"
                      ? "Багатомовна модель, що звіряє структуру тексту зі світовими стандартами"
                      : "Статистичний класифікатор лексичних та стилометричних патернів";

                  return (
                    <div
                      key={modelKey}
                      className="p-3.5 rounded-xl bg-secondary/55 border border-border/80 flex flex-col gap-2"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs font-semibold text-foreground">
                          {friendlyTitle}
                        </span>
                        <span className="text-xs font-mono font-bold tabular-nums text-primary">
                          {numScore.toFixed(1)}%
                        </span>
                      </div>
                      <div className="w-full bg-muted h-2 rounded-full overflow-hidden">
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
              </CardContent>
            </Card>
          )}

          {/* Покроковий 5-рівневий аудит */}
          {tb.xai_reasoning_steps && tb.xai_reasoning_steps.length > 0 && (
            <Card className="border-border/90 bg-card/90">
              <CardHeader className="p-6 pb-4">
                <CardTitle className="text-sm font-bold text-foreground flex items-center gap-2">
                  <ShieldCheck className="size-4 text-verified" />
                  Покроковий XAI-протокол перевірки
                </CardTitle>
              </CardHeader>
              <CardContent className="p-6 pt-0 flex flex-col gap-2.5">
                {tb.xai_reasoning_steps.map((step) => {
                  const badgeVariant =
                    step.status === "good"
                      ? "verified"
                      : step.status === "warning"
                      ? "warning"
                      : "destructive";
                  return (
                    <div
                      key={step.step}
                      className="p-3.5 rounded-xl bg-secondary/55 border border-border/80 flex flex-col gap-1.5"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs font-semibold text-foreground">
                          Крок {step.step}. {step.component}
                        </span>
                        <Badge
                          variant={badgeVariant}
                          className="font-mono tabular-nums"
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
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      {/* 4. Блок крос-верифікації */}
      <Card className="border-border/90 bg-card/90">
        <CardHeader className="p-6 sm:p-8 pb-4 border-b border-border/75">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex flex-col gap-1">
              <CardTitle className="text-lg sm:text-xl font-bold text-foreground flex items-center gap-2">
                <Search className="size-5 text-primary" />
                Висвітлення цієї події іншими ЗМІ (Крос-верифікація)
              </CardTitle>
              <CardDescription className="text-xs text-muted-foreground">
                Семантичний пошук споріднених публікацій у незалежних редакціях за допомогою векторної бази pgvector та моделі MiniLM-L12-v2
              </CardDescription>
            </div>
            <Badge variant="default" className="tabular-nums self-start sm:self-center">
              Незалежних підтверджень: {tb.corroborating_articles?.length || 0}
            </Badge>
          </div>
        </CardHeader>

        <CardContent className="p-6 sm:p-8 flex flex-col gap-5">
          {tb.corroboration_summary && (
            <div className="p-4 rounded-xl bg-secondary/50 border border-border/80 text-sm text-foreground">
              {tb.corroboration_summary}
            </div>
          )}

          {tb.corroborating_articles && tb.corroborating_articles.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {tb.corroborating_articles.map((corr) => (
                <Card
                  key={corr.id}
                  className="p-4 bg-secondary/45 border-border/80 hover:border-primary/40 transition-colors flex flex-col justify-between gap-3"
                >
                  <div className="flex flex-col gap-2">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-bold text-primary flex items-center gap-1.5">
                        {corr.source_name}
                        {corr.is_whitelisted && (
                          <Badge variant="verified" className="text-[10px] px-1.5 py-0">
                            Білий список ІМІ
                          </Badge>
                        )}
                      </span>
                      <Badge variant="outline" className="font-mono tabular-nums">
                        {(corr.similarity * 100).toFixed(0)}%
                      </Badge>
                    </div>

                    <h4 className="text-sm font-semibold text-foreground leading-snug line-clamp-2">
                      {corr.title}
                    </h4>
                  </div>

                  <div className="pt-3 border-t border-border/70 flex items-center justify-between gap-2 text-xs tabular-nums">
                    <span className="text-muted-foreground">
                      Довіра:{" "}
                      <strong className="text-verified">
                        {corr.trust_score.toFixed(0)}%
                      </strong>
                    </span>
                    <div className="flex items-center gap-1.5">
                      <Button variant="secondary" size="xs" asChild>
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
                </Card>
              ))}
            </div>
          ) : (
            <EmptyState
              icon={Search}
              title="Інших публікацій про цю подію ще не зафіксовано"
              description="Це може бути свіжа або ексклюзивна публікація, яка ще очікує підтвердження в інших редакціях."
            />
          )}
        </CardContent>
      </Card>

      {/* Схожі новини з цієї ж рубрики */}
      {article.similar_articles && article.similar_articles.length > 0 && (
        <section className="flex flex-col gap-4 pt-2">
          <h2 className="text-lg sm:text-xl font-bold text-foreground">
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
