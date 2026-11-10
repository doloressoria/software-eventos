"use client";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import Link from "next/link";
import { type FormEvent, useRef, useState } from "react";
import { NewPasswordFields } from "@/components/auth/new-password-fields";
import { Button, buttonVariants } from "@/components/ui/button";
import { FormAlert } from "@/components/ui/form";
import { validateNewPassword } from "@/lib/auth/new-password";
import type { Database } from "@/types/database.types";

export function SetPasswordForm() {
  const recovery = useRef<SupabaseClient<Database>["auth"] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [saved, setSaved] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const password = String(data.get("password") ?? "");
    const validationError = validateNewPassword(password, data.get("confirmation"));
    setError(validationError);
    if (validationError) return;

    setPending(true);
    try {
      if (!recovery.current) {
        const token = new URLSearchParams(window.location.hash.slice(1)).get("token_hash");
        if (!token) {
          setError("Abrí el enlace para definir la contraseña que recibiste por correo.");
          return;
        }

        // Keep the recovery session in memory so it cannot replace a signed-in account.
        const { auth } = createClient<Database>(
          process.env.NEXT_PUBLIC_SUPABASE_URL!,
          process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
          {
            auth: {
              storageKey: "software-eventos-recovery",
              persistSession: false,
              autoRefreshToken: false,
              detectSessionInUrl: false,
            },
          },
        );
        const { data, error } = await auth.verifyOtp({ type: "recovery", token_hash: token });
        if (error || !data.session) {
          const invalid = !error || error.code === "otp_expired" || error.code === "user_banned";
          setError(invalid
            ? "El enlace ya no es válido. Pedile a un administrador que te envíe uno nuevo."
            : "No pudimos verificar el enlace. Volvé a intentar.");
          return;
        }
        recovery.current = auth;
        window.history.replaceState(null, "", window.location.pathname);
      }

      const { error } = await recovery.current.updateUser({ password });
      if (error) {
        setError(error.code === "weak_password"
          ? "Elegí una contraseña más segura."
          : "No se pudo guardar la contraseña. Volvé a intentar.");
        return;
      }

      const auth = recovery.current;
      recovery.current = null;
      setSaved(true);
      await auth.signOut({ scope: "local" });
    } catch {
      setError("No se pudo completar la operación. Volvé a intentar.");
    } finally {
      setPending(false);
    }
  }

  if (saved) {
    return (
      <div className="space-y-4">
        <FormAlert variant="success">Tu contraseña se guardó correctamente.</FormAlert>
        <Link href="/login" className={buttonVariants()}>Ir al inicio de sesión</Link>
      </div>
    );
  }

  return (
    <form method="post" className="space-y-5" onSubmit={handleSubmit}>
      <NewPasswordFields />
      {error && <FormAlert>{error}</FormAlert>}
      <Button type="submit" disabled={pending}>
        {pending ? "Guardando…" : "Guardar contraseña"}
      </Button>
    </form>
  );
}
