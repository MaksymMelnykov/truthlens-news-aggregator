"use client";

import React, { useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { Loader2, AlertCircle, Globe } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";

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
      const res = await fetch(
        `${apiUrl}/auth/google/url?redirect_uri=${encodeURIComponent(redirectUri)}`
      );

      if (!res.ok) {
        throw new Error("Не вдалося отримати посилання для входу через Google");
      }

      const data = await res.json();

      if (data.configured && data.url) {
        window.location.href = data.url;
        return;
      }

      const msg =
        "Вхід через Google тимчасово недоступний: на сервері ще не вказано ідентифікатор клієнта OAuth.";
      if (onError) {
        onError(msg);
      } else {
        setLocalError(msg);
      }
    } catch (e: unknown) {
      const errMsg =
        e instanceof Error
          ? e.message
          : "Помилка зв'язку з сервером авторизації Google";
      if (onError) {
        onError(errMsg);
      } else {
        setLocalError(errMsg);
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex flex-col gap-2 w-full">
      <Button
        type="button"
        variant="outline"
        onClick={handleGoogleClick}
        disabled={isLoading}
        className="w-full"
      >
        {isLoading ? (
          <Loader2 className="size-4 animate-spin" />
        ) : (
          <Globe className="size-4 text-primary" />
        )}
        <span>
          {mode === "register"
            ? "Продовжити з Google"
            : "Увійти через Google"}
        </span>
      </Button>

      {localError && (
        <Alert variant="warning">
          <AlertCircle className="size-4" />
          <AlertDescription>{localError}</AlertDescription>
        </Alert>
      )}
    </div>
  );
};
