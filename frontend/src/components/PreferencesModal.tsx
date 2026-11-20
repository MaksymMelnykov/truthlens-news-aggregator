"use client";

import React, { useState, useEffect } from "react";
import { toast } from "sonner";
import { useAuth } from "@/context/AuthContext";
import { Source } from "@/types";
import {
  Sliders,
  Check,
  ShieldCheck,
  Layers,
  Globe,
  Loader2,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";

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

  const [availableSources, setAvailableSources] =
    useState<DynamicSourceItem[]>(FALLBACK_SOURCES);
  const [selectedCats, setSelectedCats] = useState<string[]>([]);
  const [selectedSources, setSelectedSources] = useState<string[]>([]);
  const [onlyVerified, setOnlyVerified] = useState<boolean>(false);
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

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
      .catch(() => {});
  }, [isOpen, apiUrl]);

  useEffect(() => {
    if (user?.preferences) {
      setSelectedCats(user.preferences.favorite_categories || []);
      setSelectedSources(user.preferences.favorite_sources || []);
      setOnlyVerified(user.preferences.only_verified || false);
    }
  }, [user, isOpen]);

  const toggleCategory = (cat: string) => {
    setSelectedCats((prev) =>
      prev.includes(cat) ? prev.filter((c) => c !== cat) : [...prev, cat]
    );
  };

  const toggleSource = (domain: string) => {
    setSelectedSources((prev) =>
      prev.includes(domain)
        ? prev.filter((s) => s !== domain)
        : [...prev, domain]
    );
  };

  const handleSave = async () => {
    if (!token) {
      setErrorMessage("Будь ласка, авторизуйтесь для збереження вподобань.");
      return;
    }
    setIsSaving(true);
    setErrorMessage(null);

    try {
      await updatePreferences({
        favorite_categories: selectedCats,
        favorite_sources: selectedSources,
        only_verified: onlyVerified,
      });

      toast.success("Вподобання персональної стрічки оновлено");
      onSaved();
      onClose();
    } catch (e: unknown) {
      setErrorMessage(
        e instanceof Error ? e.message : "Помилка при збереженні вподобань."
      );
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center gap-3">
            <div className="flex size-10 items-center justify-center rounded-xl border border-border bg-secondary text-primary">
              <Sliders className="size-5" />
            </div>
            <div>
              <DialogTitle>Персоналізація стрічки новин</DialogTitle>
              <DialogDescription>
                Налаштуйте пріоритетні тематики, медіа-джерела та фільтр рівня достовірності
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="flex flex-col gap-5 py-2">
          <Card className="flex-row items-center justify-between gap-4 p-4 bg-secondary/50">
            <div className="flex items-center gap-3">
              <ShieldCheck className="size-5 text-verified" />
              <div className="flex flex-col gap-0.5">
                <span className="text-xs sm:text-sm font-bold text-foreground">
                  Тільки перевірені публікації (Verified ≥ 80%)
                </span>
                <span className="text-xs text-muted-foreground">
                  Автоматично приховувати статті з помірним або високим ризиком маніпуляцій
                </span>
              </div>
            </div>
            <Button
              type="button"
              variant={onlyVerified ? "default" : "outline"}
              size="sm"
              role="switch"
              aria-checked={onlyVerified}
              onClick={() => setOnlyVerified(!onlyVerified)}
            >
              {onlyVerified ? "Увімкнено" : "Вимкнено"}
            </Button>
          </Card>

          <div className="flex flex-col gap-2.5">
            <div className="flex items-center justify-between text-xs font-semibold text-foreground">
              <span className="flex items-center gap-1.5">
                <Layers className="size-4 text-primary" />
                <span>Улюблені тематики</span>
              </span>
              <span className="text-xs text-muted-foreground tabular-nums">
                {selectedCats.length > 0
                  ? `Обрано: ${selectedCats.length}`
                  : "Усі категорії"}
              </span>
            </div>
            <div className="flex flex-wrap gap-2">
              {AVAILABLE_CATEGORIES.map((cat) => {
                const active = selectedCats.includes(cat);
                return (
                  <Button
                    key={cat}
                    type="button"
                    variant={active ? "default" : "outline"}
                    size="sm"
                    onClick={() => toggleCategory(cat)}
                    aria-pressed={active}
                  >
                    {active && <Check className="size-3.5" />}
                    <span>{cat}</span>
                  </Button>
                );
              })}
            </div>
          </div>

          <div className="flex flex-col gap-2.5">
            <div className="flex items-center justify-between text-xs font-semibold text-foreground">
              <span className="flex items-center gap-1.5">
                <Globe className="size-4 text-accent" />
                <span>Довірені видання (Україна та Світ)</span>
              </span>
              <span className="text-xs text-muted-foreground tabular-nums">
                {selectedSources.length > 0
                  ? `Обрано: ${selectedSources.length}`
                  : "Усі джерела"}
              </span>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {availableSources.map((src) => {
                const active = selectedSources.includes(src.domain);
                return (
                  <Button
                    key={`${src.name}-${src.domain}`}
                    type="button"
                    variant={active ? "default" : "outline"}
                    onClick={() => toggleSource(src.domain)}
                    aria-pressed={active}
                    className="h-auto flex-col items-start p-3 text-left justify-start gap-1"
                  >
                    <div className="flex items-center justify-between w-full gap-1">
                      <span className="text-xs font-bold truncate">
                        {src.name}
                      </span>
                      <Badge
                        variant={active ? "accent" : "secondary"}
                        className="px-1.5 py-0 text-[10px]"
                      >
                        {src.region}
                      </Badge>
                    </div>
                    <span className="text-[11px] font-mono opacity-80 truncate max-w-full">
                      {src.domain}
                    </span>
                  </Button>
                );
              })}
            </div>
          </div>

          {errorMessage && (
            <Alert variant="destructive">
              <AlertDescription>{errorMessage}</AlertDescription>
            </Alert>
          )}
        </div>

        <DialogFooter>
          <Button type="button" variant="ghost" onClick={onClose}>
            Скасувати
          </Button>
          <Button
            type="button"
            variant="default"
            onClick={handleSave}
            disabled={isSaving}
          >
            {isSaving && <Loader2 className="size-4 animate-spin" />}
            <span>{isSaving ? "Збереження…" : "Зберегти вподобання"}</span>
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
