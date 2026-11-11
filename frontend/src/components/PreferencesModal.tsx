"use client";

import React, { useState, useEffect } from "react";
import { useAuth } from "@/context/AuthContext";
import { Source } from "@/types";
import {
  X,
  Sliders,
  Check,
  ShieldCheck,
  Layers,
  Globe2,
} from "lucide-react";

interface PreferencesModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSaved: () => void;
}

const AVAILABLE_CATEGORIES = [
  "Політика",
  "Технології",
  "Економіка",
  "Суспільство",
  "Здоров'я",
  "Світ",
];

const FALLBACK_SOURCES = [
  { name: "Українська правда", domain: "pravda.com.ua", region: "UA" },
  { name: "BBC News Україна", domain: "bbc.com", region: "UA" },
  { name: "Дзеркало тижня (ZN.UA)", domain: "zn.ua", region: "UA" },
  { name: "УНІАН", domain: "unian.net", region: "UA" },
  { name: "УНН Новини", domain: "unn.ua", region: "UA" },
  { name: "Факти ICTV", domain: "fakty.ua", region: "UA" },
  { name: "LB.ua", domain: "lb.ua", region: "UA" },
  { name: "Інтерфакс-Україна", domain: "interfax.com.ua", region: "UA" },
  { name: "The Guardian", domain: "theguardian.com", region: "INTL" },
  { name: "DW English", domain: "dw.com", region: "INTL" },
  { name: "Politico Europe", domain: "politico.eu", region: "INTL" },
  { name: "NPR World", domain: "npr.org", region: "INTL" },
  { name: "CNN World", domain: "cnn.com", region: "INTL" },
];

interface DynamicSourceItem {
  name: string;
  domain: string;
  region: string;
}

