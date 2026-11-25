"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { motion } from "motion/react";
import { toast } from "sonner";
import { Article } from "@/types";
import { TrustBadge } from "./TrustBadge";
import {
  Bookmark,
  ExternalLink,
  FileText,
} from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { useGuestLimit } from "@/context/GuestLimitContext";
import { Card, CardContent, CardFooter, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

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
  const { canOpenArticleDetail, openLimitModal } = useGuestLimit();
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
          toast("Видалено зі збережених матеріалів");
        }
      } else {
        const res = await fetch(`${apiUrl}/bookmarks/${article.id}`, {
          method: "POST",
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.ok) {
          setIsBookmarked(true);
          onBookmarkChange?.(article.id, true);
          toast.success("Новину збережено у закладки");
        }
      }
    } catch {
      toast.error("Не вдалося оновити статус закладки");
    } finally {
      setIsUpdating(false);
    }
  };

  const [imgSrc] = useState<string | null>(article.image_url || null);
  const [imgFailed, setImgFailed] = useState<boolean>(false);

  const formattedDate = new Date(article.published_at).toLocaleDateString(
    "uk-UA",
    {
      day: "numeric",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    }
  );

  return (
    <motion.article
      layout
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      whileHover={{ y: -3 }}
      transition={{ duration: 0.24, ease: [0.2, 0, 0, 1] }}
      className="h-full"
    >
      <Card className="group h-full justify-between transition-colors hover:border-primary/45">
        <div className="flex flex-col gap-3.5">
          {imgSrc && !imgFailed ? (
            <div className="relative w-full aspect-video overflow-hidden rounded-xl border border-border bg-background">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={imgSrc}
                alt={article.title}
                loading="lazy"
                onError={() => setImgFailed(true)}
                className="size-full object-cover transition-transform duration-500 group-hover:scale-[1.03]"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-background/85 via-transparent to-transparent pointer-events-none" />

              <div className="absolute top-2.5 left-2.5 flex items-center gap-1.5">
                <Badge variant="secondary">{article.category}</Badge>
              </div>

              <Button
                type="button"
                variant={isBookmarked ? "accent" : "secondary"}
                size="icon"
                onClick={toggleBookmark}
                disabled={isUpdating}
                className="absolute top-2.5 right-2.5 size-8"
                aria-label={
                  user
                    ? isBookmarked
                      ? "Видалити із закладок"
                      : "Зберегти в закладки"
                    : "Увійдіть, щоб зберегти"
                }
                title={
                  user
                    ? isBookmarked
                      ? "Видалити із закладок"
                      : "Зберегти в закладки"
                    : "Увійдіть, щоб зберегти"
                }
              >
                <Bookmark className="size-4" />
              </Button>
            </div>
          ) : (
            <CardHeader className="flex-row items-center justify-between gap-2">
              <div className="flex items-center gap-1.5 flex-wrap">
                <Badge variant="secondary">{article.category}</Badge>
              </div>

              <Button
                type="button"
                variant={isBookmarked ? "accent" : "ghost"}
                size="icon"
                onClick={toggleBookmark}
                disabled={isUpdating}
                className="size-8"
                aria-label={
                  user
                    ? isBookmarked
                      ? "Видалити із закладок"
                      : "Зберегти в закладки"
                    : "Увійдіть, щоб зберегти"
                }
              >
                <Bookmark className="size-4" />
              </Button>
            </CardHeader>
          )}

          <CardContent className="gap-2">
            <div className="flex items-center gap-2 text-xs text-muted-foreground flex-wrap">
              <span className="font-semibold text-foreground">
                {article.source_name}
              </span>
              <span className="font-mono text-[11px]">{article.domain}</span>
              <span
                className="size-1 rounded-full bg-border"
                aria-hidden="true"
              />
              <span className="tabular-nums text-[11px]">{formattedDate}</span>
            </div>

            <h3 className="font-bold text-base text-foreground group-hover:text-primary transition-colors line-clamp-2 leading-snug">
              <a
                href={article.url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-start gap-1.5"
              >
                <span>{article.title}</span>
                <ExternalLink className="size-4 mt-0.5 opacity-60 group-hover:opacity-100 transition-opacity shrink-0" />
              </a>
            </h3>

            {article.summary && (
              <p className="text-xs sm:text-sm text-muted-foreground line-clamp-3 leading-relaxed">
                {article.summary}
              </p>
            )}
          </CardContent>
        </div>

        <CardFooter className="flex-wrap gap-2">
          <Button asChild variant="outline" size="sm">
            <Link
              href={`/news/${article.id}`}
              aria-label={`Повний розбір статті: ${article.title}`}
              onClick={(e) => {
                if (!user && !canOpenArticleDetail(article.id)) {
                  e.preventDefault();
                  openLimitModal("xai_details");
                }
              }}
            >
              <FileText className="size-4 text-accent" />
              <span>Деталі</span>
            </Link>
          </Button>

          <TrustBadge
            score={article.trust_score}
            verdict={article.verdict}
            size="sm"
          />
        </CardFooter>
      </Card>
    </motion.article>
  );
};
