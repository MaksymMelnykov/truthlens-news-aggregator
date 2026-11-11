"use client";

import React, { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { NewsCard } from "@/components/NewsCard";
import { Article, NewsFeedResponse } from "@/types";
import { useAuth } from "@/context/AuthContext";
import { PreferencesModal } from "@/components/PreferencesModal";
import {
  Search,
  Filter,
  ShieldCheck,
  Sparkles,
  SlidersHorizontal,
  RefreshCw,
  CheckCircle2,
  AlertTriangle,
  AlertOctagon,
  Clock,
  ArrowUpDown,
  Radio,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  Settings,
  Globe2,
} from "lucide-react";
import Link from "next/link";

const CATEGORIES = ["Всі", "Політика", "Технології", "Економіка", "Суспільство", "Здоров'я"];
const VERDICTS = [
  { id: "ALL", label: "Всі рівні" },
  { id: "Verified", label: "Тільки перевірені", icon: ShieldCheck, color: "text-emerald-400" },
  { id: "Caution", label: "Потребує уваги", icon: AlertTriangle, color: "text-amber-400" },
  { id: "High Risk", label: "Високий ризик", icon: AlertOctagon, color: "text-rose-400" },
];

const TIME_RANGES = [
  { id: "all", label: "За весь час" },
  { id: "24h", label: "Останні 24г" },
  { id: "today", label: "Сьогодні" },
  { id: "week", label: "Цей тиждень" },
];

const SORT_OPTIONS = [
  { id: "newest", label: "Найновіші спочатку" },
  { id: "trust_desc", label: "Найвища довіра (Verified)" },
  { id: "trust_asc", label: "Найнижча довіра (Ризики/Фейки)" },
];

function getPaginationItems(current: number, total: number): (number | string)[] {
  if (total <= 7) {
    return Array.from({ length: total }, (_, i) => i + 1);
  }
  if (current <= 4) {
    return [1, 2, 3, 4, 5, "...", total];
  }
  if (current >= total - 3) {
    return [1, "...", total - 4, total - 3, total - 2, total - 1, total];
  }
  return [1, "...", current - 1, current, current + 1, "...", total];
}

export default function HomePage() {
  const router = useRouter();
  const { user, apiUrl } = useAuth();
  const newsFeedRef = useRef<HTMLElement>(null);

  useEffect(() => {
    if (user?.role === "admin") {
      router.replace("/analytics");
    }
  }, [user, router]);

  const [articles, setArticles] = useState<Article[]>([]);
  const [total, setTotal] = useState<number>(0);
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [pageSize, setPageSize] = useState<number>(12);
  const [feedScope, setFeedScope] = useState<string>("all"); // "all", "ua", "en"
  const [isPrefsOpen, setIsPrefsOpen] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [search, setSearch] = useState<string>("");
  const [activeSearch, setActiveSearch] = useState<string>("");
  const [category, setCategory] = useState<string>("Всі");
  const [verdict, setVerdict] = useState<string>("ALL");
  const [timeRange, setTimeRange] = useState<string>("all");
  const [sortBy, setSortBy] = useState<string>("newest");
  const [onlyPersonalized, setOnlyPersonalized] = useState<boolean>(false);
  const [quickUrl, setQuickUrl] = useState<string>("");
  const [autoRefresh, setAutoRefresh] = useState<boolean>(true);
  const [lastRefreshedAt, setLastRefreshedAt] = useState<string>("щойно");

  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const pageNumbers = getPaginationItems(currentPage, totalPages);

  const fetchNews = async (showLoading = true, pageToFetch = currentPage, sizeToFetch = pageSize) => {
    if (showLoading) setIsLoading(true);
    try {
      const params = new URLSearchParams();
      params.append("page", pageToFetch.toString());
      params.append("page_size", sizeToFetch.toString());
      if (feedScope !== "all") params.append("language", feedScope);
      if (category !== "Всі") params.append("category", category);
      if (verdict !== "ALL") params.append("verdict", verdict);
      if (timeRange !== "all") params.append("time_range", timeRange);
      if (sortBy !== "newest") params.append("sort_by", sortBy);
      if (activeSearch.trim()) params.append("search", activeSearch.trim());
      if (onlyPersonalized) params.append("personalized", "true");

      const headers: Record<string, string> = {};
      const token = typeof window !== "undefined" ? localStorage.getItem("truthlens_token") : null;
      if (token) headers["Authorization"] = `Bearer ${token}`;

      const res = await fetch(`${apiUrl}/news?${params.toString()}`, {
        headers,
        cache: "no-store",
      });
      if (res.ok) {
        const data: NewsFeedResponse = await res.json();
        setArticles(data.items);
        setTotal(data.total);
        const now = new Date();
        setLastRefreshedAt(
          `${now.getHours().toString().padStart(2, "0")}:${now
            .getMinutes()
            .toString()
            .padStart(2, "0")}:${now.getSeconds().toString().padStart(2, "0")}`
        );
      }
    } catch (e) {
      console.error("Помилка завантаження новин", e);
    } finally {
      if (showLoading) setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchNews(true, currentPage, pageSize);
  }, [currentPage, pageSize, feedScope, category, verdict, timeRange, sortBy, onlyPersonalized, activeSearch]);

  // Фонове автоматичне оновлення стрічки новин кожні 25 секунд + при поверненні на вкладку без перезавантаження сторінки
  useEffect(() => {
    if (!autoRefresh) return;
    const timer = setInterval(() => {
      fetchNews(false, currentPage, pageSize);
    }, 25000);

    const handleVisibilityOrFocus = () => {
      if (document.visibilityState === "visible") {
        fetchNews(false, currentPage, pageSize);
      }
    };
    window.addEventListener("focus", handleVisibilityOrFocus);
    document.addEventListener("visibilitychange", handleVisibilityOrFocus);

    return () => {
      clearInterval(timer);
      window.removeEventListener("focus", handleVisibilityOrFocus);
      document.removeEventListener("visibilitychange", handleVisibilityOrFocus);
    };
  }, [autoRefresh, currentPage, pageSize, feedScope, category, verdict, timeRange, sortBy, onlyPersonalized, activeSearch]);

  const handlePageChange = (newPage: number) => {
    if (newPage < 1 || newPage > totalPages || newPage === currentPage) return;
    setCurrentPage(newPage);
    if (newsFeedRef.current) {
      newsFeedRef.current.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  };

  const handlePageSizeChange = (newSize: number) => {
    setPageSize(newSize);
    setCurrentPage(1);
  };

  const handleCategoryChange = (cat: string) => {
    setCategory(cat);
    setCurrentPage(1);
  };

  const handleBookmarkChange = (articleId: number, isBookmarked: boolean) => {
    setArticles((prev) =>
      prev.map((a) => (a.id === articleId ? { ...a, is_bookmarked: isBookmarked } : a))
    );
  };

  const handleVerdictChange = (v: string) => {
    setVerdict(v);
    setCurrentPage(1);
  };

  const handleTimeRangeChange = (tr: string) => {
    setTimeRange(tr);
    setCurrentPage(1);
  };

  const handleSortByChange = (sb: string) => {
    setSortBy(sb);
    setCurrentPage(1);
  };

  const handlePersonalizedChange = (p: boolean) => {
    if (
      p &&
      (!user?.preferences?.favorite_categories?.length &&
        !user?.preferences?.favorite_sources?.length &&
        !user?.preferences?.only_verified)
    ) {
      setIsPrefsOpen(true);
    }
    if (p) {
      setCategory("Всі");
    }
    setOnlyPersonalized(p);
    setCurrentPage(1);
  };

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setActiveSearch(search.trim());
    setCurrentPage(1);
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
      {/* Hero-блок з пошуком та швидкою перевіркою */}
      <section className="relative overflow-hidden rounded-3xl border border-zinc-800 bg-gradient-to-b from-zinc-900/80 via-zinc-900/40 to-zinc-950 p-6 sm:p-10 text-center shadow-2xl">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-cyan-900/20 via-transparent to-transparent pointer-events-none" />

        <div className="relative z-10 max-w-3xl mx-auto space-y-4">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-semibold bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">
            <Sparkles className="w-3.5 h-3.5" />
            <span>Інтелектуальний моніторинг дезінформації</span>
          </div>

          <h1 className="text-3xl sm:text-5xl font-black tracking-tight text-white leading-tight">
            Читати новини з{" "}
            <span className="bg-gradient-to-r from-cyan-400 via-teal-300 to-indigo-400 bg-clip-text text-transparent">
              впевненістю
            </span>
          </h1>

          <p className="text-sm sm:text-base text-zinc-400 leading-relaxed max-w-2xl mx-auto">
            Автоматичний розбір надійності джерел, виявлення маніпуляцій, клікбейту та пояснення оцінки через Explainable AI.
          </p>

          {/* Панель швидкого вводу посилання */}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (quickUrl.trim()) {
                window.location.href = `/verify?url=${encodeURIComponent(quickUrl.trim())}`;
              }
            }}
            className="mt-6 flex flex-col sm:flex-row items-center gap-2 max-w-xl mx-auto bg-zinc-950/80 p-1.5 rounded-2xl border border-zinc-800 focus-within:border-cyan-500/50 shadow-lg"
          >
            <div className="flex items-center gap-2 px-3 w-full">
              <Search className="w-4 h-4 text-zinc-500 flex-shrink-0" />
              <input
                type="text"
                placeholder="Вставте URL-посилання новини для миттєвої перевірки..."
                value={quickUrl}
                onChange={(e) => setQuickUrl(e.target.value)}
                className="w-full bg-transparent text-sm text-zinc-100 placeholder-zinc-500 focus:outline-none"
              />
            </div>
            <button
              type="submit"
              className="w-full sm:w-auto px-5 py-2.5 rounded-xl bg-cyan-500 text-zinc-950 font-semibold text-xs sm:text-sm hover:bg-cyan-400 transition-colors flex-shrink-0 flex items-center justify-center gap-1.5 shadow-md shadow-cyan-500/20"
            >
              <ShieldCheck className="w-4 h-4" />
              Перевірити
            </button>
          </form>
        </div>
      </section>

      {/* Фільтри та панель пошуку */}
      <section className="space-y-4">
        {/* Перемикач стрічок: Всі / Українські / Міжнародні */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 border-b border-zinc-800/80 pb-3">
          <div className="flex items-center gap-1.5 p-1 rounded-2xl bg-zinc-900/90 border border-zinc-800 shadow-sm">
            <button
              onClick={() => {
                setFeedScope("all");
                setCurrentPage(1);
              }}
              className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-semibold transition-all ${
                feedScope === "all"
                  ? "bg-zinc-100 text-zinc-950 shadow-sm"
                  : "text-zinc-400 hover:text-white"
              }`}
            >
              <span>Всі новини</span>
            </button>
            <button
              onClick={() => {
                setFeedScope("ua");
                setCurrentPage(1);
              }}
              className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-semibold transition-all ${
                feedScope === "ua"
                  ? "bg-blue-600 text-white shadow-sm shadow-blue-500/20"
                  : "text-zinc-400 hover:text-white"
              }`}
            >
              <span>🇺🇦 Українські медіа</span>
            </button>
            <button
              onClick={() => {
                setFeedScope("en");
                setCurrentPage(1);
              }}
              className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-semibold transition-all ${
                feedScope === "en"
                  ? "bg-indigo-600 text-white shadow-sm shadow-indigo-500/20"
                  : "text-zinc-400 hover:text-white"
              }`}
            >
              <Globe2 className="w-3.5 h-3.5" />
              <span>🌍 Міжнародні ЗМІ</span>
            </button>
          </div>

          <div className="text-[11px] text-zinc-400 font-medium">
            {feedScope === "all" && "Агрегація українських та світових видань"}
            {feedScope === "ua" && "Тільки україномовні національні медіа (УП, ZN.UA, УНІАН тощо)"}
            {feedScope === "en" && "Провідні міжнародні ЗМІ (BBC World, The Guardian, DW, Politico тощо)"}
          </div>
        </div>

        <div className="flex flex-col md:flex-row gap-4 items-center justify-between border-b border-zinc-800/80 pb-4">
          {/* Категорії */}
          <div className="flex items-center gap-1.5 overflow-x-auto w-full md:w-auto pb-2 md:pb-0 scrollbar-none">
            {CATEGORIES.map((cat) => (
              <button
                key={cat}
                onClick={() => handleCategoryChange(cat)}
                className={`px-3.5 py-1.5 rounded-xl text-xs font-medium transition-all ${
                  category === cat
                    ? "bg-zinc-100 text-zinc-950 font-semibold shadow-sm"
                    : "bg-zinc-900 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800"
                }`}
              >
                {cat}
              </button>
            ))}
          </div>

          {/* Пошук по заголовках */}
          <form onSubmit={handleSearchSubmit} className="flex items-center gap-2 w-full md:w-72">
            <div className="relative w-full">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
              <input
                type="text"
                placeholder="Пошук у новинах..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full pl-9 pr-3 py-1.5 rounded-xl bg-zinc-900 border border-zinc-800 text-xs text-zinc-200 placeholder-zinc-500 focus:outline-none focus:border-zinc-700"
              />
            </div>
            <button
              type="submit"
              className="p-2 rounded-xl bg-zinc-800 text-zinc-300 hover:bg-zinc-700 hover:text-white transition-colors"
              title="Шукати"
            >
              <Search className="w-3.5 h-3.5" />
            </button>
          </form>
        </div>

        {/* Додаткові фільтри: Рівень довіри та Часовий інтервал */}
        <div className="flex flex-wrap items-center justify-between gap-3 text-xs">
          {/* Рівень довіри */}
          <div className="flex items-center gap-2">
            <span className="text-zinc-500 font-medium">Рівень довіри:</span>
            <div className="flex items-center gap-1 bg-zinc-900/60 p-1 rounded-xl border border-zinc-800/80">
              {VERDICTS.map((v) => (
                <button
                  key={v.id}
                  onClick={() => handleVerdictChange(v.id)}
                  className={`px-2.5 py-1 rounded-lg transition-all ${
                    verdict === v.id
                      ? "bg-zinc-800 text-white font-medium shadow-xs"
                      : "text-zinc-400 hover:text-zinc-200"
                  }`}
                >
                  {v.label}
                </button>
              ))}
            </div>
          </div>

          {/* Часовий діапазон */}
          <div className="flex items-center gap-2">
            <span className="text-zinc-500 font-medium inline-flex items-center gap-1">
              <Clock className="w-3.5 h-3.5 text-zinc-400" />
              Час:
            </span>
            <div className="flex items-center gap-1 bg-zinc-900/60 p-1 rounded-xl border border-zinc-800/80">
              {TIME_RANGES.map((tr) => (
                <button
                  key={tr.id}
                  onClick={() => handleTimeRangeChange(tr.id)}
                  className={`px-2.5 py-1 rounded-lg transition-all ${
                    timeRange === tr.id
                      ? "bg-cyan-500/20 text-cyan-300 font-medium border border-cyan-500/30"
                      : "text-zinc-400 hover:text-zinc-200"
                  }`}
                >
                  {tr.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Третій рядок: Сортування, Автооновлення та ручна синхронізація */}
        <div className="flex flex-wrap items-center justify-between gap-3 text-xs pt-1 border-t border-zinc-900/60">
          {/* Сортування */}
          <div className="flex items-center gap-2">
            <span className="text-zinc-500 font-medium inline-flex items-center gap-1">
              <ArrowUpDown className="w-3.5 h-3.5 text-zinc-400" />
              Сортувати:
            </span>
            <select
              value={sortBy}
              onChange={(e) => handleSortByChange(e.target.value)}
              aria-label="Сортування новин"
              className="bg-zinc-900 border border-zinc-800 text-zinc-200 rounded-xl px-2.5 py-1 focus:outline-none focus:border-cyan-500/50 cursor-pointer"
            >
              {SORT_OPTIONS.map((so) => (
                <option key={so.id} value={so.id}>
                  {so.label}
                </option>
              ))}
            </select>
          </div>

          {/* Права частина: Індикатор Автооновлення + Кнопка Оновити з RSS */}
          <div className="flex flex-wrap items-center gap-3">
            {/* Тумблер Автооновлення */}
            <button
              onClick={() => setAutoRefresh(!autoRefresh)}
              className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl border text-xs transition-all ${
                autoRefresh
                  ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-400"
                  : "bg-zinc-900 border-zinc-800 text-zinc-500"
              }`}
              title="Автоматичне оновлення стрічки щохвилини"
            >
              <span className={`w-2 h-2 rounded-full ${autoRefresh ? "bg-emerald-400 animate-ping" : "bg-zinc-600"}`} />
              <span>{autoRefresh ? `Наживо (${lastRefreshedAt})` : "Автооновлення вимкнено"}</span>
            </button>

            {user && (
              <div className="flex items-center gap-1.5 bg-zinc-900/90 px-2 py-1 rounded-xl border border-zinc-800">
                <label className="flex items-center gap-1.5 cursor-pointer select-none text-zinc-300 hover:text-white transition-colors">
                  <input
                    type="checkbox"
                    checked={onlyPersonalized}
                    onChange={(e) => handlePersonalizedChange(e.target.checked)}
                    className="rounded bg-zinc-900 border-zinc-700 text-cyan-500 focus:ring-cyan-500"
                  />
                  <span>Мої вподобання</span>
                </label>
                <button
                  type="button"
                  onClick={() => setIsPrefsOpen(true)}
                  className="p-1 rounded-lg text-zinc-400 hover:text-cyan-300 hover:bg-zinc-800 transition-colors"
                  title="Налаштувати мої улюблені рубрики та джерела"
                >
                  <Settings className="w-3.5 h-3.5" />
                </button>
              </div>
            )}
          </div>
        </div>
      </section>

      {/* Стрічка новин */}
      <section ref={newsFeedRef} className="scroll-mt-20 space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-zinc-800/60 pb-3">
          <div className="flex items-center gap-2.5">
            <h2 className="text-lg font-bold text-white tracking-tight">Стрічка новин</h2>
            <span className="px-2.5 py-0.5 rounded-full text-xs font-medium bg-zinc-800/80 text-zinc-300 border border-zinc-700/60">
              {total} {total % 10 === 1 && total % 100 !== 11 ? "новина" : [2, 3, 4].includes(total % 10) && ![12, 13, 14].includes(total % 100) ? "новини" : "новин"}
            </span>
          </div>

          {totalPages > 1 && (
            <span className="text-xs text-zinc-400 font-medium">
              Сторінка <span className="text-cyan-400 font-bold">{currentPage}</span> з{" "}
              <span className="text-zinc-200">{totalPages}</span>
            </span>
          )}
        </div>

        {isLoading ? (
          <div className="flex flex-col items-center justify-center py-20 text-zinc-500 space-y-3">
            <RefreshCw className="w-8 h-8 animate-spin text-cyan-500" />
            <p className="text-sm">Аналізуємо та завантажуємо статті...</p>
          </div>
        ) : articles.length === 0 ? (
          <div className="text-center py-20 border border-dashed border-zinc-800 rounded-3xl p-8 space-y-3">
            <ShieldCheck className="w-10 h-10 text-zinc-600 mx-auto" />
            <h4 className="text-base font-semibold text-zinc-300">Новин не знайдено</h4>
            <p className="text-xs text-zinc-500 max-w-sm mx-auto">
              Спробуйте змінити пошуковий запит або обрати іншу категорію/рівень довіри.
            </p>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {articles.map((article) => (
                <NewsCard
                  key={article.id}
                  article={article}
                  initialBookmarked={article.is_bookmarked}
                  onBookmarkChange={handleBookmarkChange}
                />
              ))}
            </div>

            {/* Пагінація */}
            <div className="pt-8 border-t border-zinc-800/80 flex flex-col md:flex-row items-center justify-between gap-4 text-xs">
              {/* Інформація про показані елементи та вибір розміру сторінки */}
              <div className="flex flex-wrap items-center justify-center md:justify-start gap-4 text-zinc-400">
                <span>
                  Показано{" "}
                  <strong className="text-zinc-200 font-semibold">
                    {(currentPage - 1) * pageSize + 1}–{Math.min(currentPage * pageSize, total)}
                  </strong>{" "}
                  з <strong className="text-zinc-200 font-semibold">{total}</strong> новин
                </span>

                <div className="flex items-center gap-1.5 bg-zinc-900/90 px-2.5 py-1 rounded-xl border border-zinc-800">
                  <span className="text-zinc-500">На сторінці:</span>
                  {[12, 24, 48].map((size) => (
                    <button
                      key={size}
                      onClick={() => handlePageSizeChange(size)}
                      className={`px-2 py-0.5 rounded-lg transition-all font-medium ${
                        pageSize === size
                          ? "bg-cyan-500/20 text-cyan-300 border border-cyan-500/30"
                          : "text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/60"
                      }`}
                    >
                      {size}
                    </button>
                  ))}
                </div>
              </div>

              {/* Кнопки перемикання сторінок */}
              {totalPages > 1 && (
                <div className="flex items-center gap-1.5">
                  {/* Перша сторінка */}
                  <button
                    onClick={() => handlePageChange(1)}
                    disabled={currentPage === 1}
                    aria-label="Перша сторінка"
                    className="p-2 rounded-xl bg-zinc-900 border border-zinc-800 text-zinc-400 hover:text-white hover:border-zinc-700 disabled:opacity-30 disabled:pointer-events-none transition-all"
                    title="Перша сторінка"
                  >
                    <ChevronsLeft className="w-4 h-4" />
                  </button>

                  {/* Попередня сторінка */}
                  <button
                    onClick={() => handlePageChange(currentPage - 1)}
                    disabled={currentPage === 1}
                    aria-label="Попередня сторінка"
                    className="p-2 rounded-xl bg-zinc-900 border border-zinc-800 text-zinc-400 hover:text-white hover:border-zinc-700 disabled:opacity-30 disabled:pointer-events-none transition-all"
                    title="Попередня сторінка"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>

                  {/* Номери сторінок з багатокрапками */}
                  <div className="flex items-center gap-1">
                    {pageNumbers.map((p, idx) =>
                      p === "..." ? (
                        <span key={`ellipsis-${idx}`} className="px-2 py-1 text-zinc-600 select-none font-mono">
                          ...
                        </span>
                      ) : (
                        <button
                          key={`page-${p}`}
                          onClick={() => handlePageChange(p as number)}
                          className={`min-w-[34px] h-[34px] px-2 rounded-xl text-xs font-semibold transition-all flex items-center justify-center ${
                            currentPage === p
                              ? "bg-gradient-to-r from-cyan-500 to-blue-600 text-zinc-950 font-bold shadow-md shadow-cyan-500/20"
                              : "bg-zinc-900 border border-zinc-800 text-zinc-300 hover:text-white hover:border-zinc-700 hover:bg-zinc-800"
                          }`}
                        >
                          {p}
                        </button>
                      )
                    )}
                  </div>

                  {/* Наступна сторінка */}
                  <button
                    onClick={() => handlePageChange(currentPage + 1)}
                    disabled={currentPage === totalPages}
                    aria-label="Наступна сторінка"
                    className="p-2 rounded-xl bg-zinc-900 border border-zinc-800 text-zinc-400 hover:text-white hover:border-zinc-700 disabled:opacity-30 disabled:pointer-events-none transition-all"
                    title="Наступна сторінка"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>

                  {/* Остання сторінка */}
                  <button
                    onClick={() => handlePageChange(totalPages)}
                    disabled={currentPage === totalPages}
                    aria-label="Остання сторінка"
                    className="p-2 rounded-xl bg-zinc-900 border border-zinc-800 text-zinc-400 hover:text-white hover:border-zinc-700 disabled:opacity-30 disabled:pointer-events-none transition-all"
                    title="Остання сторінка"
                  >
                    <ChevronsRight className="w-4 h-4" />
                  </button>
                </div>
              )}
            </div>
          </>
        )}
      </section>

      {/* Модальне вікно налаштування вподобань */}
      <PreferencesModal
        isOpen={isPrefsOpen}
        onClose={() => setIsPrefsOpen(false)}
        onSaved={() => {
          setOnlyPersonalized(true);
          setCategory("Всі");
          setCurrentPage(1);
          fetchNews(true, 1, pageSize);
        }}
      />
    </div>
  );
}
