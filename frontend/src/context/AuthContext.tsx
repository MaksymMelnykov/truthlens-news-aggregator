"use client";

import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from "react";
import { useRouter, usePathname } from "next/navigation";
import { toast } from "sonner";
import { User } from "@/types";

interface AuthContextType {
  user: User | null;
  token: string | null;
  isLoading: boolean;
  setUser: (user: User | null) => void;
  setToken: (token: string | null) => void;
  setSession: (token: string, refreshToken: string, user: User) => void;
  login: (email: string, password: string) => Promise<void>;
  loginWithGoogle: (credential: string, email?: string, fullName?: string) => Promise<void>;
  register: (email: string, password: string, fullName?: string) => Promise<void>;
  logout: () => void;
  updatePreferences: (prefs: Partial<NonNullable<User["preferences"]>>) => Promise<void>;
  apiUrl: string;
}

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api/v1";

const formatErrorDetail = (detail: unknown, fallback: string): string => {
  if (!detail) return fallback;
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail)) {
    return detail
      .map((d: unknown) => {
        if (d && typeof d === "object" && "msg" in d) {
          return String((d as { msg?: unknown }).msg ?? "");
        }
        return typeof d === "object" ? JSON.stringify(d) : String(d);
      })
      .join(", ");
  }
  if (typeof detail === "object") {
    if ("msg" in detail) {
      return String((detail as { msg?: unknown }).msg ?? fallback);
    }
    return JSON.stringify(detail);
  }
  return String(detail);
};

