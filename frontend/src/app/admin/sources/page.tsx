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
  Search,
  Sparkles,
  ExternalLink,
  X,
} from "lucide-react";

export default function AdminSourcesPage() {
  const { user, token, isLoading: authLoading, apiUrl } = useAuth();
  const baseApi = apiUrl.endsWith("/api/v1") ? apiUrl : `${apiUrl}/api/v1`;

  const [sources, setSources] = useState<Source[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "rss" | "white" | "black">("all");
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [syncingSourceId, setSyncingSourceId] = useState<number | null>(null);
  const [syncingAll, setSyncingAll] = useState(false);

  // Модальне вікно створення або редагування джерела
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingSource, setEditingSource] = useState<Source | null>(null);

  // Поля форми
  const [name, setName] = useState("");
  const [domain, setDomain] = useState("");
  const [homepageUrl, setHomepageUrl] = useState("");
  const [rssUrl, setRssUrl] = useState("");
  const [language, setLanguage] = useState<"ua" | "en">("ua");
  const [rating, setRating] = useState<number>(85);
  const [listStatus, setListStatus] = useState<"whitelist" | "neutral" | "blacklist">("whitelist");
  const [saving, setSaving] = useState(false);

  const fetchSources = async () => {
    setIsLoading(true);
    try {
      const res = await fetch(`${baseApi}/sources`);
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
  }, [baseApi]);

  const openCreateModal = () => {
    setEditingSource(null);
    setName("");
    setDomain("");
    setHomepageUrl("");
    setRssUrl("");
    setLanguage("ua");
    setRating(88);
    setListStatus("whitelist");
    setIsModalOpen(true);
  };

  const openEditModal = (src: Source) => {
    setEditingSource(src);
    setName(src.name);
    setDomain(src.domain);
    setHomepageUrl(src.homepage_url || `https://${src.domain}`);
    setRssUrl(src.rss_url || "");
    setLanguage((src.language === "en" ? "en" : "ua") as "ua" | "en");
    setRating(Math.round(src.reliability_rating));
    if (src.is_whitelisted) {
      setListStatus("whitelist");
    } else if (src.is_blacklisted) {
      setListStatus("blacklist");
    } else {
      setListStatus("neutral");
    }
    setIsModalOpen(true);
  };

  const handleSaveSource = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token) return;
    setSaving(true);
    setStatusMessage(null);

    const payload = {
      name: name.trim(),
      domain: domain.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "").split("/")[0],
      homepage_url: homepageUrl.trim() || `https://${domain.trim().toLowerCase()}`,
      rss_url: rssUrl.trim() || null,
      language,
      country: language === "en" ? "INT" : "UA",
      reliability_rating: Number(rating),
      is_whitelisted: listStatus === "whitelist",
      is_blacklisted: listStatus === "blacklist",
    };

    try {
      const url = editingSource
        ? `${baseApi}/sources/${editingSource.id}`
        : `${baseApi}/sources`;
      const method = editingSource ? "PUT" : "POST";

      const res = await fetch(url, {
        method,
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
      });

      if (res.ok) {
        setIsModalOpen(false);
        const rssNote = payload.rss_url
          ? " Автоматичний імпорт новин із RSS уже запущено у фоні — статті з'являться у стрічці за кілька секунд."
          : "";
        setStatusMessage(
          (editingSource
            ? `Джерело «${payload.name}» (${payload.domain}) успішно оновлено!`
            : `Нове джерело «${payload.name}» (${payload.domain}) додано до реєстру!`) + rssNote
        );
        await fetchSources();
      } else {
        const errData = await res.json().catch(() => ({}));
        setStatusMessage(`Помилка: ${errData.detail || "не вдалося зберегти джерело"}`);
      }
    } catch (e) {
      console.error("Помилка збереження джерела", e);
      setStatusMessage("Помилка з'єднання із сервером при збереженні джерела.");
    } finally {
      setSaving(false);
    }
  };

  const handleFetchSingleRss = async (src: Source) => {
    if (!token || !src.rss_url) return;
    setSyncingSourceId(src.id);
    setStatusMessage(null);
    try {
      const res = await fetch(`${baseApi}/sources/${src.id}/fetch-rss`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        setStatusMessage(
          data.message || `RSS-канал «${src.name}» перевірено: імпортовано ${data.new_articles ?? 0} нових статей.`
        );
      } else {
        setStatusMessage(`Помилка RSS: ${data.detail || "не вдалося прочитати RSS-стрічку"}`);
      }
    } catch (e) {
      console.error("Помилка синхронізації RSS", e);
      setStatusMessage("Не вдалося виконати запит на парсинг RSS-стрічки.");
    } finally {
      setSyncingSourceId(null);
    }
  };

  const handleSyncAllFeeds = async () => {
    setSyncingAll(true);
    setStatusMessage(null);
    try {
      const res = await fetch(`${baseApi}/news/sync`, { method: "POST" });
      if (res.ok) {
        setStatusMessage(
          "Фоновий збір та XAI-скоринг усіх активних RSS-каналів запущено! Нові статті автоматично з'являться у базі."
        );
      }
    } catch (e) {
      console.error("Помилка синхронізації всіх RSS", e);
    } finally {
      setSyncingAll(false);
    }
  };

  const handleDelete = async (id: number, srcName: string) => {
    if (!token || !confirm(`Видалити медіаджерело «${srcName}» з реєстру?`)) return;
    try {
      const res = await fetch(`${baseApi}/sources/${id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        setSources((prev) => prev.filter((s) => s.id !== id));
        setStatusMessage(`Джерело «${srcName}» видалено з реєстру.`);
      }
    } catch (e) {
      console.error("Помилка видалення джерела", e);
    }
  };

  if (!authLoading && (!user || user.role !== "admin")) {
    return (
      <div className="max-w-md mx-auto px-4 py-20 text-center space-y-4">
        <ShieldAlert className="w-12 h-12 text-amber-500 mx-auto" />
        <h2 className="text-xl font-bold text-white">Доступ обмежено</h2>
        <p className="text-xs text-zinc-400">
          Цей розділ призначений виключно для адміністраторів системи TruthLens.
        </p>
        <Link
          href="/login"
          className="inline-block mt-2 px-4 py-2 rounded-xl bg-indigo-600 text-xs font-semibold text-white"
        >
          Увійти як Адміністратор
        </Link>
      </div>
    );
  }

  const filteredSources = sources.filter((s) => {
    const q = searchQuery.trim().toLowerCase();
    const matchesSearch =
      !q ||
      s.name.toLowerCase().includes(q) ||
      s.domain.toLowerCase().includes(q) ||
      (s.rss_url && s.rss_url.toLowerCase().includes(q));
    if (!matchesSearch) return false;
    if (statusFilter === "rss") return Boolean(s.rss_url && s.rss_url.trim());
    if (statusFilter === "white") return s.is_whitelisted;
    if (statusFilter === "black") return s.is_blacklisted;
    return true;
  });

  const activeRssCount = sources.filter((s) => s.rss_url && s.rss_url.trim()).length;
  const whiteCount = sources.filter((s) => s.is_whitelisted).length;
  const blackCount = sources.filter((s) => s.is_blacklisted).length;

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
      {/* Шапка сторінки керування джерелами та RSS */}
      <div className="rounded-3xl border border-zinc-800/90 bg-gradient-to-br from-zinc-900/95 via-zinc-950 to-cyan-950/20 p-6 sm:p-8 shadow-2xl space-y-5">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="space-y-2">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-cyan-500/10 border border-cyan-500/30 text-cyan-300 text-xs font-semibold">
              <SlidersHorizontal className="w-3.5 h-3.5" />
              <span>Адміністрування реєстру ЗМІ • Domain Credibility Index & RSS Ingestion</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
              Керування репутацією доменів та RSS-каналами
            </h1>
            <p className="text-xs sm:text-sm text-zinc-400 max-w-3xl leading-relaxed">
              Додавайте нові RSS-стрічки для автоматичного парсингу новин, змінюйте індекс репутації доменів (0–100%) та керуйте Білим і Чорним списками медіа.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={handleSyncAllFeeds}
              disabled={syncingAll}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-100 text-xs font-semibold border border-zinc-700 transition-colors cursor-pointer"
            >
              <RefreshCw className={`w-4 h-4 text-cyan-400 ${syncingAll ? "animate-spin" : ""}`} />
              <span>Оновити всі RSS-канали</span>
            </button>

            <button
              type="button"
              onClick={openCreateModal}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-gradient-to-r from-cyan-500 to-indigo-600 text-white font-bold text-xs shadow-lg shadow-cyan-500/20 hover:brightness-110 transition-all cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>Додати джерело / RSS-канал</span>
            </button>
          </div>
        </div>

        {/* Статистичні лічильники реєстру */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2">
          <div className="p-3.5 rounded-2xl bg-zinc-900/90 border border-zinc-800">
            <span className="text-[11px] text-zinc-400">Усього джерел у реєстрі</span>
            <div className="text-xl font-extrabold text-white font-mono mt-0.5">
              {sources.length}
            </div>
          </div>
          <div className="p-3.5 rounded-2xl bg-zinc-900/90 border border-zinc-800">
            <span className="text-[11px] text-zinc-400">Підключені RSS-стрічки</span>
            <div className="text-xl font-extrabold text-cyan-400 font-mono mt-0.5">
              {activeRssCount}
            </div>
          </div>
          <div className="p-3.5 rounded-2xl bg-zinc-900/90 border border-zinc-800">
            <span className="text-[11px] text-zinc-400">Білий список ІМІ</span>
            <div className="text-xl font-extrabold text-emerald-400 font-mono mt-0.5">
              {whiteCount}
            </div>
          </div>
          <div className="p-3.5 rounded-2xl bg-zinc-900/90 border border-zinc-800">
            <span className="text-[11px] text-zinc-400">Чорний список (дезінформація)</span>
            <div className="text-xl font-extrabold text-rose-400 font-mono mt-0.5">
              {blackCount}
            </div>
          </div>
        </div>
      </div>

      {/* Повідомлення про статус дії */}
      {statusMessage && (
        <div className="flex items-center justify-between gap-3 px-4 py-3 rounded-2xl bg-cyan-500/10 border border-cyan-500/30 text-cyan-200 text-xs font-medium">
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-cyan-400 flex-shrink-0" />
            <span>{statusMessage}</span>
          </div>
          <button
            type="button"
            onClick={() => setStatusMessage(null)}
            className="text-zinc-400 hover:text-white cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Панель пошуку та фільтрів */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
        <div className="relative flex-1 max-w-md">
          <Search className="w-4 h-4 text-zinc-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Пошук за назвою ЗМІ, доменом або RSS URL..."
            className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-zinc-900 border border-zinc-800 text-xs text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-cyan-500"
          />
        </div>

        <div className="flex flex-wrap gap-1.5">
          {[
            { id: "all", label: `Всі (${sources.length})` },
            { id: "rss", label: `З RSS-каналом (${activeRssCount})` },
            { id: "white", label: `Білий список (${whiteCount})` },
            { id: "black", label: `Чорний список (${blackCount})` },
          ].map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setStatusFilter(tab.id as any)}
              className={`px-3.5 py-2 rounded-xl text-xs font-semibold transition-colors cursor-pointer ${
                statusFilter === tab.id
                  ? "bg-cyan-500/20 text-cyan-300 border border-cyan-500/40"
                  : "bg-zinc-900 text-zinc-400 hover:text-zinc-200 border border-zinc-800"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Таблиця джерел */}
      {isLoading ? (
        <div className="flex flex-col items-center justify-center py-20 text-zinc-500 space-y-3">
          <RefreshCw className="w-8 h-8 animate-spin text-indigo-500" />
          <p className="text-sm">Завантаження бази джерел та RSS-каналів...</p>
        </div>
      ) : (
        <div className="rounded-3xl border border-zinc-800 bg-zinc-900/60 overflow-hidden shadow-xl">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-zinc-950 border-b border-zinc-800 text-zinc-400 font-mono uppercase text-[10px]">
                <tr>
                  <th className="px-5 py-3.5">Назва ЗМІ та Домен</th>
                  <th className="px-5 py-3.5">Мова</th>
                  <th className="px-5 py-3.5">RSS-канал (Автозбір)</th>
                  <th className="px-5 py-3.5">Репутація домену</th>
                  <th className="px-5 py-3.5">Статус у реєстрі</th>
                  <th className="px-5 py-3.5 text-right">Керування</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800/60">
                {filteredSources.map((source) => (
                  <tr key={source.id} className="hover:bg-zinc-800/30 transition-colors">
                    <td className="px-5 py-4">
                      <div className="font-bold text-zinc-100 text-sm">{source.name}</div>
                      <div className="text-zinc-400 font-mono text-[11px] flex items-center gap-1.5 mt-0.5">
                        <Globe className="w-3 h-3 text-zinc-500" />
                        <span>{source.domain}</span>
                      </div>
                    </td>

                    <td className="px-5 py-4">
                      <span className="px-2 py-0.5 rounded text-[10px] font-mono uppercase bg-zinc-800 text-zinc-300">
                        {source.language === "en" ? "EN" : "UA"}
                      </span>
                    </td>

                    <td className="px-5 py-4 max-w-xs">
                      {source.rss_url ? (
                        <div className="space-y-1">
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold bg-cyan-500/10 text-cyan-300 border border-cyan-500/25">
                            <CheckCircle2 className="w-3 h-3" /> Активний RSS
                          </span>
                          <div
                            className="text-[11px] font-mono text-zinc-400 truncate max-w-[240px]"
                            title={source.rss_url}
                          >
                            {source.rss_url}
                          </div>
                        </div>
                      ) : (
                        <span className="text-zinc-500 text-[11px]">RSS не вказано</span>
                      )}
                    </td>

                    <td className="px-5 py-4">
                      <div className="flex items-center gap-2">
                        <span
                          className={`font-mono font-bold text-sm ${
                            source.reliability_rating >= 80
                              ? "text-emerald-400"
                              : source.reliability_rating >= 50
                              ? "text-amber-400"
                              : "text-rose-400"
                          }`}
                        >
                          {source.reliability_rating.toFixed(0)}%
                        </span>
                        <div className="w-16 h-1.5 rounded-full bg-zinc-800 overflow-hidden hidden sm:block">
                          <div
                            className={`h-full rounded-full ${
                              source.reliability_rating >= 80
                                ? "bg-emerald-500"
                                : source.reliability_rating >= 50
                                ? "bg-amber-500"
                                : "bg-rose-500"
                            }`}
                            style={{ width: `${Math.min(100, Math.max(4, source.reliability_rating))}%` }}
                          />
                        </div>
                      </div>
                    </td>

                    <td className="px-5 py-4">
                      {source.is_whitelisted ? (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-semibold bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
                          <CheckCircle2 className="w-3 h-3" />
                          Білий список ІМІ
                        </span>
                      ) : source.is_blacklisted ? (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-semibold bg-rose-500/15 text-rose-300 border border-rose-500/30">
                          <XCircle className="w-3 h-3" />
                          Чорний список
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-semibold bg-zinc-800 text-zinc-300 border border-zinc-700">
                          Нейтральний
                        </span>
                      )}
                    </td>

                    <td className="px-5 py-4 text-right">
                      <div className="inline-flex items-center gap-1.5">
                        {source.rss_url && (
                          <button
                            type="button"
                            onClick={() => handleFetchSingleRss(source)}
                            disabled={syncingSourceId === source.id}
                            className="px-2.5 py-1.5 rounded-lg bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-300 border border-cyan-500/25 text-[11px] font-semibold inline-flex items-center gap-1 transition-colors cursor-pointer"
                            title="Зібрати свіжі новини з цього RSS-каналу зараз"
                          >
                            <RefreshCw
                              className={`w-3.5 h-3.5 ${
                                syncingSourceId === source.id ? "animate-spin" : ""
                              }`}
                            />
                            <span className="hidden md:inline">Зібрати RSS</span>
                          </button>
                        )}

                        <button
                          type="button"
                          onClick={() => openEditModal(source)}
                          className="px-2.5 py-1.5 rounded-lg bg-indigo-500/15 hover:bg-indigo-500/25 text-indigo-300 border border-indigo-500/30 text-[11px] font-semibold transition-colors cursor-pointer"
                          title="Змінити репутацію домену або RSS-канал"
                        >
                          Редагувати
                        </button>

                        <button
                          type="button"
                          onClick={() => handleDelete(source.id, source.name)}
                          className="p-1.5 rounded-lg text-zinc-500 hover:text-rose-400 hover:bg-rose-500/10 transition-colors cursor-pointer"
                          title="Видалити джерело"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Модальне вікно додавання / редагування джерела */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm">
          <div className="w-full max-w-lg bg-zinc-900 border border-zinc-800 rounded-3xl p-6 sm:p-7 space-y-5 shadow-2xl">
            <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
              <div>
                <h3 className="text-lg font-bold text-white">
                  {editingSource ? "Редагування медіаджерела та RSS" : "Додати нове джерело та RSS-канал"}
                </h3>
                <p className="text-xs text-zinc-400">
                  Налаштуйте домен, RSS-стрічку та базовий рейтинг довіри (Domain Credibility Index)
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="p-1.5 rounded-xl bg-zinc-800 text-zinc-400 hover:text-white cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveSource} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-zinc-300">Назва видання (ЗМІ)</label>
                  <input
                    type="text"
                    required
                    placeholder="Напр.: Суспільне Новини"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="w-full mt-1 px-3.5 py-2 rounded-xl bg-zinc-950 border border-zinc-800 text-xs text-zinc-100 focus:outline-none focus:border-cyan-500"
                  />
                </div>

                <div>
                  <label className="text-xs font-semibold text-zinc-300">Домен (без https://)</label>
                  <input
                    type="text"
                    required
                    placeholder="Напр.: suspilne.media"
                    value={domain}
                    onChange={(e) => setDomain(e.target.value)}
                    className="w-full mt-1 px-3.5 py-2 rounded-xl bg-zinc-950 border border-zinc-800 text-xs font-mono text-zinc-100 focus:outline-none focus:border-cyan-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="sm:col-span-2">
                  <label className="text-xs font-semibold text-cyan-300">
                    URL-адреса RSS-каналу (для автозбору новин)
                  </label>
                  <input
                    type="url"
                    placeholder="https://suspilne.media/rss/all.rss"
                    value={rssUrl}
                    onChange={(e) => setRssUrl(e.target.value)}
                    className="w-full mt-1 px-3.5 py-2 rounded-xl bg-zinc-950 border border-zinc-800 text-xs font-mono text-zinc-100 focus:outline-none focus:border-cyan-500"
                  />
                </div>

                <div>
                  <label className="text-xs font-semibold text-zinc-300">Мова потоку</label>
                  <select
                    value={language}
                    onChange={(e) => setLanguage(e.target.value as "ua" | "en")}
                    className="w-full mt-1 px-3 py-2 rounded-xl bg-zinc-950 border border-zinc-800 text-xs text-zinc-100 focus:outline-none focus:border-cyan-500"
                  >
                    <option value="ua">UA (Українська)</option>
                    <option value="en">EN (English / World)</option>
                  </select>
                </div>
              </div>

              {/* Повзунок репутації домену */}
              <div className="p-4 rounded-2xl bg-zinc-950/90 border border-zinc-800 space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-semibold text-zinc-200">
                    Індекс репутації домену (0–100%):
                  </label>
                  <span
                    className={`px-2.5 py-0.5 rounded-lg font-mono font-bold text-sm ${
                      rating >= 80
                        ? "bg-emerald-500/15 text-emerald-300"
                        : rating >= 50
                        ? "bg-amber-500/15 text-amber-300"
                        : "bg-rose-500/15 text-rose-300"
                    }`}
                  >
                    {rating}%
                  </span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="100"
                  step="1"
                  value={rating}
                  onChange={(e) => setRating(Number(e.target.value))}
                  className="w-full accent-cyan-500 cursor-pointer"
                />
                <div className="flex justify-between text-[10px] text-zinc-500 font-mono">
                  <span>0% (Фейки / ІПСО)</span>
                  <span>50% (Сумнівне / Таблоїд)</span>
                  <span>95% (Білий список ІМІ)</span>
                </div>
              </div>

              {/* Вибір статусу списку */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-zinc-300">
                  Категорія в реєстрі достовірності:
                </label>
                <div className="grid grid-cols-3 gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setListStatus("whitelist");
                      if (rating < 80) setRating(92);
                    }}
                    className={`py-2 px-3 rounded-xl text-xs font-semibold border transition-all cursor-pointer ${
                      listStatus === "whitelist"
                        ? "bg-emerald-500/20 text-emerald-300 border-emerald-500/40"
                        : "bg-zinc-950 text-zinc-400 border-zinc-800"
                    }`}
                  >
                    ✓ Білий список
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setListStatus("neutral");
                      if (rating > 85 || rating < 45) setRating(72);
                    }}
                    className={`py-2 px-3 rounded-xl text-xs font-semibold border transition-all cursor-pointer ${
                      listStatus === "neutral"
                        ? "bg-cyan-500/20 text-cyan-300 border-cyan-500/40"
                        : "bg-zinc-950 text-zinc-400 border-zinc-800"
                    }`}
                  >
                    • Нейтральний
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setListStatus("blacklist");
                      if (rating > 35) setRating(12);
                    }}
                    className={`py-2 px-3 rounded-xl text-xs font-semibold border transition-all cursor-pointer ${
                      listStatus === "blacklist"
                        ? "bg-rose-500/20 text-rose-300 border-rose-500/40"
                        : "bg-zinc-950 text-zinc-400 border-zinc-800"
                    }`}
                  >
                    ⚠ Чорний список
                  </button>
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-zinc-800">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 rounded-xl text-xs font-semibold text-zinc-400 hover:text-white cursor-pointer"
                >
                  Скасувати
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-5 py-2 rounded-xl bg-gradient-to-r from-cyan-500 to-indigo-600 text-xs font-bold text-white hover:brightness-110 disabled:opacity-50 cursor-pointer"
                >
                  {saving
                    ? "Збереження..."
                    : editingSource
                    ? "Зберегти зміни"
                    : "Додати джерело"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
