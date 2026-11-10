"use client";

import { useActionState } from "react";
import { NewPasswordFields } from "@/components/auth/new-password-fields";
import { Button } from "@/components/ui/button";
import { FormAlert, Input, Label } from "@/components/ui/form";
import { changePasswordAction } from "./actions";

export function ChangePasswordForm() {
  const [state, action, pending] = useActionState(changePasswordAction, null);

  if (state && "success" in state) {
    return <FormAlert variant="success">Tu contraseña se actualizó correctamente.</FormAlert>;
  }

  return (
    <form action={action} className="space-y-5">
      <div>
        <Label htmlFor="current_password">Contraseña actual</Label>
        <Input id="current_password" name="current_password" type="password" autoComplete="current-password" required />
      </div>
      <NewPasswordFields />
      {state?.error && <FormAlert>{state.error}</FormAlert>}
      <Button type="submit" disabled={pending}>
        {pending ? "Guardando…" : "Guardar nueva contraseña"}
      </Button>
    </form>
  );
}
