"use client";

import React, { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "motion/react";
import { NewsCard } from "@/components/NewsCard";
import { Article, NewsFeedResponse, Source } from "@/types";
import { useAuth } from "@/context/AuthContext";
import { PreferencesModal } from "@/components/PreferencesModal";
import {
  Search,
  ShieldCheck,
  SlidersHorizontal,
  AlertTriangle,
  AlertOctagon,
  Clock,
  ArrowUpDown,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  Settings,
  Globe,
  MapPin,
  Radio,
  RotateCcw,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  EmptyState,
  ErrorState,
  NewsCardSkeletonGrid,
} from "@/components/ui/state-displays";

const CATEGORIES = [
  "Всі",
  "Політика",
  "Технології",
  "Економіка",
  "Суспільство",
  "Здоров'я",
];

const VERDICTS = [
  { id: "ALL", label: "Усі рівні" },
  { id: "Verified", label: "Перевірені", icon: ShieldCheck },
  { id: "Caution", label: "Потребують уваги", icon: AlertTriangle },
  { id: "High Risk", label: "Високий ризик", icon: AlertOctagon },
];

const TIME_RANGES = [
  { id: "all", label: "За весь час" },
  { id: "24h", label: "24 години" },
  { id: "today", label: "Сьогодні" },
  { id: "week", label: "Тиждень" },
];

const SORT_OPTIONS = [
  { id: "newest", label: "Найновіші спочатку" },
  { id: "trust_desc", label: "Найвища достовірність" },
  { id: "trust_asc", label: "Найвищий ризик маніпуляцій" },
];

function getPaginationItems(current: number, total: number): (number | string)[] {
  if (total <= 7) {
    return Array.from({ length: total }, (_, i) => i + 1);
  }
  if (current <= 4) {
    return [1, 2, 3, 4, 5, "…", total];
  }
  if (current >= total - 3) {
    return [1, "…", total - 4, total - 3, total - 2, total - 1, total];
  }
  return [1, "…", current - 1, current, current + 1, "…", total];
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
  const [feedScope, setFeedScope] = useState<string>("all");
  const [isPrefsOpen, setIsPrefsOpen] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [search, setSearch] = useState<string>("");
  const [activeSearch, setActiveSearch] = useState<string>("");
  const [category, setCategory] = useState<string>("Всі");
  const [selectedSource, setSelectedSource] = useState<string>("ALL");
  const [availableSources, setAvailableSources] = useState<Source[]>([]);
  const [verdict, setVerdict] = useState<string>("ALL");
  const [timeRange, setTimeRange] = useState<string>("all");
  const [sortBy, setSortBy] = useState<string>("newest");
  const [onlyPersonalized, setOnlyPersonalized] = useState<boolean>(false);
  const [quickUrl, setQuickUrl] = useState<string>("");
  const [autoRefresh, setAutoRefresh] = useState<boolean>(true);
  const [lastRefreshedAt, setLastRefreshedAt] = useState<string>("щойно");

  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const pageNumbers = getPaginationItems(currentPage, totalPages);

  const fetchNews = async (
    showLoading = true,
    pageToFetch = currentPage,
    sizeToFetch = pageSize
  ) => {
    if (showLoading) {
      setIsLoading(true);
      setFetchError(null);
    }
    try {
      const params = new URLSearchParams();
      params.append("page", pageToFetch.toString());
      params.append("page_size", sizeToFetch.toString());
      if (feedScope !== "all") params.append("language", feedScope);
      if (category !== "Всі") params.append("category", category);
      if (selectedSource !== "ALL") params.append("source", selectedSource);
      if (verdict !== "ALL") params.append("verdict", verdict);
      if (timeRange !== "all") params.append("time_range", timeRange);
      if (sortBy !== "newest") params.append("sort_by", sortBy);
      if (activeSearch.trim()) params.append("search", activeSearch.trim());
      if (onlyPersonalized) params.append("personalized", "true");

      const headers: Record<string, string> = {};
      const token =
        typeof window !== "undefined"
          ? localStorage.getItem("truthlens_token")
          : null;
      if (token) headers["Authorization"] = `Bearer ${token}`;

      const res = await fetch(`${apiUrl}/news?${params.toString()}`, {
        headers,
        cache: "no-store",
      });
      if (!res.ok) {
        throw new Error(
          "Не вдалося завантажити стрічку новин із сервера. Спробуйте повторити запит."
        );
      }
      const data: NewsFeedResponse = await res.json();
      setArticles(data.items);
      setTotal(data.total);
      setFetchError(null);
      const now = new Date();
      setLastRefreshedAt(
        `${now.getHours().toString().padStart(2, "0")}:${now
          .getMinutes()
          .toString()
          .padStart(2, "0")}:${now.getSeconds().toString().padStart(2, "0")}`
      );
    } catch (e: unknown) {
      if (showLoading) {
        setFetchError(
          e instanceof Error
            ? e.message
            : "Тимчасова помилка з'єднання з сервером новин."
        );
      }
    } finally {
      if (showLoading) setIsLoading(false);
    }
  };

  useEffect(() => {
    const baseApi = apiUrl.endsWith("/api/v1") ? apiUrl : `${apiUrl}/api/v1`;
    fetch(`${baseApi}/sources`, { cache: "no-store" })
      .then((res) => (res.ok ? res.json() : []))
      .then((data: Source[]) => {
        if (Array.isArray(data)) {
          setAvailableSources(data.filter((s) => !s.is_blacklisted));
        }
      })
      .catch(() => {});
  }, [apiUrl]);

  useEffect(() => {
    fetchNews(true, currentPage, pageSize);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    currentPage,
    pageSize,
    feedScope,
    category,
    selectedSource,
    verdict,
    timeRange,
    sortBy,
    onlyPersonalized,
    activeSearch,
  ]);

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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    autoRefresh,
    currentPage,
    pageSize,
    feedScope,
    category,
    selectedSource,
    verdict,
    timeRange,
    sortBy,
    onlyPersonalized,
    activeSearch,
  ]);

  const handlePageChange = (newPage: number) => {
    if (newPage < 1 || newPage > totalPages || newPage === currentPage) return;
    setCurrentPage(newPage);
    if (newsFeedRef.current) {
      newsFeedRef.current.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  };

  const resetAllFilters = () => {
    setFeedScope("all");
    setCategory("Всі");
    setSelectedSource("ALL");
    setVerdict("ALL");
    setTimeRange("all");
    setSortBy("newest");
    setOnlyPersonalized(false);
    setSearch("");
    setActiveSearch("");
    setCurrentPage(1);
  };

  const handleBookmarkChange = (articleId: number, isBookmarked: boolean) => {
    setArticles((prev) =>
      prev.map((a) =>
        a.id === articleId ? { ...a, is_bookmarked: isBookmarked } : a
      )
    );
  };

  const handlePersonalizedChange = (p: boolean) => {
    if (
      p &&
      !user?.preferences?.favorite_categories?.length &&
      !user?.preferences?.favorite_sources?.length &&
      !user?.preferences?.only_verified
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
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 flex flex-col gap-8">
      {/* Split Hero Section (/design-taste-frontend + /impeccable) */}
      <Card className="p-6 sm:p-8 lg:p-10 bg-card border-border">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
          <div className="lg:col-span-7 flex flex-col gap-4 text-left">
            <h1 className="text-3xl sm:text-4xl lg:text-5xl font-extrabold tracking-tight text-foreground">
              Верифікована стрічка новин з прозорим ШІ-аудитом
            </h1>
            <p className="text-sm sm:text-base text-muted-foreground leading-relaxed max-w-[65ch]">
              Автоматична крос-перевірка подій між незалежними медіа, детекція маніпулятивних прийомів та миттєве пояснення достовірності кожної публікації.
            </p>
          </div>

          <div className="lg:col-span-5">
            <Card className="p-4 sm:p-5 bg-secondary/50 border-border gap-3">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-bold uppercase tracking-wider text-primary font-mono">
                  Експрес-перевірка матеріалу
                </span>
                <Badge variant="accent">XAI Engine</Badge>
              </div>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  if (quickUrl.trim()) {
                    router.push(
                      `/verify?url=${encodeURIComponent(quickUrl.trim())}`
                    );
                  } else {
                    router.push("/verify");
                  }
                }}
                className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2"
              >
                <Input
                  type="url"
                  placeholder="https://example.com/news-article"
                  value={quickUrl}
                  onChange={(e) => setQuickUrl(e.target.value)}
                  aria-label="URL-посилання новини для миттєвої перевірки"
                />
                <Button type="submit" variant="default">
                  <ShieldCheck className="size-4" />
                  <span>Перевірити</span>
                </Button>
              </form>
            </Card>
          </div>
        </div>
      </Card>

      {/* Панель фільтрації та керування потоком */}
      <Card className="p-4 sm:p-6 flex flex-col gap-4">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-4 border-b border-border">
          <Tabs
            value={feedScope}
            onValueChange={(val) => {
              setFeedScope(val);
              setCurrentPage(1);
            }}
          >
            <TabsList aria-label="Регіональний діапазон медіа">
              <TabsTrigger value="all">Усі видання</TabsTrigger>
              <TabsTrigger value="ua">
                <MapPin className="size-3.5" />
                <span>Українські ЗМІ</span>
              </TabsTrigger>
              <TabsTrigger value="en">
                <Globe className="size-3.5" />
                <span>Міжнародні ЗМІ</span>
              </TabsTrigger>
            </TabsList>
          </Tabs>

          <form
            onSubmit={handleSearchSubmit}
            className="flex items-center gap-2 w-full lg:w-80"
          >
            <Input
              type="search"
              placeholder="Пошук за заголовком або доменом…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              aria-label="Пошук у стрічці новин"
            />
            <Button
              type="submit"
              variant="secondary"
              size="icon"
              aria-label="Виконати пошук"
            >
              <Search className="size-4" />
            </Button>
          </form>
        </div>

        {/* Рубрики */}
        <div
          role="group"
          aria-label="Фільтр за рубриками"
          className="flex items-center gap-2 overflow-x-auto pb-1"
        >
          {CATEGORIES.map((cat) => (
            <Button
              key={cat}
              type="button"
              variant={category === cat ? "default" : "outline"}
              size="sm"
              onClick={() => {
                setCategory(cat);
                setCurrentPage(1);
              }}
              aria-pressed={category === cat}
            >
              {cat}
            </Button>
          ))}
        </div>

        {/* Додаткові фільтри: Достовірність, Час, Джерело, Сортування */}
        <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-border/70 text-xs">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-muted-foreground font-semibold">
              Рівень довіри:
            </span>
            <div className="flex flex-wrap items-center gap-1.5">
              {VERDICTS.map((v) => {
                const Icon = v.icon;
                const active = verdict === v.id;
                return (
                  <Button
                    key={v.id}
                    type="button"
                    variant={active ? "default" : "ghost"}
                    size="sm"
                    onClick={() => {
                      setVerdict(v.id);
                      setCurrentPage(1);
                    }}
                    aria-pressed={active}
                  >
                    {Icon && <Icon className="size-3.5" />}
                    <span>{v.label}</span>
                  </Button>
                );
              })}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <span className="text-muted-foreground font-semibold inline-flex items-center gap-1">
              <Clock className="size-3.5 text-primary" />
              <span>Період:</span>
            </span>
            <div className="flex flex-wrap items-center gap-1">
              {TIME_RANGES.map((tr) => (
                <Button
                  key={tr.id}
                  type="button"
                  variant={timeRange === tr.id ? "secondary" : "ghost"}
                  size="sm"
                  onClick={() => {
                    setTimeRange(tr.id);
                    setCurrentPage(1);
                  }}
                  aria-pressed={timeRange === tr.id}
                >
                  {tr.label}
                </Button>
              ))}
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-border/70">
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2">
              <ArrowUpDown className="size-4 text-primary" />
              <Select
                value={sortBy}
                onValueChange={(val) => {
                  setSortBy(val);
                  setCurrentPage(1);
                }}
              >
                <SelectTrigger
                  className="w-52 h-9 text-xs"
                  aria-label="Сортування списку новин"
                >
                  <SelectValue placeholder="Сортування" />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    {SORT_OPTIONS.map((so) => (
                      <SelectItem key={so.id} value={so.id}>
                        {so.label}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
            </div>

            {availableSources.length > 0 && (
              <div className="flex items-center gap-2">
                <Globe className="size-4 text-accent" />
                <Select
                  value={selectedSource}
                  onValueChange={(val) => {
                    setSelectedSource(val);
                    setCurrentPage(1);
                    if (val !== "ALL") {
                      const picked = availableSources.find(
                        (s) => s.domain === val
                      );
                      if (
                        picked &&
                        feedScope !== "all" &&
                        picked.language !== feedScope
                      ) {
                        setFeedScope("all");
                      }
                    }
                  }}
                >
                  <SelectTrigger
                    className="w-56 h-9 text-xs"
                    aria-label="Фільтр за джерелом"
                  >
                    <SelectValue placeholder="Усі джерела" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      <SelectItem value="ALL">
                        Усі джерела ({availableSources.length})
                      </SelectItem>
                      {availableSources.map((src) => (
                        <SelectItem key={src.id} value={src.domain}>
                          {src.name} ({src.language === "en" ? "EN" : "UA"})
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              variant={autoRefresh ? "secondary" : "outline"}
              size="sm"
              onClick={() => setAutoRefresh(!autoRefresh)}
              aria-pressed={autoRefresh}
              title="Автоматичне оновлення потоку кожні 25 секунд"
            >
              <Radio className="size-3.5 text-verified" />
              <span className="tabular-nums">
                {autoRefresh
                  ? `Наживо (${lastRefreshedAt})`
                  : "Автооновлення вимкнено"}
              </span>
            </Button>

            {user && (
              <div className="flex items-center gap-1.5">
                <Button
                  type="button"
                  variant={onlyPersonalized ? "default" : "outline"}
                  size="sm"
                  onClick={() => handlePersonalizedChange(!onlyPersonalized)}
                  aria-pressed={onlyPersonalized}
                >
                  <SlidersHorizontal className="size-3.5" />
                  <span>Мої вподобання</span>
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={() => setIsPrefsOpen(true)}
                  aria-label="Налаштувати мої вподобання"
                  title="Налаштувати мої вподобання"
                >
                  <Settings className="size-4" />
                </Button>
              </div>
            )}
          </div>
        </div>
      </Card>

      {/* Стрічка публікацій */}
      <section ref={newsFeedRef} className="scroll-mt-20 flex flex-col gap-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <h2 className="text-xl font-bold text-foreground">
              Публікації у потоці
            </h2>
            <Badge variant="secondary" className="tabular-nums font-mono">
              {total} матеріалів
            </Badge>
          </div>

          {totalPages > 1 && (
            <span className="text-xs text-muted-foreground font-medium tabular-nums">
              Сторінка <strong className="text-primary">{currentPage}</strong> з{" "}
              <strong className="text-foreground">{totalPages}</strong>
            </span>
          )}
        </div>

        <AnimatePresence mode="wait">
          {isLoading ? (
            <NewsCardSkeletonGrid key="feed-skeleton" count={6} />
          ) : fetchError ? (
            <ErrorState
              key="feed-error"
              title="Помилка завантаження стрічки новин"
              description={fetchError}
              retryLabel="Повторити запит"
              onRetry={() => fetchNews(true, currentPage, pageSize)}
            />
          ) : articles.length === 0 ? (
            <EmptyState
              key="feed-empty"
              icon={<ShieldCheck className="size-6" />}
              title="За вибраними критеріями публікацій не знайдено"
              description="Спробуйте змінити пошуковий запит, розширити часовий діапазон або скинути активні фільтри джерел."
              actionLabel="Скинути фільтри"
              onAction={resetAllFilters}
            />
          ) : (
            <motion.div
              key={`feed-page-${currentPage}-${feedScope}-${category}-${verdict}`}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="flex flex-col gap-8"
            >
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
              <Card className="p-4 flex-col md:flex-row items-center justify-between gap-4 text-xs">
                <div className="flex flex-wrap items-center gap-4 text-muted-foreground tabular-nums">
                  <span>
                    Показано{" "}
                    <strong className="text-foreground">
                      {(currentPage - 1) * pageSize + 1}–
                      {Math.min(currentPage * pageSize, total)}
                    </strong>{" "}
                    із <strong className="text-foreground">{total}</strong>
                  </span>

                  <div className="flex items-center gap-1.5">
                    <span>На сторінці:</span>
                    {[12, 24, 48].map((size) => (
                      <Button
                        key={size}
                        type="button"
                        variant={pageSize === size ? "default" : "ghost"}
                        size="sm"
                        className="h-7 px-2.5 text-xs tabular-nums"
                        onClick={() => {
                          setPageSize(size);
                          setCurrentPage(1);
                        }}
                      >
                        {size}
                      </Button>
                    ))}
                  </div>
                </div>

                {totalPages > 1 && (
                  <div className="flex items-center gap-1">
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      className="size-8"
                      onClick={() => handlePageChange(1)}
                      disabled={currentPage === 1}
                      aria-label="Перша сторінка"
                    >
                      <ChevronsLeft className="size-4" />
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      className="size-8"
                      onClick={() => handlePageChange(currentPage - 1)}
                      disabled={currentPage === 1}
                      aria-label="Попередня сторінка"
                    >
                      <ChevronLeft className="size-4" />
                    </Button>

                    {pageNumbers.map((p, idx) =>
                      p === "…" ? (
                        <span
                          key={`ellipsis-${idx}`}
                          className="px-2 text-muted-foreground font-mono"
                        >
                          …
                        </span>
                      ) : (
                        <Button
                          key={`page-${p}`}
                          type="button"
                          variant={currentPage === p ? "default" : "outline"}
                          size="sm"
                          className="min-w-8 h-8 px-2.5 text-xs tabular-nums"
                          onClick={() => handlePageChange(p as number)}
                          aria-current={currentPage === p ? "page" : undefined}
                        >
                          {p}
                        </Button>
                      )
                    )}

                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      className="size-8"
                      onClick={() => handlePageChange(currentPage + 1)}
                      disabled={currentPage === totalPages}
                      aria-label="Наступна сторінка"
                    >
                      <ChevronRight className="size-4" />
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      className="size-8"
                      onClick={() => handlePageChange(totalPages)}
                      disabled={currentPage === totalPages}
                      aria-label="Остання сторінка"
                    >
                      <ChevronsRight className="size-4" />
                    </Button>
                  </div>
                )}
              </Card>
            </motion.div>
          )}
        </AnimatePresence>
      </section>

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
