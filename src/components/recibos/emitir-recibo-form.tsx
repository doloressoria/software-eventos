"use client";
import { useActionState } from "react";
import { SubmitButton } from "@/components/salones/submit-button";
import { FormAlert } from "@/components/ui/form";

export function EmitirReciboForm({ action }: { action: (state: { error?: string }) => Promise<{ error?: string }> }) {
  const [state, formAction] = useActionState(action, {});
  return <form action={formAction} className="space-y-3">
    <p className="text-sm">Al emitir se guardan los datos actuales. Los cambios posteriores del cobro generan comprobantes vinculados.</p>
    {state.error && <FormAlert>{state.error}</FormAlert>}
    <SubmitButton pendingLabel="Emitiendo…">Emitir recibo y habilitar descarga</SubmitButton>
  </form>;
}
