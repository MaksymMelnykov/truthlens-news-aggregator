"use client";

import React, { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { TrustScoreBreakdown } from "@/types";
import { TrustBadge } from "./TrustBadge";
import {
  X,
  Fingerprint,
  AlertTriangle,
  PieChart,
  Sparkles,
  CheckCircle2,
  Search,
  ExternalLink,
  RefreshCw,
  Globe,
  FileText,
} from "lucide-react";

export interface XaiModalData {
  article_id?: number;
  title: string;
  domain?: string;
  url?: string;
  published_at?: string;
  trust_breakdown: TrustScoreBreakdown;
}

interface XaiReportModalProps {
  isOpen: boolean;
  onClose: () => void;
  loading?: boolean;
  data: XaiModalData | null;
  error?: string | null;
}

export const XaiReportModal: React.FC<XaiReportModalProps> = ({
  isOpen,
  onClose,
  loading = false,
  data,
  error = null,
}) => {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = prevOverflow;
    };
  }, [isOpen, onClose]);

  if (!isOpen || !mounted) return null;

  const tb = data?.trust_breakdown;

  return createPortal(
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-3 sm:p-6 bg-zinc-950/80 backdrop-blur-md animate-in fade-in duration-200"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-4xl max-h-[90vh] flex flex-col rounded-3xl border border-zinc-800 bg-zinc-900 shadow-2xl shadow-cyan-950/40 overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Шапка модального вікна */}
        <div className="flex items-start justify-between gap-4 px-5 sm:px-7 py-4 sm:py-5 border-b border-zinc-800 bg-zinc-950/60">
          <div className="space-y-1 min-w-0">
            <div className="inline-flex items-center gap-1.5 text-xs font-semibold text-cyan-400">
              <Fingerprint className="w-4 h-4" />
              <span>Зрозумілий розбір достовірності (Пояснювальний ШІ)</span>
            </div>
            <h2 className="text-base sm:text-xl font-bold text-white leading-snug line-clamp-2">
              {data?.title || "Завантаження розбору новини..."}
            </h2>
            <div className="flex flex-wrap items-center gap-3 text-xs text-zinc-400">
              {data?.domain && (
                <span className="inline-flex items-center gap-1">
                  <Globe className="w-3.5 h-3.5 text-zinc-500" />
                  Джерело: <strong className="text-zinc-200">{data.domain}</strong>
                </span>
              )}
              {data?.url && (
                <a
                  href={data.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-cyan-400 hover:underline"
                >
                  <span>Відкрити оригінал</span>
                  <ExternalLink className="w-3 h-3" />
                </a>
              )}
              {data?.article_id && (
                <Link
                  href={`/news/${data.article_id}`}
                  onClick={onClose}
                  className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-lg bg-cyan-500/15 text-cyan-300 border border-cyan-500/30 hover:bg-cyan-500 hover:text-zinc-950 font-semibold transition-colors"
                >
                  <FileText className="w-3 h-3" />
                  <span>Повний текст і підсвітка ШІ →</span>
                </Link>
              )}
            </div>
          </div>

          <div className="flex items-center gap-3 flex-shrink-0">
            {tb && <TrustBadge score={tb.score} verdict={tb.verdict} size="md" />}
            <button
              type="button"
              onClick={onClose}
              className="p-2 rounded-xl bg-zinc-800/80 hover:bg-zinc-700 text-zinc-300 hover:text-white border border-zinc-700/60 transition-colors"
              title="Закрити вікно (Esc)"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Тіло модального вікна зі скролом */}
        <div className="overflow-y-auto p-5 sm:p-7 space-y-5">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-16 text-zinc-400 space-y-3">
              <RefreshCw className="w-8 h-8 animate-spin text-cyan-400" />
              <p className="text-sm">Завантажуємо збережений розбір...</p>
            </div>
          ) : error ? (
            <div className="p-4 rounded-2xl bg-rose-500/10 border border-rose-500/20 text-rose-400 text-sm flex items-center gap-3">
              <AlertTriangle className="w-5 h-5 flex-shrink-0" />
              <span>{error}</span>
            </div>
          ) : tb ? (
            <>
              {/* Головне пояснення простими словами */}
              <div className="p-4 sm:p-5 rounded-2xl bg-cyan-500/5 border border-cyan-500/20 space-y-1.5">
                <h4 className="text-xs sm:text-sm font-bold text-cyan-300 flex items-center gap-2">
                  <Fingerprint className="w-4 h-4 text-cyan-400" />
                  Короткий висновок простими словами:
                </h4>
                <p className="text-xs sm:text-sm text-zinc-200 leading-relaxed">
                  {tb.explanation}
                </p>
              </div>

              {/* 4 зрозумілі показники */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                <div className="p-3.5 rounded-2xl bg-zinc-950/70 border border-zinc-800/80 space-y-1.5">
                  <span className="text-xs font-semibold text-zinc-200">
                    1. Спокійний тон тексту
                  </span>
                  <div className="text-xl font-bold text-cyan-400 font-mono">
                    {tb.stylometry_score.toFixed(0)}%
                  </div>
                  <div className="w-full bg-zinc-800 h-1.5 rounded-full overflow-hidden">
                    <div
                      className="bg-cyan-500 h-full rounded-full"
                      style={{ width: `${tb.stylometry_score}%` }}
                    />
                  </div>
                  <p className="text-[11px] text-zinc-400">
                    Без кричущих заголовків і тиску на емоції
                  </p>
                </div>

                <div className="p-3.5 rounded-2xl bg-zinc-950/70 border border-zinc-800/80 space-y-1.5">
                  <span className="text-xs font-semibold text-zinc-200">
                    2. Надійність видання
                  </span>
                  <div className="text-xl font-bold text-emerald-400 font-mono">
                    {tb.source_reputation_score.toFixed(0)}%
                  </div>
                  <div className="w-full bg-zinc-800 h-1.5 rounded-full overflow-hidden">
                    <div
                      className="bg-emerald-500 h-full rounded-full"
                      style={{ width: `${tb.source_reputation_score}%` }}
                    />
                  </div>
                  <p className="text-[11px] text-zinc-400">
                    Чи дотримується сайт журналістських стандартів
                  </p>
                </div>

                <div className="p-3.5 rounded-2xl bg-zinc-950/70 border border-zinc-800/80 space-y-1.5">
                  <span className="text-xs font-semibold text-zinc-200">
                    3. Перевірка ШІ на правдивість
                  </span>
                  <div className="text-xl font-bold text-indigo-400 font-mono">
                    {tb.ml_authenticity_score.toFixed(0)}%
                  </div>
                  <div className="w-full bg-zinc-800 h-1.5 rounded-full overflow-hidden">
                    <div
                      className="bg-indigo-500 h-full rounded-full"
                      style={{ width: `${tb.ml_authenticity_score}%` }}
                    />
                  </div>
                  <p className="text-[11px] text-zinc-400">
                    Чи схожий текст на реальні факти, а не на вигадку
                  </p>
                </div>

                <div className="p-3.5 rounded-2xl bg-zinc-950/70 border border-zinc-800/80 space-y-1.5">
                  <span className="text-xs font-semibold text-zinc-200">
                    4. Підтвердження в інших ЗМІ
                  </span>
                  <div className="text-xl font-bold text-purple-400 font-mono">
                    {tb.corroboration_score.toFixed(0)}%
                  </div>
                  <div className="w-full bg-zinc-800 h-1.5 rounded-full overflow-hidden">
                    <div
                      className="bg-purple-500 h-full rounded-full"
                      style={{ width: `${tb.corroboration_score}%` }}
                    />
                  </div>
                  <p className="text-[11px] text-zinc-400">
                    Чи повідомляють про цю подію інші незалежні медіа
                  </p>
                </div>
              </div>

              {/* Виявлені маркери маніпуляцій */}
              {tb.manipulation_markers && tb.manipulation_markers.length > 0 && (
                <div className="p-4 rounded-2xl bg-rose-500/5 border border-rose-500/20 space-y-2">
                  <h4 className="text-xs font-semibold text-rose-400 flex items-center gap-1.5">
                    <AlertTriangle className="w-4 h-4" />
                    На що варто звернути увагу (виявлені емоційні чи підозрілі прийоми):
                  </h4>
                  <div className="flex flex-wrap gap-2">
                    {tb.manipulation_markers.map((marker, idx) => (
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

              {/* Оцінка трьох незалежних ШІ-експертів простими словами */}
              {tb.models_breakdown && Object.keys(tb.models_breakdown).length > 0 && (
                <div className="p-4 sm:p-5 rounded-2xl bg-zinc-950/70 border border-zinc-800/90 space-y-3">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1">
                    <h4 className="text-xs font-semibold text-indigo-300 flex items-center gap-1.5">
                      <PieChart className="w-4 h-4 text-indigo-400" />
                      Як незалежні ШІ-експерти оцінили цей текст:
                    </h4>
                    <span className="text-[11px] text-zinc-400">
                      Чим вищий відсоток — тим більше текст схожий на чесну новину
                    </span>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    {Object.entries(tb.models_breakdown).map(([modelKey, modelScore]) => {
                      const friendlyTitle =
                        modelKey === "ukr_roberta_base" || modelKey === "ukr-roberta-base"
                          ? "Український мовний ШІ"
                          : modelKey === "xlm_roberta_base" || modelKey === "xlm-roberta-base"
                          ? "Міжнародний мовний ШІ"
                          : modelKey.toLowerCase().includes("ensemble")
                          ? "Спільний висновок ШІ"
                          : "Детектор фейків та вкидів";

                      const friendlySubtitle =
                        modelKey === "ukr_roberta_base" || modelKey === "ukr-roberta-base"
                          ? "Розуміє особливості українських новин і мовних зворотів"
                          : modelKey === "xlm_roberta_base" || modelKey === "xlm-roberta-base"
                          ? "Порівнює матеріал зі світовими стандартами журналістики"
                          : "Перевіряє текст на типові шаблони маніпуляцій";

                      return (
                        <div
                          key={modelKey}
                          className="p-3 rounded-xl bg-zinc-900/90 border border-zinc-800 space-y-1.5"
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
                    })}
                  </div>
                </div>
              )}

              {/* Слова в тексті, на які звернув увагу ШІ */}
              {tb.xai_top_tokens && tb.xai_top_tokens.length > 0 && (
                <div className="p-4 sm:p-5 rounded-2xl bg-zinc-950/70 border border-zinc-800/90 space-y-2.5">
                  <div className="space-y-1">
                    <h4 className="text-xs font-semibold text-cyan-300 flex items-center gap-1.5">
                      <Sparkles className="w-4 h-4 text-cyan-400" />
                      На які слова в тексті звернув увагу штучний інтелект:
                    </h4>
                    <p className="text-[11px] text-zinc-400">
                      Зеленим позначені слова, характерні для спокійних фактів, а червоним — слова, що часто зустрічаються у чутках або сенсаціях.
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {tb.xai_top_tokens.map((tok, idx) => {
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

              {/* 5 простих кроків перевірки */}
              {tb.xai_reasoning_steps && tb.xai_reasoning_steps.length > 0 && (
                <div className="p-4 sm:p-5 rounded-2xl bg-zinc-950/70 border border-zinc-800/90 space-y-2.5">
                  <h4 className="text-xs font-semibold text-zinc-200 flex items-center gap-1.5">
                    <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                    Чому система поставила таку оцінку (5 простих кроків перевірки):
                  </h4>
                  <div className="space-y-2">
                    {tb.xai_reasoning_steps.map((stepItem) => {
                      const badgeColor =
                        stepItem.status === "good"
                          ? "bg-emerald-500/10 text-emerald-300 border-emerald-500/30"
                          : stepItem.status === "warning"
                          ? "bg-amber-500/10 text-amber-300 border-amber-500/30"
                          : "bg-rose-500/10 text-rose-300 border-rose-500/30";
                      return (
                        <div
                          key={stepItem.step}
                          className="p-3 rounded-xl bg-zinc-900/80 border border-zinc-800/90 flex flex-col sm:flex-row sm:items-center justify-between gap-2"
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
                          {stepItem.score !== undefined && (
                            <span
                              className={`self-start sm:self-center px-2.5 py-1 rounded-lg text-xs font-mono font-bold border flex-shrink-0 ${badgeColor}`}
                            >
                              {Number(stepItem.score).toFixed(0)}%
                            </span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Хто ще написав про цю подію */}
              <div className="p-4 sm:p-5 rounded-2xl bg-zinc-950/70 border border-zinc-800/90 space-y-3">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1">
                  <h4 className="text-xs font-semibold text-purple-300 flex items-center gap-1.5">
                    <Search className="w-4 h-4 text-purple-400" />
                    Хто ще з незалежних ЗМІ написав про цю подію:
                  </h4>
                  <span className="text-[11px] text-zinc-400">
                    Знайдено підтверджень: {tb.corroborating_articles?.length || 0}
                  </span>
                </div>
                {tb.corroboration_summary && (
                  <p className="text-xs text-zinc-300">{tb.corroboration_summary}</p>
                )}
                {tb.corroborating_articles && tb.corroborating_articles.length > 0 && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-1">
                    {tb.corroborating_articles.map((art) => (
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

              {/* Схожі розбори в базі фактчеків */}
              {tb.matched_fact_checks && tb.matched_fact_checks.length > 0 && (
                <div className="p-4 sm:p-5 rounded-2xl bg-amber-500/5 border border-amber-500/25 space-y-2.5">
                  <h4 className="text-xs font-semibold text-amber-300 flex items-center gap-1.5">
                    <AlertTriangle className="w-4 h-4 text-amber-400" />
                    Схожі розбори від українських фактчекерів (StopFake / VoxCheck):
                  </h4>
                  <div className="space-y-2">
                    {tb.matched_fact_checks.map((fc) => (
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
                        <p className="text-xs text-zinc-200 font-medium">
                          «{fc.claim_text}»
                        </p>
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
            </>
          ) : null}
        </div>
      </div>
    </div>,
    document.body
  );
};
