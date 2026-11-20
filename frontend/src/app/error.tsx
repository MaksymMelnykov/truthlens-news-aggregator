"use client";

import { useEffect } from "react";
import { ErrorState } from "@/components/ui/state-displays";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("TruthLens UI Error:", error);
  }, [error]);

  return (
    <div className="max-w-2xl mx-auto px-4 py-16">
      <ErrorState
        title="Виникла тимчасова помилка відображення"
        description="Не вдалося коректно завантажити цей розділ застосунку. Спробуйте оновити дані або повернутися на головну стрічку."
        retryLabel="Оновити сторінку"
        onRetry={reset}
        secondaryHref="/"
        secondaryLabel="На головну стрічку"
      />
    </div>
  );
}

