"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { AnimatePresence } from "motion/react";
import { useAuth } from "@/context/AuthContext";
import { NewsCard } from "@/components/NewsCard";
import { Article } from "@/types";
import { Bookmark, ArrowLeft, LogIn } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  EmptyState,
  ErrorState,
  NewsCardSkeletonGrid,
} from "@/components/ui/state-displays";

export default function BookmarksPage() {
  const { user, token, apiUrl } = useAuth();
  const [bookmarks, setBookmarks] = useState<Article[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchBookmarks = async () => {
    if (!token) {
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    setError(null);
    try {
      const res = await fetch(`${apiUrl}/bookmarks`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        throw new Error("Не вдалося завантажити збережені матеріали.");
      }
      const data = await res.json();
      setBookmarks(
        data.map((item: Article) => ({ ...item, is_bookmarked: true }))
      );
    } catch (e: unknown) {
      setError(
        e instanceof Error
          ? e.message
          : "Помилка з'єднання під час отримання закладок."
      );
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchBookmarks();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  const handleBookmarkChange = (articleId: number, isBookmarked: boolean) => {
    if (!isBookmarked) {
      setBookmarks((prev) => prev.filter((a) => a.id !== articleId));
    }
  };

  if (!user && !isLoading) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-16">
        <EmptyState
          icon={<LogIn className="size-6" />}
          title="Закладки доступні після авторизації"
          description="Увійдіть у свій обліковий запис або зареєструйтесь, щоб зберігати важливі новини та аналітичні звіти."
          actionLabel="Увійти в акаунт"
          actionHref="/login"
        />
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-border pb-4">
        <div className="flex items-center gap-3">
          <Button asChild variant="outline" size="icon">
            <Link href="/" aria-label="Повернутися до стрічки">
              <ArrowLeft className="size-4" />
            </Link>
          </Button>
          <div>
            <div className="flex items-center gap-2.5">
              <Bookmark className="size-6 text-primary" />
              <h1 className="text-2xl font-bold text-foreground">
                Збережені матеріали
              </h1>
              <Badge variant="secondary" className="font-mono tabular-nums">
                {bookmarks.length}
              </Badge>
            </div>
            <p className="text-xs sm:text-sm text-muted-foreground">
              Персональна добірка верифікованих публікацій для швидкого доступу
            </p>
          </div>
        </div>
      </div>

      <AnimatePresence mode="wait">
        {isLoading ? (
          <NewsCardSkeletonGrid key="bookmarks-skeleton" count={3} />
        ) : error ? (
          <ErrorState
            key="bookmarks-error"
            title="Помилка завантаження закладок"
            description={error}
            onRetry={fetchBookmarks}
          />
        ) : bookmarks.length === 0 ? (
          <EmptyState
            key="bookmarks-empty"
            icon={<Bookmark className="size-6" />}
            title="У вас ще немає збережених публікацій"
            description="Натискайте на іконку закладки на будь-якій картці новини у головній стрічці, щоб додати матеріал до власної бібліотеки."
            actionLabel="Перейти до стрічки новин"
            actionHref="/"
          />
        ) : (
          <div
            key="bookmarks-grid"
            className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6"
          >
            {bookmarks.map((article) => (
              <NewsCard
                key={article.id}
                article={article}
                initialBookmarked={true}
                onBookmarkChange={handleBookmarkChange}
              />
            ))}
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
