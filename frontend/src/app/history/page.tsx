"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { useAuth } from "@/context/AuthContext";
import { HistoryItem } from "@/types";
import { TrustBadge } from "@/components/TrustBadge";
import {
  History,
  Trash2,
  RefreshCw,
  ArrowLeft,
  LogIn,
  FileText,
  Globe,
  ExternalLink,
} from "lucide-react";

export default function HistoryPage() {
  const { user, token, apiUrl } = useAuth();
  const [historyItems, setHistoryItems] = useState<HistoryItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const fetchHistory = async () => {
    if (!token) {
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    try {
      const res = await fetch(`${apiUrl}/history`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setHistoryItems(data);
      }
    } catch (e) {
      console.error("Помилка завантаження історії", e);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchHistory();
  }, [token]);

  const deleteItem = async (id: number) => {
    if (!token) return;
    try {
      const res = await fetch(`${apiUrl}/history/${id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        setHistoryItems((prev) => prev.filter((item) => item.id !== id));
      }
    } catch (e) {
      console.error("Помилка видалення запису", e);
    }
  };

  const clearAll = async () => {
    if (!token || !confirm("Ви впевнені, що бажаєте очистити всю історію перевірок?")) return;
    try {
      const res = await fetch(`${apiUrl}/history`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        setHistoryItems([]);
      }
    } catch (e) {
      console.error("Помилка очищення історії", e);
    }
  };

  if (!user && !isLoading) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-20 text-center space-y-4">
        <div className="w-12 h-12 rounded-2xl bg-zinc-900 border border-zinc-800 mx-auto flex items-center justify-center text-zinc-500">
          <History className="w-6 h-6" />
        </div>
        <h2 className="text-xl font-bold text-zinc-200">Історія фактчекінгу доступна тільки для авторизованих користувачів</h2>
        <p className="text-sm text-zinc-400 max-w-md mx-auto">
          Увійдіть у свій акаунт, щоб зберігати та переглядати результати всіх перевірених статей та посилань.
        </p>
        <div className="pt-2">
          <Link
            href="/login"
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-cyan-500 text-zinc-950 font-semibold text-sm hover:bg-cyan-400 transition-colors shadow-lg shadow-cyan-500/20"
          >
            <LogIn className="w-4 h-4" />
            Увійти в акаунт
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
      {/* Заголовок */}
      <div className="flex items-center justify-between border-b border-zinc-800/80 pb-4">
        <div className="flex items-center gap-3">
          <Link
            href="/"
            className="p-2 rounded-xl bg-zinc-900 border border-zinc-800 text-zinc-400 hover:text-white transition-colors"
            title="Назад до стрічки"
          >
            <ArrowLeft className="w-4 h-4" />
          </Link>
          <div>
            <h1 className="text-2xl font-bold text-white flex items-center gap-2">
              <History className="w-6 h-6 text-cyan-400" />
              Особиста історія перевірок
            </h1>
            <p className="text-xs text-zinc-400">
              Хронологія ваших запитів на виявлення дезінформації ({historyItems.length})
            </p>
          </div>
        </div>

        {historyItems.length > 0 && (
          <button
            onClick={clearAll}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium text-rose-400 border border-rose-500/20 hover:bg-rose-500/10 transition-colors"
          >
            <Trash2 className="w-3.5 h-3.5" />
            Очистити все
          </button>
        )}
      </div>

      {/* Список записів історії */}
      {isLoading ? (
        <div className="flex flex-col items-center justify-center py-20 text-zinc-500 space-y-3">
          <RefreshCw className="w-8 h-8 animate-spin text-cyan-500" />
          <p className="text-sm">Завантаження історії...</p>
        </div>
      ) : historyItems.length === 0 ? (
        <div className="text-center py-20 border border-dashed border-zinc-800 rounded-3xl p-8 space-y-3">
          <History className="w-10 h-10 text-zinc-600 mx-auto" />
          <h4 className="text-base font-semibold text-zinc-300">Історія порожня</h4>
          <p className="text-xs text-zinc-500 max-w-sm mx-auto">
            Скористайтеся розділом «Перевірка статті», щоб проаналізувати будь-яку новину чи посилання.
          </p>
          <Link
            href="/verify"
            className="inline-block mt-2 px-4 py-2 rounded-xl bg-zinc-800 text-xs font-semibold text-zinc-200 hover:bg-zinc-700 transition-colors"
          >
            Перевірити новину
          </Link>
        </div>
      ) : (
        <div className="space-y-3">
          {historyItems.map((item) => (
            <div
              key={item.id}
              className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 p-4 rounded-2xl border border-zinc-800 bg-zinc-900/60 hover:bg-zinc-900/90 transition-colors"
            >
              <div className="flex items-start gap-3 min-w-0">
                <div className="p-2 rounded-xl bg-zinc-800 text-zinc-400 flex-shrink-0 mt-0.5 sm:mt-0">
                  {item.query_type === "url" ? (
                    <Globe className="w-4 h-4 text-cyan-400" />
                  ) : (
                    <FileText className="w-4 h-4 text-indigo-400" />
                  )}
                </div>
                <div className="min-w-0 space-y-1">
                  <div className="font-semibold text-sm text-zinc-200 truncate max-w-xl">
                    {item.query_preview}
                  </div>
                  <div className="flex items-center gap-2 text-[11px] text-zinc-500 font-mono">
                    <span className="uppercase">{item.query_type}</span>
                    <span>•</span>
                    <span>{new Date(item.created_at).toLocaleString("uk-UA")}</span>
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-3 w-full sm:w-auto justify-between sm:justify-end border-t sm:border-t-0 pt-2 sm:pt-0 border-zinc-800">
                <TrustBadge score={item.trust_score} verdict={item.verdict} size="sm" />
                <button
                  onClick={() => deleteItem(item.id)}
                  className="p-1.5 rounded-lg text-zinc-500 hover:text-rose-400 hover:bg-rose-500/10 transition-colors"
                  title="Видалити з історії"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
