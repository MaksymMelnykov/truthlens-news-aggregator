"use client";

import React, { useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { Loader2, AlertCircle } from "lucide-react";

interface GoogleAuthButtonProps {
  mode?: "login" | "register";
  onError?: (msg: string) => void;
}

export const GoogleAuthButton: React.FC<GoogleAuthButtonProps> = ({
  mode = "login",
  onError,
}) => {
  const { apiUrl } = useAuth();
  const [isLoading, setIsLoading] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  const handleGoogleClick = async () => {
    setLocalError(null);
    setIsLoading(true);

    try {
      const redirectUri = window.location.origin + "/auth/callback/google";
      const res = await fetch(`${apiUrl}/auth/google/url?redirect_uri=${encodeURIComponent(redirectUri)}`);
      
      if (!res.ok) {
        throw new Error("Не вдалося отримати посилання для входу через Google");
      }

      const data = await res.json();

      if (data.configured && data.url) {
        // Автоматичний прямий перехід на офіційний вибір акаунтів Google (accounts.google.com)
        window.location.href = data.url;
        return;
      }

      // Якщо GOOGLE_CLIENT_ID ще не налаштовано в backend/.env
      const msg = "Для автоматичного переходу на accounts.google.com вкажіть GOOGLE_CLIENT_ID у backend/.env (див. покрокові інструкції в чаті).";
      if (onError) {
        onError(msg);
      } else {
        setLocalError(msg);
      }
    } catch (e: any) {
      console.error("Помилка ініціалізації Google OAuth:", e);
      const msg = e.message || "Помилка зв'язку з сервером авторизації Google";
      if (onError) {
        onError(msg);
      } else {
        setLocalError(msg);
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="w-full space-y-2">
      <button
        type="button"
        onClick={handleGoogleClick}
        disabled={isLoading}
        className="w-full py-2.5 px-4 rounded-xl bg-zinc-900 hover:bg-zinc-800/90 border border-zinc-700/80 hover:border-zinc-600 text-zinc-100 font-medium text-sm flex items-center justify-center gap-3 transition-all shadow-sm hover:shadow-md active:scale-[0.99] disabled:opacity-50 cursor-pointer"
      >
        {isLoading ? (
          <Loader2 className="w-4 h-4 animate-spin text-zinc-400" />
        ) : (
          <svg className="w-4 h-4 flex-shrink-0" viewBox="0 0 24 24">
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
        )}
        <span>
          {mode === "register" ? "Зареєструватися через Google" : "Увійти через Google"}
        </span>
      </button>

      {localError && (
        <div className="flex items-start gap-2 p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-300 text-xs leading-relaxed">
          <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5 text-amber-400" />
          <span>{localError}</span>
        </div>
      )}
    </div>
  );
};
