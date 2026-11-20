"use client";

import React, { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { AnimatePresence, motion } from "motion/react";
import { toast } from "sonner";
import { useAuth } from "@/context/AuthContext";
import { Source } from "@/types";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@/components/ui/card";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import {
  FieldGroup,
  Field,
  FieldLabel,
  FieldDescription,
} from "@/components/ui/label";
import { EmptyState, ErrorState } from "@/components/ui/state-displays";
import {
  SlidersHorizontal,
  Plus,
  Trash2,
  CheckCircle2,
  XCircle,
  RefreshCw,
  ShieldCheck,
  ShieldAlert,
  Globe,
  Search,
  Sparkles,
  Pencil,
  AlertTriangle,
} from "lucide-react";

function SourcesTableSkeleton() {
  return (
    <Card className="border-border/85 bg-card/90 overflow-hidden">
      <div className="p-5 flex flex-col gap-3">
        {Array.from({ length: 6 }).map((_, idx) => (
          <Skeleton key={idx} className="h-14 w-full rounded-xl" />
        ))}
      </div>
    </Card>
  );
}

export default function AdminSourcesPage() {
  const { user, token, isLoading: authLoading, apiUrl } = useAuth();
  const baseApi = apiUrl.endsWith("/api/v1") ? apiUrl : `${apiUrl}/api/v1`;

  const [sources, setSources] = useState<Source[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "rss" | "white" | "black">("all");
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [syncingSourceId, setSyncingSourceId] = useState<number | null>(null);
  const [syncingAll, setSyncingAll] = useState(false);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingSource, setEditingSource] = useState<Source | null>(null);

  const [name, setName] = useState("");
  const [domain, setDomain] = useState("");
  const [homepageUrl, setHomepageUrl] = useState("");
  const [rssUrl, setRssUrl] = useState("");
  const [language, setLanguage] = useState<"ua" | "en">("ua");
  const [rating, setRating] = useState<number>(88);
  const [listStatus, setListStatus] = useState<"whitelist" | "neutral" | "blacklist">("whitelist");
  const [saving, setSaving] = useState(false);

  const fetchSources = useCallback(async () => {
    setIsLoading(true);
    setFetchError(null);
    try {
      const res = await fetch(`${baseApi}/sources`, { cache: "no-store" });
      if (!res.ok) {
        throw new Error("Не вдалося завантажити реєстр інформаційних джерел.");
      }
      const data = await res.json();
      setSources(data);
    } catch (e: unknown) {
      setFetchError(
        e instanceof Error ? e.message : "Помилка з'єднання із сервером."
      );
    } finally {
      setIsLoading(false);
    }
  }, [baseApi]);

  useEffect(() => {
    fetchSources();
  }, [fetchSources]);

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

    const cleanDomain = domain
      .trim()
      .toLowerCase()
      .replace(/^https?:\/\//, "")
      .replace(/^www\./, "")
      .split("/")[0];

    const payload = {
      name: name.trim(),
      domain: cleanDomain,
      homepage_url: homepageUrl.trim() || `https://${cleanDomain}`,
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
          ? " Автоматичний імпорт новин із RSS уже запущено у фоні."
          : "";
        const msg =
          (editingSource
            ? `Джерело «${payload.name}» (${payload.domain}) успішно оновлено.`
            : `Нове джерело «${payload.name}» (${payload.domain}) додано до реєстру.`) +
          rssNote;
        setStatusMessage(msg);
        toast.success(msg);
        await fetchSources();
      } else {
        const errData = await res.json().catch(() => ({}));
        const errMsg = `Помилка: ${errData.detail || "не вдалося зберегти джерело"}`;
        setStatusMessage(errMsg);
        toast.error(errMsg);
      }
    } catch {
      toast.error("Помилка з'єднання із сервером при збереженні джерела.");
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
        const msg =
          data.message ||
          `RSS-канал «${src.name}» перевірено: імпортовано ${data.new_articles ?? 0} нових статей.`;
        setStatusMessage(msg);
        toast.success(msg);
      } else {
        toast.error(`Помилка RSS: ${data.detail || "не вдалося прочитати RSS-стрічку"}`);
      }
    } catch {
      toast.error("Не вдалося виконати запит на парсинг RSS-стрічки.");
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
        const msg =
          "Фоновий збір та XAI-скоринг усіх активних RSS-каналів запущено. Нові статті автоматично з'являться у базі.";
        setStatusMessage(msg);
        toast.success(msg);
      }
    } catch {
      toast.error("Не вдалося запустити синхронізацію RSS-каналів.");
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
        toast.success(`Джерело «${srcName}» видалено з реєстру.`);
      }
    } catch {
      toast.error("Не вдалося видалити джерело.");
    }
  };

  if (!authLoading && (!user || user.role !== "admin")) {
    return (
      <div className="max-w-xl mx-auto px-4 py-20">
        <EmptyState
          icon={ShieldAlert}
          title="Доступ обмежено"
          description="Цей розділ призначений виключно для адміністраторів платформи TruthLens."
          actionLabel="Увійти як Адміністратор"
          onAction={() => {
            window.location.href = "/login";
          }}
        />
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
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 flex flex-col gap-6">
      {/* Шапка сторінки керування джерелами та RSS */}
      <Card className="border-border/90 bg-card/95 shadow-lg">
        <CardHeader className="p-6 sm:p-8 pb-4">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
            <div className="flex flex-col gap-2 max-w-3xl">
              <Badge variant="default" className="w-fit">
                <SlidersHorizontal className="size-3.5" />
                Адміністрування реєстру ЗМІ • Domain Credibility Index & RSS
              </Badge>
              <CardTitle className="text-2xl sm:text-3xl font-extrabold text-foreground tracking-tight">
                Керування репутацією доменів та RSS-каналами
              </CardTitle>
              <CardDescription className="text-xs sm:text-sm text-muted-foreground leading-relaxed max-w-[68ch]">
                Додавайте нові RSS-стрічки для автоматичного парсингу новин, змінюйте індекс репутації доменів (0–100%) та керуйте Білим і Чорним списками медіа.
              </CardDescription>
            </div>

            <div className="flex flex-wrap items-center gap-2.5 self-start lg:self-center">
              <Button
                type="button"
                variant="outline"
                onClick={handleSyncAllFeeds}
                disabled={syncingAll}
              >
                <RefreshCw
                  className={`size-4 text-primary ${syncingAll ? "animate-spin" : ""}`}
                  data-icon="inline-start"
                />
                Оновити всі RSS-канали
              </Button>

              <Button type="button" variant="accent" onClick={openCreateModal}>
                <Plus className="size-4" data-icon="inline-start" />
                Додати джерело / RSS-канал
              </Button>
            </div>
          </div>
        </CardHeader>

        <CardContent className="p-6 sm:p-8 pt-2">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3.5">
            <div className="p-4 rounded-xl bg-secondary/55 border border-border/80 flex flex-col gap-1">
              <span className="text-xs text-muted-foreground">Усього джерел у реєстрі</span>
              <div className="text-2xl font-extrabold text-foreground font-mono tabular-nums">
                {sources.length}
              </div>
            </div>
            <div className="p-4 rounded-xl bg-secondary/55 border border-border/80 flex flex-col gap-1">
              <span className="text-xs text-muted-foreground">Підключені RSS-стрічки</span>
              <div className="text-2xl font-extrabold text-primary font-mono tabular-nums">
                {activeRssCount}
              </div>
            </div>
            <div className="p-4 rounded-xl bg-secondary/55 border border-border/80 flex flex-col gap-1">
              <span className="text-xs text-muted-foreground">Білий список ІМІ</span>
              <div className="text-2xl font-extrabold text-verified font-mono tabular-nums">
                {whiteCount}
              </div>
            </div>
            <div className="p-4 rounded-xl bg-secondary/55 border border-border/80 flex flex-col gap-1">
              <span className="text-xs text-muted-foreground">Чорний список (дезінформація)</span>
              <div className="text-2xl font-extrabold text-destructive font-mono tabular-nums">
                {blackCount}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Повідомлення про статус дії */}
      <AnimatePresence mode="wait">
        {statusMessage && (
          <motion.div
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
          >
            <Alert variant="default" className="bg-primary/10 border-primary/30">
              <Sparkles className="size-4 text-primary" />
              <AlertTitle>Оновлення реєстру джерел</AlertTitle>
              <AlertDescription>{statusMessage}</AlertDescription>
            </Alert>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Панель пошуку та фільтрів */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
        <div className="relative flex-1 max-w-md">
          <Search className="size-4 text-muted-foreground absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          <Input
            type="search"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Пошук за назвою ЗМІ, доменом або RSS URL..."
            aria-label="Пошук джерела"
            className="pl-10"
          />
        </div>

        <div className="flex flex-wrap gap-1.5">
          {(
            [
              { id: "all", label: `Всі (${sources.length})` },
              { id: "rss", label: `З RSS-каналом (${activeRssCount})` },
              { id: "white", label: `Білий список (${whiteCount})` },
              { id: "black", label: `Чорний список (${blackCount})` },
            ] as const
          ).map((tab) => (
            <Button
              key={tab.id}
              type="button"
              variant={statusFilter === tab.id ? "default" : "outline"}
              size="sm"
              onClick={() => setStatusFilter(tab.id)}
              className="tabular-nums"
            >
              {tab.label}
            </Button>
          ))}
        </div>
      </div>

      {/* Таблиця джерел */}
      {isLoading ? (
        <SourcesTableSkeleton />
      ) : fetchError ? (
        <ErrorState
          title="Не вдалося завантажити реєстр джерел"
          message={fetchError}
          onRetry={fetchSources}
        />
      ) : filteredSources.length === 0 ? (
        <EmptyState
          icon={Globe}
          title="Джерел за обраними критеріями не знайдено"
          description="Спробуйте змінити пошуковий запит або додайте нове інформаційне джерело."
          actionLabel="Додати джерело"
          onAction={openCreateModal}
        />
      ) : (
        <Card className="border-border/85 bg-card/90 overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Назва ЗМІ та Домен</TableHead>
                <TableHead>Мова</TableHead>
                <TableHead>RSS-канал (Автозбір)</TableHead>
                <TableHead>Репутація домену</TableHead>
                <TableHead>Статус у реєстрі</TableHead>
                <TableHead className="text-right">Керування</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredSources.map((source) => (
                <TableRow key={source.id}>
                  <TableCell>
                    <div className="font-bold text-foreground text-sm">{source.name}</div>
                    <div className="text-muted-foreground font-mono text-xs flex items-center gap-1.5 mt-0.5">
                      <Globe className="size-3.5 text-muted-foreground" />
                      <span>{source.domain}</span>
                    </div>
                  </TableCell>

                  <TableCell>
                    <Badge variant="secondary" className="font-mono uppercase">
                      {source.language === "en" ? "EN" : "UA"}
                    </Badge>
                  </TableCell>

                  <TableCell className="max-w-xs">
                    {source.rss_url ? (
                      <div className="flex flex-col gap-1">
                        <Badge variant="default" className="w-fit">
                          <CheckCircle2 className="size-3" />
                          Активний RSS
                        </Badge>
                        <div
                          className="text-[11px] font-mono text-muted-foreground truncate max-w-[240px]"
                          title={source.rss_url}
                        >
                          {source.rss_url}
                        </div>
                      </div>
                    ) : (
                      <span className="text-muted-foreground text-xs">RSS не вказано</span>
                    )}
                  </TableCell>

                  <TableCell>
                    <div className="flex items-center gap-2.5 tabular-nums">
                      <span
                        className={`font-mono font-bold text-sm ${
                          source.reliability_rating >= 80
                            ? "text-verified"
                            : source.reliability_rating >= 50
                            ? "text-warning"
                            : "text-destructive"
                        }`}
                      >
                        {source.reliability_rating.toFixed(0)}%
                      </span>
                      <div className="w-16 h-1.5 rounded-full bg-muted overflow-hidden hidden sm:block">
                        <div
                          className={`h-full rounded-full ${
                            source.reliability_rating >= 80
                              ? "bg-verified"
                              : source.reliability_rating >= 50
                              ? "bg-warning"
                              : "bg-destructive"
                          }`}
                          style={{
                            width: `${Math.min(
                              100,
                              Math.max(4, source.reliability_rating)
                            )}%`,
                          }}
                        />
                      </div>
                    </div>
                  </TableCell>

                  <TableCell>
                    {source.is_whitelisted ? (
                      <Badge variant="verified">
                        <CheckCircle2 className="size-3" />
                        Білий список ІМІ
                      </Badge>
                    ) : source.is_blacklisted ? (
                      <Badge variant="destructive">
                        <XCircle className="size-3" />
                        Чорний список
                      </Badge>
                    ) : (
                      <Badge variant="secondary">Нейтральний</Badge>
                    )}
                  </TableCell>

                  <TableCell className="text-right">
                    <div className="inline-flex items-center gap-1.5">
                      {source.rss_url && (
                        <Button
                          type="button"
                          variant="outline"
                          size="xs"
                          onClick={() => handleFetchSingleRss(source)}
                          disabled={syncingSourceId === source.id}
                          title="Зібрати свіжі новини з цього RSS-каналу зараз"
                        >
                          <RefreshCw
                            className={`size-3.5 text-primary ${
                              syncingSourceId === source.id ? "animate-spin" : ""
                            }`}
                            data-icon="inline-start"
                          />
                          <span className="hidden md:inline">Зібрати RSS</span>
                        </Button>
                      )}

                      <Button
                        type="button"
                        variant="secondary"
                        size="xs"
                        onClick={() => openEditModal(source)}
                      >
                        <Pencil className="size-3.5" data-icon="inline-start" />
                        Редагувати
                      </Button>

                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-xs"
                        onClick={() => handleDelete(source.id, source.name)}
                        aria-label={`Видалити джерело ${source.name}`}
                        className="text-muted-foreground hover:text-destructive"
                      >
                        <Trash2 className="size-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}

      {/* Модальне вікно додавання / редагування джерела */}
      <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {editingSource
                ? "Редагування медіаджерела та RSS"
                : "Додати нове джерело та RSS-канал"}
            </DialogTitle>
            <DialogDescription>
              Налаштуйте домен, RSS-стрічку та базовий рейтинг довіри (Domain Credibility Index)
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSaveSource}>
            <FieldGroup>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                <Field>
                  <FieldLabel htmlFor="src-name-input">Назва видання (ЗМІ)</FieldLabel>
                  <Input
                    id="src-name-input"
                    type="text"
                    required
                    placeholder="Напр.: Суспільне Новини"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                  />
                </Field>

                <Field>
                  <FieldLabel htmlFor="src-domain-input">Домен (без https://)</FieldLabel>
                  <Input
                    id="src-domain-input"
                    type="text"
                    required
                    placeholder="Напр.: suspilne.media"
                    value={domain}
                    onChange={(e) => setDomain(e.target.value)}
                    className="font-mono"
                  />
                </Field>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
                <Field className="sm:col-span-2">
                  <FieldLabel htmlFor="src-rss-input">
                    URL-адреса RSS-каналу (для автозбору)
                  </FieldLabel>
                  <Input
                    id="src-rss-input"
                    type="url"
                    placeholder="https://suspilne.media/rss/all.rss"
                    value={rssUrl}
                    onChange={(e) => setRssUrl(e.target.value)}
                    className="font-mono"
                  />
                </Field>

                <Field>
                  <FieldLabel>Мова потоку</FieldLabel>
                  <Select
                    value={language}
                    onValueChange={(val) => setLanguage(val as "ua" | "en")}
                  >
                    <SelectTrigger aria-label="Мова потоку">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="ua">UA (Українська)</SelectItem>
                      <SelectItem value="en">EN (World)</SelectItem>
                    </SelectContent>
                  </Select>
                </Field>
              </div>

              {/* Повзунок репутації домену */}
              <div className="p-4 rounded-xl bg-secondary/55 border border-border flex flex-col gap-2.5">
                <div className="flex items-center justify-between">
                  <FieldLabel htmlFor="src-rating-range">
                    Індекс репутації домену (0–100%)
                  </FieldLabel>
                  <Badge
                    variant={
                      rating >= 80
                        ? "verified"
                        : rating >= 50
                        ? "warning"
                        : "destructive"
                    }
                    className="font-mono tabular-nums"
                  >
                    {rating}%
                  </Badge>
                </div>
                <input
                  id="src-rating-range"
                  type="range"
                  min="0"
                  max="100"
                  step="1"
                  value={rating}
                  onChange={(e) => setRating(Number(e.target.value))}
                  className="w-full accent-primary cursor-pointer"
                />
                <div className="flex justify-between text-[10px] text-muted-foreground font-mono tabular-nums">
                  <span>0% (Фейки / ІПСО)</span>
                  <span>50% (Сумнівне / Таблоїд)</span>
                  <span>95% (Білий список ІМІ)</span>
                </div>
              </div>

              {/* Вибір статусу списку */}
              <Field>
                <FieldLabel>Категорія в реєстрі достовірності</FieldLabel>
                <div className="grid grid-cols-3 gap-2">
                  <Button
                    type="button"
                    variant={listStatus === "whitelist" ? "default" : "outline"}
                    size="sm"
                    onClick={() => {
                      setListStatus("whitelist");
                      if (rating < 80) setRating(92);
                    }}
                  >
                    <CheckCircle2 className="size-3.5" data-icon="inline-start" />
                    Білий список
                  </Button>

                  <Button
                    type="button"
                    variant={listStatus === "neutral" ? "default" : "outline"}
                    size="sm"
                    onClick={() => {
                      setListStatus("neutral");
                      if (rating > 85 || rating < 45) setRating(72);
                    }}
                  >
                    <ShieldCheck className="size-3.5" data-icon="inline-start" />
                    Нейтральний
                  </Button>

                  <Button
                    type="button"
                    variant={listStatus === "blacklist" ? "destructive" : "outline"}
                    size="sm"
                    onClick={() => {
                      setListStatus("blacklist");
                      if (rating > 35) setRating(12);
                    }}
                  >
                    <AlertTriangle className="size-3.5" data-icon="inline-start" />
                    Чорний список
                  </Button>
                </div>
                <FieldDescription>
                  Статус визначає базовий пріоритет джерела при обчисленні інтегрального балу Trust Score V4.
                </FieldDescription>
              </Field>

              <DialogFooter className="pt-3 border-t border-border/75">
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => setIsModalOpen(false)}
                >
                  Скасувати
                </Button>
                <Button type="submit" variant="accent" disabled={saving}>
                  {saving
                    ? "Збереження..."
                    : editingSource
                    ? "Зберегти зміни"
                    : "Додати джерело"}
                </Button>
              </DialogFooter>
            </FieldGroup>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
