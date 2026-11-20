"use client";

import React from "react";
import Link from "next/link";
import { TrustScoreBreakdown } from "@/types";
import { TrustBadge } from "./TrustBadge";
import {
  Fingerprint,
  AlertTriangle,
  PieChart,
  Sparkles,
  CheckCircle2,
  Search,
  ExternalLink,
  Globe,
  FileText,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ErrorState } from "@/components/ui/state-displays";
import { cn } from "@/lib/utils";

export interface XaiModalData {
  article_id?: number;
  title: string;
  domain?: string;
  url?: string;
  published_at?: string;
  trust_breakdown: TrustScoreBreakdown;
}

interface XaiReportModalProps {
  isOpen: boolean;
  onClose: () => void;
  loading?: boolean;
  data: XaiModalData | null;
  error?: string | null;
}

export const XaiReportModal: React.FC<XaiReportModalProps> = ({
  isOpen,
  onClose,
  loading = false,
  data,
  error = null,
}) => {
  const tb = data?.trust_breakdown;

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-4xl max-h-[90vh] overflow-y-auto p-0 gap-0">
        <DialogHeader className="p-5 sm:p-6 border-b border-border bg-secondary/40 pr-12">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <Badge variant="secondary">
              <Fingerprint className="size-3.5 text-primary" />
              <span>Звіт пояснювального ШІ (XAI Audit)</span>
            </Badge>
            {tb && <TrustBadge score={tb.score} verdict={tb.verdict} size="md" />}
          </div>
          <DialogTitle className="text-base sm:text-xl leading-snug pt-1">
            {data?.title || "Аналітичний розбір достовірності публікації"}
          </DialogTitle>
          <DialogDescription asChild>
            <div className="flex flex-wrap items-center gap-3 pt-1 text-xs text-muted-foreground">
              {data?.domain && (
                <span className="inline-flex items-center gap-1.5">
                  <Globe className="size-3.5 text-primary" />
                  <span>Джерело:</span>
                  <strong className="font-mono text-foreground">{data.domain}</strong>
                </span>
              )}
              {data?.url && (
                <a
                  href={data.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-primary hover:underline font-medium"
                >
                  <span>Першоджерело</span>
                  <ExternalLink className="size-3.5" />
                </a>
              )}
              {data?.article_id && (
                <Button asChild variant="outline" size="sm" className="h-7 px-2.5 text-xs">
                  <Link href={`/news/${data.article_id}`} onClick={onClose}>
                    <FileText className="size-3.5 text-accent" />
                    <span>Повний текст і підсвітка ШІ</span>
                  </Link>
                </Button>
              )}
            </div>
          </DialogDescription>
        </DialogHeader>

        <div className="p-5 sm:p-6 flex flex-col gap-5">
          {loading ? (
            <div className="flex flex-col gap-4" aria-busy="true">
              <Skeleton className="h-20 w-full rounded-2xl" />
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                {Array.from({ length: 4 }).map((_, idx) => (
                  <Skeleton key={idx} className="h-28 w-full rounded-2xl" />
                ))}
              </div>
              <Skeleton className="h-36 w-full rounded-2xl" />
            </div>
          ) : error ? (
            <ErrorState
              title="Не вдалося завантажити XAI-розбір"
              description={error}
            />
          ) : tb ? (
            <>
              <Card className="p-4 sm:p-5 bg-secondary/50 gap-2">
                <div className="flex items-center gap-2 text-xs sm:text-sm font-bold text-primary">
                  <Fingerprint className="size-4" />
                  <span>Підсумковий висновок верифікації</span>
                </div>
                <p className="text-xs sm:text-sm text-foreground leading-relaxed max-w-[72ch]">
                  {tb.explanation}
                </p>
              </Card>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                {[
                  {
                    title: "1. Нейтральність стилю",
                    score: tb.stylometry_score,
                    desc: "Відсутність клікбейту та емоційного тиску",
                  },
                  {
                    title: "2. Репутація домену",
                    score: tb.source_reputation_score,
                    desc: "Дотримання редакційних стандартів",
                  },
                  {
                    title: "3. Автентичність (NLP)",
                    score: tb.ml_authenticity_score,
                    desc: "Оцінка ансамблю мовних моделей",
                  },
                  {
                    title: "4. Крос-верифікація",
                    score: tb.corroboration_score,
                    desc: "Підтвердження в незалежних медіа",
                  },
                ].map((metric) => (
                  <Card key={metric.title} className="p-4 gap-2 bg-card">
                    <span className="text-xs font-semibold text-foreground">
                      {metric.title}
                    </span>
                    <div className="text-2xl font-bold font-mono tabular-nums text-primary">
                      {metric.score.toFixed(0)}%
                    </div>
                    <div className="w-full bg-secondary h-1.5 rounded-full overflow-hidden">
                      <div
                        className="bg-primary h-full rounded-full"
                        style={{ width: `${Math.min(100, Math.max(4, metric.score))}%` }}
                      />
                    </div>
                    <p className="text-[11px] text-muted-foreground leading-snug">
                      {metric.desc}
                    </p>
                  </Card>
                ))}
              </div>

              {tb.manipulation_markers && tb.manipulation_markers.length > 0 && (
                <Card className="p-4 border-destructive/40 bg-destructive/10 gap-2.5">
                  <div className="flex items-center gap-2 text-xs font-bold text-destructive-foreground">
                    <AlertTriangle className="size-4 text-destructive" />
                    <span>Виявлені маркери маніпуляцій або емоційного тиску</span>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {tb.manipulation_markers.map((marker, idx) => (
                      <Badge key={idx} variant="destructive">
                        {marker}
                      </Badge>
                    ))}
                  </div>
                </Card>
              )}

              {tb.models_breakdown && Object.keys(tb.models_breakdown).length > 0 && (
                <Card className="p-4 sm:p-5 gap-3">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1">
                    <div className="flex items-center gap-2 text-xs sm:text-sm font-bold text-foreground">
                      <PieChart className="size-4 text-primary" />
                      <span>Декомпозиція оцінок ансамблю ШІ-моделей</span>
                    </div>
                    <span className="text-xs text-muted-foreground">
                      Імовірність достовірного інформаційного матеріалу
                    </span>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    {Object.entries(tb.models_breakdown).map(([modelKey, modelScore]) => {
                      const friendlyTitle =
                        modelKey === "ukr_roberta_base" || modelKey === "ukr-roberta-base"
                          ? "Українська мовна модель (ukr-roberta)"
                          : modelKey === "xlm_roberta_base" || modelKey === "xlm-roberta-base"
                          ? "Мультимовна модель (XLM-RoBERTa)"
                          : modelKey.toLowerCase().includes("ensemble")
                          ? "Гібридний ансамбль TruthLens"
                          : modelKey;

                      const val = Number(modelScore);
                      return (
                        <Card key={modelKey} className="p-3.5 bg-secondary/40 gap-2">
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-xs font-semibold text-foreground">
                              {friendlyTitle}
                            </span>
                            <span className="text-xs font-bold font-mono tabular-nums text-primary">
                              {val.toFixed(0)}%
                            </span>
                          </div>
                          <div className="w-full bg-background h-1.5 rounded-full overflow-hidden">
                            <div
                              className={cn(
                                "h-full rounded-full",
                                val >= 75
                                  ? "bg-verified"
                                  : val >= 50
                                  ? "bg-accent"
                                  : "bg-destructive"
                              )}
                              style={{ width: `${Math.min(100, Math.max(5, val))}%` }}
                            />
                          </div>
                        </Card>
                      );
                    })}
                  </div>
                </Card>
              )}

              {tb.xai_top_tokens && tb.xai_top_tokens.length > 0 && (
                <Card className="p-4 sm:p-5 gap-3">
                  <div className="flex flex-col gap-1">
                    <div className="flex items-center gap-2 text-xs sm:text-sm font-bold text-foreground">
                      <Sparkles className="size-4 text-accent" />
                      <span>Ключові токени впливу на рішення класифікатора</span>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Слова, які найбільше вплинули на підсумковий індекс достовірності
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {tb.xai_top_tokens.map((tok, idx) => {
                      const isFake = tok.direction === "fake_indicator";
                      return (
                        <Badge
                          key={idx}
                          variant={isFake ? "destructive" : "verified"}
                          className="px-3 py-1"
                        >
                          <span>«{tok.token}»</span>
                          <span className="opacity-80 text-[10px]">
                            {isFake ? "(ризик маніпуляції)" : "(фактичний маркер)"}
                          </span>
                        </Badge>
                      );
                    })}
                  </div>
                </Card>
              )}

              {tb.attribution_analysis && (
                <Card className="p-4 sm:p-5 gap-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2 text-xs sm:text-sm font-bold text-foreground">
                      <CheckCircle2 className="size-4 text-verified" />
                      <span>Верифікація цитат і першоджерел (NER)</span>
                    </div>
                    <Badge variant="secondary" className="font-mono tabular-nums">
                      Достовірність атрибуції:{" "}
                      {Number(tb.attribution_analysis.attribution_score || 70).toFixed(0)}%
                    </Badge>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {tb.attribution_analysis.summary}
                  </p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <Card className="p-3.5 bg-secondary/40 gap-2">
                      <span className="text-xs font-semibold text-foreground">
                        Верифіковані інституції та документи
                      </span>
                      {tb.attribution_analysis.verified_entities &&
                      tb.attribution_analysis.verified_entities.length > 0 ? (
                        <div className="flex flex-wrap gap-1.5">
                          {tb.attribution_analysis.verified_entities.map((ent, idx) => (
                            <Badge key={idx} variant="verified">
                              {ent}
                            </Badge>
                          ))}
                        </div>
                      ) : (
                        <p className="text-xs text-muted-foreground">
                          Прямих згадок офіційних відомств не зафіксовано.
                        </p>
                      )}
                    </Card>
                    <Card className="p-3.5 bg-secondary/40 gap-2">
                      <span className="text-xs font-semibold text-foreground">
                        Непідтверджені або анонімні посилання
                      </span>
                      {tb.attribution_analysis.unverified_claims &&
                      tb.attribution_analysis.unverified_claims.length > 0 ? (
                        <div className="flex flex-wrap gap-1.5">
                          {tb.attribution_analysis.unverified_claims.map((claim, idx) => (
                            <Badge key={idx} variant="destructive">
                              {claim}
                            </Badge>
                          ))}
                        </div>
                      ) : (
                        <p className="text-xs text-muted-foreground">
                          Маніпулятивних посилань на анонімні джерела не виявлено.
                        </p>
                      )}
                    </Card>
                  </div>
                </Card>
              )}

              {tb.xai_reasoning_steps && tb.xai_reasoning_steps.length > 0 && (
                <Card className="p-4 sm:p-5 gap-3">
                  <div className="flex items-center gap-2 text-xs sm:text-sm font-bold text-foreground">
                    <CheckCircle2 className="size-4 text-primary" />
                    <span>Покроковий протокол XAI-аудиту</span>
                  </div>
                  <div className="flex flex-col gap-2">
                    {tb.xai_reasoning_steps.map((stepItem) => {
                      const variant =
                        stepItem.status === "good"
                          ? "verified"
                          : stepItem.status === "warning"
                          ? "warning"
                          : "destructive";
                      return (
                        <div
                          key={stepItem.step}
                          className="p-3.5 rounded-xl border border-border bg-secondary/40 flex flex-col sm:flex-row sm:items-center justify-between gap-2"
                        >
                          <div className="flex flex-col gap-1">
                            <div className="flex items-center gap-2">
                              <span className="size-5 rounded-full bg-secondary text-primary text-xs font-bold font-mono tabular-nums flex items-center justify-center border border-border">
                                {stepItem.step}
                              </span>
                              <span className="text-xs font-bold text-foreground">
                                {stepItem.component}
                              </span>
                            </div>
                            <p className="text-xs text-muted-foreground pl-7 leading-relaxed">
                              {stepItem.summary}
                            </p>
                          </div>
                          {stepItem.score !== undefined && (
                            <Badge variant={variant} className="font-mono tabular-nums">
                              {Number(stepItem.score).toFixed(0)}%
                            </Badge>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </Card>
              )}

              <Card className="p-4 sm:p-5 gap-3">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1">
                  <div className="flex items-center gap-2 text-xs sm:text-sm font-bold text-foreground">
                    <Search className="size-4 text-primary" />
                    <span>Крос-верифікація в незалежних медіа</span>
                  </div>
                  <Badge variant="outline" className="tabular-nums">
                    Підтверджень: {tb.corroborating_articles?.length || 0}
                  </Badge>
                </div>
                {tb.corroboration_summary && (
                  <p className="text-xs text-muted-foreground">
                    {tb.corroboration_summary}
                  </p>
                )}
                {tb.corroborating_articles && tb.corroborating_articles.length > 0 && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    {tb.corroborating_articles.map((art) => (
                      <a
                        key={art.id}
                        href={art.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="p-3.5 rounded-xl border border-border bg-secondary/40 hover:border-primary/50 transition-colors flex flex-col justify-between gap-2 group"
                      >
                        <div className="flex flex-col gap-1.5">
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-xs font-bold text-foreground">
                              {art.source_name}
                            </span>
                            <Badge variant="secondary" className="font-mono tabular-nums">
                              Схожість {(art.similarity * 100).toFixed(0)}%
                            </Badge>
                          </div>
                          <p className="text-xs text-foreground group-hover:text-primary transition-colors line-clamp-2">
                            {art.title}
                          </p>
                        </div>
                        <div className="flex items-center justify-between text-[11px] text-muted-foreground pt-2 border-t border-border/70 tabular-nums">
                          <span>Довіра: {art.trust_score.toFixed(0)}%</span>
                          <span className="inline-flex items-center gap-1 text-primary">
                            Перейти <ExternalLink className="size-3" />
                          </span>
                        </div>
                      </a>
                    ))}
                  </div>
                )}
              </Card>

              {tb.matched_fact_checks && tb.matched_fact_checks.length > 0 && (
                <Card className="p-4 sm:p-5 border-warning/40 bg-warning/10 gap-3">
                  <div className="flex items-center gap-2 text-xs sm:text-sm font-bold text-accent">
                    <AlertTriangle className="size-4" />
                    <span>Збіги з базою фактчекерів (StopFake / VoxCheck)</span>
                  </div>
                  <div className="flex flex-col gap-2.5">
                    {tb.matched_fact_checks.map((fc) => (
                      <Card key={fc.id} className="p-3.5 bg-background/80 gap-1.5">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <Badge variant="warning">
                            {fc.fact_checker} • {fc.rating}
                          </Badge>
                          <span className="text-xs font-mono tabular-nums text-muted-foreground">
                            Схожість: {(fc.similarity * 100).toFixed(0)}%
                          </span>
                        </div>
                        <p className="text-xs font-semibold text-foreground">
                          «{fc.claim_text}»
                        </p>
                        {fc.explanation && (
                          <p className="text-xs text-muted-foreground line-clamp-2">
                            {fc.explanation}
                          </p>
                        )}
                        {fc.source_url && (
                          <a
                            href={fc.source_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline pt-1"
                          >
                            <span>Читати спростування</span>
                            <ExternalLink className="size-3.5" />
                          </a>
                        )}
                      </Card>
                    ))}
                  </div>
                </Card>
              )}
            </>
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  );
};
