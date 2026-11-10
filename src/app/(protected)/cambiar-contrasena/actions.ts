"use server";

import { redirect } from "next/navigation";
import { validateNewPassword } from "@/lib/auth/new-password";
import { createClient } from "@/lib/supabase/server";

type ChangePasswordState = { error: string } | { success: true } | null;

export async function changePasswordAction(
  _previousState: ChangePasswordState,
  formData: FormData,
): Promise<ChangePasswordState> {
  const currentPassword = formData.get("current_password");
  const password = formData.get("password");
  const confirmation = formData.get("confirmation");

  if (typeof currentPassword !== "string" || !currentPassword) {
    return { error: "Ingresá tu contraseña actual." };
  }
  const validationError = validateNewPassword(password, confirmation);
  if (validationError || typeof password !== "string") {
    return { error: validationError ?? "Ingresá una contraseña nueva." };
  }
  if (password === currentPassword) return { error: "Elegí una contraseña distinta de la actual." };

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user?.email) redirect("/login?redirectedFrom=/cambiar-contrasena");

  // Sign in again so the current password is checked regardless of the project's Auth settings.
  const { error: signInError } = await supabase.auth.signInWithPassword({
    email: user.email,
    password: currentPassword,
  });
  if (signInError) {
    return {
      error: signInError.code === "invalid_credentials"
        ? "La contraseña actual es incorrecta."
        : "No se pudo verificar la contraseña actual. Volvé a intentar.",
    };
  }

  const { error } = await supabase.auth.updateUser({ password, current_password: currentPassword });
  if (error?.code === "weak_password") return { error: "Elegí una contraseña más segura." };
  if (error) return { error: "No se pudo cambiar la contraseña. Volvé a intentar." };

  return { success: true };
}
