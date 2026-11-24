"use client";

import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion } from "motion/react";
import { useAuth } from "@/context/AuthContext";
import {
  Bookmark,
  History,
  LogOut,
  SlidersHorizontal,
  Sparkles,
  ShieldAlert,
  PieChart,
  Newspaper,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { BrandLogo } from "@/components/ui/brand-logo";
import { cn } from "@/lib/utils";

export const Header: React.FC = () => {
  const { user, logout } = useAuth();
  const pathname = usePathname();

  const isActive = (path: string) => pathname === path;
  const isAdmin = user?.role === "admin";

  const navItems = isAdmin
    ? [
        {
          href: "/admin/analytics",
          label: "Аналітика та метрики",
          icon: PieChart,
        },
        {
          href: "/admin/sources",
          label: "Джерела та RSS-канали",
          icon: SlidersHorizontal,
        },
      ]
    : [
        {
          href: "/",
          label: "Стрічка новин",
          icon: Newspaper,
        },
        {
          href: "/factchecks",
          label: "База фактчеків",
          icon: ShieldAlert,
        },
        {
          href: "/verify",
          label: "Перевірка статті",
          icon: Sparkles,
        },
      ];

  return (
    <header className="sticky top-0 z-40 w-full border-b border-border bg-background/85 backdrop-blur-md">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-4">
        <Link
          href={isAdmin ? "/admin/analytics" : "/"}
          className="group flex items-center gap-3 focus-visible:rounded-xl"
          aria-label="TruthLens — перехід на головну"
        >
          <BrandLogo size="md" />
          <div className="flex items-center gap-2">
            <span className="font-extrabold text-lg sm:text-xl tracking-tight text-foreground">
              TruthLens
            </span>
            <Badge variant={isAdmin ? "accent" : "secondary"}>
              {isAdmin ? "Admin Console" : "Media Guard"}
            </Badge>
          </div>
        </Link>

        <nav
          aria-label="Основна навігація"
          className="hidden md:flex items-center gap-1 rounded-xl border border-border bg-card/80 p-1"
        >
          {navItems.map((item) => {
            const Icon = item.icon;
            const active = isActive(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "relative px-3.5 py-1.5 rounded-lg text-xs sm:text-sm font-semibold flex items-center gap-2 transition-colors",
                  active
                    ? "text-primary-foreground"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                {active && (
                  <motion.span
                    layoutId="header-active-pill"
                    transition={{ duration: 0.22, ease: [0.2, 0, 0, 1] }}
                    className="absolute inset-0 rounded-lg bg-primary"
                    aria-hidden="true"
                  />
                )}
                <Icon className="relative z-10 size-4" />
                <span className="relative z-10">{item.label}</span>
              </Link>
            );
          })}
        </nav>

        <div className="flex items-center gap-2.5">
          {user ? (
            <div className="flex items-center gap-2">
              {!isAdmin && (
                <>
                  <Button
                    asChild
                    variant={isActive("/bookmarks") ? "default" : "ghost"}
                    size="icon"
                  >
                    <Link
                      href="/bookmarks"
                      aria-label="Збережені новини"
                      title="Збережені новини"
                    >
                      <Bookmark className="size-4" />
                    </Link>
                  </Button>

                  <Button
                    asChild
                    variant={isActive("/history") ? "default" : "ghost"}
                    size="icon"
                  >
                    <Link
                      href="/history"
                      aria-label="Історія перевірок"
                      title="Історія перевірок"
                    >
                      <History className="size-4" />
                    </Link>
                  </Button>
                </>
              )}

              <div className="flex items-center gap-2.5 pl-2.5 border-l border-border">
                <div
                  className={cn(
                    "size-8 rounded-full flex items-center justify-center text-xs font-bold border",
                    isAdmin
                      ? "bg-accent text-accent-foreground border-accent"
                      : "bg-primary text-primary-foreground border-primary"
                  )}
                  aria-hidden="true"
                >
                  {(user.full_name || user.email || "U").charAt(0).toUpperCase()}
                </div>
                <div className="hidden lg:flex flex-col text-left text-xs">
                  <span className="font-bold text-foreground truncate max-w-[140px]">
                    {user.full_name || user.email.split("@")[0]}
                  </span>
                  <span className="text-[11px] font-mono uppercase text-muted-foreground">
                    {isAdmin ? "Адміністратор" : "Читач"}
                  </span>
                </div>

                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={logout}
                  aria-label="Вийти з облікового запису"
                  title="Вийти з облікового запису"
                >
                  <LogOut className="size-4" />
                </Button>
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <Button asChild variant="ghost" size="sm">
                <Link href="/login">Увійти</Link>
              </Button>
              <Button asChild variant="default" size="sm">
                <Link href="/register">Створити акаунт</Link>
              </Button>
            </div>
          )}
        </div>
      </div>

      {/* Мобільна навігація */}
      <nav
        aria-label="Мобільна навігація"
        className="flex md:hidden items-center justify-around border-t border-border/70 bg-card/90 px-2 py-1.5"
      >
        {navItems.map((item) => {
          const Icon = item.icon;
          const active = isActive(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors",
                active
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              <Icon className="size-4" />
              <span>{item.label}</span>
            </Link>
          );
        })}
      </nav>
    </header>
  );
};
