"use client";

import React, { useState, useEffect } from "react";
import { Article, ArticleDetail } from "@/types";
import { TrustBadge } from "./TrustBadge";
import {
  Bookmark,
  ExternalLink,
  Fingerprint,
  RefreshCw,
  ChevronDown,
  ChevronUp,
  Search,
} from "lucide-react";
import { useAuth } from "@/context/AuthContext";

interface NewsCardProps {
  article: Article;
  initialBookmarked?: boolean;
  onBookmarkChange?: (articleId: number, isBookmarked: boolean) => void;
}

export const NewsCard: React.FC<NewsCardProps> = ({
  article,
  initialBookmarked = false,
  onBookmarkChange,
}) => {
  const { user, token, apiUrl } = useAuth();
  const [isBookmarked, setIsBookmarked] = useState<boolean>(
    Boolean(initialBookmarked || article.is_bookmarked)
  );
  const [isUpdating, setIsUpdating] = useState<boolean>(false);

  useEffect(() => {
    setIsBookmarked(Boolean(initialBookmarked || article.is_bookmarked));
  }, [article.is_bookmarked, initialBookmarked]);

  const toggleBookmark = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    if (!user || !token) {
      window.location.href = "/login";
      return;
    }

    setIsUpdating(true);
    try {
      if (isBookmarked) {
        const res = await fetch(`${apiUrl}/bookmarks/${article.id}`, {
          method: "DELETE",
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.ok) {
          setIsBookmarked(false);
          onBookmarkChange?.(article.id, false);
        }
      } else {
        const res = await fetch(`${apiUrl}/bookmarks/${article.id}`, {
          method: "POST",
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.ok) {
          setIsBookmarked(true);
          onBookmarkChange?.(article.id, true);
        }
      }
    } catch (err) {
      console.error("Помилка збереження закладки", err);
    } finally {
      setIsUpdating(false);
    }
  };

  const [imgSrc, setImgSrc] = useState<string | null>(article.image_url || null);
  const [imgFailed, setImgFailed] = useState<boolean>(false);
  const [showXai, setShowXai] = useState<boolean>(false);
  const [xaiDetail, setXaiDetail] = useState<ArticleDetail | null>(null);
  const [loadingXai, setLoadingXai] = useState<boolean>(false);

  const toggleXaiPanel = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    const nextState = !showXai;
    setShowXai(nextState);

    if (nextState && !xaiDetail && !loadingXai) {
      setLoadingXai(true);
      try {
        const headers: Record<string, string> = {};
        if (token) headers["Authorization"] = `Bearer ${token}`;
        const res = await fetch(`${apiUrl}/news/${article.id}`, { headers });
        if (res.ok) {
          const data: ArticleDetail = await res.json();
          setXaiDetail(data);
        }
      } catch (err) {
        console.error("Не вдалося завантажити XAI-деталі статті", err);
      } finally {
        setLoadingXai(false);
      }
    }
  };

  const formattedDate = new Date(article.published_at).toLocaleDateString("uk-UA", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });

  const isInternational = article.language === "en";

  return (
    <article className="group flex flex-col justify-between overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-900/60 p-4 sm:p-5 backdrop-blur-sm transition-all duration-300 hover:-translate-y-1 hover:border-zinc-700 hover:bg-zinc-900/90 hover:shadow-2xl hover:shadow-cyan-950/30">
      <div>
        {/* Обкладинка статті */}
        {imgSrc && !imgFailed ? (
          <div className="relative w-full aspect-video overflow-hidden rounded-xl mb-3.5 bg-zinc-950 border border-zinc-800/80">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={imgSrc}
              alt={article.title}
              loading="lazy"
              onError={() => setImgFailed(true)}
              className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
            />
            {/* Тонкий градієнтний оверлей */}
            <div className="absolute inset-0 bg-gradient-to-t from-zinc-950/80 via-transparent to-transparent pointer-events-none" />

            {/* Бейдж мови/регіону зверху на фото */}
            <div className="absolute top-2.5 left-2.5 flex items-center gap-1.5">
              <span
                className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-[10px] font-bold backdrop-blur-md border shadow-sm ${
                  isInternational
                    ? "bg-indigo-500/80 text-white border-indigo-400/40"
                    : "bg-blue-600/80 text-white border-blue-400/40"
                }`}
              >
                {isInternational ? "🌍 Світ (EN)" : "🇺🇦 UA"}
              </span>

              <span className="px-2 py-0.5 rounded-lg text-[10px] font-medium bg-zinc-900/80 text-zinc-300 border border-zinc-700/60 backdrop-blur-md">
                {article.category}
              </span>
            </div>

            {/* Кнопка закладки зверху праворуч */}
            <button
              onClick={toggleBookmark}
              disabled={isUpdating}
              className={`absolute top-2.5 right-2.5 p-1.5 rounded-lg backdrop-blur-md border transition-all ${
                isBookmarked
                  ? "bg-cyan-500/80 text-zinc-950 border-cyan-400"
                  : "bg-zinc-900/70 text-zinc-300 border-zinc-700/60 hover:text-white hover:bg-zinc-800"
              }`}
              title={
                user
                  ? isBookmarked
                    ? "Видалити із закладок"
                    : "Зберегти в закладки"
                  : "Увійдіть, щоб зберегти"
              }
            >
              <Bookmark
                className={`w-3.5 h-3.5 ${isBookmarked ? "fill-zinc-950" : ""}`}
              />
            </button>
          </div>
        ) : (
          /* Верхній рядок без фото (фолбек): Джерело та закладка */
          <div className="flex items-center justify-between gap-2 mb-3">
            <div className="flex items-center gap-1.5">
              <span
                className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-[10px] font-bold border ${
                  isInternational
                    ? "bg-indigo-500/20 text-indigo-300 border-indigo-500/30"
                    : "bg-blue-500/20 text-blue-300 border-blue-500/30"
                }`}
              >
                {isInternational ? "🌍 Світ" : "🇺🇦 UA"}
              </span>
              <span className="px-2 py-0.5 rounded-lg text-[10px] font-medium bg-zinc-800 text-zinc-400">
                {article.category}
              </span>
            </div>

            <button
              onClick={toggleBookmark}
              disabled={isUpdating}
              className={`p-1.5 rounded-lg border transition-all ${
                isBookmarked
                  ? "bg-cyan-500/20 text-cyan-400 border-cyan-500/40"
                  : "text-zinc-500 border-transparent hover:text-zinc-300 hover:bg-zinc-800"
              }`}
              title={
                user
                  ? isBookmarked
                    ? "Видалити із закладок"
                    : "Зберегти в закладки"
                  : "Увійдіть, щоб зберегти"
              }
            >
              <Bookmark
                className={`w-4 h-4 ${isBookmarked ? "fill-cyan-400" : ""}`}
              />
            </button>
          </div>
        )}

        {/* Джерело та дата */}
        <div className="flex items-center gap-2 mb-2 text-xs">
          <span className="font-semibold text-zinc-300">
            {article.source_name}
          </span>
          <span className="text-[11px] font-mono text-zinc-500">
            {article.domain}
          </span>
          <span className="w-1 h-1 rounded-full bg-zinc-700" />
          <span className="text-[11px] text-zinc-500">{formattedDate}</span>
        </div>

        {/* Заголовок */}
        <h3 className="font-bold text-base text-zinc-100 group-hover:text-cyan-300 transition-colors line-clamp-2 mb-2 leading-snug">
          <a
            href={article.url}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5"
          >
            <span>{article.title}</span>
            <ExternalLink className="w-3.5 h-3.5 opacity-0 group-hover:opacity-70 transition-opacity flex-shrink-0" />
          </a>
        </h3>

        {/* Короткий зміст */}
        {article.summary && (
          <p className="text-xs sm:text-sm text-zinc-400 line-clamp-2 sm:line-clamp-3 mb-4 leading-relaxed font-normal">
            {article.summary}
          </p>
        )}
      </div>

      {/* Нижня панель: Trust Score + зрозумілий розбір */}
      <div className="pt-3 mt-2 border-t border-zinc-800/80 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={toggleXaiPanel}
            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-semibold bg-zinc-800/80 hover:bg-zinc-800 text-cyan-300 border border-zinc-700/70 transition-colors"
            title="Подивитися просте та зрозуміле пояснення, чому новина отримала такий рейтинг довіри"
          >
            <Fingerprint className="w-3.5 h-3.5 text-cyan-400" />
            <span>Чому така оцінка?</span>
            {showXai ? (
              <ChevronUp className="w-3 h-3" />
            ) : (
              <ChevronDown className="w-3 h-3" />
            )}
          </button>

          <TrustBadge score={article.trust_score} verdict={article.verdict} size="sm" />
        </div>

        {/* Розгорнута панель пояснення простими словами */}
        {showXai && (
          <div className="p-3.5 rounded-xl bg-zinc-950/90 border border-zinc-800 space-y-3 text-xs">
            {loadingXai ? (
              <div className="flex items-center justify-center gap-2 py-4 text-zinc-400">
                <RefreshCw className="w-4 h-4 animate-spin text-cyan-400" />
                <span>Готуємо зрозумілий розбір новини...</span>
              </div>
            ) : xaiDetail?.trust_breakdown ? (
              <>
                <div className="text-[11px] font-semibold text-zinc-200">
                  Як формується довіра до цієї новини:
                </div>

                {/* Чотири зрозумілі кожному показники */}
                <div className="grid grid-cols-2 gap-2">
                  <div className="p-2 rounded-lg bg-zinc-900 border border-zinc-800/80 space-y-0.5">
                    <div className="flex justify-between text-[10px] text-zinc-300">
                      <span>Надійність сайту</span>
                      <span className="font-mono font-bold text-emerald-400">
                        {xaiDetail.trust_breakdown.source_reputation_score.toFixed(0)}%
                      </span>
                    </div>
                    <p className="text-[9px] text-zinc-500">Чи перевірене це медіа</p>
                  </div>

                  <div className="p-2 rounded-lg bg-zinc-900 border border-zinc-800/80 space-y-0.5">
                    <div className="flex justify-between text-[10px] text-zinc-300">
                      <span>Спокійний тон</span>
                      <span className="font-mono font-bold text-cyan-400">
                        {xaiDetail.trust_breakdown.stylometry_score.toFixed(0)}%
                      </span>
                    </div>
                    <p className="text-[9px] text-zinc-500">Без крику та залякування</p>
                  </div>

                  <div className="p-2 rounded-lg bg-zinc-900 border border-zinc-800/80 space-y-0.5">
                    <div className="flex justify-between text-[10px] text-zinc-300">
                      <span>Перевірка ШІ</span>
                      <span className="font-mono font-bold text-indigo-400">
                        {xaiDetail.trust_breakdown.ml_authenticity_score.toFixed(0)}%
                      </span>
                    </div>
                    <p className="text-[9px] text-zinc-500">Чи схоже на правдиві факти</p>
                  </div>

                  <div className="p-2 rounded-lg bg-zinc-900 border border-zinc-800/80 space-y-0.5">
                    <div className="flex justify-between text-[10px] text-zinc-300">
                      <span>Інші ЗМІ</span>
                      <span className="font-mono font-bold text-purple-400">
                        {xaiDetail.trust_breakdown.corroboration_score.toFixed(0)}%
                      </span>
                    </div>
                    <p className="text-[9px] text-zinc-500">Чи пишуть про це колеги</p>
                  </div>
                </div>

                {/* Висновок трьох незалежних ШІ-помічників простими словами */}
                {xaiDetail.trust_breakdown.models_breakdown &&
                  Object.keys(xaiDetail.trust_breakdown.models_breakdown).length > 0 && (
                    <div className="space-y-1">
                      <span className="text-[10px] text-zinc-400">
                        Оцінки трьох ШІ-експертів:
                      </span>
                      <div className="flex flex-wrap gap-1.5">
                        {Object.entries(xaiDetail.trust_breakdown.models_breakdown).map(
                          ([key, val]) => (
                            <span
                              key={key}
                              className="px-2 py-0.5 rounded bg-indigo-500/10 border border-indigo-500/25 text-[10px] text-indigo-200"
                            >
                              {key === "ukr_roberta_base" || key === "ukr-roberta-base"
                                ? "Український мовний ШІ"
                                : key === "xlm_roberta_base" || key === "xlm-roberta-base"
                                ? "Міжнародний мовний ШІ"
                                : "Детектор фейків"}
                              : <strong className="font-mono">{Number(val).toFixed(0)}%</strong>
                            </span>
                          )
                        )}
                      </div>
                    </div>
                  )}

                {/* Пояснення простими словами */}
                <div className="p-2.5 rounded-lg bg-zinc-900/90 border border-zinc-800/90">
                  <p className="text-[11px] text-zinc-200 leading-relaxed">
                    {xaiDetail.trust_breakdown.explanation}
                  </p>
                </div>

                {/* Хто ще написав про цю подію */}
                {xaiDetail.trust_breakdown.corroborating_articles &&
                  xaiDetail.trust_breakdown.corroborating_articles.length > 0 && (
                    <div className="space-y-1.5 pt-1 border-t border-zinc-800/80">
                      <div className="flex items-center gap-1 text-[10px] font-semibold text-purple-300">
                        <Search className="w-3 h-3" />
                        <span>
                          Хто ще написав про цю подію ({xaiDetail.trust_breakdown.corroborating_articles.length}):
                        </span>
                      </div>
                      <div className="space-y-1">
                        {xaiDetail.trust_breakdown.corroborating_articles
                          .slice(0, 3)
                          .map((corr) => (
                            <a
                              key={corr.id}
                              href={corr.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="flex items-center justify-between gap-2 p-1.5 rounded-lg bg-zinc-900 hover:bg-zinc-800/90 border border-zinc-800/70 transition-colors"
                            >
                              <span className="text-[11px] text-zinc-200 truncate">
                                <strong className="text-purple-300">{corr.source_name}:</strong>{" "}
                                {corr.title}
                              </span>
                              <span className="text-[10px] font-mono text-purple-300 flex-shrink-0">
                                схожість {(corr.similarity * 100).toFixed(0)}%
                              </span>
                            </a>
                          ))}
                      </div>
                    </div>
                  )}
              </>
            ) : (
              <p className="text-zinc-400">Не вдалося завантажити пояснення.</p>
            )}
          </div>
        )}
      </div>
    </article>
  );
};
