"use client";

import React, { useState, useEffect, Suspense, useRef } from "react";
import { useSearchParams } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { TrustBadge } from "@/components/TrustBadge";
import { TrustScoreBreakdown } from "@/types";
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

function VerifyContent() {
  const searchParams = useSearchParams();
  const initialUrl = searchParams.get("url") || "";
  const initialReportId = searchParams.get("report_id") || "";

  const { token, apiUrl } = useAuth();
  const resultSectionRef = useRef<HTMLDivElement>(null);

  const [activeTab, setActiveTab] = useState<"url" | "text">(initialUrl ? "url" : "url");
  const [urlInput, setUrlInput] = useState(initialUrl);
  const [titleInput, setTitleInput] = useState("");
  const [textInput, setTextInput] = useState("");
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [result, setResult] = useState<VerificationResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Історія раніше перевірених статей та текстів
  const [savedReports, setSavedReports] = useState<SavedReportItem[]>([]);
  const [historyFilter, setHistoryFilter] = useState<"all" | "url" | "text">("all");
  const [loadingHistory, setLoadingHistory] = useState<boolean>(false);

  const fetchSavedReports = async () => {
    setLoadingHistory(true);
    try {
      const headers: Record<string, string> = {};
      if (token) headers["Authorization"] = `Bearer ${token}`;
      const res = await fetch(`${apiUrl}/verify/reports?limit=20`, { headers });
      if (res.ok) {
        const data: SavedReportItem[] = await res.json();
        setSavedReports(data);
      }
    } catch (e) {
      console.error("Не вдалося завантажити збережені перевірки", e);
    } finally {
      setLoadingHistory(false);
    }
  };

  const loadReportById = async (reportId: number | string) => {
    setIsAnalyzing(true);
    setError(null);
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
    } catch (err: any) {
      setError(err.message || "Помилка завантаження збереженого звіту");
    } finally {
      setIsAnalyzing(false);
    }
  };

  useEffect(() => {
    fetchSavedReports();
  }, [apiUrl, token]);

  useEffect(() => {
    if (initialReportId) {
      loadReportById(initialReportId);
    } else if (initialUrl) {
      handleVerifyUrl(initialUrl);
    }
  }, [initialUrl, initialReportId]);

  const handleVerifyUrl = async (urlToVerify?: string) => {
    const targetUrl = urlToVerify || urlInput;
    if (!targetUrl.trim()) return;

    setIsAnalyzing(true);
    setError(null);
    try {
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (token) headers["Authorization"] = `Bearer ${token}`;

      const res = await fetch(`${apiUrl}/verify/url`, {
        method: "POST",
        headers,
        body: JSON.stringify({ url: targetUrl.trim() }),
      });

      if (!res.ok) throw new Error("Не вдалося проаналізувати вказане посилання");
      const data: VerificationResponse = await res.json();
      setResult(data);
      fetchSavedReports();
    } catch (err: any) {
      setError(err.message || "Сталася помилка під час аналізу");
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleVerifyText = async () => {
    if (!textInput.trim()) return;

    setIsAnalyzing(true);
    setError(null);
    try {
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (token) headers["Authorization"] = `Bearer ${token}`;

      const res = await fetch(`${apiUrl}/verify/text`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          title: titleInput.trim() || undefined,
          text: textInput.trim(),
        }),
      });

      if (!res.ok) throw new Error("Не вдалося проаналізувати текст");
      const data: VerificationResponse = await res.json();
      setResult(data);
      fetchSavedReports();
    } catch (err: any) {
      setError(err.message || "Сталася помилка під час аналізу");
    } finally {
      setIsAnalyzing(false);
    }
  };

  const filteredSavedReports = savedReports.filter((item) => {
    if (historyFilter === "all") return true;
    return item.query_type === historyFilter;
  });

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
      {/* Заголовок */}
      <div className="text-center space-y-2 max-w-2xl mx-auto">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-semibold bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">
          <Sparkles className="w-3.5 h-3.5" />
          <span>Зрозуміла перевірка новин за допомогою ШІ</span>
        </div>
        <h1 className="text-3xl font-extrabold text-white">Швидка перевірка новини</h1>
        <p className="text-sm text-zinc-400">
          Вставте посилання на статтю або скопіюйте її текст — система простими словами пояснить, чи варто їй довіряти
        </p>
      </div>

      {/* Перемикач вкладок */}
      <div className="flex justify-center">
        <div className="inline-flex p-1 rounded-2xl bg-zinc-900 border border-zinc-800">
          <button
            onClick={() => {
              setActiveTab("url");
              setResult(null);
            }}
            className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs sm:text-sm font-semibold transition-all ${
              activeTab === "url"
                ? "bg-zinc-800 text-white shadow-md shadow-zinc-950/40"
                : "text-zinc-400 hover:text-zinc-200"
            }`}
          >
            <Globe className="w-4 h-4" />
            За посиланням (URL)
          </button>
          <button
            onClick={() => {
              setActiveTab("text");
              setResult(null);
            }}
            className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs sm:text-sm font-semibold transition-all ${
              activeTab === "text"
                ? "bg-zinc-800 text-white shadow-md shadow-zinc-950/40"
                : "text-zinc-400 hover:text-zinc-200"
            }`}
          >
            <FileText className="w-4 h-4" />
            Власний текст статті
          </button>
        </div>
      </div>

      {/* Форма введення */}
      <div className="rounded-3xl border border-zinc-800 bg-zinc-900/60 p-6 backdrop-blur-xl shadow-xl space-y-4">
        {activeTab === "url" ? (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleVerifyUrl();
            }}
            className="space-y-4"
          >
            <div className="space-y-1">
              <label className="text-xs font-semibold text-zinc-300">
                Посилання (URL) на веб-сторінку з новиною
              </label>
              <div className="relative">
                <Globe className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-zinc-500" />
                <input
                  type="url"
                  required
                  value={urlInput}
                  onChange={(e) => setUrlInput(e.target.value)}
                  placeholder="https://suspilne.media/news/..."
                  className="w-full pl-10 pr-4 py-3 rounded-2xl bg-zinc-950 border border-zinc-800 text-sm text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-cyan-500 transition-colors"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={isAnalyzing}
              className="w-full py-3 rounded-2xl bg-gradient-to-r from-cyan-500 to-indigo-600 text-white font-semibold text-sm shadow-lg shadow-cyan-500/20 hover:shadow-cyan-500/35 hover:brightness-110 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
            >
              {isAnalyzing ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  <span>Читаємо статтю та перевіряємо факти...</span>
                </>
              ) : (
                <>
                  <ShieldCheck className="w-4 h-4" />
                  <span>Перевірити новину за посиланням</span>
                </>
              )}
            </button>
          </form>
        ) : (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleVerifyText();
            }}
            className="space-y-4"
          >
            <div className="space-y-1">
              <label className="text-xs font-semibold text-zinc-300">
                Заголовок новини (необов&apos;язково)
              </label>
              <input
                type="text"
                value={titleInput}
                onChange={(e) => setTitleInput(e.target.value)}
                placeholder="Введіть заголовок статті..."
                className="w-full px-4 py-2.5 rounded-2xl bg-zinc-950 border border-zinc-800 text-sm text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-cyan-500 transition-colors"
              />
            </div>

            <div className="space-y-1">
              <label className="text-xs font-semibold text-zinc-300">
                Повний текст або уривок новини
              </label>
              <textarea
                required
                rows={5}
                value={textInput}
                onChange={(e) => setTextInput(e.target.value)}
                placeholder="Вставте текст із соцмережі, Telegram-каналу або сайту..."
                className="w-full px-4 py-3 rounded-2xl bg-zinc-950 border border-zinc-800 text-sm text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-cyan-500 transition-colors resize-none"
              />
            </div>

            <button
              type="submit"
              disabled={isAnalyzing}
              className="w-full py-3 rounded-2xl bg-gradient-to-r from-cyan-500 to-indigo-600 text-white font-semibold text-sm shadow-lg shadow-cyan-500/20 hover:shadow-cyan-500/35 hover:brightness-110 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
            >
              {isAnalyzing ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  <span>Перевіряємо текст на маніпуляції та фейки...</span>
                </>
              ) : (
                <>
                  <ShieldCheck className="w-4 h-4" />
                  <span>Перевірити текст</span>
                </>
              )}
            </button>
          </form>
        )}
      </div>

      {/* Помилка */}
      {error && (
        <div className="p-4 rounded-2xl bg-rose-500/10 border border-rose-500/20 text-rose-400 text-sm flex items-center gap-3">
          <AlertTriangle className="w-5 h-5 flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Результати перевірки (Пояснювальний ШІ простими словами) */}
      <div ref={resultSectionRef}>
        {result && (
          <div className="rounded-3xl border border-zinc-800 bg-zinc-900/80 p-6 sm:p-8 backdrop-blur-xl shadow-2xl space-y-6">
            {/* Головний індекс довіри */}
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b border-zinc-800 pb-6">
              <div className="space-y-1">
                <span className="text-xs font-semibold uppercase tracking-wider text-cyan-400">
                  Підсумковий висновок перевірки
                </span>
                <h2 className="text-xl sm:text-2xl font-bold text-white">
                  {result.title}
                </h2>
                {result.analyzed_domain && (
                  <p className="text-xs text-zinc-400">
                    Сайт джерела: <strong className="text-zinc-200">{result.analyzed_domain}</strong>
                  </p>
                )}
              </div>

              <TrustBadge
                score={result.trust_breakdown.score}
                verdict={result.trust_breakdown.verdict}
                size="lg"
              />
            </div>

            {/* Головне пояснення простими словами (на першому місці для зручності читача) */}
            <div className="p-5 rounded-2xl bg-cyan-500/5 border border-cyan-500/20 space-y-2">
              <h4 className="text-sm font-bold text-cyan-300 flex items-center gap-2">
                <Fingerprint className="w-4 h-4 text-cyan-400" />
                Короткий висновок простими словами:
              </h4>
              <p className="text-sm text-zinc-200 leading-relaxed">
                {result.trust_breakdown.explanation}
              </p>
            </div>

            {/* 4 зрозумілі показники для людей будь-якого віку */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              <div className="p-4 rounded-2xl bg-zinc-950/60 border border-zinc-800/80 space-y-1.5">
                <span className="text-xs font-semibold text-zinc-200">
                  1. Спокійний тон тексту
                </span>
                <div className="text-xl font-bold text-cyan-400 font-mono">
                  {result.trust_breakdown.stylometry_score.toFixed(0)}%
                </div>
                <div className="w-full bg-zinc-800 h-1.5 rounded-full overflow-hidden">
                  <div
                    className="bg-cyan-500 h-full rounded-full"
                    style={{ width: `${result.trust_breakdown.stylometry_score}%` }}
                  />
                </div>
                <p className="text-[11px] text-zinc-400">
                  Чи немає кричущих заголовків та тиску на емоції
                </p>
              </div>

              <div className="p-4 rounded-2xl bg-zinc-950/60 border border-zinc-800/80 space-y-1.5">
                <span className="text-xs font-semibold text-zinc-200">
                  2. Надійність видання
                </span>
                <div className="text-xl font-bold text-emerald-400 font-mono">
                  {result.trust_breakdown.source_reputation_score.toFixed(0)}%
                </div>
                <div className="w-full bg-zinc-800 h-1.5 rounded-full overflow-hidden">
                  <div
                    className="bg-emerald-500 h-full rounded-full"
                    style={{ width: `${result.trust_breakdown.source_reputation_score}%` }}
                  />
                </div>
                <p className="text-[11px] text-zinc-400">
                  Чи дотримується цей сайт журналістських стандартів
                </p>
              </div>

              <div className="p-4 rounded-2xl bg-zinc-950/60 border border-zinc-800/80 space-y-1.5">
                <span className="text-xs font-semibold text-zinc-200">
                  3. Перевірка ШІ на правдивість
                </span>
                <div className="text-xl font-bold text-indigo-400 font-mono">
                  {result.trust_breakdown.ml_authenticity_score.toFixed(0)}%
                </div>
                <div className="w-full bg-zinc-800 h-1.5 rounded-full overflow-hidden">
                  <div
                    className="bg-indigo-500 h-full rounded-full"
                    style={{ width: `${result.trust_breakdown.ml_authenticity_score}%` }}
                  />
                </div>
                <p className="text-[11px] text-zinc-400">
                  Чи схожий текст на реальні факти, а не на вигадку
                </p>
              </div>

              <div className="p-4 rounded-2xl bg-zinc-950/60 border border-zinc-800/80 space-y-1.5">
                <span className="text-xs font-semibold text-zinc-200">
                  4. Підтвердження в інших ЗМІ
                </span>
                <div className="text-xl font-bold text-purple-400 font-mono">
                  {result.trust_breakdown.corroboration_score.toFixed(0)}%
                </div>
                <div className="w-full bg-zinc-800 h-1.5 rounded-full overflow-hidden">
                  <div
                    className="bg-purple-500 h-full rounded-full"
                    style={{ width: `${result.trust_breakdown.corroboration_score}%` }}
                  />
                </div>
                <p className="text-[11px] text-zinc-400">
                  Чи повідомляють про цю подію інші незалежні медіа
                </p>
              </div>
            </div>

            {/* Знайдені маркери маніпуляцій */}
            {result.trust_breakdown.manipulation_markers.length > 0 && (
              <div className="p-4 rounded-2xl bg-rose-500/5 border border-rose-500/20 space-y-2">
                <h4 className="text-xs font-semibold text-rose-400 flex items-center gap-1.5">
                  <AlertTriangle className="w-4 h-4" />
                  На що варто звернути особливу увагу (виявлені підозрілі прийоми):
                </h4>
                <div className="flex flex-wrap gap-2">
                  {result.trust_breakdown.manipulation_markers.map((marker, idx) => (
                    <span
                      key={idx}
                      className="px-2.5 py-1 rounded-lg text-xs font-medium bg-rose-500/10 text-rose-300 border border-rose-500/30"
                    >
                      {marker}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Зрозуміле пояснення 3 ШІ-експертів без складних технічних термінів */}
            {result.trust_breakdown.models_breakdown &&
              Object.keys(result.trust_breakdown.models_breakdown).length > 0 && (
                <div className="p-5 rounded-2xl bg-zinc-950/70 border border-zinc-800/90 space-y-3">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1">
                    <h4 className="text-xs font-semibold text-indigo-300 flex items-center gap-1.5">
                      <PieChart className="w-4 h-4 text-indigo-400" />
                      Як три незалежні ШІ-експерти оцінили цей текст:
                    </h4>
                    <span className="text-[11px] text-zinc-400">
                      Чим вищий відсоток — тим більше текст схожий на правдиву новину
                    </span>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    {Object.entries(result.trust_breakdown.models_breakdown).map(
                      ([modelKey, modelScore]) => {
                        const friendlyTitle =
                          modelKey === "ukr_roberta_base" || modelKey === "ukr-roberta-base"
                            ? "Український мовний ШІ-експерт"
                            : modelKey === "xlm_roberta_base" || modelKey === "xlm-roberta-base"
                            ? "Міжнародний мовний ШІ-експерт"
                            : "Комплексний детектор фейків";

                        const friendlySubtitle =
                          modelKey === "ukr_roberta_base" || modelKey === "ukr-roberta-base"
                            ? "Аналізує особливості українських новин і мовних зворотів"
                            : modelKey === "xlm_roberta_base" || modelKey === "xlm-roberta-base"
                            ? "Порівнює матеріал зі стандартами світової журналістики"
                            : "Перевіряє текст на типові шаблони маніпуляцій та вкидів";

                        return (
                          <div
                            key={modelKey}
                            className="p-3.5 rounded-xl bg-zinc-900/90 border border-zinc-800 space-y-2"
                          >
                            <div className="flex items-center justify-between gap-2">
                              <span className="text-xs font-semibold text-zinc-200">
                                {friendlyTitle}
                              </span>
                              <span className="text-xs font-bold font-mono text-indigo-300">
                                {Number(modelScore).toFixed(0)}%
                              </span>
                            </div>
                            <div className="w-full bg-zinc-800 h-1.5 rounded-full overflow-hidden">
                              <div
                                className={`h-full rounded-full ${
                                  Number(modelScore) >= 75
                                    ? "bg-emerald-500"
                                    : Number(modelScore) >= 50
                                    ? "bg-amber-500"
                                    : "bg-rose-500"
                                }`}
                                style={{
                                  width: `${Math.min(100, Math.max(5, Number(modelScore)))}%`,
                                }}
                              />
                            </div>
                            <p className="text-[11px] text-zinc-400 leading-snug">
                              {friendlySubtitle}
                            </p>
                          </div>
                        );
                      }
                    )}
                  </div>
                </div>
              )}

            {/* Слова в тексті, на які звернув увагу ШІ */}
            {result.trust_breakdown.xai_top_tokens &&
              result.trust_breakdown.xai_top_tokens.length > 0 && (
                <div className="p-5 rounded-2xl bg-zinc-950/70 border border-zinc-800/90 space-y-3">
                  <div className="space-y-1">
                    <h4 className="text-xs font-semibold text-cyan-300 flex items-center gap-1.5">
                      <Sparkles className="w-4 h-4 text-cyan-400" />
                      На які слова та вирази в тексті звернув увагу штучний інтелект:
                    </h4>
                    <p className="text-[11px] text-zinc-400">
                      Зеленим позначені слова, характерні для спокійних офіційних повідомлень, а червоним — слова, що часто зустрічаються у чутках або сенсаціях.
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {result.trust_breakdown.xai_top_tokens.map((tok, idx) => {
                      const isFake = tok.direction === "fake_indicator";
                      return (
                        <span
                          key={idx}
                          className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-xl text-xs font-medium border ${
                            isFake
                              ? "bg-rose-500/10 text-rose-300 border-rose-500/30"
                              : "bg-emerald-500/10 text-emerald-300 border-emerald-500/30"
                          }`}
                        >
                          <span>«{tok.token}»</span>
                          <span className="text-[10px] opacity-85">
                            {isFake ? "— ознака емоцій / ризику" : "— ознака фактів"}
                          </span>
                        </span>
                      );
                    })}
                  </div>
                </div>
              )}

            {/* Покрокове пояснення 5 етапів перевірки простими словами */}
            {result.trust_breakdown.xai_reasoning_steps &&
              result.trust_breakdown.xai_reasoning_steps.length > 0 && (
                <div className="p-5 rounded-2xl bg-zinc-950/70 border border-zinc-800/90 space-y-3">
                  <h4 className="text-xs font-semibold text-zinc-200 flex items-center gap-1.5">
                    <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                    Чому система поставила таку оцінку (5 простих кроків перевірки):
                  </h4>
                  <div className="space-y-2.5">
                    {result.trust_breakdown.xai_reasoning_steps.map((stepItem) => {
                      const badgeColor =
                        stepItem.status === "good"
                          ? "bg-emerald-500/10 text-emerald-300 border-emerald-500/30"
                          : stepItem.status === "warning"
                          ? "bg-amber-500/10 text-amber-300 border-amber-500/30"
                          : "bg-rose-500/10 text-rose-300 border-rose-500/30";
                      return (
                        <div
                          key={stepItem.step}
                          className="p-3.5 rounded-xl bg-zinc-900/80 border border-zinc-800/90 flex flex-col sm:flex-row sm:items-center justify-between gap-2"
                        >
                          <div className="space-y-1">
                            <div className="flex items-center gap-2">
                              <span className="w-5 h-5 rounded-full bg-zinc-800 text-zinc-200 text-[11px] font-bold flex items-center justify-center">
                                {stepItem.step}
                              </span>
                              <span className="text-xs font-semibold text-zinc-100">
                                {stepItem.component}
                              </span>
                            </div>
                            <p className="text-xs text-zinc-300 pl-7 leading-relaxed">
                              {stepItem.summary}
                            </p>
                          </div>
                          <span
                            className={`self-start sm:self-center px-2.5 py-1 rounded-lg text-xs font-mono font-bold border flex-shrink-0 ${badgeColor}`}
                          >
                            {Number(stepItem.score).toFixed(0)}%
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

            {/* Крос-верифікація між незалежними ЗМІ */}
            <div className="p-5 rounded-2xl bg-zinc-950/70 border border-zinc-800/90 space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1">
                <h4 className="text-xs font-semibold text-purple-300 flex items-center gap-1.5">
                  <Search className="w-4 h-4 text-purple-400" />
                  Хто ще з незалежних ЗМІ написав про цю подію:
                </h4>
                <span className="text-[11px] text-zinc-400">
                  Знайдено підтверджень: {result.trust_breakdown.corroborating_articles?.length || 0}
                </span>
              </div>
              {result.trust_breakdown.corroboration_summary && (
                <p className="text-xs text-zinc-300">{result.trust_breakdown.corroboration_summary}</p>
              )}
              {result.trust_breakdown.corroborating_articles &&
                result.trust_breakdown.corroborating_articles.length > 0 && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-1">
                    {result.trust_breakdown.corroborating_articles.map((art) => (
                      <a
                        key={art.id}
                        href={art.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="p-3 rounded-xl bg-zinc-900/90 border border-zinc-800 hover:border-purple-500/40 transition-all flex flex-col justify-between gap-2 group"
                      >
                        <div className="space-y-1">
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-[11px] font-semibold text-purple-300 flex items-center gap-1">
                              {art.source_name}
                              {art.is_whitelisted && (
                                <span className="px-1.5 py-0.5 rounded text-[9px] bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
                                  Надійне ЗМІ
                                </span>
                              )}
                            </span>
                            <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-purple-500/15 text-purple-300 border border-purple-500/30">
                              схожість {(art.similarity * 100).toFixed(0)}%
                            </span>
                          </div>
                          <p className="text-xs text-zinc-200 font-medium line-clamp-2 group-hover:text-cyan-300 transition-colors">
                            {art.title}
                          </p>
                        </div>
                        <div className="flex items-center justify-between text-[10px] text-zinc-500 pt-1 border-t border-zinc-800/70">
                          <span>Рейтинг довіри: {art.trust_score.toFixed(0)}%</span>
                          <span className="inline-flex items-center gap-1 text-zinc-400 group-hover:text-white">
                            Перейти до статті <ExternalLink className="w-3 h-3" />
                          </span>
                        </div>
                      </a>
                    ))}
                  </div>
                )}
            </div>

            {/* Семантичні збіги в базі фактчеків (StopFake / VoxCheck) */}
            {result.trust_breakdown.matched_fact_checks &&
              result.trust_breakdown.matched_fact_checks.length > 0 && (
                <div className="p-5 rounded-2xl bg-amber-500/5 border border-amber-500/25 space-y-3">
                  <h4 className="text-xs font-semibold text-amber-300 flex items-center gap-1.5">
                    <AlertTriangle className="w-4 h-4 text-amber-400" />
                    Схожі розбори від українських фактчекерів (StopFake / VoxCheck):
                  </h4>
                  <div className="space-y-2">
                    {result.trust_breakdown.matched_fact_checks.map((fc) => (
                      <div
                        key={fc.id}
                        className="p-3.5 rounded-xl bg-zinc-950/80 border border-amber-500/20 space-y-1.5"
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <span className="text-xs font-bold text-amber-300">
                            {fc.fact_checker} • Висновок: {fc.rating}
                          </span>
                          <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-amber-500/15 text-amber-300 border border-amber-500/30">
                            Схожість теми: {(fc.similarity * 100).toFixed(0)}%
                          </span>
                        </div>
                        <p className="text-xs text-zinc-200 font-medium">«{fc.claim_text}»</p>
                        {fc.explanation && (
                          <p className="text-xs text-zinc-400 line-clamp-2">{fc.explanation}</p>
                        )}
                        {fc.source_url && (
                          <a
                            href={fc.source_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 text-[11px] text-cyan-400 hover:underline pt-1"
                          >
                            Читати повне спростування <ExternalLink className="w-3 h-3" />
                          </a>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
          </div>
        )}
      </div>

      {/* Історія раніше перевірених статей за посиланням або текстом */}
      <div className="rounded-3xl border border-zinc-800 bg-zinc-900/50 p-6 backdrop-blur-xl space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-zinc-800/80 pb-4">
          <div className="space-y-1">
            <h3 className="text-base font-bold text-white flex items-center gap-2">
              <History className="w-5 h-5 text-cyan-400" />
              Раніше перевірені статті та тексти
            </h3>
            <p className="text-xs text-zinc-400">
              Натисніть «Переглянути розбір», щоб у будь-який момент знову відкрити результат перевірки
            </p>
          </div>

          <div className="inline-flex p-1 rounded-xl bg-zinc-950 border border-zinc-800 self-start sm:self-center">
            <button
              type="button"
              onClick={() => setHistoryFilter("all")}
              className={`px-3 py-1 rounded-lg text-xs font-medium transition-colors ${
                historyFilter === "all"
                  ? "bg-zinc-800 text-white"
                  : "text-zinc-400 hover:text-zinc-200"
              }`}
            >
              Всі ({savedReports.length})
            </button>
            <button
              type="button"
              onClick={() => setHistoryFilter("url")}
              className={`px-3 py-1 rounded-lg text-xs font-medium transition-colors ${
                historyFilter === "url"
                  ? "bg-zinc-800 text-white"
                  : "text-zinc-400 hover:text-zinc-200"
              }`}
            >
              За посиланням
            </button>
            <button
              type="button"
              onClick={() => setHistoryFilter("text")}
              className={`px-3 py-1 rounded-lg text-xs font-medium transition-colors ${
                historyFilter === "text"
                  ? "bg-zinc-800 text-white"
                  : "text-zinc-400 hover:text-zinc-200"
              }`}
            >
              За текстом
            </button>
          </div>
        </div>

        {loadingHistory ? (
          <div className="flex items-center justify-center gap-2 py-8 text-zinc-500 text-xs">
            <RefreshCw className="w-4 h-4 animate-spin text-cyan-400" />
            <span>Завантаження історії перевірок...</span>
          </div>
        ) : filteredSavedReports.length === 0 ? (
          <div className="text-center py-8 text-xs text-zinc-500">
            У цій категорії ще немає перевірених матеріалів. Перевірте будь-яке посилання або текст вище!
          </div>
        ) : (
          <div className="space-y-2.5">
            {filteredSavedReports.map((item) => (
              <div
                key={item.analysis_id}
                className="p-4 rounded-2xl bg-zinc-950/70 border border-zinc-800/80 hover:border-zinc-700 transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-3"
              >
                <div className="space-y-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span
                      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold border ${
                        item.query_type === "url"
                          ? "bg-cyan-500/10 text-cyan-300 border-cyan-500/30"
                          : "bg-indigo-500/10 text-indigo-300 border-indigo-500/30"
                      }`}
                    >
                      {item.query_type === "url" ? (
                        <>
                          <Globe className="w-3 h-3" /> Посилання
                        </>
                      ) : (
                        <>
                          <FileText className="w-3 h-3" /> Текст
                        </>
                      )}
                    </span>
                    {item.created_at && (
                      <span className="text-[11px] text-zinc-500 flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        {new Date(item.created_at).toLocaleString("uk-UA", {
                          day: "2-digit",
                          month: "short",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </span>
                    )}
                  </div>
                  <h4 className="text-sm font-semibold text-zinc-100 truncate">
                    {item.title}
                  </h4>
                  {item.url && (
                    <p className="text-[11px] text-zinc-500 font-mono truncate">{item.url}</p>
                  )}
                </div>

                <div className="flex items-center gap-3 self-end sm:self-center flex-shrink-0">
                  <TrustBadge score={item.trust_score} verdict={item.verdict} size="sm" />
                  <button
                    type="button"
                    onClick={() => loadReportById(item.analysis_id)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-zinc-800 hover:bg-cyan-500 hover:text-zinc-950 text-zinc-200 text-xs font-semibold transition-colors"
                  >
                    <Eye className="w-3.5 h-3.5" />
                    <span>Переглянути розбір</span>
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default function VerifyPage() {
  return (
    <Suspense
      fallback={
        <div className="flex flex-col items-center justify-center py-20 text-zinc-500 space-y-3">
          <RefreshCw className="w-8 h-8 animate-spin text-cyan-500" />
          <p className="text-sm">Завантаження аналітичного модуля...</p>
        </div>
      }
    >
      <VerifyContent />
    </Suspense>
  );
}
