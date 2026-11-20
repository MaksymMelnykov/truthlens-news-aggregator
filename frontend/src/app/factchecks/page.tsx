"use client";

import React, { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { AnimatePresence, motion } from "motion/react";
import { toast } from "sonner";
import { useAuth } from "@/context/AuthContext";
import { FactCheckClaim } from "@/types";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
} from "@/components/ui/card";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";
import {
  EmptyState,
  ErrorState,
  FactCheckListSkeleton,
} from "@/components/ui/state-displays";
import {
  ShieldAlert,
  Search,
  RefreshCw,
  CheckCircle2,
  XCircle,
  Sparkles,
  ArrowUpRight,
  Calendar,
  Building,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  RotateCcw,
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

interface OnlineCheckMatch {
  claim: string;
  fact_checker: string;
  rating: string;
  explanation?: string;
  review_url?: string;
}

interface OnlineCheckResult {
  is_debunked: boolean;
  confidence: number;
  matched_claim?: OnlineCheckMatch | null;
}

export default function FactChecksPage() {
  const { apiUrl } = useAuth();
  const [claims, setClaims] = useState<FactCheckClaim[]>([]);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedChecker, setSelectedChecker] = useState<string>("all");
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [pageSize, setPageSize] = useState<number>(9);
  const factChecksGridRef = useRef<HTMLDivElement>(null);

  const [checkText, setCheckText] = useState("");
  const [isChecking, setIsChecking] = useState(false);
  const [checkResult, setCheckResult] = useState<OnlineCheckResult | null>(null);
  const [lastRefreshedAt, setLastRefreshedAt] = useState<string>("щойно");

  const fetchClaims = useCallback(
    async (showLoading = true) => {
      if (showLoading) {
        setLoading(true);
        setFetchError(null);
      }
      try {
        const res = await fetch(`${apiUrl}/factchecks?page_size=200&limit=200`, {
          cache: "no-store",
        });
        if (!res.ok) {
          throw new Error("Не вдалося завантажити реєстр спростованих фейків.");
        }
        const data = await res.json();
        setClaims(data.items || []);
        const now = new Date();
        setLastRefreshedAt(
          `${now.getHours().toString().padStart(2, "0")}:${now
            .getMinutes()
            .toString()
            .padStart(2, "0")}:${now.getSeconds().toString().padStart(2, "0")}`
        );
      } catch (err: unknown) {
        if (showLoading) {
          setFetchError(
            err instanceof Error
              ? err.message
              : "Тимчасова помилка з'єднання із сервером верифікації."
          );
        }
      } finally {
        if (showLoading) setLoading(false);
      }
    },
    [apiUrl]
  );

  useEffect(() => {
    fetchClaims(true);
  }, [fetchClaims]);

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
  }, [fetchClaims]);

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
      if (!res.ok) {
        throw new Error("Не вдалося виконати миттєву звірку твердження");
      }
      const data: OnlineCheckResult = await res.json();
      setCheckResult(data);
    } catch {
      toast.error("Не вдалося звірити твердження з базою фактчеків.");
    } finally {
      setIsChecking(false);
    }
  };

  const filteredClaims = useMemo(() => {
    return claims.filter((item) => {
      const matchesSearch =
        searchQuery === "" ||
        item.claim.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (item.explanation &&
          item.explanation.toLowerCase().includes(searchQuery.toLowerCase())) ||
        item.fact_checker.toLowerCase().includes(searchQuery.toLowerCase());

      const matchesChecker =
        selectedChecker === "all" ||
        item.fact_checker.toLowerCase().includes(selectedChecker.toLowerCase());

      return matchesSearch && matchesChecker;
    });
  }, [claims, searchQuery, selectedChecker]);

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

  const resetFilters = () => {
    setSearchQuery("");
    setSelectedChecker("all");
    setCurrentPage(1);
  };

  const factCheckers = useMemo(() => {
    return Array.from(new Set(claims.map((c) => c.fact_checker)));
  }, [claims]);

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 flex flex-col gap-8">
      {/* Шапка реєстру спростувань та віджет миттєвої звірки */}
      <Card className="relative overflow-hidden border-border/90 bg-card/90 shadow-lg">
        <div
          className="pointer-events-none absolute -top-24 -right-24 size-72 rounded-full bg-accent/10 blur-3xl"
          aria-hidden="true"
        />
        <CardHeader className="p-6 sm:p-8 pb-4">
          <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
            <div className="flex flex-col gap-3 max-w-3xl">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="accent">
                  <ShieldAlert className="size-3.5" />
                  Центр протидії дезінформації та фейкам
                </Badge>
                <Badge variant="outline" className="tabular-nums font-mono">
                  <span className="size-2 rounded-full bg-verified animate-pulse" />
                  Синхронізовано: {lastRefreshedAt}
                </Badge>
              </div>
              <CardTitle className="text-2xl sm:text-3xl md:text-4xl font-extrabold tracking-tight text-foreground">
                База спростованих фейків та ІПСО
              </CardTitle>
              <CardDescription className="text-sm sm:text-base text-muted-foreground leading-relaxed max-w-[68ch]">
                Оперативна база дезінформаційних вкидів та маніпуляцій, верифікованих провідними фактчекерами (StopFake, VoxCheck, Детектор медіа, AFP, Reuters). Автоматично зіставляється з кожною новиною платформи за допомогою векторного пошуку.
              </CardDescription>
            </div>

            <Button
              variant="outline"
              size="sm"
              onClick={() => fetchClaims(true)}
              disabled={loading}
              className="self-start shrink-0"
            >
              <RefreshCw
                className={`size-4 text-primary ${loading ? "animate-spin" : ""}`}
                data-icon="inline-start"
              />
              Оновити реєстр
            </Button>
          </div>
        </CardHeader>

        <CardContent className="p-6 sm:p-8 pt-2">
          <div className="rounded-xl border border-border/80 bg-secondary/50 p-4 sm:p-5 flex flex-col gap-3">
            <div className="flex items-center gap-2 text-xs sm:text-sm font-semibold text-foreground">
              <Sparkles className="size-4 text-accent shrink-0" />
              <span>Миттєва семантична звірка будь-якого твердження з базою спростувань:</span>
            </div>

            <form
              onSubmit={handleOnlineCheck}
              className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5"
            >
              <div className="relative flex-1">
                <Search className="size-4 text-muted-foreground absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                <Input
                  type="search"
                  value={checkText}
                  onChange={(e) => setCheckText(e.target.value)}
                  placeholder="Введіть підозрілий заголовок або тезу (наприклад: Польща скасовує виплати)..."
                  aria-label="Твердження для звірки з базою фактчеків"
                  className="pl-10"
                />
              </div>
              <Button
                type="submit"
                variant="accent"
                disabled={isChecking || !checkText.trim()}
                className="shrink-0"
              >
                {isChecking ? (
                  <RefreshCw className="size-4 animate-spin" data-icon="inline-start" />
                ) : (
                  <Search className="size-4" data-icon="inline-start" />
                )}
                Перевірити тезу
              </Button>
            </form>

            <AnimatePresence mode="wait">
              {checkResult && (
                <motion.div
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -6 }}
                  transition={{ duration: 0.2 }}
                >
                  <Alert
                    variant={checkResult.is_debunked ? "destructive" : "verified"}
                    className="mt-1"
                  >
                    {checkResult.is_debunked ? (
                      <XCircle className="size-4" />
                    ) : (
                      <CheckCircle2 className="size-4" />
                    )}
                    <AlertTitle className="tabular-nums">
                      {checkResult.is_debunked
                        ? `Виявлено збіг із відомим фейком (схожість ${Math.round(
                            checkResult.confidence * 100
                          )}%)`
                        : "Прямих збігів зі спростованими фейками у базі не виявлено"}
                    </AlertTitle>
                    {checkResult.matched_claim && (
                      <AlertDescription className="mt-2 flex flex-col gap-1.5 text-xs">
                        <div>
                          <strong className="text-foreground">Спростована теза:</strong>{" "}
                          «{checkResult.matched_claim.claim}»
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                          <strong className="text-foreground">Організація:</strong>
                          <Badge variant="accent">
                            {checkResult.matched_claim.fact_checker}
                          </Badge>
                          <Badge variant="destructive">
                            {checkResult.matched_claim.rating}
                          </Badge>
                        </div>
                        {checkResult.matched_claim.explanation && (
                          <p className="text-muted-foreground leading-relaxed">
                            <strong className="text-foreground">Пояснення:</strong>{" "}
                            {checkResult.matched_claim.explanation}
                          </p>
                        )}
                        {checkResult.matched_claim.review_url && (
                          <div className="pt-1">
                            <Button
                              variant="link"
                              size="sm"
                              asChild
                              className="h-auto p-0 text-primary"
                            >
                              <a
                                href={checkResult.matched_claim.review_url}
                                target="_blank"
                                rel="noopener noreferrer"
                              >
                                Читати оригінальне розслідування фактчекерів
                                <ArrowUpRight className="size-3.5" data-icon="inline-end" />
                              </a>
                            </Button>
                          </div>
                        )}
                      </AlertDescription>
                    )}
                  </Alert>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </CardContent>
      </Card>

      {/* Панель пошуку та фільтрів організацій */}
      <div className="flex flex-col lg:flex-row gap-4 items-stretch lg:items-center justify-between pb-5 border-b border-border/70">
        <div className="relative flex-1 max-w-md">
          <Search className="size-4 text-muted-foreground absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          <Input
            type="search"
            value={searchQuery}
            onChange={(e) => handleSearchChange(e.target.value)}
            placeholder="Фільтрувати спростування за ключовими словами..."
            aria-label="Фільтр спростувань за ключовими словами"
            className="pl-10"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-muted-foreground inline-flex items-center gap-1.5 mr-1 font-medium">
            <Building className="size-3.5 text-primary" />
            Організація:
          </span>
          <Button
            variant={selectedChecker === "all" ? "default" : "outline"}
            size="xs"
            onClick={() => handleCheckerChange("all")}
            className="tabular-nums"
          >
            Всі ({claims.length})
          </Button>
          {factCheckers.map((checker) => (
            <Button
              key={checker}
              variant={selectedChecker === checker ? "default" : "outline"}
              size="xs"
              onClick={() => handleCheckerChange(checker)}
            >
              {checker}
            </Button>
          ))}
        </div>
      </div>

      {/* Сітка спростувань */}
      <div ref={factChecksGridRef} className="scroll-mt-24 flex flex-col gap-6">
        <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground font-mono tabular-nums">
          <span>
            ЗНАЙДЕНО СПРОСТУВАНЬ: <strong className="text-foreground">{filteredClaims.length}</strong>{" "}
            (сторінка {currentPage} з {totalPages})
          </span>
          <Badge variant="verified" className="font-mono">
            МОНІТОРИНГ АКТИВНИЙ
          </Badge>
        </div>

        <AnimatePresence mode="wait">
          {loading ? (
            <motion.div
              key="factchecks-skeleton"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
            >
              <FactCheckListSkeleton count={6} />
            </motion.div>
          ) : fetchError ? (
            <motion.div
              key="factchecks-error"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
            >
              <ErrorState
                title="Не вдалося завантажити базу спростувань"
                message={fetchError}
                onRetry={() => fetchClaims(true)}
              />
            </motion.div>
          ) : filteredClaims.length === 0 ? (
            <motion.div
              key="factchecks-empty"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
            >
              <EmptyState
                icon={ShieldAlert}
                title="За вказаними критеріями спростувань не знайдено"
                description="Спробуйте змінити пошуковий запит або скинути фільтр фактчекінгової організації."
                actionLabel="Скинути фільтри"
                onAction={resetFilters}
              />
            </motion.div>
          ) : (
            <motion.div
              key={`factchecks-grid-${currentPage}-${selectedChecker}`}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.22 }}
              className="flex flex-col gap-8"
            >
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {paginatedClaims.map((claim, idx) => (
                  <motion.div
                    key={claim.id}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.2, delay: Math.min(idx * 0.03, 0.2) }}
                    className="h-full"
                  >
                    <Card className="h-full flex flex-col justify-between border-border/85 bg-card/90 hover:border-primary/40 transition-colors group">
                      <CardHeader className="p-5 pb-3 flex flex-col gap-3">
                        <div className="flex items-center justify-between gap-2">
                          <Badge variant="destructive">
                            <XCircle className="size-3.5" />
                            {claim.rating || "Фейк"}
                          </Badge>
                          <Badge variant="accent">{claim.fact_checker}</Badge>
                        </div>

                        <CardTitle className="text-base font-bold text-foreground group-hover:text-primary transition-colors line-clamp-3 leading-snug">
                          «{claim.claim}»
                        </CardTitle>
                      </CardHeader>

                      <CardContent className="px-5 py-0 flex-1">
                        {claim.explanation ? (
                          <div className="rounded-xl bg-secondary/55 border border-border/60 p-3 text-xs text-muted-foreground line-clamp-4 leading-relaxed">
                            {claim.explanation}
                          </div>
                        ) : (
                          <div className="rounded-xl bg-secondary/35 border border-border/40 p-3 text-xs text-muted-foreground italic">
                            Твердження офіційно спростоване редакцією {claim.fact_checker}.
                          </div>
                        )}
                      </CardContent>

                      <CardFooter className="p-5 pt-4 mt-4 border-t border-border/60 flex items-center justify-between text-xs text-muted-foreground">
                        <span className="inline-flex items-center gap-1.5 font-mono text-[11px] tabular-nums">
                          <Calendar className="size-3.5 text-muted-foreground" />
                          {claim.published_at
                            ? new Date(claim.published_at).toLocaleDateString("uk-UA")
                            : "Актуальний запис"}
                        </span>

                        {claim.review_url ? (
                          <Button variant="ghost" size="xs" asChild className="text-primary">
                            <a
                              href={claim.review_url}
                              target="_blank"
                              rel="noopener noreferrer"
                            >
                              Розслідування
                              <ArrowUpRight className="size-3.5" data-icon="inline-end" />
                            </a>
                          </Button>
                        ) : (
                          <Badge variant="secondary">Архівний запис</Badge>
                        )}
                      </CardFooter>
                    </Card>
                  </motion.div>
                ))}
              </div>

              {/* Пагінація */}
              <div className="pt-6 border-t border-border/80 flex flex-col sm:flex-row items-center justify-between gap-4">
                <div className="flex flex-wrap items-center gap-4 text-xs text-muted-foreground tabular-nums">
                  <span>
                    Показано{" "}
                    <strong className="text-foreground">
                      {Math.min((currentPage - 1) * pageSize + 1, filteredClaims.length)}–
                      {Math.min(currentPage * pageSize, filteredClaims.length)}
                    </strong>{" "}
                    із <strong className="text-foreground">{filteredClaims.length}</strong> спростувань
                  </span>

                  <div className="inline-flex items-center gap-1 rounded-xl bg-secondary/70 border border-border px-2 py-1">
                    <span className="text-muted-foreground pr-1">На сторінці:</span>
                    {[9, 18, 36].map((size) => (
                      <Button
                        key={size}
                        variant={pageSize === size ? "default" : "ghost"}
                        size="xs"
                        onClick={() => handlePageSizeChange(size)}
                        className="h-6 px-2 tabular-nums"
                      >
                        {size}
                      </Button>
                    ))}
                  </div>
                </div>

                {totalPages > 1 && (
                  <div className="flex items-center gap-1.5">
                    <Button
                      variant="outline"
                      size="icon-sm"
                      onClick={() => handlePageChange(1)}
                      disabled={currentPage === 1}
                      aria-label="Перша сторінка"
                    >
                      <ChevronsLeft className="size-4" />
                    </Button>
                    <Button
                      variant="outline"
                      size="icon-sm"
                      onClick={() => handlePageChange(currentPage - 1)}
                      disabled={currentPage === 1}
                      aria-label="Попередня сторінка"
                    >
                      <ChevronLeft className="size-4" />
                    </Button>

                    <div className="flex items-center gap-1">
                      {pageNumbers.map((p, idx) =>
                        p === "..." ? (
                          <span
                            key={`ellipsis-${idx}`}
                            className="px-2 py-1 text-muted-foreground select-none font-mono"
                          >
                            ...
                          </span>
                        ) : (
                          <Button
                            key={`page-${p}`}
                            variant={currentPage === p ? "default" : "outline"}
                            size="sm"
                            onClick={() => handlePageChange(p as number)}
                            className="min-w-8 h-8 px-2.5 tabular-nums"
                          >
                            {p}
                          </Button>
                        )
                      )}
                    </div>

                    <Button
                      variant="outline"
                      size="icon-sm"
                      onClick={() => handlePageChange(currentPage + 1)}
                      disabled={currentPage === totalPages}
                      aria-label="Наступна сторінка"
                    >
                      <ChevronRight className="size-4" />
                    </Button>
                    <Button
                      variant="outline"
                      size="icon-sm"
                      onClick={() => handlePageChange(totalPages)}
                      disabled={currentPage === totalPages}
                      aria-label="Остання сторінка"
                    >
                      <ChevronsRight className="size-4" />
                    </Button>
                  </div>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