export const PreferencesModal: React.FC<PreferencesModalProps> = ({
  isOpen,
  onClose,
  onSaved,
}) => {
  const { user, token, updatePreferences, apiUrl } = useAuth();

  const [availableSources, setAvailableSources] = useState<DynamicSourceItem[]>(FALLBACK_SOURCES);
  const [selectedCats, setSelectedCats] = useState<string[]>([]);
  const [selectedSources, setSelectedSources] = useState<string[]>([]);
  const [onlyVerified, setOnlyVerified] = useState<boolean>(false);
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [message, setMessage] = useState<string | null>(null);

  // Динамічне завантаження актуальних джерел із БД (включаючи додані адміністратором)
  useEffect(() => {
    if (!isOpen) return;
    const baseApi = apiUrl.endsWith("/api/v1") ? apiUrl : `${apiUrl}/api/v1`;
    fetch(`${baseApi}/sources`, { cache: "no-store" })
      .then((res) => (res.ok ? res.json() : null))
      .then((data: Source[] | null) => {
        if (Array.isArray(data) && data.length > 0) {
          const filtered = data
            .filter((s) => !s.is_blacklisted)
            .map((s) => ({
              name: s.name,
              domain: s.domain,
              region: s.language === "en" ? "INTL" : "UA",
            }));
          if (filtered.length > 0) {
            setAvailableSources(filtered);
          }
        }
      })
      .catch(() => {
        // У разі збою мережі лишаємо резервний список
      });
  }, [isOpen, apiUrl]);

  // Синхронізація з поточними вподобаннями користувача при відкритті
  useEffect(() => {
    if (user?.preferences) {
      setSelectedCats(user.preferences.favorite_categories || []);
      setSelectedSources(user.preferences.favorite_sources || []);
      setOnlyVerified(user.preferences.only_verified || false);
    }
  }, [user, isOpen]);

  if (!isOpen) return null;

  const toggleCategory = (cat: string) => {
    if (selectedCats.includes(cat)) {
      setSelectedCats(selectedCats.filter((c) => c !== cat));
    } else {
      setSelectedCats([...selectedCats, cat]);
    }
  };

  const toggleSource = (domain: string) => {
    if (selectedSources.includes(domain)) {
      setSelectedSources(selectedSources.filter((s) => s !== domain));
    } else {
      setSelectedSources([...selectedSources, domain]);
    }
  };

  const handleSave = async () => {
    if (!token) {
      setMessage("Будь ласка, авторизуйтесь для збереження вподобань.");
      return;
    }
    setIsSaving(true);
    setMessage(null);

    try {
      await updatePreferences({
        favorite_categories: selectedCats,
        favorite_sources: selectedSources,
        only_verified: onlyVerified,
      });

      setMessage("Вподобання успішно збережено!");
      setTimeout(() => {
        onSaved();
        onClose();
      }, 600);
    } catch (e: any) {
      console.error("Помилка збереження вподобань", e);
      setMessage(e?.message || "Помилка при збереженні вподобань.");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="relative w-full max-w-xl rounded-3xl border border-zinc-800 bg-zinc-900 p-6 shadow-2xl space-y-6 max-h-[90vh] overflow-y-auto">
        {/* Заголовок */}
        <div className="flex items-center justify-between border-b border-zinc-800 pb-4">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-cyan-500/10 border border-cyan-500/20 text-cyan-400">
              <Sliders className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-white">Мої вподобання</h3>
              <p className="text-xs text-zinc-400">
                Налаштуйте теми та джерела для персональної стрічки новин
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 rounded-xl text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Секція 1: Тільки перевірені новини */}
        <div className="flex items-center justify-between p-3.5 rounded-2xl bg-zinc-950/70 border border-zinc-800/80">
          <div className="flex items-center gap-3">
            <ShieldCheck className="w-5 h-5 text-emerald-400" />
            <div>
              <div className="text-xs font-semibold text-zinc-200">
                Тільки перевірені новини (Verified)
              </div>
              <div className="text-[11px] text-zinc-400">
                Приховувати статті з помірним чи високим ризиком маніпуляцій
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setOnlyVerified(!onlyVerified)}
            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors cursor-pointer ${
              onlyVerified ? "bg-cyan-500" : "bg-zinc-800"
            }`}
          >
            <span
              className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                onlyVerified ? "translate-x-6" : "translate-x-1"
              }`}
            />
          </button>
        </div>

        {/* Секція 2: Улюблені категорії */}
        <div className="space-y-2.5">
          <div className="flex items-center justify-between text-xs font-semibold text-zinc-300">
            <span className="flex items-center gap-1.5">
              <Layers className="w-4 h-4 text-cyan-400" />
              Улюблені категорії:
            </span>
            <span className="text-[11px] text-zinc-500">
              {selectedCats.length > 0
                ? `Обрано: ${selectedCats.length}`
                : "Всі категорії"}
            </span>
          </div>
          <div className="flex flex-wrap gap-2">
            {AVAILABLE_CATEGORIES.map((cat) => {
              const active = selectedCats.includes(cat);
              return (
                <button
                  key={cat}
                  onClick={() => toggleCategory(cat)}
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium transition-all cursor-pointer ${
                    active
                      ? "bg-cyan-500 text-zinc-950 font-bold shadow-md shadow-cyan-500/20"
                      : "bg-zinc-950 border border-zinc-800 text-zinc-400 hover:text-zinc-200 hover:border-zinc-700"
                  }`}
                >
                  {active && <Check className="w-3.5 h-3.5" />}
                  <span>{cat}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Секція 3: Улюблені джерела (динамічно з БД) */}
        <div className="space-y-2.5">
          <div className="flex items-center justify-between text-xs font-semibold text-zinc-300">
            <span className="flex items-center gap-1.5">
              <Globe2 className="w-4 h-4 text-indigo-400" />
              Довірені джерела (UA та International):
            </span>
            <span className="text-[11px] text-zinc-500">
              {selectedSources.length > 0
                ? `Обрано: ${selectedSources.length}`
                : "Всі джерела"}
            </span>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {availableSources.map((src) => {
              const active = selectedSources.includes(src.domain);
              return (
                <button
                  key={`${src.name}-${src.domain}`}
                  type="button"
                  onClick={() => toggleSource(src.domain)}
                  className={`flex flex-col items-start p-2.5 rounded-xl text-left text-xs transition-all border cursor-pointer ${
                    active
                      ? "bg-indigo-500/20 border-indigo-500/50 text-white"
                      : "bg-zinc-950/60 border-zinc-800/80 text-zinc-400 hover:border-zinc-700 hover:text-zinc-200"
                  }`}
                >
                  <div className="flex items-center justify-between w-full gap-1">
                    <span className="font-semibold text-zinc-200 truncate">
                      {src.name}
                    </span>
                    <span className="text-[9px] px-1 rounded bg-zinc-800 text-zinc-400 flex-shrink-0">
                      {src.region}
                    </span>
                  </div>
                  <span className="text-[10px] text-zinc-500 font-mono mt-0.5 truncate max-w-full">
                    {src.domain}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Повідомлення про успіх / помилку */}
        {message && (
          <div className="p-3 rounded-xl bg-zinc-950 border border-zinc-800 text-center text-xs font-medium text-cyan-400 animate-in fade-in">
            {message}
          </div>
        )}

        {/* Кнопки дій */}
        <div className="flex items-center justify-end gap-3 pt-4 border-t border-zinc-800">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl text-xs font-medium text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors cursor-pointer"
          >
            Скасувати
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={isSaving}
            className="px-5 py-2 rounded-xl text-xs font-bold bg-gradient-to-r from-cyan-500 to-blue-600 text-zinc-950 hover:from-cyan-400 hover:to-blue-500 transition-all shadow-md shadow-cyan-500/20 disabled:opacity-50 cursor-pointer"
          >
            {isSaving ? "Збереження..." : "Зберегти вподобання"}
          </button>
        </div>
      </div>
    </div>
  );
};
