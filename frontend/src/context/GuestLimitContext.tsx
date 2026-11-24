"use client";

import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
} from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Lock, LogIn, UserPlus, CheckCircle2, Sparkles } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
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

export type GuestFeatureKey = "verify" | "xai_details" | "factcheck_claim";

export const GUEST_LIMITS: Record<GuestFeatureKey, number> = {
  verify: 2,
  xai_details: 2,
  factcheck_claim: 2,
};

interface GuestUsageState {
  verify: number;
  xai_details: number;
  factcheck_claim: number;
  unlockedArticleIds: number[];
  unlockedXaiModalIds: number[];
}

const DEFAULT_USAGE: GuestUsageState = {
  verify: 0,
  xai_details: 0,
  factcheck_claim: 0,
  unlockedArticleIds: [],
  unlockedXaiModalIds: [],
};

const STORAGE_KEY = "truthlens_guest_usage_v1";

const FEATURE_META: Record<
  GuestFeatureKey,
  { title: string; description: string; shortName: string }
> = {
  verify: {
    title: "Вичерпано гостьовий ліміт перевірок (2 з 2)",
    description:
      "Ви вже використали 2 безкоштовні перевірки новин за посиланням або текстом. Увійдіть або створіть безкоштовний акаунт TruthLens для безлімітної перевірки статей та збереження історії.",
    shortName: "перевірок новин",
  },
  xai_details: {
    title: "Вичерпано гостьовий ліміт XAI-розборів (2 з 2)",
    description:
      "Ви вже використали 2 безкоштовні перегляди XAI-розбору або деталей статей. Авторизуйтеся, щоб без обмежень переглядати повний аналіз усіх новин у стрічці.",
    shortName: "переглядів XAI-розбору та деталей",
  },
  factcheck_claim: {
    title: "Вичерпано гостьовий ліміт звірок тверджень (2 з 2)",
    description:
      "Ви вже виконали 2 безкоштовні семантичні звірки тверджень із базою спростувань. Увійдіть або зареєструйтеся, щоб користуватися базою фактчеків без обмежень.",
    shortName: "семантичних звірок у базі спростувань",
  },
};

