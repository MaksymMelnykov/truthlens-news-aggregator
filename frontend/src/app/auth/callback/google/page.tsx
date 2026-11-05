"use client";

import React, { useEffect, useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { Loader2, AlertCircle, ArrowLeft } from "lucide-react";
import Link from "next/link";

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
      setError(`Google відхилив запит: ${errorParam}`);
      setIsProcessing(false);
      return;
    }

    if (!code) {
      // Якщо користувач уже авторизований і оновив сторінку
      if (typeof window !== "undefined" && localStorage.getItem("truthlens_token")) {
        router.replace("/");
        return;
      }
      setError("Не знайдено авторизаційного коду від Google.");
      setIsProcessing(false);
      return;
    }

    // Запобігаємо подвійному виконанню запиту в React StrictMode
    if (hasRequestedRef.current) {
      return;
    }
    hasRequestedRef.current = true;

    // Очищаємо параметр ?code з адресного рядка, щоб при випадковому F5 не надсилався спалений код
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
          // Якщо токен вже був збережений успішним першим запитом
          if (typeof window !== "undefined" && localStorage.getItem("truthlens_token")) {
            router.replace("/");
            return;
          }
          const data = await res.json().catch(() => ({}));
          throw new Error(data.detail || "Помилка обміну токена Google OAuth");
        }

        const data = await res.json();
        // Встановлюємо токен та користувача в React State + localStorage
        setSession(data.access_token, data.refresh_token, data.user);

        // Перенаправляємо на головну
        router.replace("/");
      } catch (err: any) {
        console.error("Google Auth Callback Error:", err);
        if (typeof window !== "undefined" && localStorage.getItem("truthlens_token")) {
          router.replace("/");
          return;
        }
        setError(err.message || "Помилка автентифікації через Google");
      } finally {
        setIsProcessing(false);
      }
    };

    exchangeCode();
  }, [searchParams, apiUrl, router, setSession]);

  return (
    <div className="min-h-[70vh] flex items-center justify-center px-4">
      <div className="w-full max-w-md rounded-3xl border border-zinc-800 bg-zinc-900/70 p-8 backdrop-blur-xl shadow-2xl text-center space-y-6">
        {/* Google Logo */}
        <div className="w-12 h-12 rounded-2xl bg-zinc-950 border border-zinc-800 mx-auto flex items-center justify-center shadow-lg">
          <svg className="w-6 h-6" viewBox="0 0 24 24">
            <path
              fill="#4285F4"
              d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.8-2.4 3.66v3.05h3.88c2.27-2.09 3.66-5.17 3.66-9.15z"
            />
            <path
              fill="#34A853"
              d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.1-6.72-4.93H1.24v3.15C3.26 21.36 7.34 24 12 24z"
            />
            <path
              fill="#FBBC05"
              d="M5.28 14.27c-.25-.72-.38-1.49-.38-2.27s.13-1.55.38-2.27V6.58H1.24C.45 8.16 0 9.97 0 12s.45 3.84 1.24 5.42l4.04-3.15z"
            />
            <path
              fill="#EA4335"
              d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.34 0 3.26 2.64 1.24 6.58l4.04 3.15c.95-2.83 3.6-4.98 6.72-4.98z"
            />
          </svg>
        </div>

        {isProcessing && (
          <div className="space-y-3">
            <div className="flex items-center justify-center gap-2 text-cyan-400">
              <Loader2 className="w-5 h-5 animate-spin" />
              <span className="font-semibold text-sm">Вхід через Google...</span>
            </div>
            <p className="text-xs text-zinc-400">
              Перевіряємо обліковий запис та готуємо персоналізовану стрічку новин.
            </p>
          </div>
        )}

        {error && (
          <div className="space-y-4">
            <div className="flex items-center gap-2 p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs text-left">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              <span>{error}</span>
            </div>

            <Link
              href="/login"
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-semibold transition-colors"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Повернутися до входу</span>
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}

export default function GoogleCallbackPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-[70vh] flex items-center justify-center">
          <Loader2 className="w-6 h-6 animate-spin text-cyan-400" />
        </div>
      }
    >
      <GoogleCallbackContent />
    </Suspense>
  );
}
