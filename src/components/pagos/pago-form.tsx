"use client";

import { useActionState, useEffect, useRef, useId } from "react";
import { SubmitButton } from "@/components/salones/submit-button";
import { DatePickerField } from "@/components/ui/date-picker-field";
import {
  FieldError,
  FormAlert,
  Input,
  Label,
  Textarea,
} from "@/components/ui/form";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { PagoFormState } from "@/lib/pagos/validation";
import { PagoMoneyFields } from "@/components/pagos/pago-money-fields";
import type { EventoServicioPagoOption } from "@/lib/evento-servicios/queries";

type PagoFormProps = {
  action: (
    previousState: PagoFormState,
    formData: FormData,
  ) => Promise<PagoFormState>;
  initialState: PagoFormState;
  servicios?: EventoServicioPagoOption[];
  editing?: boolean;
};

export function PagoForm({ action, initialState, servicios, editing = false }: PagoFormProps) {
  const [state, formAction] = useActionState(action, initialState);
  const id = useId();
  const formRef = useRef<HTMLFormElement>(null);
  const fechaPagoValue = state.successMessage && !editing
    ? initialState.fields.fecha_pago
    : state.fields.fecha_pago;
  const eventoServicioValue = state.successMessage && !editing
    ? initialState.fields.evento_servicio_id || "sin_asociar"
    : state.fields.evento_servicio_id || "sin_asociar";

  useEffect(() => {
    if (state.successMessage && !editing) {
      formRef.current?.reset();
    }
  }, [state.successMessage, editing]);

  return (
    <form ref={formRef} action={formAction} className="space-y-5" noValidate>
      <div className="grid gap-5 md:grid-cols-2">
        <PagoMoneyFields key={JSON.stringify([state.fields, state.successMessage])} state={state} />

        <div>
          <Label htmlFor={`${id}-fecha_pago`}>Fecha de pago</Label>
          <DatePickerField
            key={`fecha-pago-${fechaPagoValue}`}
            id={`${id}-fecha_pago`}
            name="fecha_pago"
            required
            defaultValue={fechaPagoValue}
            aria-invalid={Boolean(state.errors.fecha_pago)}
            aria-describedby={
              state.errors.fecha_pago ? `${id}-fecha_pago-error` : undefined
            }
          />
          {state.errors.fecha_pago ? (
            <FieldError id={`${id}-fecha_pago-error`}>
              {state.errors.fecha_pago}
            </FieldError>
          ) : null}
        </div>

        <div>
          <Label htmlFor={`${id}-concepto`}>Concepto</Label>
          <Input
            id={`${id}-concepto`}
            name="concepto"
            type="text"
            defaultValue={state.fields.concepto}
          />
        </div>

        {servicios && (
        <div className="md:col-span-2">
          <Label htmlFor={`${id}-evento_servicio_id`}>Servicio asociado</Label>
          <Select
            name="evento_servicio_id"
            defaultValue={eventoServicioValue}
            key={`servicio-${eventoServicioValue}`}
          >
            <SelectTrigger id={`${id}-evento_servicio_id`}>
              <SelectValue placeholder="Asignar automaticamente" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="sin_asociar">
                Asignar automaticamente
              </SelectItem>
              {servicios.map((servicio) => (
                <SelectItem key={servicio.id} value={servicio.id}>
                  {servicio.label} · saldo {formatCurrency(servicio.saldoPendiente)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        )}

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

function formatCurrency(value: number) {
  return new Intl.NumberFormat("es-AR", {
    currency: "ARS",
    maximumFractionDigits: 2,
    style: "currency",
  }).format(value);
}
