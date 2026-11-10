"use client";

import { useActionState, useEffect, useRef, useId } from "react";
import { SubmitButton } from "@/components/salones/submit-button";
import {
  FormAlert,
  Input,
  Label,
  Textarea,
} from "@/components/ui/form";
import type { ImputacionDestino, PagoFormState } from "@/lib/pagos/validation";
import { PagoMoneyFields } from "@/components/pagos/pago-money-fields";
import { PagoImputacionesFields } from "@/components/pagos/pago-imputaciones-fields";

type PagoFormProps = {
  action: (
    previousState: PagoFormState,
    formData: FormData,
  ) => Promise<PagoFormState>;
  initialState: PagoFormState;
  destinos?: ImputacionDestino[];
  editing?: boolean;
};

export function PagoForm({ action, initialState, destinos, editing = false }: PagoFormProps) {
  const requestInput = useRef<HTMLInputElement>(null);
  const requestId = useRef<string | null>(null);
  const [state, formAction] = useActionState(action, initialState);
  const id = useId();
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state.successMessage && !editing) {
      if (requestId.current === state.solicitudConfirmada) requestId.current = null;
      formRef.current?.reset();
    }
  }, [state, editing]);

  return (
    <form ref={formRef} action={formAction} className="space-y-5" noValidate onSubmit={() => {
      const input = requestInput.current;
      if (input) {
        requestId.current ??= crypto.randomUUID();
        input.value = requestId.current;
      }
    }}>
      {destinos && !editing && <input type="hidden" name="solicitud" ref={requestInput} />}
      <div className="grid gap-5 md:grid-cols-2">
        <PagoMoneyFields key={JSON.stringify([state.fields, state.imputaciones, state.solicitudConfirmada, state.successMessage])} state={state}>
          {destinos ? (equivalent) => (
            <PagoImputacionesFields destinos={destinos} initial={state.imputaciones} equivalent={equivalent} />
          ) : undefined}
        </PagoMoneyFields>

        <div>
          <Label htmlFor={`${id}-concepto`}>Concepto</Label>
          <Input
            id={`${id}-concepto`}
            name="concepto"
            type="text"
            defaultValue={state.fields.concepto}
          />
        </div>

        <div className="md:col-span-2">
          <Label htmlFor={`${id}-notas`}>Notas</Label>
          <Textarea
            id={`${id}-notas`}
            name="notas"
            rows={3}
            defaultValue={state.fields.notas}
          />
        </div>
      </div>

      {state.formError ? <FormAlert>{state.formError}</FormAlert> : null}
      {state.successMessage ? (
        <FormAlert variant="success">{state.successMessage}</FormAlert>
      ) : null}

      <div className="flex justify-end">
        <SubmitButton pendingLabel="Registrando...">
          {editing ? "Guardar cambios" : "Registrar pago"}
        </SubmitButton>
      </div>
    </form>
  );
}
