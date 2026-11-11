"use client";

import { useActionState } from "react";
import type { ConfirmarEventoState } from "@/app/(protected)/eventos/actions";
import { SubmitButton } from "@/components/salones/submit-button";
import { FormAlert } from "@/components/ui/form";

type ConfirmarEventoFormProps = {
  action: (
    previousState: ConfirmarEventoState,
    formData: FormData,
  ) => Promise<ConfirmarEventoState>;
};

export function ConfirmarEventoForm({ action }: ConfirmarEventoFormProps) {
  const [state, formAction] = useActionState(action, {});

  return (
    <form action={formAction} className="flex flex-col gap-2">
      <SubmitButton pendingLabel="Confirmando...">
        Confirmar evento
      </SubmitButton>
      {state.formError ? <FormAlert>{state.formError}</FormAlert> : null}
    </form>
  );
}
