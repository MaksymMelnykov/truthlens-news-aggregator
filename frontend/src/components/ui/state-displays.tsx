"use client";

import * as React from "react";
import { motion } from "motion/react";
import { AlertTriangle, RefreshCw, Inbox } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";
import { cn } from "@/lib/utils";

interface EmptyStateProps {
  icon?: React.ReactNode | React.ElementType;
  title: string;
  description: string;
  actionLabel?: string;
  onAction?: () => void;
  actionHref?: string;
  secondaryActionLabel?: string;
  onSecondaryAction?: () => void;
  className?: string;
}

export function EmptyState({
  icon,
  title,
  description,
  actionLabel,
  onAction,
  actionHref,
  secondaryActionLabel,
  onSecondaryAction,
  className,
}: EmptyStateProps) {
  const renderedIcon = React.useMemo(() => {
    if (!icon) return <Inbox className="size-6" />;
    if (React.isValidElement(icon)) return icon;
    if (typeof icon === "function" || (typeof icon === "object" && icon !== null)) {
      const IconComponent = icon as React.ElementType;
      return <IconComponent className="size-6" />;
    }
    return <Inbox className="size-6" />;
  }, [icon]);

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -6 }}
      transition={{ duration: 0.25, ease: [0.2, 0, 0, 1] }}
      role="status"
      className={cn("w-full", className)}
    >
      <Card className="items-center text-center py-12 px-6 border-dashed border-border bg-card/70">
        <div className="flex size-14 items-center justify-center rounded-2xl border border-border bg-secondary text-primary">
          {renderedIcon}
        </div>
        <div className="flex flex-col gap-1.5 max-w-md">
          <h3 className="text-base sm:text-lg font-bold text-foreground">
            {title}
          </h3>
          <p className="text-xs sm:text-sm text-muted-foreground leading-relaxed">
            {description}
          </p>
        </div>
        {(actionLabel || secondaryActionLabel) && (
          <div className="flex flex-wrap items-center justify-center gap-2.5 pt-2">
            {actionLabel && actionHref ? (
              <Button asChild variant="default">
                <a href={actionHref}>{actionLabel}</a>
              </Button>
            ) : actionLabel && onAction ? (
              <Button variant="default" onClick={onAction}>
                {actionLabel}
              </Button>
            ) : null}
            {secondaryActionLabel && onSecondaryAction && (
              <Button variant="outline" onClick={onSecondaryAction}>
                {secondaryActionLabel}
              </Button>
            )}
          </div>
        )}
      </Card>
    </motion.div>
  );
}

interface ErrorStateProps {
  title?: string;
  description?: string;
  message?: string;
  retryLabel?: string;
  onRetry?: () => void;
  secondaryHref?: string;
  secondaryLabel?: string;
  className?: string;
}

export function ErrorState({
  title = "Не вдалося завантажити дані",
  description,
  message,
  retryLabel = "Спробувати знову",
  onRetry,
  secondaryHref,
  secondaryLabel = "На головну стрічку",
  className,
}: ErrorStateProps) {
  const displayDescription =
    description || message || "Сталася тимчасова помилка під час отримання даних.";

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.99 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.22, ease: [0.2, 0, 0, 1] }}
      className={cn("w-full", className)}
    >
      <Alert variant="destructive" className="p-5 sm:p-6">
        <AlertTriangle className="size-5" />
        <AlertTitle className="text-base">{title}</AlertTitle>
        <AlertDescription className="flex flex-col gap-4 pt-1">
          <p className="text-foreground/90 max-w-[65ch]">{displayDescription}</p>
          {(onRetry || secondaryHref) && (
            <div className="flex flex-wrap items-center gap-2.5">
              {onRetry && (
                <Button variant="outline" size="sm" onClick={onRetry}>
                  <RefreshCw className="size-4" />
                  <span>{retryLabel}</span>
                </Button>
              )}
              {secondaryHref && (
                <Button asChild variant="ghost" size="sm">
                  <a href={secondaryHref}>{secondaryLabel}</a>
                </Button>
              )}
            </div>
          )}
        </AlertDescription>
      </Alert>
    </motion.div>
  );
}

export function NewsCardSkeletonGrid({ count = 6 }: { count?: number }) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
      aria-busy="true"
      aria-label="Завантаження карток новин"
      className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6"
    >
      {Array.from({ length: count }).map((_, idx) => (
        <Card key={idx} className="justify-between p-5">
          <div className="flex flex-col gap-3.5">
            <Skeleton className="w-full aspect-video rounded-xl" />
            <div className="flex items-center justify-between gap-2">
              <Skeleton className="h-4 w-28 rounded-md" />
              <Skeleton className="h-4 w-20 rounded-md" />
            </div>
            <div className="flex flex-col gap-2">
              <Skeleton className="h-5 w-full rounded-md" />
              <Skeleton className="h-5 w-4/5 rounded-md" />
            </div>
            <div className="flex flex-col gap-1.5">
              <Skeleton className="h-3.5 w-full rounded-md" />
              <Skeleton className="h-3.5 w-11/12 rounded-md" />
            </div>
          </div>
          <div className="flex items-center justify-between gap-2 pt-3 border-t border-border/80">
            <div className="flex items-center gap-2">
              <Skeleton className="h-8 w-28 rounded-xl" />
              <Skeleton className="h-8 w-24 rounded-xl" />
            </div>
            <Skeleton className="h-7 w-24 rounded-full" />
          </div>
        </Card>
      ))}
    </motion.div>
  );
}

export function FactCheckListSkeleton({ count = 4 }: { count?: number }) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
      aria-busy="true"
      aria-label="Завантаження бази спростувань"
      className="flex flex-col gap-4"
    >
      {Array.from({ length: count }).map((_, idx) => (
        <Card key={idx} className="p-5 sm:p-6">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Skeleton className="h-6 w-24 rounded-full" />
              <Skeleton className="h-6 w-28 rounded-full" />
            </div>
            <Skeleton className="h-4 w-24 rounded-md" />
          </div>
          <Skeleton className="h-6 w-4/5 rounded-md" />
          <div className="flex flex-col gap-2">
            <Skeleton className="h-4 w-full rounded-md" />
            <Skeleton className="h-4 w-5/6 rounded-md" />
          </div>
        </Card>
      ))}
    </motion.div>
  );
}

export function AnalyticsDashboardSkeleton() {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
      aria-busy="true"
      aria-label="Завантаження аналітичних метрик"
      className="flex flex-col gap-6"
    >
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Card key={i} className="p-5">
            <CardHeader className="flex-row items-center justify-between">
              <Skeleton className="h-4 w-28 rounded-md" />
              <Skeleton className="size-8 rounded-xl" />
            </CardHeader>
            <CardContent className="gap-2">
              <Skeleton className="h-8 w-24 rounded-lg" />
              <Skeleton className="h-3.5 w-36 rounded-md" />
            </CardContent>
          </Card>
        ))}
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card className="p-6">
          <Skeleton className="h-5 w-52 rounded-md" />
          <Skeleton className="h-64 w-full rounded-xl" />
        </Card>
        <Card className="p-6">
          <Skeleton className="h-5 w-52 rounded-md" />
          <Skeleton className="h-64 w-full rounded-xl" />
        </Card>
      </div>
      <Card className="p-6">
        <Skeleton className="h-5 w-64 rounded-md" />
        <div className="flex flex-col gap-3 pt-2">
          {Array.from({ length: 5 }).map((_, r) => (
            <Skeleton key={r} className="h-10 w-full rounded-xl" />
          ))}
        </div>
      </Card>
    </motion.div>
  );
}
