"use client";

import React, { useState, useEffect, Suspense } from "react";
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
  ChevronRight,
  Fingerprint,
  PieChart,
  HelpCircle,
} from "lucide-react";

interface VerificationResponse {
  title: string;
  extracted_text_preview?: string;
  analyzed_domain?: string;
  trust_breakdown: TrustScoreBreakdown;
}

function VerifyContent() {
  const searchParams = useSearchParams();
  const initialUrl = searchParams.get("url") || "";

  const { token, apiUrl } = useAuth();
  const [activeTab, setActiveTab] = useState<"url" | "text">(initialUrl ? "url" : "url");
  const [urlInput, setUrlInput] = useState(initialUrl);
  const [titleInput, setTitleInput] = useState("");
  const [textInput, setTextInput] = useState("");
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [result, setResult] = useState<VerificationResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (initialUrl) {
      handleVerifyUrl(initialUrl);
    }
  }, [initialUrl]);

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
      const data = await res.json();
      setResult(data);
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
      const data = await res.json();
      setResult(data);
    } catch (err: any) {
      setError(err.message || "Сталася помилка під час аналізу");
    } finally {
      setIsAnalyzing(false);
    }
  };

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
      {/* Заголовок */}
      <div className="text-center space-y-2 max-w-2xl mx-auto">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-semibold bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">
          <Sparkles className="w-3.5 h-3.5" />
          <span>Модуль оперативного фактчекінгу</span>
        </div>
        <h1 className="text-3xl font-extrabold text-white">Швидка перевірка новини</h1>
        <p className="text-sm text-zinc-400">
          Вставте URL-посилання або довільний текст для багатофакторного аналізу достовірності
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
                URL адреса веб-сторінки з новиною
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
                  <span>Витяг тексту та інференс моделі...</span>
                </>
              ) : (
                <>
                  <ShieldCheck className="w-4 h-4" />
                  <span>Запустити конвеєр перевірки</span>
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
                Заголовок матеріалу (опціонально)
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
                Повний текст або фрагмент новини
              </label>
              <textarea
                required
                rows={5}
                value={textInput}
                onChange={(e) => setTextInput(e.target.value)}
                placeholder="Вставте текст підозрілого матеріалу..."
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
                  <span>Стилометричний та NLP аналіз...</span>
                </>
              ) : (
                <>
                  <ShieldCheck className="w-4 h-4" />
                  <span>Проаналізувати текст</span>
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

      {/* Результати перевірки (Explainable AI розбір) */}
      {result && (
        <div className="rounded-3xl border border-zinc-800 bg-zinc-900/80 p-6 sm:p-8 backdrop-blur-xl shadow-2xl space-y-6">
          {/* Головний індекс довіри */}
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b border-zinc-800 pb-6">
            <div>
              <span className="text-xs font-mono uppercase tracking-wider text-zinc-400">
                Результат перевірки
              </span>
              <h2 className="text-xl sm:text-2xl font-bold text-white mt-1">
                {result.title}
              </h2>
              {result.analyzed_domain && (
                <p className="text-xs text-zinc-400 font-mono mt-1">
                  Джерело: {result.analyzed_domain}
                </p>
              )}
            </div>

            <TrustBadge
              score={result.trust_breakdown.score}
              verdict={result.trust_breakdown.verdict}
              size="lg"
            />
          </div>

          {/* Метрики гібридного аналізу */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="p-4 rounded-2xl bg-zinc-950/60 border border-zinc-800/80 space-y-1">
              <span className="text-[11px] text-zinc-400">Стилометрія & Тон</span>
              <div className="text-lg font-bold text-zinc-100 font-mono">
                {result.trust_breakdown.stylometry_score.toFixed(0)}%
              </div>
              <div className="w-full bg-zinc-800 h-1.5 rounded-full overflow-hidden">
                <div
                  className="bg-cyan-500 h-full rounded-full"
                  style={{ width: `${result.trust_breakdown.stylometry_score}%` }}
                />
              </div>
            </div>

            <div className="p-4 rounded-2xl bg-zinc-950/60 border border-zinc-800/80 space-y-1">
              <span className="text-[11px] text-zinc-400">Репутація домену</span>
              <div className="text-lg font-bold text-zinc-100 font-mono">
                {result.trust_breakdown.source_reputation_score.toFixed(0)}%
              </div>
              <div className="w-full bg-zinc-800 h-1.5 rounded-full overflow-hidden">
                <div
                  className="bg-emerald-500 h-full rounded-full"
                  style={{ width: `${result.trust_breakdown.source_reputation_score}%` }}
                />
              </div>
            </div>

            <div className="p-4 rounded-2xl bg-zinc-950/60 border border-zinc-800/80 space-y-1">
              <span className="text-[11px] text-zinc-400">Нейромережа (NLP)</span>
              <div className="text-lg font-bold text-zinc-100 font-mono">
                {result.trust_breakdown.ml_authenticity_score.toFixed(0)}%
              </div>
              <div className="w-full bg-zinc-800 h-1.5 rounded-full overflow-hidden">
                <div
                  className="bg-indigo-500 h-full rounded-full"
                  style={{ width: `${result.trust_breakdown.ml_authenticity_score}%` }}
                />
              </div>
            </div>

            <div className="p-4 rounded-2xl bg-zinc-950/60 border border-zinc-800/80 space-y-1">
              <span className="text-[11px] text-zinc-400">Крос-верифікація</span>
              <div className="text-lg font-bold text-zinc-100 font-mono">
                {result.trust_breakdown.corroboration_score.toFixed(0)}%
              </div>
              <div className="w-full bg-zinc-800 h-1.5 rounded-full overflow-hidden">
                <div
                  className="bg-purple-500 h-full rounded-full"
                  style={{ width: `${result.trust_breakdown.corroboration_score}%` }}
                />
              </div>
            </div>
          </div>

          {/* Знайдені маркери маніпуляцій */}
          {result.trust_breakdown.manipulation_markers.length > 0 && (
            <div className="p-4 rounded-2xl bg-rose-500/5 border border-rose-500/20 space-y-2">
              <h4 className="text-xs font-semibold text-rose-400 flex items-center gap-1.5">
                <AlertTriangle className="w-4 h-4" />
                Виявлені ознаки маніпуляцій:
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

          {/* Пояснення XAI */}
          <div className="p-5 rounded-2xl bg-zinc-950/80 border border-zinc-800 space-y-2">
            <h4 className="text-xs font-semibold text-zinc-300 flex items-center gap-1.5">
              <Fingerprint className="w-4 h-4 text-cyan-400" />
              Пояснення оцінки (Explainable AI):
            </h4>
            <p className="text-sm text-zinc-300 leading-relaxed font-normal">
              {result.trust_breakdown.explanation}
            </p>
          </div>
        </div>
      )}
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

