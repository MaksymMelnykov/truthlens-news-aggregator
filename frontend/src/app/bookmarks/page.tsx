"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { useAuth } from "@/context/AuthContext";
import { NewsCard } from "@/components/NewsCard";
import { Article } from "@/types";
import { Bookmark, RefreshCw, ArrowLeft, LogIn } from "lucide-react";

export default function BookmarksPage() {
  const { user, token, apiUrl } = useAuth();
  const [bookmarks, setBookmarks] = useState<Article[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const fetchBookmarks = async () => {
    if (!token) {
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    try {
      const res = await fetch(`${apiUrl}/bookmarks`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setBookmarks(data.map((item: Article) => ({ ...item, is_bookmarked: true })));
      }
    } catch (e) {
      console.error("Помилка завантаження закладок", e);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchBookmarks();
  }, [token]);

  const handleBookmarkChange = (articleId: number, isBookmarked: boolean) => {
    if (!isBookmarked) {
      setBookmarks((prev) => prev.filter((a) => a.id !== articleId));
    }
  };

  if (!user && !isLoading) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-20 text-center space-y-4">
        <div className="w-12 h-12 rounded-2xl bg-zinc-900 border border-zinc-800 mx-auto flex items-center justify-center text-zinc-500">
          <Bookmark className="w-6 h-6" />
        </div>
        <h2 className="text-xl font-bold text-zinc-200">Закладки доступні тільки для авторизованих користувачів</h2>
        <p className="text-sm text-zinc-400 max-w-md mx-auto">
          Увійдіть у свій обліковий запис або зареєструйтесь, щоб зберігати важливі новини для подальшого читання.
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
              <Bookmark className="w-6 h-6 text-cyan-400 fill-cyan-400/20" />
              Збережені новини
            </h1>
            <p className="text-xs text-zinc-400">
              Ваша персональна добірка статей ({bookmarks.length})
            </p>
          </div>
        </div>
      </div>

      {/* Список закладок */}
      {isLoading ? (
        <div className="flex flex-col items-center justify-center py-20 text-zinc-500 space-y-3">
          <RefreshCw className="w-8 h-8 animate-spin text-cyan-500" />
          <p className="text-sm">Завантаження закладок...</p>
        </div>
      ) : bookmarks.length === 0 ? (
        <div className="text-center py-20 border border-dashed border-zinc-800 rounded-3xl p-8 space-y-3">
          <Bookmark className="w-10 h-10 text-zinc-600 mx-auto" />
          <h4 className="text-base font-semibold text-zinc-300">У вас ще немає збережених новин</h4>
          <p className="text-xs text-zinc-500 max-w-sm mx-auto">
            Натискайте на значок закладки біля будь-якої статті у стрічці, щоб додати її сюди.
          </p>
          <Link
            href="/"
            className="inline-block mt-2 px-4 py-2 rounded-xl bg-zinc-800 text-xs font-semibold text-zinc-200 hover:bg-zinc-700 transition-colors"
          >
            Перейти до стрічки
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
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
    </div>
  );
}
