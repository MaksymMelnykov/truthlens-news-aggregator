"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { AnimatePresence, motion } from "motion/react";
import { toast } from "sonner";
import { useAuth } from "@/context/AuthContext";
import { HistoryItem } from "@/types";
import { TrustBadge } from "@/components/TrustBadge";
import { XaiReportModal, XaiModalData } from "@/components/XaiReportModal";
import {
  History,
  Trash2,
  ArrowLeft,
  LogIn,
  FileText,
  Globe,
  Eye,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  EmptyState,
  ErrorState,
  FactCheckListSkeleton,
} from "@/components/ui/state-displays";

export default function HistoryPage() {
  const { user, token, apiUrl } = useAuth();
  const [historyItems, setHistoryItems] = useState<HistoryItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filterType, setFilterType] = useState<"all" | "url" | "text">("all");

  const [modalOpen, setModalOpen] = useState(false);
  const [modalLoading, setModalLoading] = useState(false);
  const [modalError, setModalError] = useState<string | null>(null);
  const [modalData, setModalData] = useState<XaiModalData | null>(null);

  const fetchHistory = async () => {
    if (!token) {
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    setError(null);
    try {
      const res = await fetch(`${apiUrl}/history`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        throw new Error("Не вдалося завантажити журнал перевірок.");
      }
      const data = await res.json();
      setHistoryItems(data);
    } catch (e: unknown) {
      setError(
        e instanceof Error
          ? e.message
          : "Помилка з'єднання під час завантаження історії."
      );
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchHistory();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  const openSavedReportModal = async (item: HistoryItem) => {
    setModalOpen(true);
    setModalError(null);
    setModalData(null);

    if (!item.analysis_id) {
      setModalError("Для цього запису детальний звіт не збережено.");
      return;
    }

    setModalLoading(true);
    try {
      const headers: Record<string, string> = {};
      if (token) headers["Authorization"] = `Bearer ${token}`;
      const res = await fetch(`${apiUrl}/verify/reports/${item.analysis_id}`, {
        headers,
      });
      if (!res.ok) {
        throw new Error("Не вдалося завантажити збережений звіт перевірки.");
      }
      const report = await res.json();
      setModalData({
        title: report.title || item.query_preview,
        domain: report.analyzed_domain,
        url: report.source_url,
        published_at: report.created_at,
        trust_breakdown: report.trust_breakdown,
      });
    } catch (err: unknown) {
      setModalError(
        err instanceof Error
          ? err.message
          : "Помилка відкриття збереженого звіту."
      );
    } finally {
      setModalLoading(false);
    }
  };

  const deleteItem = async (id: number) => {
    if (!token) return;
    try {
      const res = await fetch(`${apiUrl}/history/${id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        setHistoryItems((prev) => prev.filter((item) => item.id !== id));
        toast("Запис видалено з журналу перевірок");
      }
    } catch {
      toast.error("Не вдалося видалити запис");
    }
  };

  const clearAll = async () => {
    if (!token) return;
    try {
      const res = await fetch(`${apiUrl}/history`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        setHistoryItems([]);
        toast.success("Журнал перевірок очищено");
      }
    } catch {
      toast.error("Не вдалося очистити журнал перевірок");
    }
  };

  const filteredItems = historyItems.filter((it) => {
    if (filterType === "all") return true;
    return it.query_type === filterType;
  });

  if (!user && !isLoading) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-16">
        <EmptyState
          icon={<LogIn className="size-6" />}
          title="Журнал перевірок доступний після входу"
          description="Увійдіть у свій обліковий запис, щоб автоматично зберігати та переглядати результати всіх перевірених статей та посилань."
          actionLabel="Увійти в акаунт"
          actionHref="/login"
        />
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 flex flex-col gap-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-border pb-4">
        <div className="flex items-center gap-3">
          <Button asChild variant="outline" size="icon">
            <Link href="/" aria-label="Повернутися до стрічки">
              <ArrowLeft className="size-4" />
            </Link>
          </Button>
          <div>
            <div className="flex items-center gap-2.5">
              <History className="size-6 text-primary" />
              <h1 className="text-2xl font-bold text-foreground">
                Журнал перевірок
              </h1>
              <Badge variant="secondary" className="font-mono tabular-nums">
                {historyItems.length}
              </Badge>
            </div>
            <p className="text-xs sm:text-sm text-muted-foreground">
              Архів ваших XAI-перевірок статей та URL-посилань
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {historyItems.length > 0 && (
            <Tabs
              value={filterType}
              onValueChange={(v) => setFilterType(v as "all" | "url" | "text")}
            >
              <TabsList aria-label="Фільтр типу перевірки">
                <TabsTrigger value="all">Усі ({historyItems.length})</TabsTrigger>
                <TabsTrigger value="url">За посиланням</TabsTrigger>
                <TabsTrigger value="text">За текстом</TabsTrigger>
              </TabsList>
            </Tabs>
          )}

          {historyItems.length > 0 && (
            <Button variant="destructive" size="sm" onClick={clearAll}>
              <Trash2 className="size-4" />
              <span>Очистити журнал</span>
            </Button>
          )}
        </div>
      </div>

      <AnimatePresence mode="wait">
        {isLoading ? (
          <FactCheckListSkeleton key="history-skeleton" count={4} />
        ) : error ? (
          <ErrorState
            key="history-error"
            title="Помилка завантаження журналу перевірок"
            description={error}
            onRetry={fetchHistory}
          />
        ) : filteredItems.length === 0 ? (
          <EmptyState
            key="history-empty"
            icon={<History className="size-6" />}
            title="Записів у журналі не знайдено"
            description="Скористайтеся інструментом «Перевірка статті», щоб проаналізувати будь-який текст або посилання за допомогою XAI."
            actionLabel="Перевірити статтю"
            actionHref="/verify"
          />
        ) : (
          <motion.div
            key="history-list"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="flex flex-col gap-3"
          >
            {filteredItems.map((item) => (
              <Card
                key={item.id}
                className="flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 hover:border-primary/40 transition-colors"
              >
                <div className="flex items-start gap-3 min-w-0">
                  <div className="flex size-10 shrink-0 items-center justify-center rounded-xl border border-border bg-secondary text-primary">
                    {item.query_type === "url" ? (
                      <Globe className="size-4" />
                    ) : (
                      <FileText className="size-4" />
                    )}
                  </div>
                  <div className="min-w-0 flex flex-col gap-1">
                    <span className="font-bold text-sm text-foreground truncate max-w-xl">
                      {item.query_preview}
                    </span>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground font-mono tabular-nums">
                      <Badge variant="outline" className="text-[10px] py-0">
                        {item.query_type === "url" ? "URL" : "Текст"}
                      </Badge>
                      <span>
                        {new Date(item.created_at).toLocaleString("uk-UA")}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2.5 w-full sm:w-auto justify-between sm:justify-end pt-2 sm:pt-0 border-t sm:border-t-0 border-border">
                  <TrustBadge
                    score={item.trust_score}
                    verdict={item.verdict}
                    size="sm"
                  />
                  {item.analysis_id && (
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      onClick={() => openSavedReportModal(item)}
                    >
                      <Eye className="size-4 text-primary" />
                      <span>Переглянути звіт</span>
                    </Button>
                  )}
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => deleteItem(item.id)}
                    aria-label="Видалити запис з журналу"
                    title="Видалити з історії"
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </div>
              </Card>
            ))}
          </motion.div>
        )}
      </AnimatePresence>

      <XaiReportModal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        loading={modalLoading}
        data={modalData}
        error={modalError}
      />
    </div>
  );
}
