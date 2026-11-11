"use client";

import { useActionState, useId, useState, useRef } from "react";
import { useExportForm } from "@/components/commercial-export";
import type { DeletePagoState } from "@/app/(protected)/pagos/actions";
import { SubmitButton } from "@/components/salones/submit-button";
import { FormAlert, Input, Label } from "@/components/ui/form";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { ImputacionDestino } from "@/lib/pagos/validation";

export function ReasignarExcedenteForm({ action, destinos, maximo, precio }: {
  action: (state: DeletePagoState, form: FormData) => Promise<DeletePagoState>;
  destinos: ImputacionDestino[];
  maximo: number;
  precio: number;
}) {
  const [state, formAction, pending] = useActionState(action, {});
  const formRef = useRef<HTMLFormElement>(null);
  useExportForm(formRef, pending, !state.formError, state);
  const [cantidad, setCantidad] = useState(String(maximo));
  const id = useId();
  const importe = new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS" }).format(Number(cantidad) * precio);
  return <details className="mt-2 rounded-md border p-2">
    <summary className="cursor-pointer text-sm font-medium">Reasignar excedente</summary>
    <form ref={formRef} action={formAction} className="mt-2 min-w-56 space-y-3">
      <div>
        <Label htmlFor={`${id}-cantidad`}>Personas a liberar (hasta {maximo})</Label>
        <Input id={`${id}-cantidad`} name="cantidad" type="number" min={1} max={maximo} step={1} required value={cantidad}
          onChange={(event) => setCantidad(event.target.value)} />
      </div>
      <p className="text-xs text-slate-600" aria-live="polite">{importe} al precio histórico, dentro de este cobro.</p>
      <div>
        <Label htmlFor={`${id}-destino`}>Destino del excedente</Label>
        <Select name="destino" required>
          <SelectTrigger id={`${id}-destino`}><SelectValue placeholder="Elegí un destino" /></SelectTrigger>
          <SelectContent>{destinos.map((destino) => <SelectItem key={destino.value} value={destino.value}>{destino.label}</SelectItem>)}</SelectContent>
        </Select>
      </div>
      {state.formError && <FormAlert>{state.formError}</FormAlert>}
      <SubmitButton pendingLabel="Reasignando…">Confirmar reasignación</SubmitButton>
    </form>
  </details>;
}
