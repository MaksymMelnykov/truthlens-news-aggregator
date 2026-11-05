"use client";

import React, { createContext, useContext, useState, useEffect } from "react";
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

const formatErrorDetail = (detail: any, fallback: string): string => {
  if (!detail) return fallback;
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail)) {
    return detail
      .map((d: any) => d.msg || (typeof d === "object" ? JSON.stringify(d) : String(d)))
      .join(", ");
  }
  if (typeof detail === "object") {
    return detail.msg || JSON.stringify(detail);
  }
  return String(detail);
};

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  // Ініціалізація збереженої сесії
  useEffect(() => {
    try {
      const savedToken = localStorage.getItem("truthlens_token");
      const savedUser = localStorage.getItem("truthlens_user");
      if (savedToken && savedUser) {
        setToken(savedToken);
        setUser(JSON.parse(savedUser));
        // Оновити профіль у фоні
        fetch(`${API_BASE}/auth/me`, {
          headers: { Authorization: `Bearer ${savedToken}` },
        })
          .then((res) => (res.ok ? res.json() : null))
          .then((freshUser) => {
            if (freshUser) {
              setUser(freshUser);
              localStorage.setItem("truthlens_user", JSON.stringify(freshUser));
            } else {
              logout();
            }
          })
          .catch(() => {});
      }
    } catch (e) {
      console.error("Помилка завантаження сесії користувача", e);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const setSession = (accessToken: string, refreshToken: string, newUser: User) => {
    setToken(accessToken);
    setUser(newUser);
    localStorage.setItem("truthlens_token", accessToken);
    localStorage.setItem("truthlens_refresh_token", refreshToken);
    localStorage.setItem("truthlens_user", JSON.stringify(newUser));
  };

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

  const logout = () => {
    setUser(null);
    setToken(null);
    localStorage.removeItem("truthlens_token");
    localStorage.removeItem("truthlens_refresh_token");
    localStorage.removeItem("truthlens_user");
  };

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
        isLoading,
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
