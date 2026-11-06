"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { FieldError, FormAlert, Input, Label } from "@/components/ui/form";
import { createClient } from "@/lib/supabase/client";

type LoginFormProps = {
  accessError?: string | null;
  redirectTo: string;
};

type FieldErrors = {
  email?: string;
  password?: string;
};

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function validateLogin(email: string, password: string) {
  const errors: FieldErrors = {};

  if (!email) {
    errors.email = "Ingresa tu email.";
  } else if (!emailPattern.test(email)) {
    errors.email = "Ingresa un email valido.";
  }

  if (!password) {
    errors.password = "Ingresa tu contrasena.";
  }

  return errors;
}

function getLoginErrorMessage(message: string) {
  const normalizedMessage = message.toLowerCase();

  if (
    normalizedMessage.includes("invalid login credentials") ||
    normalizedMessage.includes("invalid credentials")
  ) {
    return "Email o contrasena incorrectos.";
  }

  return "No pudimos iniciar sesion. Revisa los datos e intenta nuevamente.";
}

export function LoginForm({ accessError, redirectTo }: LoginFormProps) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const normalizedEmail = email.trim();
    const nextFieldErrors = validateLogin(normalizedEmail, password);
    setFieldErrors(nextFieldErrors);
    setFormError(null);

    if (Object.keys(nextFieldErrors).length > 0) {
      return;
    }

    setIsLoading(true);

    const supabase = createClient();
    const { error } = await supabase.auth.signInWithPassword({
      email: normalizedEmail,
      password,
    });

    if (error) {
      setFormError(getLoginErrorMessage(error.message));
      setIsLoading(false);
      return;
    }

    router.replace(redirectTo);
    router.refresh();
  }

  return (
    <div className="w-full">
      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-teal-700">
        Acceso
      </p>
      <h1 className="mt-2 text-2xl font-semibold tracking-tight text-slate-950">
        Iniciar sesion
      </h1>
      <p className="mt-3 text-sm leading-6 text-slate-600">
        Ingresa con tus credenciales para acceder al panel interno.
      </p>

      {accessError ? (
        <div className="mt-5">
          <FormAlert>{accessError}</FormAlert>
        </div>
      ) : null}

      <form method="post" className="mt-6 space-y-5" noValidate onSubmit={handleSubmit}>
        <div>
          <Label htmlFor="email">Email</Label>
          <Input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            disabled={isLoading}
            aria-invalid={Boolean(fieldErrors.email)}
            aria-describedby={fieldErrors.email ? "email-error" : undefined}
          />
          {fieldErrors.email ? (
            <FieldError id="email-error">{fieldErrors.email}</FieldError>
          ) : null}
        </div>

        <div>
          <Label htmlFor="password">Contrasena</Label>
          <Input
            id="password"
            name="password"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            disabled={isLoading}
            aria-invalid={Boolean(fieldErrors.password)}
            aria-describedby={
              fieldErrors.password ? "password-error" : undefined
            }
          />
          {fieldErrors.password ? (
            <FieldError id="password-error">
              {fieldErrors.password}
            </FieldError>
          ) : null}
        </div>

        {formError ? <FormAlert>{formError}</FormAlert> : null}

        <Button
          type="submit"
          disabled={isLoading}
          className="w-full"
        >
          {isLoading ? "Ingresando..." : "Ingresar"}
        </Button>
      </form>
    </div>
  );
}
