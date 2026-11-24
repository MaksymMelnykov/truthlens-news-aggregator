import type { Metadata } from "next";
import { Plus_Jakarta_Sans, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { AuthProvider } from "@/context/AuthContext";
import { GuestLimitProvider } from "@/context/GuestLimitContext";
import { Header } from "@/components/Header";
import { Toaster } from "@/components/ui/sonner";
import { BrandLogo } from "@/components/ui/brand-logo";

const jakarta = Plus_Jakarta_Sans({
  subsets: ["latin", "cyrillic-ext"],
  weight: ["400", "500", "600", "700", "800"],
  variable: "--font-sans",
  display: "swap",
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin", "cyrillic"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: "TruthLens — Платформа моніторингу медіа та верифікації новин",
  description:
    "Професійна платформа верифікації новин у реальному часі: крос-медійна перевірка фактів, стилометричний аналіз маніпуляцій, репутація доменів та прозорий XAI-аудит.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="uk"
      className={`${jakarta.variable} ${jetbrainsMono.variable} dark h-full`}
    >
      <body
        className={`${jakarta.className} bg-background text-foreground min-h-full flex flex-col antialiased`}
      >
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-50 focus:rounded-xl focus:bg-primary focus:px-4 focus:py-2 focus:text-sm focus:font-bold focus:text-primary-foreground"
        >
          Перейти до основного вмісту
        </a>
        <AuthProvider>
          <GuestLimitProvider>
            <Header />
            <main id="main-content" className="flex-grow">
              {children}
            </main>
            <footer className="border-t border-border bg-card/60 py-8 text-xs text-muted-foreground">
              <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <BrandLogo size="sm" />
                  <div className="text-left">
                    <p className="font-bold text-foreground">
                      TruthLens Media Intelligence
                    </p>
                    <p className="text-muted-foreground">
                      Незалежна платформа верифікації новин та протидії дезінформації
                    </p>
                  </div>
                </div>
                <p className="text-center sm:text-right text-muted-foreground">
                  Крос-верифікація ЗМІ • Моніторинг медіапростору • Пояснювальний ШІ (XAI)
                </p>
              </div>
            </footer>
            <Toaster />
          </GuestLimitProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
