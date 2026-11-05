import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { AuthProvider } from "@/context/AuthContext";
import { Header } from "@/components/Header";

const inter = Inter({ subsets: ["latin", "cyrillic"] });

export const metadata: Metadata = {
  title: "TruthLens — Агрегатор новин з виявленням неправдивої інформації",
  description: "Інтелектуальний агрегатор новин з гібридною системою перевірки достовірності, стилометричним аналізом та XAI-поясненнями",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="uk" className="dark h-full">
      <body className={`${inter.className} bg-zinc-950 text-zinc-100 min-h-full flex flex-col antialiased`}>
        <AuthProvider>
          <Header />
          <main className="flex-grow">{children}</main>
          <footer className="border-t border-zinc-800/60 bg-zinc-950/80 py-8 text-center text-xs text-zinc-500">
            <div className="max-w-7xl mx-auto px-4">
              <p className="mb-2">
                <span className="font-semibold text-zinc-400">TruthLens</span> — Кваліфікаційна магістерська робота (КМР) 2026
              </p>
              <p>
                Гібридний аналіз дезінформації: Стилометрія • NLP Transformers • Репутація доменів • Пояснювальний ШІ (XAI)
              </p>
            </div>
          </footer>
        </AuthProvider>
      </body>
    </html>
  );
}