const isJwtExpired = (jwtToken: string): boolean => {
  try {
    const parts = jwtToken.split(".");
    if (parts.length !== 3) return false;
    const base64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const padded = base64 + "=".repeat((4 - (base64.length % 4)) % 4);
    const payload = JSON.parse(atob(padded)) as { exp?: number };
    if (typeof payload.exp !== "number") return false;
    // Вважаємо токен простроченим за 10 секунд до точного exp
    return Date.now() >= payload.exp * 1000 - 10_000;
  } catch {
    return false;
  }
};

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const pathnameRef = useRef(pathname);
  pathnameRef.current = pathname;

  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isRedirectingOut, setIsRedirectingOut] = useState<boolean>(false);

  useEffect(() => {
    if (isRedirectingOut && pathname === "/") {
      setIsRedirectingOut(false);
    }
  }, [isRedirectingOut, pathname]);

  const clearLocalSession = useCallback(() => {
    setUser(null);
    setToken(null);
    if (typeof window !== "undefined") {
      localStorage.removeItem("truthlens_token");
      localStorage.removeItem("truthlens_refresh_token");
      localStorage.removeItem("truthlens_user");
    }
  }, []);

  const handleAutoLogout = useCallback(() => {
    clearLocalSession();
    toast.info("Термін дії сесії завершився. Виконано автоматичний вихід.");
    const currentPath = pathnameRef.current;
    if (currentPath && currentPath !== "/" && currentPath !== "/login" && currentPath !== "/register") {
      setIsRedirectingOut(true);
      router.replace("/");
    }
  }, [clearLocalSession, router]);

  const verifyCurrentSession = useCallback(async () => {
    if (typeof window === "undefined") return;
    const savedToken = localStorage.getItem("truthlens_token");
    if (!savedToken) return;

    if (isJwtExpired(savedToken)) {
      handleAutoLogout();
      return;
    }

    try {
      const res = await fetch(`${API_BASE}/auth/me`, {
        headers: { Authorization: `Bearer ${savedToken}` },
        cache: "no-store",
      });
      if (res.ok) {
        const freshUser = (await res.json()) as User;
        setUser(freshUser);
        setToken(savedToken);
        localStorage.setItem("truthlens_user", JSON.stringify(freshUser));
      } else if (res.status === 401 || res.status === 403) {
        handleAutoLogout();
      }
    } catch {
      // Тимчасова відсутність мережі — не розлогінюємо користувача
    }
  }, [handleAutoLogout]);

  // Ініціалізація збереженої сесії при першому відкритті
  useEffect(() => {
    try {
      const savedToken = localStorage.getItem("truthlens_token");
      const savedUser = localStorage.getItem("truthlens_user");
      if (savedToken && savedUser) {
        if (isJwtExpired(savedToken)) {
          handleAutoLogout();
        } else {
          setToken(savedToken);
          setUser(JSON.parse(savedUser));
          void verifyCurrentSession();
        }
      }
    } catch (e) {
      console.error("Помилка завантаження сесії користувача", e);
    } finally {
      setIsLoading(false);
    }
  }, [handleAutoLogout, verifyCurrentSession]);

  // Періодична перевірка сесії та перевірка при поверненні на вкладку через проміжок часу
  useEffect(() => {
    const handleReturnToTab = () => {
      if (document.visibilityState === "visible") {
        void verifyCurrentSession();
      }
    };
    const handleFocus = () => {
      void verifyCurrentSession();
    };

    const intervalId = setInterval(() => {
      void verifyCurrentSession();
    }, 60_000);

    window.addEventListener("focus", handleFocus);
    document.addEventListener("visibilitychange", handleReturnToTab);

    return () => {
      clearInterval(intervalId);
      window.removeEventListener("focus", handleFocus);
      document.removeEventListener("visibilitychange", handleReturnToTab);
    };
  }, [verifyCurrentSession]);

  const setSession = useCallback((accessToken: string, refreshToken: string, newUser: User) => {
    setToken(accessToken);
    setUser(newUser);
    localStorage.setItem("truthlens_token", accessToken);
    localStorage.setItem("truthlens_refresh_token", refreshToken);
    localStorage.setItem("truthlens_user", JSON.stringify(newUser));
  }, []);

  const login = async (email: string, password: string) => {
    const res = await fetch(`${API_BASE}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });

    if (!res.ok) {
      const errorData = await res.json().catch(() => ({}));
      throw new Error(formatErrorDetail(errorData.detail, "Невірний email або пароль"));
    }

    const data = await res.json();
    setSession(data.access_token, data.refresh_token, data.user);
  };

  const register = async (email: string, password: string, fullName?: string) => {
    const res = await fetch(`${API_BASE}/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email,
        password,
        full_name: fullName || undefined,
      }),
    });

    if (!res.ok) {
      const errorData = await res.json().catch(() => ({}));
      throw new Error(formatErrorDetail(errorData.detail, "Помилка під час реєстрації"));
    }

    const data = await res.json();
    setSession(data.access_token, data.refresh_token, data.user);
  };

  const loginWithGoogle = async (credential: string, email?: string, fullName?: string) => {
    const res = await fetch(`${API_BASE}/auth/google`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        credential,
        email: email || undefined,
        full_name: fullName || undefined,
      }),
    });

    if (!res.ok) {
      const errorData = await res.json().catch(() => ({}));
      throw new Error(formatErrorDetail(errorData.detail, "Помилка авторизації через Google"));
    }

    const data = await res.json();
    setSession(data.access_token, data.refresh_token, data.user);
  };

  const logout = useCallback(() => {
    clearLocalSession();
    if (pathnameRef.current && pathnameRef.current !== "/") {
      setIsRedirectingOut(true);
      router.replace("/");
    }
  }, [clearLocalSession, router]);

  const updatePreferences = async (prefs: Partial<NonNullable<User["preferences"]>>) => {
    if (!token) return;
    const res = await fetch(`${API_BASE}/auth/me/preferences`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(prefs),
    });

    if (res.status === 401 || res.status === 403) {
      handleAutoLogout();
      return;
    }

    if (!res.ok) {
      const errorData = await res.json().catch(() => ({}));
      throw new Error(formatErrorDetail(errorData.detail, "Помилка збереження вподобань"));
    }

    const updatedUser = await res.json();
    setUser(updatedUser);
    localStorage.setItem("truthlens_user", JSON.stringify(updatedUser));
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        isLoading: isLoading || isRedirectingOut,
        setUser,
        setToken,
        setSession,
        login,
        loginWithGoogle,
        register,
        logout,
        updatePreferences,
        apiUrl: API_BASE,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
