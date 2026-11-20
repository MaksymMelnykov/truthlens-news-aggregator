"use client";

import React, { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { motion } from "motion/react";
import { useAuth } from "@/context/AuthContext";
import { GoogleAuthButton } from "@/components/GoogleAuthButton";
import {
  Mail,
  Lock,
  User,
  ArrowRight,
  AlertCircle,
  Eye,
  EyeOff,
  Loader2,
} from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  FieldGroup,
  Field,
  FieldLabel,
  FieldDescription,
  FieldError,
} from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Separator } from "@/components/ui/separator";
import { BrandLogo } from "@/components/ui/brand-logo";

export default function RegisterPage() {
  const router = useRouter();
  const { register } = useAuth();

  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (password.length < 6) {
      setError("Пароль повинен містити щонайменше 6 символів");
      return;
    }

    setIsSubmitting(true);
    try {
      await register(email, password, fullName);
      router.push("/");
    } catch (err: unknown) {
      setError(
        err instanceof Error ? err.message : "Не вдалося створити акаунт"
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-[80dvh] flex items-center justify-center px-4 py-12">
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.25, ease: [0.2, 0, 0, 1] }}
        className="w-full max-w-md"
      >
        <Card className="p-6 sm:p-8 gap-6">
          <CardHeader className="items-center text-center gap-2">
            <BrandLogo size="lg" />
            <CardTitle className="text-2xl pt-1">Створити акаунт</CardTitle>
            <CardDescription>
              Приєднуйтесь до TruthLens для верифікації новин та персоналізації інформаційного потоку
            </CardDescription>
          </CardHeader>

          <CardContent className="gap-5">
            {error && (
              <Alert variant="destructive" id="register-error-msg">
                <AlertCircle className="size-4" />
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            <GoogleAuthButton mode="register" onError={setError} />

            <div className="relative flex items-center justify-center py-1">
              <Separator />
              <span className="bg-card px-3 text-[11px] text-muted-foreground uppercase tracking-wider font-mono absolute">
                або через email
              </span>
            </div>

            <form onSubmit={handleSubmit} noValidate>
              <FieldGroup>
                <Field>
                  <FieldLabel htmlFor="register-name">
                    <User className="size-4 text-primary" />
                    <span>Ім’я або псевдонім</span>
                  </FieldLabel>
                  <Input
                    id="register-name"
                    name="name"
                    type="text"
                    autoComplete="name"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    placeholder="Олена Коваленко"
                  />
                </Field>

                <Field invalid={Boolean(error)}>
                  <FieldLabel htmlFor="register-email">
                    <Mail className="size-4 text-primary" />
                    <span>Електронна пошта</span>
                  </FieldLabel>
                  <Input
                    id="register-email"
                    name="email"
                    type="email"
                    autoComplete="email"
                    required
                    aria-invalid={Boolean(error)}
                    aria-describedby={error ? "register-error-msg" : undefined}
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="name@example.com"
                  />
                </Field>

                <Field invalid={Boolean(error)}>
                  <FieldLabel htmlFor="register-password">
                    <Lock className="size-4 text-primary" />
                    <span>Пароль</span>
                  </FieldLabel>
                  <div className="relative">
                    <Input
                      id="register-password"
                      name="password"
                      type={showPassword ? "text" : "password"}
                      autoComplete="new-password"
                      required
                      minLength={6}
                      aria-invalid={Boolean(error)}
                      aria-describedby="password-hint"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="Мінімум 6 символів"
                      className="pr-10"
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-1 top-1 size-8"
                      aria-label={
                        showPassword ? "Приховати пароль" : "Показати пароль"
                      }
                    >
                      {showPassword ? (
                        <EyeOff className="size-4 text-primary" />
                      ) : (
                        <Eye className="size-4" />
                      )}
                    </Button>
                  </div>
                  <FieldDescription id="password-hint">
                    Використовуйте щонайменше 6 символів для захисту облікового запису.
                  </FieldDescription>
                  {error && <FieldError>{error}</FieldError>}
                </Field>

                <Button
                  type="submit"
                  variant="default"
                  size="lg"
                  disabled={isSubmitting}
                  className="w-full mt-1"
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 className="size-4 animate-spin" />
                      <span>Створення акаунту…</span>
                    </>
                  ) : (
                    <>
                      <span>Створити акаунт</span>
                      <ArrowRight className="size-4" />
                    </>
                  )}
                </Button>
              </FieldGroup>
            </form>
          </CardContent>

          <CardFooter className="justify-center text-xs text-muted-foreground">
            <span>Вже маєте обліковий запис?</span>
            <Link
              href="/login"
              className="font-bold text-primary hover:underline ml-1.5"
            >
              Увійти
            </Link>
          </CardFooter>
        </Card>
      </motion.div>
    </div>
  );
}
