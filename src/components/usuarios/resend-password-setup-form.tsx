"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { FormAlert } from "@/components/ui/form";

type SendResult = { error?: string; message?: string };

export function ResendPasswordSetupForm({ send }: { send: () => Promise<SendResult> }) {
  const [result, action, pending] = useActionState(send, null);

  return (
    <form action={action} className="max-w-4xl space-y-2">
      <Button type="submit" variant="secondary" disabled={pending}>
        {pending ? "Enviando…" : "Enviar enlace para definir contraseña"}
      </Button>
      {result?.error && <FormAlert>{result.error}</FormAlert>}
      {result?.message && <FormAlert variant="success">{result.message}</FormAlert>}
    </form>
  );
}
