"use client";

import React, { useState, useEffect, useMemo, useRef } from "react";
import Link from "next/link";
import { useAuth } from "@/context/AuthContext";
import { FactCheckClaim } from "@/types";
import {
  ShieldAlert,
  Search,
  ExternalLink,
  RefreshCw,
  Filter,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Sparkles,
  Database,
  ArrowUpRight,
  Info,
  Calendar,
  Building,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
} from "lucide-react";

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

export default function FactChecksPage() {
  const { apiUrl, token, user } = useAuth();
  const [claims, setClaims] = useState<FactCheckClaim[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedChecker, setSelectedChecker] = useState<string>("all");
  const [selectedRating, setSelectedRating] = useState<string>("all");
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [pageSize, setPageSize] = useState<number>(12);
  const factChecksGridRef = useRef<HTMLDivElement>(null);

  // Стан для швидкої онлайн-перевірки тексту
  const [checkText, setCheckText] = useState("");
  const [isChecking, setIsChecking] = useState(false);
  const [checkResult, setCheckResult] = useState<any | null>(null);
  const [lastRefreshedAt, setLastRefreshedAt] = useState<string>("щойно");

  const fetchClaims = async (showLoading = true) => {
    if (showLoading) setLoading(true);
    try {
      const res = await fetch(`${apiUrl}/factchecks?page_size=200&limit=200`, {
        cache: "no-store",
      });
      if (res.ok) {
        const data = await res.json();
        setClaims(data.items || []);
        const now = new Date();
        setLastRefreshedAt(
          `${now.getHours().toString().padStart(2, "0")}:${now
            .getMinutes()
            .toString()
            .padStart(2, "0")}:${now.getSeconds().toString().padStart(2, "0")}`
        );
      }
    } catch (err) {
      console.error("Помилка завантаження фактчеків:", err);
    } finally {
      if (showLoading) setLoading(false);
    }
  };

  useEffect(() => {
    fetchClaims(true);
  }, [apiUrl]);

  // Фонове автоматичне оновлення бази фактчеків кожні 25 секунд без перезавантаження сторінки
  useEffect(() => {
    const timer = setInterval(() => {
      fetchClaims(false);
    }, 25000);

    const handleVisibilityOrFocus = () => {
      if (document.visibilityState === "visible") {
        fetchClaims(false);
      }
    };
    window.addEventListener("focus", handleVisibilityOrFocus);
    document.addEventListener("visibilitychange", handleVisibilityOrFocus);

    return () => {
      clearInterval(timer);
      window.removeEventListener("focus", handleVisibilityOrFocus);
      document.removeEventListener("visibilitychange", handleVisibilityOrFocus);
    };
  }, [apiUrl]);



  const handleOnlineCheck = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!checkText.trim()) return;

    setIsChecking(true);
    setCheckResult(null);
    try {
      const res = await fetch(`${apiUrl}/factchecks/check`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: checkText.trim(),
          text: checkText.trim(),
        }),
      });
      if (res.ok) {
        const data = await res.json();
        setCheckResult(data);
      }
    } catch (err) {
      console.error("Помилка онлайн-перевірки:", err);
    } finally {
      setIsChecking(false);
    }
  };

  // Фільтрація списку фактчеків
  const filteredClaims = useMemo(() => {
    return claims.filter((item) => {
      const matchesSearch =
        searchQuery === "" ||
        item.claim.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (item.explanation && item.explanation.toLowerCase().includes(searchQuery.toLowerCase())) ||
        item.fact_checker.toLowerCase().includes(searchQuery.toLowerCase());

      const matchesChecker =
        selectedChecker === "all" ||
        item.fact_checker.toLowerCase().includes(selectedChecker.toLowerCase());

      const matchesRating =
        selectedRating === "all" ||
        item.rating.toLowerCase().includes(selectedRating.toLowerCase());

      return matchesSearch && matchesChecker && matchesRating;
    });
  }, [claims, searchQuery, selectedChecker, selectedRating]);

  // Розрахунок пагінації
  const totalPages = Math.max(1, Math.ceil(filteredClaims.length / pageSize));
  const pageNumbers = getPaginationItems(currentPage, totalPages);

  const paginatedClaims = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredClaims.slice(start, start + pageSize);
  }, [filteredClaims, currentPage, pageSize]);

  const handlePageChange = (newPage: number) => {
    if (newPage < 1 || newPage > totalPages || newPage === currentPage) return;
    setCurrentPage(newPage);
    if (factChecksGridRef.current) {
      factChecksGridRef.current.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  };

  const handlePageSizeChange = (newSize: number) => {
    setPageSize(newSize);
    setCurrentPage(1);
  };

  const handleSearchChange = (val: string) => {
    setSearchQuery(val);
    setCurrentPage(1);
  };

  const handleCheckerChange = (checker: string) => {
    setSelectedChecker(checker);
    setCurrentPage(1);
  };

  // Отримання унікальних організацій
  const factCheckers = useMemo(() => {
    const list = Array.from(new Set(claims.map((c) => c.fact_checker)));
    return list;
  }, [claims]);

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 pb-16">
      {/* Hero Header */}
      <div className="relative border-b border-zinc-800/80 bg-gradient-to-b from-zinc-900 via-zinc-950 to-zinc-950 py-12 px-4 sm:px-6 lg:px-8 overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_80%_80%_at_50%_-20%,rgba(245,158,11,0.12),rgba(255,255,255,0))]" />
        
        <div className="relative max-w-7xl mx-auto">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
            <div className="space-y-3">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-amber-500/10 border border-amber-500/20 text-amber-400 text-xs font-semibold tracking-wide">
                <ShieldAlert className="w-3.5 h-3.5" />
                Центр протидії дезінформації та фейкам
              </div>
              <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight bg-gradient-to-r from-zinc-100 via-zinc-200 to-zinc-400 bg-clip-text text-transparent">
                База спростованих фейків
              </h1>
              <p className="text-zinc-400 text-sm sm:text-base max-w-2xl leading-relaxed">
                Оперативна база дезінформаційних вкидів та маніпуляцій, верифікованих провідними фактчекерами (StopFake, VoxCheck, AFP, Reuters, Google FactCheck). Автоматично зіставляється з кожною новиною агрегатора.
              </p>
            </div>

            {/* Статус фонової синхронізації */}
            <div className="flex items-center gap-3">
              <div
                className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl bg-zinc-900/90 border border-zinc-800 text-xs font-medium text-zinc-300 shadow-sm"
                title="Сторінка автоматично підтягує нові фактчеки кожні 25 секунд без перезавантаження"
              >
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                <span>Живе оновлення ({lastRefreshedAt})</span>
              </div>
            </div>
          </div>

          {/* Інтерактивний віджет перевірки будь-якої тези */}
          <div className="mt-8 p-5 rounded-2xl bg-zinc-900/80 border border-zinc-800/80 shadow-2xl backdrop-blur-xl">
            <h2 className="text-sm font-semibold text-zinc-300 mb-2 flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-amber-400" />
              Миттєва звірка будь-якого твердження з базою спростувань:
            </h2>
            <form onSubmit={handleOnlineCheck} className="flex flex-col sm:flex-row gap-2">
              <input
                type="text"
                value={checkText}
                onChange={(e) => setCheckText(e.target.value)}
                placeholder="Введіть підозрілий заголовок або тезу (наприклад: Польща екстрадує українців)..."
                className="flex-1 px-4 py-2.5 rounded-xl bg-zinc-950 border border-zinc-700/80 text-sm text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-amber-500/80 focus:ring-1 focus:ring-amber-500/80 transition-all"
              />
              <button
                type="submit"
                disabled={isChecking || !checkText.trim()}
                className="px-5 py-2.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-100 text-sm font-semibold flex items-center justify-center gap-2 transition-all disabled:opacity-50 shrink-0"
              >
                {isChecking ? (
                  <RefreshCw className="w-4 h-4 animate-spin text-amber-400" />
                ) : (
                  <Search className="w-4 h-4 text-amber-400" />
                )}
                Перевірити
              </button>
            </form>

            {/* Результат швидкої перевірки */}
            {checkResult && (
              <div
                className={`mt-4 p-4 rounded-xl border transition-all ${
                  checkResult.is_debunked
                    ? "bg-rose-950/40 border-rose-500/40 text-rose-200"
                    : "bg-emerald-950/30 border-emerald-500/30 text-emerald-200"
                }`}
              >
                <div className="flex items-start gap-3">
                  {checkResult.is_debunked ? (
                    <XCircle className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" />
                  ) : (
                    <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
                  )}
                  <div className="space-y-1">
                    <div className="font-bold text-sm">
                      {checkResult.is_debunked
                        ? `ЗБІГ З ВІДОМИМ ФЕЙКОМ! (Впевненість: ${Math.round(checkResult.confidence * 100)}%)`
                        : "Прямих збігів зі спростованими фейками не виявлено."}
                    </div>
                    {checkResult.matched_claim && (
                      <div className="text-xs space-y-1.5 pt-1 text-zinc-300">
                        <div>
                          <strong className="text-zinc-400">Спростована теза:</strong>{" "}
                          «{checkResult.matched_claim.claim}»
                        </div>
                        <div>
                          <strong className="text-zinc-400">Організація:</strong>{" "}
                          <span className="text-amber-400">{checkResult.matched_claim.fact_checker}</span> (
                          {checkResult.matched_claim.rating})
                        </div>
                        {checkResult.matched_claim.explanation && (
                          <div>
                            <strong className="text-zinc-400">Пояснення:</strong>{" "}
                            {checkResult.matched_claim.explanation}
                          </div>
                        )}
                        {checkResult.matched_claim.review_url && (
                          <a
                            href={checkResult.matched_claim.review_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 text-xs text-cyan-400 hover:text-cyan-300 underline font-medium pt-1"
                          >
                            Читати оригінальне розслідування фактчекерів <ArrowUpRight className="w-3 h-3" />
                          </a>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Фільтри та панель пошуку */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 mt-8">
        <div className="flex flex-col md:flex-row gap-4 items-stretch md:items-center justify-between pb-6 border-b border-zinc-800/60">
          {/* Пошук у списку */}
          <div className="relative flex-1 max-w-md">
            <Search className="w-4 h-4 text-zinc-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => handleSearchChange(e.target.value)}
              placeholder="Фільтрувати спростування за словами..."
              className="w-full pl-10 pr-4 py-2 rounded-xl bg-zinc-900 border border-zinc-800 text-sm text-zinc-200 placeholder-zinc-500 focus:outline-none focus:border-amber-500/50"
            />
          </div>

          {/* Фільтри фактчекерів */}
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs text-zinc-400 flex items-center gap-1 mr-1">
              <Building className="w-3.5 h-3.5" /> Організація:
            </span>
            <button
              onClick={() => handleCheckerChange("all")}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                selectedChecker === "all"
                  ? "bg-amber-500/20 text-amber-300 border border-amber-500/40"
                  : "bg-zinc-900 text-zinc-400 hover:text-zinc-200 border border-zinc-800"
              }`}
            >
              Всі ({claims.length})
            </button>
            {factCheckers.map((checker) => (
              <button
                key={checker}
                onClick={() => handleCheckerChange(checker)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                  selectedChecker === checker
                    ? "bg-amber-500/20 text-amber-300 border border-amber-500/40"
                    : "bg-zinc-900 text-zinc-400 hover:text-zinc-200 border border-zinc-800"
                }`}
              >
                {checker}
              </button>
            ))}
          </div>
        </div>

        {/* Результати списку */}
        <div ref={factChecksGridRef} className="mt-6 scroll-mt-24">
          <div className="flex items-center justify-between text-xs text-zinc-500 mb-4 font-mono">
            <span>ЗНАЙДЕНО СПРОСТУВАНЬ: {filteredClaims.length} (сторінка {currentPage} з {totalPages})</span>
            <span>СТАТУС: ВЕДЕТЬСЯ МОНІТОРИНГ</span>
          </div>

          {loading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
              {[...Array(6)].map((_, i) => (
                <div
                  key={i}
                  className="h-56 rounded-2xl bg-zinc-900/60 border border-zinc-800/60 animate-pulse p-5 space-y-3"
                >
                  <div className="h-4 bg-zinc-800 rounded w-1/3" />
                  <div className="h-6 bg-zinc-800 rounded w-3/4" />
                  <div className="h-16 bg-zinc-800/60 rounded" />
                </div>
              ))}
            </div>
          ) : filteredClaims.length === 0 ? (
            <div className="text-center py-16 px-4 bg-zinc-900/30 rounded-2xl border border-zinc-800/50">
              <ShieldAlert className="w-12 h-12 text-zinc-600 mx-auto mb-3" />
              <h3 className="text-base font-semibold text-zinc-300">
                За вказаними критеріями нічого не знайдено
              </h3>
              <p className="text-xs text-zinc-500 mt-1 max-w-sm mx-auto">
                Спробуйте змінити пошуковий запит або скинути фільтри організацій.
              </p>
            </div>
          ) : (
            <div className="space-y-8">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                {paginatedClaims.map((claim) => (
                  <div
                    key={claim.id}
                    className="flex flex-col justify-between rounded-2xl bg-gradient-to-b from-zinc-900/90 to-zinc-950/90 border border-zinc-800/80 hover:border-amber-500/40 p-5 shadow-lg hover:shadow-amber-500/5 transition-all group"
                  >
                    <div className="space-y-3">
                      {/* Бейдж вердикту та організації */}
                      <div className="flex items-center justify-between gap-2">
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold tracking-wide uppercase bg-rose-500/10 text-rose-400 border border-rose-500/20">
                          <XCircle className="w-3 h-3" />
                          {claim.rating || "Фейк"}
                        </span>

                        <span className="text-xs font-semibold text-amber-400/90 bg-amber-500/10 px-2 py-0.5 rounded border border-amber-500/20">
                          {claim.fact_checker}
                        </span>
                      </div>

                      {/* Текст спростованої тези */}
                      <h3 className="text-sm font-bold text-zinc-100 group-hover:text-amber-300 transition-colors line-clamp-3 leading-snug">
                        «{claim.claim}»
                      </h3>

                      {/* Пояснення фактчекерів */}
                      {claim.explanation && (
                        <p className="text-xs text-zinc-400 line-clamp-4 leading-relaxed bg-zinc-950/50 p-2.5 rounded-xl border border-zinc-800/50">
                          {claim.explanation}
                        </p>
                      )}
                    </div>

                    {/* Футер картки з датою та посиланням на джерело */}
                    <div className="pt-4 mt-4 border-t border-zinc-800/60 flex items-center justify-between text-xs text-zinc-500">
                      <span className="flex items-center gap-1 font-mono text-[11px]">
                        <Calendar className="w-3 h-3" />
                        {claim.published_at
                          ? new Date(claim.published_at).toLocaleDateString("uk-UA")
                          : "Нещодавно"}
                      </span>

                      {claim.review_url ? (
                        <a
                          href={claim.review_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-xs text-cyan-400 hover:text-cyan-300 font-medium group-hover:underline"
                        >
                          Розслідування <ArrowUpRight className="w-3.5 h-3.5" />
                        </a>
                      ) : (
                        <span className="text-zinc-600">Архівний запис</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>

              {/* Пагінація */}
              <div className="pt-6 border-t border-zinc-800/80 flex flex-col sm:flex-row items-center justify-between gap-4">
                {/* Ліва частина: Інформація про записи та вибір кількості на сторінці */}
                <div className="flex flex-wrap items-center gap-4 text-xs text-zinc-400">
                  <span>
                    Показано{" "}
                    <strong className="text-zinc-200">
                      {Math.min((currentPage - 1) * pageSize + 1, filteredClaims.length)}–
                      {Math.min(currentPage * pageSize, filteredClaims.length)}
                    </strong>{" "}
                    із <strong className="text-zinc-200">{filteredClaims.length}</strong> спростувань
                  </span>

                  <div className="flex items-center gap-1.5 bg-zinc-900 border border-zinc-800 rounded-xl px-2 py-1">
                    <span className="text-zinc-500">На сторінці:</span>
                    {[12, 24, 48].map((size) => (
                      <button
                        key={size}
                        onClick={() => handlePageSizeChange(size)}
                        className={`px-2 py-0.5 rounded-lg font-semibold transition-all ${
                          pageSize === size
                            ? "bg-gradient-to-r from-amber-500 to-rose-600 text-white shadow-sm"
                            : "text-zinc-400 hover:text-white"
                        }`}
                      >
                        {size}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Права частина: Кнопки переходу між сторінками */}
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
                                ? "bg-gradient-to-r from-amber-500 to-rose-600 text-white font-bold shadow-md shadow-amber-500/20"
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
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
