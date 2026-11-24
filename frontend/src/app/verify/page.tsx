"use client";

import React, { useState, useEffect, Suspense, useRef, useCallback } from "react";
import { useSearchParams } from "next/navigation";
import { AnimatePresence, motion } from "motion/react";
import { toast } from "sonner";
import { useAuth } from "@/context/AuthContext";
import { useGuestLimit, GUEST_LIMITS } from "@/context/GuestLimitContext";
import { TrustBadge } from "@/components/TrustBadge";
import { TrustScoreBreakdown } from "@/types";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import {
  FieldGroup,
  Field,
  FieldLabel,
  FieldDescription,
  FieldError,
} from "@/components/ui/label";
import { EmptyState, ErrorState } from "@/components/ui/state-displays";
import {
  Sparkles,
  Globe,
  FileText,
  ShieldCheck,
  AlertTriangle,
  CheckCircle2,
  RefreshCw,
  Search,
  ExternalLink,
  Fingerprint,
  PieChart,
  History,
  Clock,
  Eye,
} from "lucide-react";

interface VerificationResponse {
  analysis_id?: number;
  title: string;
  extracted_text_preview?: string;
  analyzed_domain?: string;
  source_url?: string;
  query_type?: string;
  created_at?: string;
  trust_breakdown: TrustScoreBreakdown;
}

interface SavedReportItem {
  analysis_id: number;
  query_type: "url" | "text" | string;
  title: string;
  preview?: string;
  url?: string;
  trust_score: number;
  verdict: string;
  explanation?: string;
  created_at?: string;
}

function VerifyResultSkeleton() {
  return (
    <Card className="border-border/85 bg-card/90 p-6 sm:p-8 flex flex-col gap-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 border-b border-border/70">
        <div className="flex flex-col gap-2 flex-1">
          <Skeleton className="h-4 w-44 rounded-full" />
          <Skeleton className="h-7 w-4/5" />
          <Skeleton className="h-4 w-52" />
        </div>
        <Skeleton className="h-10 w-36 rounded-full" />
      </div>
      <Skeleton className="h-24 w-full rounded-xl" />
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-28 w-full rounded-xl" />
        ))}
      </div>
      <Skeleton className="h-40 w-full rounded-xl" />
    </Card>
  );
}

