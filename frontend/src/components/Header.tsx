"use client";

import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import {
  ShieldCheck,
  Bookmark,
  History,
  LogOut,
  SlidersHorizontal,
  Sparkles,
  ShieldAlert,
  PieChart,
} from "lucide-react";

export const Header: React.FC = () => {
  const { user, logout } = useAuth();
  const pathname = usePathname();

  const isActive = (path: string) => pathname === path;
  const isAdmin = user?.role === "admin";

  return (
    <header className="sticky top-0 z-50 w-full border-b border-zinc-800/80 bg-zinc-950/80 backdrop-blur-md">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
        {/* Логотип бренду */}
        <Link href={isAdmin ? "/analytics" : "/"} className="flex items-center gap-2.5 group">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-cyan-600 via-indigo-600 to-emerald-500 p-0.5 shadow-lg shadow-cyan-500/20 group-hover:shadow-cyan-500/40 transition-all">
            <div className="w-full h-full bg-zinc-950 rounded-[10px] flex items-center justify-center">
              <ShieldCheck className="w-5 h-5 text-cyan-400 group-hover:scale-110 transition-transform" />
            </div>
          </div>
          <div>
            <div className="flex items-center gap-1.5">
              <span className="font-extrabold text-xl tracking-tight bg-gradient-to-r from-zinc-100 via-zinc-200 to-zinc-400 bg-clip-text text-transparent">
                TruthLens
              </span>
              {isAdmin ? (
                <span className="text-[10px] uppercase font-mono tracking-wider px-1.5 py-0.5 rounded bg-indigo-500/15 text-indigo-300 border border-indigo-500/30">
                  Admin Panel
                </span>
              ) : (
                <span className="text-[10px] uppercase font-mono tracking-wider px-1.5 py-0.5 rounded bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">
                  AI FactCheck
                </span>
              )}
            </div>
          </div>
        </Link>

        {/* Навігація: суворий поділ між Адміністратором та Користувачем */}
        <nav className="flex items-center gap-1">
          {isAdmin ? (
            <>
              <Link
                href="/analytics"
                className={`px-3.5 py-2 rounded-lg text-sm font-medium flex items-center gap-1.5 transition-colors ${
                  isActive("/analytics")
                    ? "bg-indigo-500/20 text-indigo-200 border border-indigo-500/40"
                    : "text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900"
                }`}
              >
                <PieChart className="w-4 h-4 text-indigo-400" />
                <span>Аналітика та метрики</span>
              </Link>
              <Link
                href="/admin/sources"
                className={`px-3.5 py-2 rounded-lg text-sm font-medium flex items-center gap-1.5 transition-colors ${
                  isActive("/admin/sources")
                    ? "bg-cyan-500/20 text-cyan-200 border border-cyan-500/40"
                    : "text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900"
                }`}
              >
                <SlidersHorizontal className="w-4 h-4 text-cyan-400" />
                <span>Джерела та RSS-канали</span>
              </Link>
            </>
          ) : (
            <div className="hidden md:flex items-center gap-1">
              <Link
                href="/"
                className={`px-3.5 py-2 rounded-lg text-sm font-medium transition-colors ${
                  isActive("/")
                    ? "bg-zinc-800/80 text-white"
                    : "text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900"
                }`}
              >
                Стрічка новин
              </Link>
              <Link
                href="/factchecks"
                className={`px-3.5 py-2 rounded-lg text-sm font-medium flex items-center gap-1.5 transition-colors ${
                  isActive("/factchecks")
                    ? "bg-zinc-800/80 text-white"
                    : "text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900"
                }`}
              >
                <ShieldAlert className="w-4 h-4 text-amber-400" />
                База фактчеків
              </Link>
              <Link
                href="/verify"
                className={`px-3.5 py-2 rounded-lg text-sm font-medium flex items-center gap-1.5 transition-colors ${
                  isActive("/verify")
                    ? "bg-zinc-800/80 text-white"
                    : "text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900"
                }`}
              >
                <Sparkles className="w-4 h-4 text-cyan-400" />
                Перевірка статті
              </Link>
            </div>
          )}
        </nav>

        {/* Блок стану користувача */}
        <div className="flex items-center gap-3">
          {user ? (
            <div className="flex items-center gap-2">
              {/* Закладки та Історія перевірок — лише для звичайних користувачів */}
              {!isAdmin && (
                <>
                  <Link
                    href="/bookmarks"
                    className={`p-2 rounded-lg text-zinc-400 hover:text-zinc-100 hover:bg-zinc-900 transition-colors ${
                      isActive("/bookmarks") ? "text-cyan-400 bg-zinc-900" : ""
                    }`}
                    title="Збережені новини"
                  >
                    <Bookmark className="w-4 h-4" />
                  </Link>

                  <Link
                    href="/history"
                    className={`p-2 rounded-lg text-zinc-400 hover:text-zinc-100 hover:bg-zinc-900 transition-colors ${
                      isActive("/history") ? "text-cyan-400 bg-zinc-900" : ""
                    }`}
                    title="Історія фактчекінгу"
                  >
                    <History className="w-4 h-4" />
                  </Link>
                </>
              )}

              {/* Профіль користувача / адміністратора */}
              <div className="flex items-center gap-2 pl-2 border-l border-zinc-800">
                <div
                  className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold text-white shadow-inner ${
                    isAdmin
                      ? "bg-gradient-to-tr from-indigo-600 to-purple-600"
                      : "bg-gradient-to-tr from-cyan-600 to-indigo-600"
                  }`}
                >
                  {user.full_name
                    ? user.full_name.charAt(0).toUpperCase()
                    : user.email.charAt(0).toUpperCase()}
                </div>
                <div className="hidden lg:block text-left text-xs">
                  <div className="font-semibold text-zinc-200 truncate max-w-[130px]">
                    {user.full_name || user.email.split("@")[0]}
                  </div>
                  <div
                    className={`text-[10px] font-mono uppercase ${
                      isAdmin ? "text-indigo-400 font-bold" : "text-zinc-500"
                    }`}
                  >
                    {isAdmin ? "Адміністратор" : "Користувач"}
                  </div>
                </div>

                <button
                  onClick={logout}
                  className="p-2 rounded-lg text-zinc-400 hover:text-rose-400 hover:bg-rose-500/10 transition-colors cursor-pointer"
                  title="Вийти з акаунту"
                >
                  <LogOut className="w-4 h-4" />
                </button>
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <Link
                href="/login"
                className="px-3.5 py-2 text-sm font-medium text-zinc-300 hover:text-white transition-colors"
              >
                Вхід
              </Link>
              <Link
                href="/register"
                className="px-4 py-2 text-sm font-medium rounded-lg bg-gradient-to-r from-cyan-500 to-indigo-600 text-white shadow-md shadow-cyan-500/20 hover:shadow-cyan-500/35 hover:brightness-110 transition-all"
              >
                Реєстрація
              </Link>
            </div>
          )}
        </div>
      </div>
    </header>
  );
};
