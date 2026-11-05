"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { useAuth } from "@/context/AuthContext";
import { Source } from "@/types";
import {
  SlidersHorizontal,
  Plus,
  Trash2,
  CheckCircle2,
  XCircle,
  RefreshCw,
  ArrowLeft,
  ShieldCheck,
  ShieldAlert,
  Globe,
} from "lucide-react";

export default function AdminSourcesPage() {
  const { user, token, apiUrl } = useAuth();
  const [sources, setSources] = useState<Source[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);

  // Форма нового джерела
  const [name, setName] = useState("");
  const [domain, setDomain] = useState("");
  const [rating, setRating] = useState(85);
  const [isWhitelisted, setIsWhitelisted] = useState(false);
  const [isBlacklisted, setIsBlacklisted] = useState(false);

  const fetchSources = async () => {
    setIsLoading(true);
    try {
      const res = await fetch(`${apiUrl}/sources`);
      if (res.ok) {
        const data = await res.json();
        setSources(data);
      }
    } catch (e) {
      console.error("Помилка завантаження джерел", e);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchSources();
  }, []);

  const handleAddSource = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token) return;

    try {
      const res = await fetch(`${apiUrl}/sources`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          name,
          domain,
          reliability_rating: Number(rating),
          is_whitelisted: isWhitelisted,
          is_blacklisted: isBlacklisted,
          language: "ua",
          country: "UA",
        }),
      });

      if (res.ok) {
        setShowAddModal(false);
        setName("");
        setDomain("");
        setRating(85);
        fetchSources();
      }
    } catch (e) {
      console.error("Помилка створення джерела", e);
    }
  };

  const handleDelete = async (id: number) => {
    if (!token || !confirm("Видалити це медіаджерело?")) return;
    try {
      const res = await fetch(`${apiUrl}/sources/${id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        setSources((prev) => prev.filter((s) => s.id !== id));
      }
    } catch (e) {
      console.error("Помилка видалення джерела", e);
    }
  };

  if (!user || user.role !== "admin") {
    return (
      <div className="max-w-md mx-auto px-4 py-20 text-center space-y-4">
        <ShieldAlert className="w-12 h-12 text-amber-500 mx-auto" />
        <h2 className="text-xl font-bold text-white">Доступ обмежено</h2>
        <p className="text-xs text-zinc-400">
          Цей розділ призначений виключно для адміністраторів системи TruthLens.
        </p>
        <Link
          href="/"
          className="inline-block mt-2 px-4 py-2 rounded-xl bg-zinc-800 text-xs font-semibold text-zinc-200"
        >
          Повернутися на головну
        </Link>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
      {/* Заголовок */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b border-zinc-800/80 pb-4">
        <div className="flex items-center gap-3">
          <Link
            href="/"
            className="p-2 rounded-xl bg-zinc-900 border border-zinc-800 text-zinc-400 hover:text-white transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
          </Link>
          <div>
            <h1 className="text-2xl font-bold text-white flex items-center gap-2">
              <SlidersHorizontal className="w-6 h-6 text-indigo-400" />
              Керування репутацією джерел
            </h1>
            <p className="text-xs text-zinc-400">
              Налаштування доменів, білих та чорних списків для модулю Domain Credibility Index ({sources.length})
            </p>
          </div>
        </div>

        <button
          onClick={() => setShowAddModal(true)}
          className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-indigo-600 text-white font-semibold text-xs hover:bg-indigo-500 transition-colors shadow-lg shadow-indigo-600/20"
        >
          <Plus className="w-4 h-4" />
          Додати джерело
        </button>
      </div>

      {/* Модальне вікно створення */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
          <div className="w-full max-w-md bg-zinc-900 border border-zinc-800 rounded-3xl p-6 space-y-4 shadow-2xl">
            <h3 className="text-lg font-bold text-white">Додати нове джерело</h3>
            <form onSubmit={handleAddSource} className="space-y-3">
              <div>
                <label className="text-xs text-zinc-400">Назва медіа</label>
                <input
                  type="text"
                  required
                  placeholder="Суспільне Новини"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full mt-1 px-3 py-2 rounded-xl bg-zinc-950 border border-zinc-800 text-sm text-zinc-100"
                />
              </div>

              <div>
                <label className="text-xs text-zinc-400">Домен</label>
                <input
                  type="text"
                  required
                  placeholder="suspilne.media"
                  value={domain}
                  onChange={(e) => setDomain(e.target.value)}
                  className="w-full mt-1 px-3 py-2 rounded-xl bg-zinc-950 border border-zinc-800 text-sm text-zinc-100"
                />
              </div>

              <div>
                <label className="text-xs text-zinc-400">Рейтинг надійності (0-100%)</label>
                <input
                  type="number"
                  min="0"
                  max="100"
                  value={rating}
                  onChange={(e) => setRating(Number(e.target.value))}
                  className="w-full mt-1 px-3 py-2 rounded-xl bg-zinc-950 border border-zinc-800 text-sm text-zinc-100"
                />
              </div>

              <div className="flex gap-4 pt-2">
                <label className="flex items-center gap-2 text-xs text-zinc-300">
                  <input
                    type="checkbox"
                    checked={isWhitelisted}
                    onChange={(e) => {
                      setIsWhitelisted(e.target.checked);
                      if (e.target.checked) setIsBlacklisted(false);
                    }}
                    className="rounded bg-zinc-950 border-zinc-700 text-emerald-500"
                  />
                  Білий список (ІМІ)
                </label>

                <label className="flex items-center gap-2 text-xs text-zinc-300">
                  <input
                    type="checkbox"
                    checked={isBlacklisted}
                    onChange={(e) => {
                      setIsBlacklisted(e.target.checked);
                      if (e.target.checked) setIsWhitelisted(false);
                    }}
                    className="rounded bg-zinc-950 border-zinc-700 text-rose-500"
                  />
                  Чорний список (Сміттярка)
                </label>
              </div>

              <div className="flex justify-end gap-2 pt-4">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="px-4 py-2 rounded-xl text-xs font-semibold text-zinc-400 hover:text-white"
                >
                  Скасувати
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-xl bg-indigo-600 text-xs font-semibold text-white hover:bg-indigo-500"
                >
                  Зберегти
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Таблиця джерел */}
      {isLoading ? (
        <div className="flex flex-col items-center justify-center py-20 text-zinc-500 space-y-3">
          <RefreshCw className="w-8 h-8 animate-spin text-indigo-500" />
          <p className="text-sm">Завантаження бази джерел...</p>
        </div>
      ) : (
        <div className="rounded-2xl border border-zinc-800 bg-zinc-900/60 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-zinc-950 border-b border-zinc-800 text-zinc-400 font-mono uppercase text-[10px]">
                <tr>
                  <th className="px-6 py-3.5">Назва</th>
                  <th className="px-6 py-3.5">Домен</th>
                  <th className="px-6 py-3.5">Рейтинг довіри</th>
                  <th className="px-6 py-3.5">Статус списку</th>
                  <th className="px-6 py-3.5 text-right">Дії</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800/60">
                {sources.map((source) => (
                  <tr key={source.id} className="hover:bg-zinc-800/30 transition-colors">
                    <td className="px-6 py-4 font-semibold text-zinc-200">
                      {source.name}
                    </td>
                    <td className="px-6 py-4 text-zinc-400 font-mono">
                      {source.domain}
                    </td>
                    <td className="px-6 py-4">
                      <span
                        className={`font-mono font-bold ${
                          source.reliability_rating >= 80
                            ? "text-emerald-400"
                            : source.reliability_rating >= 50
                            ? "text-amber-400"
                            : "text-rose-400"
                        }`}
                      >
                        {source.reliability_rating.toFixed(0)}%
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      {source.is_whitelisted ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                          <CheckCircle2 className="w-3 h-3" />
                          White List
                        </span>
                      ) : source.is_blacklisted ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-semibold bg-rose-500/10 text-rose-400 border border-rose-500/20">
                          <XCircle className="w-3 h-3" />
                          Black List
                        </span>
                      ) : (
                        <span className="text-zinc-500 text-[11px]">Нейтральний</span>
                      )}
                    </td>
                    <td className="px-6 py-4 text-right">
                      <button
                        onClick={() => handleDelete(source.id)}
                        className="p-1.5 rounded-lg text-zinc-500 hover:text-rose-400 hover:bg-rose-500/10 transition-colors"
                        title="Видалити"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
