"use client";

import React, { useEffect, useState, useMemo } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/context/AuthContext";
import { ArticleDetail, XAITokenContribution } from "@/types";
import { TrustBadge } from "@/components/TrustBadge";
import { NewsCard } from "@/components/NewsCard";
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
  RefreshCw,
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

  useEffect(() => {
    if (!articleId) return;
    let active = true;

    const fetchDetail = async () => {
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
        if (active) {
          setArticle(data);
          setIsBookmarked(Boolean(data.is_bookmarked));
        }
      } catch (err: any) {
        if (active) {
          setError(err.message || "Помилка завантаження статті");
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    };

    fetchDetail();
    return () => {
      active = false;
    };
  }, [articleId, apiUrl, token]);

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
        setIsBookmarked(!isBookmarked);
      }
    } catch (e) {
      console.error("Помилка оновлення закладки", e);
    } finally {
      setUpdatingBookmark(false);
    }
  };

  // Формуємо правила підсвічування фраз і тригерних токенів у тексті статті
  const highlightRules = useMemo<HighlightRule[]>(() => {
    if (!article?.trust_breakdown) return [];
    const tb = article.trust_breakdown;
    const rules: HighlightRule[] = [];
    const seen = new Set<string>();

    // 1. Вбудовані маніпулятивні фрази
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

    // 2. Витягуємо фрази у лапках із manipulation_markers
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

    // 3. Додаємо XAI-токени (слова фактів та слова ризику)
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

    // Сортуємо від довших фраз до коротших, щоб багатослівні вирази підсвічувалися цілком
    rules.sort((a, b) => b.phrase.length - a.phrase.length);
    return rules;
  }, [article]);

  // Функція безпечної розмітки абзацу з підсвічуванням знайдених фраз і токенів
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

      return (
        <span
          key={idx}
          title={matchedRule.label}
          className={`inline-block px-1.5 py-0.5 mx-0.5 rounded-md font-medium transition-colors cursor-help border-b-2 ${
            matchedRule.type === "manipulation_phrase"
              ? "bg-rose-500/20 text-rose-200 border-rose-400"
              : isRisk
              ? "bg-amber-500/15 text-amber-200 border-amber-400/80"
              : "bg-emerald-500/15 text-emerald-200 border-emerald-400/80"
          }`}
        >
          {part}
        </span>
      );
    });
  };

  if (loading) {
    return (
      <div className="max-w-6xl mx-auto px-4 py-24 flex flex-col items-center justify-center text-zinc-400 space-y-4">
        <RefreshCw className="w-9 h-9 animate-spin text-cyan-400" />
        <p className="text-sm font-medium">
          Формуємо повний XAI-розбір статті та крос-верифікацію по незалежних ЗМІ...
        </p>
      </div>
    );
  }

  if (error || !article) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-20 text-center space-y-4">
        <div className="w-12 h-12 rounded-2xl bg-rose-500/10 border border-rose-500/20 mx-auto flex items-center justify-center text-rose-400">
          <AlertTriangle className="w-6 h-6" />
        </div>
        <h2 className="text-xl font-bold text-white">
          {error || "Статтю не знайдено"}
        </h2>
        <Link
          href="/"
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-sm font-semibold text-zinc-200 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          Повернутися до стрічки новин
        </Link>
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
    <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
      {/* Верхня навігаційна панель */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link
          href="/"
          className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-zinc-900 border border-zinc-800 text-xs sm:text-sm font-semibold text-zinc-300 hover:text-white hover:border-zinc-700 transition-colors"
        >
          <ArrowLeft className="w-4 h-4 text-cyan-400" />
          <span>Назад до стрічки новин</span>
        </Link>

        <div className="flex items-center gap-2.5">
          <button
            type="button"
            onClick={toggleBookmark}
            disabled={updatingBookmark}
            className={`inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs sm:text-sm font-semibold border transition-all ${
              isBookmarked
                ? "bg-cyan-500/15 text-cyan-300 border-cyan-500/40"
                : "bg-zinc-900 text-zinc-300 border-zinc-800 hover:text-white hover:border-zinc-700"
            }`}
          >
            <Bookmark className={`w-4 h-4 ${isBookmarked ? "fill-cyan-400" : ""}`} />
            <span>{isBookmarked ? "У закладках" : "Зберегти в закладки"}</span>
          </button>

          <a
            href={article.url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-xs sm:text-sm font-semibold text-cyan-400 transition-colors"
          >
            <span>Читати на сайті видання</span>
            <ExternalLink className="w-4 h-4" />
          </a>
        </div>
      </div>

      {/* 1. Головна шапка новини та підсумковий висновок Trust Score V4 */}
      <section className="rounded-3xl border border-zinc-800 bg-zinc-900/75 p-6 sm:p-8 backdrop-blur-xl shadow-2xl space-y-6">
        <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-6 border-b border-zinc-800/90 pb-6">
          <div className="space-y-3 max-w-3xl">
            <div className="flex flex-wrap items-center gap-2">
              <span className="px-2.5 py-1 rounded-lg text-xs font-bold bg-cyan-500/15 text-cyan-300 border border-cyan-500/30">
                {article.language === "en" ? "🌍 Світ (EN)" : "🇺🇦 Україна"}
              </span>
              <span className="px-2.5 py-1 rounded-lg text-xs font-semibold bg-zinc-800 text-zinc-300 border border-zinc-700/70">
                {article.category}
              </span>
              <span className="inline-flex items-center gap-1 text-xs text-zinc-400">
                <Globe className="w-3.5 h-3.5 text-zinc-500" />
                <strong className="text-zinc-200">{article.source_name}</strong> ({article.domain})
              </span>
            </div>

            <h1 className="text-2xl sm:text-3xl font-extrabold text-white leading-tight">
              {renderHighlightedParagraph(article.title)}
            </h1>

            <div className="flex flex-wrap items-center gap-4 text-xs text-zinc-400 pt-1">
              <span className="inline-flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5 text-zinc-500" />
                {formattedDate}
              </span>
              {article.author && (
                <span className="inline-flex items-center gap-1.5">
                  Автор: <strong className="text-zinc-300">{article.author}</strong>
                </span>
              )}
            </div>
          </div>

          <div className="flex flex-col sm:flex-row lg:flex-col items-start sm:items-center lg:items-end justify-between gap-3 flex-shrink-0 bg-zinc-950/70 p-4 rounded-2xl border border-zinc-800/80">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-zinc-400">
              Підсумковий рейтинг довіри
            </span>
            <TrustBadge score={tb.score} verdict={tb.verdict} size="lg" />
          </div>
        </div>

        {/* Короткий висновок простими словами */}
        <div className="p-5 rounded-2xl bg-cyan-500/5 border border-cyan-500/20 space-y-2">
          <h3 className="text-sm font-bold text-cyan-300 flex items-center gap-2">
            <Fingerprint className="w-4 h-4 text-cyan-400" />
            Висновок системи простими словами:
          </h3>
          <p className="text-sm text-zinc-200 leading-relaxed">{tb.explanation}</p>
        </div>
      </section>

      {/* Основна двоколонкова сітка: Ліворуч — Повний текст з XAI-підсвіткою, Праворуч — Візуалізація Trust Score V4 та Моделей */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* ЛІВА КОЛОНКА (7 з 12): Повний текст статті з інтерактивним підсвічуванням фраз і токенів */}
        <div className="lg:col-span-7 space-y-6">
          <section className="rounded-3xl border border-zinc-800 bg-zinc-900/70 p-6 sm:p-7 space-y-5">
            {/* Панель керування підсвічуванням у тексті */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-zinc-800 pb-4">
              <div className="space-y-1">
                <h2 className="text-base sm:text-lg font-bold text-white flex items-center gap-2">
                  <FileText className="w-5 h-5 text-cyan-400" />
                  Повний текст статті з підсвічуванням ШІ
                </h2>
                <p className="text-xs text-zinc-400">
                  Наведіть курсор на виділене слово або фразу, щоб побачити пояснення ШІ
                </p>
              </div>

              {/* Перемикач режимів підсвітки */}
              <div className="inline-flex flex-wrap p-1 rounded-xl bg-zinc-950 border border-zinc-800 gap-1">
                <button
                  type="button"
                  onClick={() => setHighlightMode("all")}
                  className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold transition-colors ${
                    highlightMode === "all"
                      ? "bg-zinc-800 text-white"
                      : "text-zinc-400 hover:text-zinc-200"
                  }`}
                >
                  Усі мітки
                </button>
                <button
                  type="button"
                  onClick={() => setHighlightMode("heatmap")}
                  className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold transition-colors ${
                    highlightMode === "heatmap"
                      ? "bg-cyan-500/20 text-cyan-300 border border-cyan-500/30"
                      : "text-zinc-400 hover:text-zinc-200"
                  }`}
                >
                  Пореченкова карта
                </button>
                <button
                  type="button"
                  onClick={() => setHighlightMode("real")}
                  className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold transition-colors ${
                    highlightMode === "real"
                      ? "bg-emerald-500/20 text-emerald-300"
                      : "text-zinc-400 hover:text-zinc-200"
                  }`}
                >
                  Ознаки фактів
                </button>
                <button
                  type="button"
                  onClick={() => setHighlightMode("fake")}
                  className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold transition-colors ${
                    highlightMode === "fake"
                      ? "bg-rose-500/20 text-rose-300"
                      : "text-zinc-400 hover:text-zinc-200"
                  }`}
                >
                  Ознаки ризику
                </button>
                <button
                  type="button"
                  onClick={() => setHighlightMode("none")}
                  className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold transition-colors ${
                    highlightMode === "none"
                      ? "bg-zinc-800 text-white"
                      : "text-zinc-400 hover:text-zinc-200"
                  }`}
                >
                  Чистий текст
                </button>
              </div>
            </div>

            {/* Кольорова підказка (легенда) */}
            {highlightMode !== "none" && highlightMode !== "heatmap" && (
              <div className="flex flex-wrap items-center gap-3 p-3 rounded-2xl bg-zinc-950/80 border border-zinc-800/80 text-xs">
                <span className="inline-flex items-center gap-1.5 text-emerald-300">
                  <span className="w-3 h-3 rounded bg-emerald-500/30 border-b-2 border-emerald-400" />
                  Слова, характерні для спокійних фактів та офіційних відомств
                </span>
                <span className="inline-flex items-center gap-1.5 text-amber-300">
                  <span className="w-3 h-3 rounded bg-amber-500/30 border-b-2 border-amber-400" />
                  Слова емоційного або сенсаційного забарвлення
                </span>
                <span className="inline-flex items-center gap-1.5 text-rose-300">
                  <span className="w-3 h-3 rounded bg-rose-500/30 border-b-2 border-rose-400" />
                  Маніпулятивні звороти / клікбейт
                </span>
              </div>
            )}

            {/* Зображення статті, якщо є */}
            {article.image_url && !imgFailed && (
              <div className="relative w-full aspect-video rounded-2xl overflow-hidden bg-zinc-950 border border-zinc-800">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={article.image_url}
                  alt={article.title}
                  onError={() => setImgFailed(true)}
                  className="w-full h-full object-cover"
                />
              </div>
            )}

            {/* Абзаци повного тексту статті АБО Пореченкова теплова карта (Sentence-Level Heatmap) */}
            {highlightMode === "heatmap" && tb.sentence_analysis && tb.sentence_analysis.length > 0 ? (
              <div className="space-y-3">
                <div className="p-3 rounded-2xl bg-cyan-500/5 border border-cyan-500/20 text-xs text-cyan-200 flex items-center justify-between gap-2">
                  <span>
                    <strong>Пореченкова теплова карта достовірності (Sentence-Level Saliency):</strong> кожне речення оцінено окремо з урахуванням контексту та посилань на джерела.
                  </span>
                </div>
                {tb.sentence_analysis.map((item) => {
                  const isGood = item.status === "factual";
                  const isBad = item.status === "manipulative";
                  return (
                    <div
                      key={item.index}
                      className={`p-3.5 rounded-2xl border-l-4 border transition-all space-y-1.5 ${
                        isGood
                          ? "bg-emerald-500/5 border-emerald-500/25 border-l-emerald-400"
                          : isBad
                          ? "bg-rose-500/10 border-rose-500/30 border-l-rose-400"
                          : "bg-amber-500/5 border-amber-500/20 border-l-amber-400"
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-[11px] font-bold uppercase tracking-wider text-zinc-400">
                          {item.is_headline ? "Заголовок матеріалу" : `Речення #${item.index}`}
                        </span>
                        <span
                          className={`px-2 py-0.5 rounded-lg text-[11px] font-mono font-bold border ${
                            isGood
                              ? "bg-emerald-500/15 text-emerald-300 border-emerald-500/30"
                              : isBad
                              ? "bg-rose-500/20 text-rose-300 border-rose-500/40"
                              : "bg-amber-500/15 text-amber-300 border-amber-500/30"
                          }`}
                        >
                          {isGood ? "Достовірно" : isBad ? "Ризик маніпуляції" : "Нейтрально"} • {Number(item.score).toFixed(0)}%
                        </span>
                      </div>
                      <p className="text-sm sm:text-base text-zinc-100 leading-relaxed">
                        {item.sentence}
                      </p>
                      <p className="text-xs text-zinc-400 italic">
                        Пояснення ШІ: {item.reason}
                      </p>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="space-y-4 text-sm sm:text-base text-zinc-200 leading-relaxed font-normal">
                {paragraphs.map((para, index) => (
                  <p key={index} className="leading-7">
                    {renderHighlightedParagraph(para)}
                  </p>
                ))}
              </div>
            )}

            {/* Виявлені прийоми маніпуляцій (якщо є) */}
            {tb.manipulation_markers && tb.manipulation_markers.length > 0 && (
              <div className="p-4 rounded-2xl bg-rose-500/5 border border-rose-500/25 space-y-2.5">
                <h4 className="text-xs font-bold text-rose-300 flex items-center gap-1.5">
                  <AlertTriangle className="w-4 h-4 text-rose-400" />
                  Виявлені стилістичні та емоційні тригери в тексті:
                </h4>
                <div className="flex flex-wrap gap-2">
                  {tb.manipulation_markers.map((m, i) => (
                    <span
                      key={i}
                      className="px-3 py-1 rounded-xl text-xs font-medium bg-rose-500/10 text-rose-200 border border-rose-500/30"
                    >
                      {m}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Згрупований список ключових токенів впливу (Контекстний XAI) */}
            {(realTokens.length > 0 || fakeTokens.length > 0) && (
              <div className="pt-4 border-t border-zinc-800 grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="p-4 rounded-2xl bg-emerald-500/5 border border-emerald-500/20 space-y-2">
                  <h4 className="text-xs font-bold text-emerald-300 flex items-center gap-1.5">
                    <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                    Ознаки чесної новини (контекст фактів):
                  </h4>
                  {realTokens.length > 0 ? (
                    <div className="flex flex-wrap gap-1.5">
                      {realTokens.map((t, i) => (
                        <span
                          key={i}
                          className="px-2.5 py-1 rounded-lg text-xs font-medium bg-emerald-500/10 text-emerald-200 border border-emerald-500/30"
                        >
                          «{t.token}»
                        </span>
                      ))}
                    </div>
                  ) : (
                    <p className="text-xs text-zinc-400">
                      Виражених офіційних маркерів не зафіксовано.
                    </p>
                  )}
                </div>

                <div className="p-4 rounded-2xl bg-rose-500/5 border border-rose-500/20 space-y-2">
                  <h4 className="text-xs font-bold text-rose-300 flex items-center gap-1.5">
                    <Sparkles className="w-4 h-4 text-rose-400" />
                    Слова, що насторожують (ознаки емоцій/ризику):
                  </h4>
                  {fakeTokens.length > 0 ? (
                    <div className="flex flex-wrap gap-1.5">
                      {fakeTokens.map((t, i) => (
                        <span
                          key={i}
                          className="px-2.5 py-1 rounded-lg text-xs font-medium bg-rose-500/10 text-rose-200 border border-rose-500/30"
                        >
                          «{t.token}»
                        </span>
                      ))}
                    </div>
                  ) : (
                    <p className="text-xs text-zinc-400">
                      Підозрілих або маніпулятивних слів не виявлено.
                    </p>
                  )}
                </div>
              </div>
            )}

            {/* Блок NER-аналізу цитат та верифікації джерел у тексті (Пункт 4) */}
            {tb.attribution_analysis && (
              <div className="pt-4 border-t border-zinc-800 space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <h4 className="text-xs sm:text-sm font-bold text-white flex items-center gap-2">
                    <ShieldCheck className="w-4 h-4 text-cyan-400" />
                    Перевірка цитат і посилань на першоджерела (NER-детектор атрибуції)
                  </h4>
                  <span className="px-2.5 py-0.5 rounded-lg text-xs font-mono font-bold bg-cyan-500/10 text-cyan-300 border border-cyan-500/30">
                    Достовірність атрибуції: {Number(tb.attribution_analysis.attribution_score || 70).toFixed(0)}%
                  </span>
                </div>
                <p className="text-xs text-zinc-300">
                  {tb.attribution_analysis.summary}
                </p>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="p-3 rounded-2xl bg-zinc-950/80 border border-zinc-800 space-y-1.5">
                    <span className="text-[11px] font-bold text-emerald-300 block">
                      Офіційні відомства та документальні джерела:
                    </span>
                    {tb.attribution_analysis.verified_entities &&
                    tb.attribution_analysis.verified_entities.length > 0 ? (
                      <div className="flex flex-wrap gap-1.5">
                        {tb.attribution_analysis.verified_entities.map((ent, idx) => (
                          <span
                            key={idx}
                            className="px-2 py-0.5 rounded-md text-[11px] bg-emerald-500/15 text-emerald-200 border border-emerald-500/30"
                          >
                            ✓ {ent}
                          </span>
                        ))}
                      </div>
                    ) : (
                      <p className="text-[11px] text-zinc-400">
                        Прямих назв державних чи міжнародних інституцій у тексті не знайдено.
                      </p>
                    )}
                  </div>

                  <div className="p-3 rounded-2xl bg-zinc-950/80 border border-zinc-800 space-y-1.5">
                    <span className="text-[11px] font-bold text-amber-300 block">
                      Псевдоцитати або анонімні посилання:
                    </span>
                    {tb.attribution_analysis.unverified_claims &&
                    tb.attribution_analysis.unverified_claims.length > 0 ? (
                      <div className="flex flex-wrap gap-1.5">
                        {tb.attribution_analysis.unverified_claims.map((claim, idx) => (
                          <span
                            key={idx}
                            className="px-2 py-0.5 rounded-md text-[11px] bg-rose-500/15 text-rose-200 border border-rose-500/30"
                          >
                            ⚠ {claim}
                          </span>
                        ))}
                      </div>
                    ) : (
                      <p className="text-[11px] text-zinc-400">
                        Маніпулятивних посилань на «анонімних інсайдерів» чи чутки не виявлено.
                      </p>
                    )}
                  </div>
                </div>
              </div>
            )}
          </section>
        </div>

        {/* ПРАВА КОЛОНКА (5 з 12): Візуалізація 5 факторів Trust Score V4 + Декомпозиція ШІ-моделей */}
        <div className="lg:col-span-5 space-y-6">
          {/* 2. Візуалізація 5 факторів Trust Score V4 */}
          <section className="rounded-3xl border border-zinc-800 bg-zinc-900/70 p-6 space-y-5">
            <div className="space-y-1">
              <h2 className="text-base sm:text-lg font-bold text-white flex items-center gap-2">
                <ShieldCheck className="w-5 h-5 text-cyan-400" />
                5 факторів оцінки Trust Score V4
              </h2>
              <p className="text-xs text-zinc-400">
                Як кожен критерій вплинув на підсумковий індекс довіри ({tb.score.toFixed(1)}%)
              </p>
            </div>

            <div className="space-y-3.5">
              {/* Фактор 1 */}
              <div className="p-3.5 rounded-2xl bg-zinc-950/70 border border-zinc-800/80 space-y-1.5">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-semibold text-zinc-200">
                    1. Надійність сайту-джерела <span className="text-zinc-500">(вага 25%)</span>
                  </span>
                  <span className="font-mono font-bold text-emerald-400">
                    {tb.source_reputation_score.toFixed(0)}%
                  </span>
                </div>
                <div className="w-full bg-zinc-800 h-2 rounded-full overflow-hidden">
                  <div
                    className="bg-emerald-500 h-full rounded-full"
                    style={{ width: `${tb.source_reputation_score}%` }}
                  />
                </div>
                <p className="text-[11px] text-zinc-400">
                  Репутація видання за моніторингом Інституту масової інформації (ІМІ)
                </p>
              </div>

              {/* Фактор 2 */}
              <div className="p-3.5 rounded-2xl bg-zinc-950/70 border border-zinc-800/80 space-y-1.5">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-semibold text-zinc-200">
                    2. Спокійний тон без клікбейту <span className="text-zinc-500">(вага 20%)</span>
                  </span>
                  <span className="font-mono font-bold text-cyan-400">
                    {tb.stylometry_score.toFixed(0)}%
                  </span>
                </div>
                <div className="w-full bg-zinc-800 h-2 rounded-full overflow-hidden">
                  <div
                    className="bg-cyan-500 h-full rounded-full"
                    style={{ width: `${tb.stylometry_score}%` }}
                  />
                </div>
                <p className="text-[11px] text-zinc-400">
                  Відсутність кричущих заголовків, КАПСЛОКУ та залякування
                </p>
              </div>

              {/* Фактор 3 */}
              <div className="p-3.5 rounded-2xl bg-zinc-950/70 border border-zinc-800/80 space-y-1.5">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-semibold text-zinc-200">
                    3. Перевірка змісту ШІ <span className="text-zinc-500">(вага 35%)</span>
                  </span>
                  <span className="font-mono font-bold text-indigo-400">
                    {tb.ml_authenticity_score.toFixed(0)}%
                  </span>
                </div>
                <div className="w-full bg-zinc-800 h-2 rounded-full overflow-hidden">
                  <div
                    className="bg-indigo-500 h-full rounded-full"
                    style={{ width: `${tb.ml_authenticity_score}%` }}
                  />
                </div>
                <p className="text-[11px] text-zinc-400">
                  Спільна оцінка трьох мовних моделей на схожість із правдивими новинами
                </p>
              </div>

              {/* Фактор 4 */}
              <div className="p-3.5 rounded-2xl bg-zinc-950/70 border border-zinc-800/80 space-y-1.5">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-semibold text-zinc-200">
                    4. Підтвердження в інших ЗМІ <span className="text-zinc-500">(вага 20%)</span>
                  </span>
                  <span className="font-mono font-bold text-purple-400">
                    {tb.corroboration_score.toFixed(0)}%
                  </span>
                </div>
                <div className="w-full bg-zinc-800 h-2 rounded-full overflow-hidden">
                  <div
                    className="bg-purple-500 h-full rounded-full"
                    style={{ width: `${tb.corroboration_score}%` }}
                  />
                </div>
                <p className="text-[11px] text-zinc-400">
                  Крос-верифікація події в інших незалежних редакціях через pgvector
                </p>
              </div>

              {/* Фактор 5 */}
              <div
                className={`p-3.5 rounded-2xl border space-y-1 ${
                  tb.fact_check_flag
                    ? "bg-rose-500/10 border-rose-500/30"
                    : "bg-emerald-500/5 border-emerald-500/20"
                }`}
              >
                <div className="flex items-center justify-between text-xs">
                  <span className="font-semibold text-zinc-200">
                    5. База фактчекерів (StopFake / VoxCheck)
                  </span>
                  <span
                    className={`font-bold ${
                      tb.fact_check_flag ? "text-rose-400" : "text-emerald-400"
                    }`}
                  >
                    {tb.fact_check_flag ? "Виявлено спростування!" : "Фейків не знайдено"}
                  </span>
                </div>
                <p className="text-[11px] text-zinc-400">
                  {tb.fact_check_flag
                    ? "У базі українських фактчекерів знайдено спростування схожого твердження."
                    : "Твердження статті не збігаються з жодним відомим фейком у базі спростувань."}
                </p>
              </div>
            </div>
          </section>

          {/* 3. Декомпозиція моделей ШІ (ukr-roberta-base vs xlm-roberta-base vs Ensemble) */}
          {tb.models_breakdown && Object.keys(tb.models_breakdown).length > 0 && (
            <section className="rounded-3xl border border-zinc-800 bg-zinc-900/70 p-6 space-y-4">
              <div className="space-y-1">
                <h2 className="text-base sm:text-lg font-bold text-white flex items-center gap-2">
                  <PieChart className="w-5 h-5 text-indigo-400" />
                  Декомпозиція оцінок ШІ-моделей
                </h2>
                <p className="text-xs text-zinc-400">
                  Як кожен із трьох незалежних ШІ-експертів оцінив достовірність тексту
                </p>
              </div>

              <div className="space-y-3">
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
                      className="p-3.5 rounded-2xl bg-zinc-950/80 border border-zinc-800 space-y-2"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs font-semibold text-zinc-100">
                          {friendlyTitle}
                        </span>
                        <span className="text-xs font-mono font-bold text-indigo-300">
                          {numScore.toFixed(1)}%
                        </span>
                      </div>
                      <div className="w-full bg-zinc-800 h-2 rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full ${
                            numScore >= 75
                              ? "bg-emerald-500"
                              : numScore >= 50
                              ? "bg-amber-500"
                              : "bg-rose-500"
                          }`}
                          style={{ width: `${Math.min(100, Math.max(5, numScore))}%` }}
                        />
                      </div>
                      <p className="text-[11px] text-zinc-400 leading-snug">{friendlyDesc}</p>
                    </div>
                  );
                })}
              </div>
            </section>
          )}

          {/* Покроковий 5-рівневий аудит (xai_reasoning_steps) */}
          {tb.xai_reasoning_steps && tb.xai_reasoning_steps.length > 0 && (
            <section className="rounded-3xl border border-zinc-800 bg-zinc-900/70 p-6 space-y-3.5">
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-emerald-400" />
                Покроковий XAI-протокол перевірки:
              </h3>
              <div className="space-y-2.5">
                {tb.xai_reasoning_steps.map((step) => {
                  const badgeColor =
                    step.status === "good"
                      ? "bg-emerald-500/10 text-emerald-300 border-emerald-500/30"
                      : step.status === "warning"
                      ? "bg-amber-500/10 text-amber-300 border-amber-500/30"
                      : "bg-rose-500/10 text-rose-300 border-rose-500/30";
                  return (
                    <div
                      key={step.step}
                      className="p-3 rounded-2xl bg-zinc-950/70 border border-zinc-800/80 space-y-1"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs font-semibold text-zinc-200">
                          Крок {step.step}. {step.component}
                        </span>
                        <span
                          className={`px-2 py-0.5 rounded text-[11px] font-mono font-bold border ${badgeColor}`}
                        >
                          {Number(step.score).toFixed(0)}%
                        </span>
                      </div>
                      <p className="text-xs text-zinc-400 leading-relaxed">{step.summary}</p>
                    </div>
                  );
                })}
              </div>
            </section>
          )}
        </div>
      </div>

      {/* 4. Блок крос-верифікації: Висвітлення цієї події іншими ЗМІ (pgvector + MiniLM-L12-v2) */}
      <section className="rounded-3xl border border-zinc-800 bg-zinc-900/75 p-6 sm:p-8 space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-zinc-800 pb-4">
          <div className="space-y-1">
            <h2 className="text-lg sm:text-xl font-bold text-white flex items-center gap-2">
              <Search className="w-5 h-5 text-purple-400" />
              Висвітлення цієї події іншими ЗМІ (Крос-верифікація)
            </h2>
            <p className="text-xs text-zinc-400">
              Семантичний пошук споріднених публікацій у незалежних редакціях за допомогою векторної бази pgvector та моделі MiniLM-L12-v2
            </p>
          </div>
          <span className="px-3 py-1.5 rounded-xl bg-purple-500/10 border border-purple-500/30 text-xs font-bold text-purple-300 self-start sm:self-center">
            Незалежних підтверджень: {tb.corroborating_articles?.length || 0}
          </span>
        </div>

        {tb.corroboration_summary && (
          <p className="text-sm text-zinc-200 bg-zinc-950/60 p-4 rounded-2xl border border-zinc-800/80">
            {tb.corroboration_summary}
          </p>
        )}

        {tb.corroborating_articles && tb.corroborating_articles.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {tb.corroborating_articles.map((corr) => (
              <div
                key={corr.id}
                className="p-4 rounded-2xl bg-zinc-950/80 border border-zinc-800 hover:border-purple-500/40 transition-all flex flex-col justify-between gap-3"
              >
                <div className="space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-bold text-purple-300 flex items-center gap-1.5">
                      {corr.source_name}
                      {corr.is_whitelisted && (
                        <span className="px-2 py-0.5 rounded text-[10px] bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
                          Білий список ІМІ
                        </span>
                      )}
                    </span>
                    <span className="text-[11px] font-mono px-2 py-0.5 rounded-lg bg-purple-500/15 text-purple-200 border border-purple-500/30">
                      схожість {(corr.similarity * 100).toFixed(0)}%
                    </span>
                  </div>

                  <h4 className="text-sm font-semibold text-zinc-100 leading-snug line-clamp-2">
                    {corr.title}
                  </h4>
                </div>

                <div className="pt-3 border-t border-zinc-800/80 flex items-center justify-between gap-2 text-xs">
                  <span className="text-zinc-400">
                    Довіра: <strong className="text-emerald-400">{corr.trust_score.toFixed(0)}%</strong>
                  </span>
                  <div className="flex items-center gap-2">
                    <Link
                      href={`/news/${corr.id}`}
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-zinc-800 hover:bg-cyan-500 hover:text-zinc-950 text-zinc-200 font-semibold transition-colors"
                    >
                      <Eye className="w-3 h-3" />
                      <span>Розбір</span>
                    </Link>
                    <a
                      href={corr.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="p-1 rounded-lg text-zinc-400 hover:text-white"
                      title="Читати оригінал"
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                    </a>
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center py-6 text-xs text-zinc-400">
            На даний момент інших публікацій про цю саму подію у стрічці ще не зафіксовано (свіжа або ексклюзивна новина).
          </div>
        )}
      </section>

      {/* Схожі новини з цієї ж рубрики */}
      {article.similar_articles && article.similar_articles.length > 0 && (
        <section className="space-y-4 pt-2">
          <h2 className="text-lg font-bold text-white">
            Інші новини рубрики «{article.category}»
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {article.similar_articles.map((sim) => (
              <NewsCard key={sim.id} article={sim} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