function VerifyContent() {
  const searchParams = useSearchParams();
  const initialUrl = searchParams.get("url") || "";
  const initialReportId = searchParams.get("report_id") || "";

  const { user, token, isLoading: authLoading, apiUrl } = useAuth();
  const { isReady: guestReady, getRemaining, consumeVerify } = useGuestLimit();
  const resultSectionRef = useRef<HTMLDivElement>(null);
  const autoTriggeredKeyRef = useRef<string | null>(null);

  const [activeTab, setActiveTab] = useState<"url" | "text">("url");
  const [urlInput, setUrlInput] = useState(initialUrl);
  const [titleInput, setTitleInput] = useState("");
  const [textInput, setTextInput] = useState("");
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [result, setResult] = useState<VerificationResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [savedReports, setSavedReports] = useState<SavedReportItem[]>([]);
  const [historyFilter, setHistoryFilter] = useState<"all" | "url" | "text">("all");
  const [loadingHistory, setLoadingHistory] = useState<boolean>(false);

  const fetchSavedReports = useCallback(async () => {
    setLoadingHistory(true);
    try {
      const headers: Record<string, string> = {};
      if (token) headers["Authorization"] = `Bearer ${token}`;
      const res = await fetch(`${apiUrl}/verify/reports?limit=12`, { headers });
      if (res.ok) {
        const data: SavedReportItem[] = await res.json();
        setSavedReports(data);
      }
    } catch {
      // Фонова історія не блокує основну форму
    } finally {
      setLoadingHistory(false);
    }
  }, [apiUrl, token]);

  const loadReportById = useCallback(
    async (reportId: number | string) => {
      setIsAnalyzing(true);
      setError(null);
      setFieldError(null);
      try {
        const headers: Record<string, string> = {};
        if (token) headers["Authorization"] = `Bearer ${token}`;
        const res = await fetch(`${apiUrl}/verify/reports/${reportId}`, { headers });
        if (!res.ok) throw new Error("Не вдалося відкрити збережений звіт перевірки");
        const data: VerificationResponse = await res.json();
        setResult(data);
        setTimeout(() => {
          resultSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
        }, 100);
      } catch (err: unknown) {
        setError(
          err instanceof Error ? err.message : "Помилка завантаження збереженого звіту"
        );
      } finally {
        setIsAnalyzing(false);
      }
    },
    [apiUrl, token]
  );

  const handleVerifyUrl = useCallback(
    async (urlToVerify?: string) => {
      const targetUrl = (urlToVerify ?? urlInput).trim();
      if (!targetUrl) {
        setFieldError("Вкажіть коректну URL-адресу новини для перевірки.");
        return;
      }
      try {
        const parsed = new URL(targetUrl);
        if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
          throw new Error("invalid protocol");
        }
      } catch {
        setFieldError("Введіть коректне посилання, що починається з http:// або https://");
        return;
      }

      if (!user) {
        const allowed = consumeVerify();
        if (!allowed) return;
      }

      setIsAnalyzing(true);
      setError(null);
      setFieldError(null);
      try {
        const headers: Record<string, string> = { "Content-Type": "application/json" };
        if (token) headers["Authorization"] = `Bearer ${token}`;

        const res = await fetch(`${apiUrl}/verify/url`, {
          method: "POST",
          headers,
          body: JSON.stringify({ url: targetUrl }),
        });

        if (!res.ok) {
          throw new Error("Не вдалося проаналізувати вказане посилання. Перевірте доступність сторінки.");
        }
        const data: VerificationResponse = await res.json();
        setResult(data);
        toast.success("XAI-перевірку посилання завершено");
        fetchSavedReports();
        setTimeout(() => {
          resultSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
        }, 100);
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : "Сталася помилка під час аналізу");
      } finally {
        setIsAnalyzing(false);
      }
    },
    [apiUrl, token, user, urlInput, consumeVerify, fetchSavedReports]
  );

  const handleVerifyText = async () => {
    const cleanText = textInput.trim();
    if (cleanText.length < 20) {
      setFieldError("Введіть щонайменше одне повне речення (від 20 символів) для достовірного аналізу.");
      return;
    }

    if (!user) {
      const allowed = consumeVerify();
      if (!allowed) return;
    }

    setIsAnalyzing(true);
    setError(null);
    setFieldError(null);
    try {
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (token) headers["Authorization"] = `Bearer ${token}`;

      const res = await fetch(`${apiUrl}/verify/text`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          title: titleInput.trim() || undefined,
          text: cleanText,
        }),
      });

      if (!res.ok) throw new Error("Не вдалося проаналізувати наданий текст.");
      const data: VerificationResponse = await res.json();
      setResult(data);
      toast.success("XAI-перевірку тексту завершено");
      fetchSavedReports();
      setTimeout(() => {
        resultSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      }, 100);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Сталася помилка під час аналізу");
    } finally {
      setIsAnalyzing(false);
    }
  };

  useEffect(() => {
    fetchSavedReports();
  }, [fetchSavedReports]);

  useEffect(() => {
    if (authLoading || !guestReady) return;
    const key = initialReportId ? `report:${initialReportId}` : initialUrl ? `url:${initialUrl}` : null;
    if (!key || autoTriggeredKeyRef.current === key) return;
    autoTriggeredKeyRef.current = key;

    if (initialReportId) {
      void loadReportById(initialReportId);
    } else if (initialUrl) {
      void handleVerifyUrl(initialUrl);
    }
  }, [initialUrl, initialReportId, authLoading, guestReady, loadReportById, handleVerifyUrl]);

  const filteredSavedReports = savedReports.filter((item) => {
    if (historyFilter === "all") return true;
    return item.query_type === historyFilter;
  });

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8 flex flex-col gap-8">
      {/* Заголовок сторінки */}
      <div className="text-center flex flex-col items-center gap-3 max-w-2xl mx-auto">
        <Badge variant="default">
          <Sparkles className="size-3.5" />
          Пояснювальна верифікація медіаконтенту (Trust Score V4)
        </Badge>
        <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-foreground">
          Швидка перевірка новини або тексту
        </h1>
        <p className="text-sm sm:text-base text-muted-foreground leading-relaxed max-w-[65ch]">
          Вставте посилання на статтю або скопіюйте повідомлення із соцмережі — гібридний ШІ-ансамбль оцінить достовірність, перевірить першоджерела та підсвітить маніпулятивні звороти.
        </p>
        {!authLoading && !user && guestReady && (
          <Badge variant="outline" className="tabular-nums">
            Гостьовий доступ: залишилось {getRemaining("verify")} з {GUEST_LIMITS.verify} безкоштовних перевірок
          </Badge>
        )}
      </div>

      {/* Вкладки та форма перевірки */}
      <Card className="border-border/90 bg-card/90 shadow-lg">
        <CardContent className="p-6 sm:p-8">
          <Tabs
            value={activeTab}
            onValueChange={(val) => {
              setActiveTab(val as "url" | "text");
              setFieldError(null);
              setError(null);
            }}
            className="flex flex-col gap-6"
          >
            <div className="flex justify-center">
              <TabsList className="grid grid-cols-2 w-full max-w-md">
                <TabsTrigger value="url">
                  <Globe className="size-4" />
                  За посиланням (URL)
                </TabsTrigger>
                <TabsTrigger value="text">
                  <FileText className="size-4" />
                  Власний текст статті
                </TabsTrigger>
              </TabsList>
            </div>

            <TabsContent value="url" className="mt-0">
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  handleVerifyUrl();
                }}
                noValidate
              >
                <FieldGroup>
                  <Field data-invalid={Boolean(fieldError)}>
                    <FieldLabel htmlFor="verify-url-input">
                      Посилання (URL) на вебсторінку з новиною
                    </FieldLabel>
                    <div className="relative">
                      <Globe className="size-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
                      <Input
                        id="verify-url-input"
                        type="url"
                        required
                        value={urlInput}
                        onChange={(e) => {
                          setUrlInput(e.target.value);
                          if (fieldError) setFieldError(null);
                        }}
                        placeholder="https://suspilne.media/news/..."
                        aria-invalid={Boolean(fieldError)}
                        aria-describedby={
                          fieldError ? "verify-url-error" : "verify-url-desc"
                        }
                        className="pl-10 h-11"
                      />
                    </div>
                    <FieldDescription id="verify-url-desc">
                      Система автоматично витягне заголовок, основний текст, домен видання та порівняє матеріал з іншими ЗМІ.
                    </FieldDescription>
                    {fieldError && (
                      <FieldError id="verify-url-error">{fieldError}</FieldError>
                    )}
                  </Field>

                  <Button
                    type="submit"
                    size="lg"
                    disabled={isAnalyzing}
                    className="w-full"
                  >
                    {isAnalyzing ? (
                      <>
                        <RefreshCw className="size-4 animate-spin" data-icon="inline-start" />
                        Читаємо статтю та перевіряємо факти...
                      </>
                    ) : (
                      <>
                        <ShieldCheck className="size-4" data-icon="inline-start" />
                        Перевірити новину за посиланням
                      </>
                    )}
                  </Button>
                </FieldGroup>
              </form>
            </TabsContent>

            <TabsContent value="text" className="mt-0">
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  handleVerifyText();
                }}
                noValidate
              >
                <FieldGroup>
                  <Field>
                    <FieldLabel htmlFor="verify-title-input">
                      Заголовок публікації (необов&apos;язково)
                    </FieldLabel>
                    <Input
                      id="verify-title-input"
                      type="text"
                      value={titleInput}
                      onChange={(e) => setTitleInput(e.target.value)}
                      placeholder="Введіть заголовок статті або допису..."
                    />
                  </Field>

                  <Field data-invalid={Boolean(fieldError)}>
                    <FieldLabel htmlFor="verify-text-input">
                      Повний текст або уривок новини
                    </FieldLabel>
                    <Textarea
                      id="verify-text-input"
                      required
                      rows={5}
                      value={textInput}
                      onChange={(e) => {
                        setTextInput(e.target.value);
                        if (fieldError) setFieldError(null);
                      }}
                      placeholder="Вставте текст із соцмережі, Telegram-каналу або новинного сайту..."
                      aria-invalid={Boolean(fieldError)}
                      aria-describedby={
                        fieldError ? "verify-text-error" : "verify-text-desc"
                      }
                    />
                    <FieldDescription id="verify-text-desc">
                      ШІ оцінить кожне речення за шкалою 0–100%, виділить емоційні тригери та перевірить згадки офіційних відомств.
                    </FieldDescription>
                    {fieldError && (
                      <FieldError id="verify-text-error">{fieldError}</FieldError>
                    )}
                  </Field>

                  <Button
                    type="submit"
                    size="lg"
                    disabled={isAnalyzing}
                    className="w-full"
                  >
                    {isAnalyzing ? (
                      <>
                        <RefreshCw className="size-4 animate-spin" data-icon="inline-start" />
                        Перевіряємо текст на маніпуляції та фейки...
                      </>
                    ) : (
                      <>
                        <ShieldCheck className="size-4" data-icon="inline-start" />
                        Перевірити текст
                      </>
                    )}
                  </Button>
                </FieldGroup>
              </form>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      {/* Секція результату або стану завантаження / помилки */}
      <div ref={resultSectionRef} className="scroll-mt-24">
        <AnimatePresence mode="wait">
          {isAnalyzing ? (
            <motion.div
              key="verify-skeleton"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
            >
              <VerifyResultSkeleton />
            </motion.div>
          ) : error ? (
            <motion.div
              key="verify-error"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
            >
              <ErrorState
                title="Не вдалося виконати перевірку"
                message={error}
                onRetry={() =>
                  activeTab === "url" ? handleVerifyUrl() : handleVerifyText()
                }
              />
            </motion.div>
          ) : result ? (
            <motion.div
              key={`verify-result-${result.analysis_id ?? result.title}`}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.25 }}
            >
              <Card className="border-border/90 bg-card/95 shadow-xl">
                <CardHeader className="p-6 sm:p-8 pb-6 border-b border-border/70">
                  <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                    <div className="flex flex-col gap-1.5">
                      <Badge variant="default" className="w-fit">
                        Підсумковий висновок перевірки
                      </Badge>
                      <CardTitle className="text-xl sm:text-2xl font-bold text-foreground leading-snug">
                        {result.title}
                      </CardTitle>
                      {result.analyzed_domain && (
                        <CardDescription className="text-xs text-muted-foreground">
                          Домен джерела:{" "}
                          <strong className="text-foreground font-mono">
                            {result.analyzed_domain}
                          </strong>
                        </CardDescription>
                      )}
                    </div>

                    <TrustBadge
                      score={result.trust_breakdown.score}
                      verdict={result.trust_breakdown.verdict}
                      size="lg"
                    />
                  </div>
                </CardHeader>

                <CardContent className="p-6 sm:p-8 flex flex-col gap-6">
                  {/* Короткий висновок простими словами */}
                  <Alert variant="default" className="bg-primary/8 border-primary/25">
                    <Fingerprint className="size-4 text-primary" />
                    <AlertTitle className="text-primary">
                      Короткий висновок простими словами
                    </AlertTitle>
                    <AlertDescription className="text-sm text-foreground leading-relaxed mt-1">
                      {result.trust_breakdown.explanation}
                    </AlertDescription>
                  </Alert>

                  {/* 4 ключові показники */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
                    <div className="p-4 rounded-xl bg-secondary/55 border border-border/80 flex flex-col gap-2">
                      <span className="text-xs font-semibold text-foreground">
                        1. Спокійний тон тексту
                      </span>
                      <div className="text-xl font-bold text-primary font-mono tabular-nums">
                        {result.trust_breakdown.stylometry_score.toFixed(0)}%
                      </div>
                      <div className="w-full bg-muted h-1.5 rounded-full overflow-hidden">
                        <div
                          className="bg-primary h-full rounded-full"
                          style={{ width: `${result.trust_breakdown.stylometry_score}%` }}
                        />
                      </div>
                      <p className="text-[11px] text-muted-foreground leading-snug">
                        Відсутність кричущих заголовків та емоційного тиску
                      </p>
                    </div>

                    <div className="p-4 rounded-xl bg-secondary/55 border border-border/80 flex flex-col gap-2">
                      <span className="text-xs font-semibold text-foreground">
                        2. Надійність видання
                      </span>
                      <div className="text-xl font-bold text-verified font-mono tabular-nums">
                        {result.trust_breakdown.source_reputation_score.toFixed(0)}%
                      </div>
                      <div className="w-full bg-muted h-1.5 rounded-full overflow-hidden">
                        <div
                          className="bg-verified h-full rounded-full"
                          style={{
                            width: `${result.trust_breakdown.source_reputation_score}%`,
                          }}
                        />
                      </div>
                      <p className="text-[11px] text-muted-foreground leading-snug">
                        Дотримання редакцією журналістських стандартів ІМІ
                      </p>
                    </div>

                    <div className="p-4 rounded-xl bg-secondary/55 border border-border/80 flex flex-col gap-2">
                      <span className="text-xs font-semibold text-foreground">
                        3. Перевірка ШІ на правдивість
                      </span>
                      <div className="text-xl font-bold text-accent font-mono tabular-nums">
                        {result.trust_breakdown.ml_authenticity_score.toFixed(0)}%
                      </div>
                      <div className="w-full bg-muted h-1.5 rounded-full overflow-hidden">
                        <div
                          className="bg-accent h-full rounded-full"
                          style={{
                            width: `${result.trust_breakdown.ml_authenticity_score}%`,
                          }}
                        />
                      </div>
                      <p className="text-[11px] text-muted-foreground leading-snug">
                        Оцінка трьох мовних моделей на схожість із фактами
                      </p>
                    </div>

                    <div className="p-4 rounded-xl bg-secondary/55 border border-border/80 flex flex-col gap-2">
                      <span className="text-xs font-semibold text-foreground">
                        4. Підтвердження в інших ЗМІ
                      </span>
                      <div className="text-xl font-bold text-primary font-mono tabular-nums">
                        {result.trust_breakdown.corroboration_score.toFixed(0)}%
                      </div>
                      <div className="w-full bg-muted h-1.5 rounded-full overflow-hidden">
                        <div
                          className="bg-primary h-full rounded-full"
                          style={{
                            width: `${result.trust_breakdown.corroboration_score}%`,
                          }}
                        />
                      </div>
                      <p className="text-[11px] text-muted-foreground leading-snug">
                        Крос-верифікація події у незалежних редакціях
                      </p>
                    </div>
                  </div>

                  {/* Виявлені маркери маніпуляцій */}
                  {result.trust_breakdown.manipulation_markers.length > 0 && (
                    <Alert variant="destructive">
                      <AlertTriangle className="size-4" />
                      <AlertTitle>
                        Виявлені підозрілі прийоми та емоційні тригери
                      </AlertTitle>
                      <AlertDescription className="mt-2 flex flex-wrap gap-2">
                        {result.trust_breakdown.manipulation_markers.map((marker, idx) => (
                          <Badge key={idx} variant="destructive">
                            {marker}
                          </Badge>
                        ))}
                      </AlertDescription>
                    </Alert>
                  )}

                  {/* Оцінка 3 ШІ-експертів */}
                  {result.trust_breakdown.models_breakdown &&
                    Object.keys(result.trust_breakdown.models_breakdown).length > 0 && (
                      <div className="p-5 rounded-xl bg-secondary/45 border border-border/80 flex flex-col gap-3.5">
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1">
                          <h3 className="text-xs sm:text-sm font-bold text-foreground flex items-center gap-2">
                            <PieChart className="size-4 text-primary" />
                            Як три незалежні ШІ-моделі оцінили цей матеріал
                          </h3>
                          <span className="text-[11px] text-muted-foreground">
                            Вищий відсоток означає вищу відповідність стандартам фактажу
                          </span>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                          {Object.entries(result.trust_breakdown.models_breakdown).map(
                            ([modelKey, modelScore]) => {
                              const numScore = Number(modelScore);
                              const friendlyTitle =
                                modelKey === "ukr_roberta_base" ||
                                modelKey === "ukr-roberta-base"
                                  ? "Український мовний ШІ (ukr-roberta)"
                                  : modelKey === "xlm_roberta_base" ||
                                    modelKey === "xlm-roberta-base"
                                  ? "Міжнародний мовний ШІ (XLM-RoBERTa)"
                                  : "Гібридний детектор фейків (Ensemble)";

                              const friendlySubtitle =
                                modelKey === "ukr_roberta_base" ||
                                modelKey === "ukr-roberta-base"
                                  ? "Аналізує контекст українських новин і мовних зворотів"
                                  : modelKey === "xlm_roberta_base" ||
                                    modelKey === "xlm-roberta-base"
                                  ? "Порівнює матеріал зі стандартами світової журналістики"
                                  : "Перевіряє текст на типові шаблони маніпуляцій та клікбейту";

                              return (
                                <div
                                  key={modelKey}
                                  className="p-3.5 rounded-xl bg-card border border-border flex flex-col gap-2"
                                >
                                  <div className="flex items-center justify-between gap-2">
                                    <span className="text-xs font-semibold text-foreground">
                                      {friendlyTitle}
                                    </span>
                                    <span className="text-xs font-bold font-mono tabular-nums text-primary">
                                      {numScore.toFixed(0)}%
                                    </span>
                                  </div>
                                  <div className="w-full bg-muted h-1.5 rounded-full overflow-hidden">
                                    <div
                                      className={`h-full rounded-full ${
                                        numScore >= 75
                                          ? "bg-verified"
                                          : numScore >= 50
                                          ? "bg-warning"
                                          : "bg-destructive"
                                      }`}
                                      style={{
                                        width: `${Math.min(100, Math.max(5, numScore))}%`,
                                      }}
                                    />
                                  </div>
                                  <p className="text-[11px] text-muted-foreground leading-snug">
                                    {friendlySubtitle}
                                  </p>
                                </div>
                              );
                            }
                          )}
                        </div>
                      </div>
                    )}

                  {/* Важливі слова та вирази (XAI top tokens) */}
                  {result.trust_breakdown.xai_top_tokens &&
                    result.trust_breakdown.xai_top_tokens.length > 0 && (
                      <div className="p-5 rounded-xl bg-secondary/45 border border-border/80 flex flex-col gap-3">
                        <div className="flex flex-col gap-1">
                          <h3 className="text-xs sm:text-sm font-bold text-foreground flex items-center gap-2">
                            <Sparkles className="size-4 text-accent" />
                            Ключові слова та вирази, на які звернув увагу штучний інтелект
                          </h3>
                          <p className="text-[11px] text-muted-foreground">
                            Зеленим позначені маркери перевіреного фактажу, червоним — емоційно забарвлені або маніпулятивні токени.
                          </p>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          {result.trust_breakdown.xai_top_tokens.map((tok, idx) => {
                            const isFake = tok.direction === "fake_indicator";
                            return (
                              <Badge
                                key={idx}
                                variant={isFake ? "destructive" : "verified"}
                                className="px-2.5 py-1 text-xs"
                              >
                                <span>«{tok.token}»</span>
                                <span className="opacity-80">
                                  {isFake ? "— ризик емоцій" : "— маркер фактів"}
                                </span>
                              </Badge>
                            );
                          })}
                        </div>
                      </div>
                    )}

                  {/* NER-детектор цитат та посилань на офіційні джерела */}
                  {result.trust_breakdown.attribution_analysis && (
                    <div className="p-5 rounded-xl bg-secondary/45 border border-border/80 flex flex-col gap-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <h3 className="text-xs sm:text-sm font-bold text-foreground flex items-center gap-2">
                          <ShieldCheck className="size-4 text-verified" />
                          Перевірка цитат і посилань на першоджерела (NER-детектор атрибуції)
                        </h3>
                        <Badge variant="default" className="font-mono tabular-nums">
                          Достовірність атрибуції:{" "}
                          {Number(
                            result.trust_breakdown.attribution_analysis.attribution_score || 70
                          ).toFixed(0)}
                          %
                        </Badge>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {result.trust_breakdown.attribution_analysis.summary}
                      </p>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div className="p-3.5 rounded-xl bg-card border border-border flex flex-col gap-2">
                          <span className="text-xs font-semibold text-verified">
                            Офіційні відомства та документальні джерела:
                          </span>
                          {result.trust_breakdown.attribution_analysis.verified_entities &&
                          result.trust_breakdown.attribution_analysis.verified_entities
                            .length > 0 ? (
                            <div className="flex flex-wrap gap-1.5">
                              {result.trust_breakdown.attribution_analysis.verified_entities.map(
                                (ent, idx) => (
                                  <Badge key={idx} variant="verified">
                                    <CheckCircle2 className="size-3" />
                                    {ent}
                                  </Badge>
                                )
                              )}
                            </div>
                          ) : (
                            <p className="text-xs text-muted-foreground">
                              Прямих згадок офіційних державних чи міжнародних установ не знайдено.
                            </p>
                          )}
                        </div>

                        <div className="p-3.5 rounded-xl bg-card border border-border flex flex-col gap-2">
                          <span className="text-xs font-semibold text-warning">
                            Псевдоцитати або анонімні посилання:
                          </span>
                          {result.trust_breakdown.attribution_analysis.unverified_claims &&
                          result.trust_breakdown.attribution_analysis.unverified_claims
                            .length > 0 ? (
                            <div className="flex flex-wrap gap-1.5">
                              {result.trust_breakdown.attribution_analysis.unverified_claims.map(
                                (claim, idx) => (
                                  <Badge key={idx} variant="destructive">
                                    <AlertTriangle className="size-3" />
                                    {claim}
                                  </Badge>
                                )
                              )}
                            </div>
                          ) : (
                            <p className="text-xs text-muted-foreground">
                              Маніпулятивних посилань на «анонімних інсайдерів» чи чутки не виявлено.
                            </p>
                          )}
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Пореченкова теплова карта достовірності */}
                  {result.trust_breakdown.sentence_analysis &&
                    result.trust_breakdown.sentence_analysis.length > 0 && (
                      <div className="p-5 rounded-xl bg-secondary/45 border border-border/80 flex flex-col gap-3">
                        <div className="flex flex-col gap-1">
                          <h3 className="text-xs sm:text-sm font-bold text-foreground flex items-center gap-2">
                            <FileText className="size-4 text-primary" />
                            Пореченкова теплова карта достовірності (оцінка кожного речення)
                          </h3>
                          <p className="text-[11px] text-muted-foreground">
                            Кожне речення оцінено за шкалою 0–100% з урахуванням контексту, посилань на джерела та емоційності.
                          </p>
                        </div>

                        <div className="flex flex-col gap-2.5 max-h-80 overflow-y-auto pr-1">
                          {result.trust_breakdown.sentence_analysis.map((item) => {
                            const isGood = item.status === "factual";
                            const isBad = item.status === "manipulative";
                            return (
                              <div
                                key={item.index}
                                className={`p-3.5 rounded-xl border-l-4 border flex flex-col gap-1.5 ${
                                  isGood
                                    ? "bg-verified/6 border-verified/25 border-l-verified"
                                    : isBad
                                    ? "bg-destructive/10 border-destructive/30 border-l-destructive"
                                    : "bg-warning/8 border-warning/25 border-l-warning"
                                }`}
                              >
                                <div className="flex items-center justify-between gap-2">
                                  <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                                    {item.is_headline ? "Заголовок" : `Речення #${item.index}`}
                                  </span>
                                  <Badge
                                    variant={
                                      isGood
                                        ? "verified"
                                        : isBad
                                        ? "destructive"
                                        : "warning"
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
                                <p className="text-xs sm:text-sm text-foreground leading-relaxed">
                                  {item.sentence}
                                </p>
                                <p className="text-[11px] text-muted-foreground italic">
                                  Пояснення ШІ: {item.reason}
                                </p>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}

                  {/* Покрокове пояснення 5 етапів перевірки */}
                  {result.trust_breakdown.xai_reasoning_steps &&
                    result.trust_breakdown.xai_reasoning_steps.length > 0 && (
                      <div className="p-5 rounded-xl bg-secondary/45 border border-border/80 flex flex-col gap-3">
                        <h3 className="text-xs sm:text-sm font-bold text-foreground flex items-center gap-2">
                          <CheckCircle2 className="size-4 text-verified" />
                          Покроковий протокол формування оцінки (5 етапів)
                        </h3>
                        <div className="flex flex-col gap-2.5">
                          {result.trust_breakdown.xai_reasoning_steps.map((stepItem) => {
                            const badgeVariant =
                              stepItem.status === "good"
                                ? "verified"
                                : stepItem.status === "warning"
                                ? "warning"
                                : "destructive";
                            return (
                              <div
                                key={stepItem.step}
                                className="p-3.5 rounded-xl bg-card border border-border flex flex-col sm:flex-row sm:items-center justify-between gap-2"
                              >
                                <div className="flex flex-col gap-1">
                                  <div className="flex items-center gap-2">
                                    <span className="size-5 rounded-full bg-secondary text-foreground text-[11px] font-bold flex items-center justify-center tabular-nums">
                                      {stepItem.step}
                                    </span>
                                    <span className="text-xs font-semibold text-foreground">
                                      {stepItem.component}
                                    </span>
                                  </div>
                                  <p className="text-xs text-muted-foreground pl-7 leading-relaxed">
                                    {stepItem.summary}
                                  </p>
                                </div>
                                <Badge
                                  variant={badgeVariant}
                                  className="self-start sm:self-center font-mono tabular-nums shrink-0"
                                >
                                  {Number(stepItem.score).toFixed(0)}%
                                </Badge>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}

                  {/* Крос-верифікація між незалежними ЗМІ */}
                  <div className="p-5 rounded-xl bg-secondary/45 border border-border/80 flex flex-col gap-3">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1">
                      <h3 className="text-xs sm:text-sm font-bold text-foreground flex items-center gap-2">
                        <Search className="size-4 text-primary" />
                        Крос-верифікація у незалежних ЗМІ (pgvector)
                      </h3>
                      <Badge variant="outline" className="tabular-nums w-fit">
                        Знайдено підтверджень:{" "}
                        {result.trust_breakdown.corroborating_articles?.length || 0}
                      </Badge>
                    </div>
                    {result.trust_breakdown.corroboration_summary && (
                      <p className="text-xs text-muted-foreground">
                        {result.trust_breakdown.corroboration_summary}
                      </p>
                    )}
                    {result.trust_breakdown.corroborating_articles &&
                      result.trust_breakdown.corroborating_articles.length > 0 && (
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                          {result.trust_breakdown.corroborating_articles.map((art) => (
                            <a
                              key={art.id}
                              href={art.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="p-3.5 rounded-xl bg-card border border-border hover:border-primary/40 transition-colors flex flex-col justify-between gap-2 group"
                            >
                              <div className="flex flex-col gap-1.5">
                                <div className="flex items-center justify-between gap-2">
                                  <span className="text-xs font-semibold text-primary flex items-center gap-1.5">
                                    {art.source_name}
                                    {art.is_whitelisted && (
                                      <Badge variant="verified" className="text-[10px] px-1.5 py-0">
                                        Білий список ІМІ
                                      </Badge>
                                    )}
                                  </span>
                                  <Badge variant="secondary" className="font-mono tabular-nums">
                                    {(art.similarity * 100).toFixed(0)}%
                                  </Badge>
                                </div>
                                <p className="text-xs text-foreground font-medium line-clamp-2 group-hover:text-primary transition-colors">
                                  {art.title}
                                </p>
                              </div>
                              <div className="flex items-center justify-between text-[11px] text-muted-foreground pt-2 border-t border-border/60 tabular-nums">
                                <span>Рейтинг довіри: {art.trust_score.toFixed(0)}%</span>
                                <span className="inline-flex items-center gap-1 text-primary">
                                  Відкрити <ExternalLink className="size-3" />
                                </span>
                              </div>
                            </a>
                          ))}
                        </div>
                      )}
                  </div>

                  {/* Збіги в базі фактчеків */}
                  {result.trust_breakdown.matched_fact_checks &&
                    result.trust_breakdown.matched_fact_checks.length > 0 && (
                      <Alert variant="warning">
                        <AlertTriangle className="size-4" />
                        <AlertTitle>
                          Схожі розбори від українських фактчекерів (StopFake / VoxCheck)
                        </AlertTitle>
                        <AlertDescription className="mt-3 flex flex-col gap-2.5">
                          {result.trust_breakdown.matched_fact_checks.map((fc) => (
                            <div
                              key={fc.id}
                              className="p-3.5 rounded-xl bg-card border border-warning/30 flex flex-col gap-1.5"
                            >
                              <div className="flex flex-wrap items-center justify-between gap-2">
                                <span className="text-xs font-bold text-warning">
                                  {fc.fact_checker} • Висновок: {fc.rating}
                                </span>
                                <Badge variant="warning" className="font-mono tabular-nums">
                                  Схожість: {(fc.similarity * 100).toFixed(0)}%
                                </Badge>
                              </div>
                              <p className="text-xs text-foreground font-medium">
                                «{fc.claim_text}»
                              </p>
                              {fc.explanation && (
                                <p className="text-xs text-muted-foreground line-clamp-2">
                                  {fc.explanation}
                                </p>
                              )}
                              {fc.source_url && (
                                <div className="pt-1">
                                  <Button
                                    variant="link"
                                    size="xs"
                                    asChild
                                    className="h-auto p-0 text-primary"
                                  >
                                    <a
                                      href={fc.source_url}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                    >
                                      Читати повне спростування
                                      <ExternalLink className="size-3" data-icon="inline-end" />
                                    </a>
                                  </Button>
                                </div>
                              )}
                            </div>
                          ))}
                        </AlertDescription>
                      </Alert>
                    )}
                </CardContent>
              </Card>
            </motion.div>
          ) : null}
        </AnimatePresence>
      </div>

      {/* Нещодавні перевірки */}
      <Card className="border-border/80 bg-card/85">
        <CardHeader className="p-6 pb-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex flex-col gap-1">
            <CardTitle className="text-base sm:text-lg font-bold text-foreground flex items-center gap-2">
              <History className="size-5 text-primary" />
              Нещодавно перевірені матеріали
            </CardTitle>
            <CardDescription className="text-xs text-muted-foreground">
              Натисніть на будь-який запис, щоб миттєво відкрити збережений XAI-звіт
            </CardDescription>
          </div>

          <div className="flex items-center gap-1.5">
            {(["all", "url", "text"] as const).map((flt) => (
              <Button
                key={flt}
                variant={historyFilter === flt ? "default" : "outline"}
                size="xs"
                onClick={() => setHistoryFilter(flt)}
              >
                {flt === "all" ? "Усі" : flt === "url" ? "За URL" : "Тексти"}
              </Button>
            ))}
          </div>
        </CardHeader>

        <CardContent className="p-6 pt-2">
          {loadingHistory ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-20 w-full rounded-xl" />
              ))}
            </div>
          ) : filteredSavedReports.length === 0 ? (
            <EmptyState
              icon={History}
              title="Збережених перевірок у цій категорії ще немає"
              description="Виконайте перевірку за посиланням або власним текстом вище — результат автоматично з'явиться в журналі."
            />
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {filteredSavedReports.slice(0, 8).map((item) => (
                <div
                  key={item.analysis_id}
                  className="p-3.5 rounded-xl bg-secondary/50 border border-border/80 hover:border-primary/40 transition-colors flex items-center justify-between gap-3"
                >
                  <div className="flex flex-col gap-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                        {item.query_type === "url" ? "URL" : "Текст"}
                      </Badge>
                      {item.created_at && (
                        <span className="text-[11px] text-muted-foreground inline-flex items-center gap-1 font-mono tabular-nums">
                          <Clock className="size-3" />
                          {new Date(item.created_at).toLocaleDateString("uk-UA")}
                        </span>
                      )}
                    </div>
                    <p className="text-xs font-semibold text-foreground truncate">
                      {item.title}
                    </p>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <TrustBadge
                      score={item.trust_score}
                      verdict={item.verdict as "Verified" | "Caution" | "High Risk"}
                      size="sm"
                    />
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      onClick={() => loadReportById(item.analysis_id)}
                      aria-label={`Відкрити звіт: ${item.title}`}
                    >
                      <Eye className="size-4 text-primary" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export default function VerifyPage() {
  return (
    <Suspense
      fallback={
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8 flex flex-col gap-8">
          <div className="flex flex-col items-center gap-3 max-w-2xl mx-auto w-full">
            <Skeleton className="h-6 w-56 rounded-full" />
            <Skeleton className="h-10 w-3/4" />
            <Skeleton className="h-4 w-2/3" />
          </div>
          <VerifyResultSkeleton />
        </div>
      }
    >
      <VerifyContent />
    </Suspense>
  );
}
