"use client";

import React, { useEffect, useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { Loader2, ArrowLeft } from "lucide-react";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { BrandLogo } from "@/components/ui/brand-logo";
import { ErrorState } from "@/components/ui/state-displays";

function GoogleCallbackContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { apiUrl, setSession } = useAuth();

  const [error, setError] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(true);
  const hasRequestedRef = React.useRef(false);

  useEffect(() => {
    const code = searchParams.get("code");
    const errorParam = searchParams.get("error");

    if (errorParam) {
      setError(`Авторизацію через Google скасовано: ${errorParam}`);
      setIsProcessing(false);
      return;
    }

    if (!code) {
      if (typeof window !== "undefined" && localStorage.getItem("truthlens_token")) {
        router.replace("/");
        return;
      }
      setError("Не знайдено коду підтвердження від Google OAuth.");
      setIsProcessing(false);
      return;
    }

    if (hasRequestedRef.current) {
      return;
    }
    hasRequestedRef.current = true;

    if (typeof window !== "undefined") {
      window.history.replaceState({}, document.title, window.location.pathname);
    }

    const exchangeCode = async () => {
      try {
        const redirectUri = window.location.origin + "/auth/callback/google";
        const res = await fetch(`${apiUrl}/auth/google/callback`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            code,
            redirect_uri: redirectUri,
          }),
        });

        if (!res.ok) {
          if (typeof window !== "undefined" && localStorage.getItem("truthlens_token")) {
            router.replace("/");
            return;
          }
          const data = await res.json().catch(() => ({}));
          throw new Error(data.detail || "Помилка обміну токена Google OAuth");
        }

        const data = await res.json();
        setSession(data.access_token, data.refresh_token, data.user);
        router.replace("/");
      } catch (err: unknown) {
        if (typeof window !== "undefined" && localStorage.getItem("truthlens_token")) {
          router.replace("/");
          return;
        }
        setError(
          err instanceof Error
            ? err.message
            : "Помилка автентифікації через Google"
        );
      } finally {
        setIsProcessing(false);
      }
    };

    exchangeCode();
  }, [searchParams, apiUrl, router, setSession]);

  return (
    <div className="min-h-[70dvh] flex items-center justify-center px-4">
      <Card className="w-full max-w-md p-6 sm:p-8 text-center items-center">
        <CardHeader className="items-center text-center">
          <BrandLogo size="lg" />
          <CardTitle className="text-xl pt-2">Авторизація через Google</CardTitle>
          <CardDescription>
            Завершення безпечного входу до платформи TruthLens
          </CardDescription>
        </CardHeader>

        <CardContent className="w-full items-center">
          {isProcessing && (
            <div className="flex flex-col items-center gap-3 py-4" role="status">
              <Loader2 className="size-6 animate-spin text-primary" />
              <p className="text-xs sm:text-sm text-muted-foreground">
                Перевіряємо обліковий запис та налаштовуємо сесію…
              </p>
            </div>
          )}

          {error && (
            <div className="flex flex-col gap-4 w-full text-left">
              <ErrorState
                title="Не вдалося завершити вхід"
                description={error}
              />
              <Button asChild variant="outline" className="w-full">
                <Link href="/login">
                  <ArrowLeft className="size-4" />
                  <span>Повернутися до входу</span>
                </Link>
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export default function GoogleCallbackPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-[70dvh] flex items-center justify-center">
          <Loader2 className="size-6 animate-spin text-primary" />
        </div>
      }
    >
      <GoogleCallbackContent />
    </Suspense>
  );
}