function readCookieValue(name: string): string | null {
  if (typeof document === "undefined") return null;
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = document.cookie.match(new RegExp(`(?:^|; )${escaped}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : null;
}

function parseUsage(raw: string | null): GuestUsageState | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<GuestUsageState>;
    return {
      verify: Math.max(0, Number(parsed.verify || 0)),
      xai_details: Math.max(0, Number(parsed.xai_details || 0)),
      factcheck_claim: Math.max(0, Number(parsed.factcheck_claim || 0)),
      unlockedArticleIds: Array.isArray(parsed.unlockedArticleIds)
        ? parsed.unlockedArticleIds.map(Number).filter(Number.isFinite)
        : [],
      unlockedXaiModalIds: Array.isArray(parsed.unlockedXaiModalIds)
        ? parsed.unlockedXaiModalIds.map(Number).filter(Number.isFinite)
        : [],
    };
  } catch {
    return null;
  }
}

function loadPersistedUsage(): GuestUsageState {
  if (typeof window === "undefined") return DEFAULT_USAGE;
  const fromLs = parseUsage(localStorage.getItem(STORAGE_KEY));
  const fromCookie = parseUsage(readCookieValue(STORAGE_KEY));

  if (!fromLs && !fromCookie) return DEFAULT_USAGE;
  if (fromLs && !fromCookie) return fromLs;
  if (!fromLs && fromCookie) return fromCookie;

  return {
    verify: Math.max(fromLs!.verify, fromCookie!.verify),
    xai_details: Math.max(fromLs!.xai_details, fromCookie!.xai_details),
    factcheck_claim: Math.max(fromLs!.factcheck_claim, fromCookie!.factcheck_claim),
    unlockedArticleIds: Array.from(
      new Set([...fromLs!.unlockedArticleIds, ...fromCookie!.unlockedArticleIds])
    ),
    unlockedXaiModalIds: Array.from(
      new Set([...fromLs!.unlockedXaiModalIds, ...fromCookie!.unlockedXaiModalIds])
    ),
  };
}

function savePersistedUsage(state: GuestUsageState): void {
  if (typeof window === "undefined") return;
  const serialized = JSON.stringify(state);
  try {
    localStorage.setItem(STORAGE_KEY, serialized);
  } catch {
    // Ігноруємо помилки квоти сховища
  }
  try {
    document.cookie = `${STORAGE_KEY}=${encodeURIComponent(
      serialized
    )}; path=/; max-age=31536000; SameSite=Lax`;
  } catch {
    // Ігноруємо помилки cookie
  }
}

interface GuestLimitContextType {
  isReady: boolean;
  usage: GuestUsageState;
  getRemaining: (feature: GuestFeatureKey) => number;
  canUseVerify: () => boolean;
  canOpenArticleDetail: (articleId: number) => boolean;
  consumeVerify: () => boolean;
  consumeFactcheckClaim: () => boolean;
  consumeXaiModal: (articleId: number) => boolean;
  consumeArticleDetail: (articleId: number) => boolean;
  openLimitModal: (feature: GuestFeatureKey) => void;
}

const GuestLimitContext = createContext<GuestLimitContextType | undefined>(undefined);

export function GuestLimitProvider({ children }: { children: React.ReactNode }) {
  const { user, isLoading: authLoading } = useAuth();
  const [usage, setUsage] = useState<GuestUsageState>(DEFAULT_USAGE);
  const [isReady, setIsReady] = useState(false);
  const [modalFeature, setModalFeature] = useState<GuestFeatureKey | null>(null);

  useEffect(() => {
    setUsage(loadPersistedUsage());
    setIsReady(true);
  }, []);

  // Якщо користувач щойно авторизувався — автоматично закриваємо модалку обмеження
  useEffect(() => {
    if (user && modalFeature) {
      setModalFeature(null);
    }
  }, [user, modalFeature]);

  const openLimitModal = useCallback((feature: GuestFeatureKey) => {
    setModalFeature(feature);
    toast.warning(FEATURE_META[feature].title, {
      description: "Увійдіть або створіть акаунт, щоб зняти обмеження.",
    });
  }, []);

  const notifyUsageProgress = useCallback(
    (feature: GuestFeatureKey, usedCount: number) => {
      const limit = GUEST_LIMITS[feature];
      const remaining = Math.max(0, limit - usedCount);
      if (remaining > 0) {
        toast.info(
          `Гостьовий режим: використано ${usedCount} з ${limit} ${FEATURE_META[feature].shortName}.`,
          {
            description: `Залишилась ще ${remaining} безкоштовна спроба. Увійдіть для безлімітного доступу.`,
          }
        );
      } else {
        toast.info(
          `Використано всі ${limit} з ${limit} безкоштовних ${FEATURE_META[feature].shortName}.`,
          {
            description: "Наступне використання буде доступне після входу в акаунт.",
          }
        );
      }
    },
    []
  );

  const getRemaining = useCallback(
    (feature: GuestFeatureKey): number => {
      if (user) return Infinity;
      const limit = GUEST_LIMITS[feature];
      return Math.max(0, limit - usage[feature]);
    },
    [user, usage]
  );

  const canUseVerify = useCallback((): boolean => {
    if (user || authLoading) return true;
    const latest = loadPersistedUsage();
    return latest.verify < GUEST_LIMITS.verify;
  }, [user, authLoading]);

  const canOpenArticleDetail = useCallback(
    (articleId: number): boolean => {
      if (user || authLoading) return true;
      const latest = loadPersistedUsage();
      if (latest.unlockedArticleIds.includes(articleId)) return true;
      return latest.xai_details < GUEST_LIMITS.xai_details;
    },
    [user, authLoading]
  );

  const consumeVerify = useCallback((): boolean => {
    if (user) return true;
    const latest = loadPersistedUsage();
    if (latest.verify >= GUEST_LIMITS.verify) {
      setUsage(latest);
      openLimitModal("verify");
      return false;
    }
    const next: GuestUsageState = {
      ...latest,
      verify: latest.verify + 1,
    };
    savePersistedUsage(next);
    setUsage(next);
    notifyUsageProgress("verify", next.verify);
    return true;
  }, [user, openLimitModal, notifyUsageProgress]);

  const consumeFactcheckClaim = useCallback((): boolean => {
    if (user) return true;
    const latest = loadPersistedUsage();
    if (latest.factcheck_claim >= GUEST_LIMITS.factcheck_claim) {
      setUsage(latest);
      openLimitModal("factcheck_claim");
      return false;
    }
    const next: GuestUsageState = {
      ...latest,
      factcheck_claim: latest.factcheck_claim + 1,
    };
    savePersistedUsage(next);
    setUsage(next);
    notifyUsageProgress("factcheck_claim", next.factcheck_claim);
    return true;
  }, [user, openLimitModal, notifyUsageProgress]);

  const consumeXaiModal = useCallback(
    (articleId: number): boolean => {
      if (user) return true;
      const latest = loadPersistedUsage();
      if (latest.unlockedXaiModalIds.includes(articleId)) {
        return true;
      }
      if (latest.xai_details >= GUEST_LIMITS.xai_details) {
        setUsage(latest);
        openLimitModal("xai_details");
        return false;
      }
      const next: GuestUsageState = {
        ...latest,
        xai_details: latest.xai_details + 1,
        unlockedXaiModalIds: [...latest.unlockedXaiModalIds, articleId],
      };
      savePersistedUsage(next);
      setUsage(next);
      notifyUsageProgress("xai_details", next.xai_details);
      return true;
    },
    [user, openLimitModal, notifyUsageProgress]
  );

  const consumeArticleDetail = useCallback(
    (articleId: number): boolean => {
      if (user) return true;
      const latest = loadPersistedUsage();
      if (latest.unlockedArticleIds.includes(articleId)) {
        return true;
      }
      if (latest.xai_details >= GUEST_LIMITS.xai_details) {
        setUsage(latest);
        openLimitModal("xai_details");
        return false;
      }
      const next: GuestUsageState = {
        ...latest,
        xai_details: latest.xai_details + 1,
        unlockedArticleIds: [...latest.unlockedArticleIds, articleId],
      };
      savePersistedUsage(next);
      setUsage(next);
      notifyUsageProgress("xai_details", next.xai_details);
      return true;
    },
    [user, openLimitModal, notifyUsageProgress]
  );

  const activeMeta = modalFeature ? FEATURE_META[modalFeature] : null;

  return (
    <GuestLimitContext.Provider
      value={{
        isReady,
        usage,
        getRemaining,
        canUseVerify,
        canOpenArticleDetail,
        consumeVerify,
        consumeFactcheckClaim,
        consumeXaiModal,
        consumeArticleDetail,
        openLimitModal,
      }}
    >
      {children}

      <Dialog
        open={Boolean(modalFeature)}
        onOpenChange={(open) => {
          if (!open) setModalFeature(null);
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader className="flex flex-col items-center text-center gap-3">
            <div className="flex size-12 items-center justify-center rounded-2xl border border-accent/30 bg-accent/12 text-accent">
              <Lock className="size-6" />
            </div>
            <Badge variant="accent">
              <Sparkles className="size-3.5" />
              Потрібна авторизація
            </Badge>
            <DialogTitle className="text-lg sm:text-xl text-foreground">
              {activeMeta?.title}
            </DialogTitle>
            <DialogDescription className="text-xs sm:text-sm text-muted-foreground leading-relaxed">
              {activeMeta?.description}
            </DialogDescription>
          </DialogHeader>

          <div className="rounded-xl border border-border/80 bg-secondary/50 p-4 flex flex-col gap-2 text-xs text-foreground">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="size-4 text-verified shrink-0" />
              <span>Безлімітні перевірки новин за URL, текстом та в базі спростувань</span>
            </div>
            <div className="flex items-center gap-2">
              <CheckCircle2 className="size-4 text-verified shrink-0" />
              <span>Повний XAI-розбір, підсвітка тригерів і теплова карта кожного речення</span>
            </div>
            <div className="flex items-center gap-2">
              <CheckCircle2 className="size-4 text-verified shrink-0" />
              <span>Персональна стрічка, збережені закладки та історія ваших перевірок</span>
            </div>
          </div>

          <DialogFooter className="flex-col sm:flex-row gap-2 pt-2">
            <Button
              asChild
              variant="outline"
              className="w-full sm:flex-1"
              onClick={() => setModalFeature(null)}
            >
              <Link href="/login">
                <LogIn className="size-4" data-icon="inline-start" />
                Увійти
              </Link>
            </Button>
            <Button
              asChild
              variant="accent"
              className="w-full sm:flex-1"
              onClick={() => setModalFeature(null)}
            >
              <Link href="/register">
                <UserPlus className="size-4" data-icon="inline-start" />
                Створити акаунт
              </Link>
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </GuestLimitContext.Provider>
  );
}

export function useGuestLimit() {
  const context = useContext(GuestLimitContext);
  if (!context) {
    throw new Error("useGuestLimit must be used within a GuestLimitProvider");
  }
  return context;
}
