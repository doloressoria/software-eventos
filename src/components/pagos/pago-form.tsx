"use client";

import { useActionState, useEffect, useRef, useId, useState } from "react";
import { SubmitButton } from "@/components/salones/submit-button";
import {
  FormAlert,
  Input,
  Label,
  Textarea,
} from "@/components/ui/form";
import type { ImputacionDestino, PagoFormState } from "@/lib/pagos/validation";
import { PagoMoneyFields } from "@/components/pagos/pago-money-fields";
import { cantidadPax, totalVistaPrevia, type OpcionCobertura } from "@/lib/catering/coberturas";
import { categoriasPax, type CategoriaPax } from "@/lib/eventos/asistentes";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PagoImputacionesFields } from "@/components/pagos/pago-imputaciones-fields";

const currency = new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS" });

type PagoFormProps = {
  action: (
    previousState: PagoFormState,
    formData: FormData,
  ) => Promise<PagoFormState>;
  initialState: PagoFormState;
  destinos?: ImputacionDestino[];
  coberturas?: OpcionCobertura[];
  editing?: boolean;
};

export function PagoForm({ action, initialState, destinos, coberturas, editing = false }: PagoFormProps) {
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
      {(destinos || coberturas?.length) && !editing ? <input type="hidden" name="solicitud" ref={requestInput} /> : null}
      <div className="grid gap-5 md:grid-cols-2">
        <ModoPagoFields key={state.solicitudConfirmada ?? "nuevo"} state={state}
          destinos={destinos} coberturas={editing ? undefined : coberturas} />

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

function ModoPagoFields({ state, destinos, coberturas }: {
  state: PagoFormState;
  destinos?: ImputacionDestino[];
  coberturas?: OpcionCobertura[];
}) {
  const id = useId();
  const [modo, setModo] = useState("importe");
  const [cateringId, setCateringId] = useState(coberturas?.[0]?.id ?? "");
  const [cantidades, setCantidades] = useState<Partial<Record<CategoriaPax, string>>>({});
  const opciones = coberturas ?? [];
  const catering = opciones.find((option) => option.id === cateringId) ?? opciones[0];
  const porPersonas = modo === "personas" && catering;
  const tarifas = catering?.tarifas ?? [];
  const coberturaTotal = porPersonas ? totalVistaPrevia(tarifas, cantidades) : undefined;

  return <>
    {opciones.length > 0 && <fieldset className="md:col-span-2">
      <legend className="mb-2 text-sm font-medium">Modo de pago</legend>
      <div className="flex flex-wrap gap-4">
        <label className="flex items-center gap-2 text-sm"><input type="radio" name="modo_pago" value="importe" checked={modo === "importe"} onChange={() => setModo("importe")} /> Pagar por importe</label>
        <label className="flex items-center gap-2 text-sm"><input type="radio" name="modo_pago" value="personas" checked={modo === "personas"} onChange={() => setModo("personas")} /> Pagar por personas</label>
      </div>
    </fieldset>}
    {porPersonas && <fieldset className="grid gap-4 rounded-lg border p-4 md:col-span-2 sm:grid-cols-2">
      <legend className="px-1 text-sm font-medium">Personas a cubrir</legend>
      {opciones.length > 1 ? <div className="sm:col-span-2">
        <Label htmlFor={`${id}-catering`}>Catering</Label>
        <Select name="cobertura_catering" value={catering.id} onValueChange={(value) => {
          setCateringId(value);
          setCantidades({});
        }}>
          <SelectTrigger id={`${id}-catering`}><SelectValue /></SelectTrigger>
          <SelectContent>{opciones.map((opcion) => <SelectItem key={opcion.id} value={opcion.id}>{opcion.label}</SelectItem>)}</SelectContent>
        </Select>
      </div> : <input type="hidden" name="cobertura_catering" value={catering.id} />}
      {categoriasPax.map(([categoria, label]) => {
        const tarifa = tarifas.find((t) => t.categoria === categoria);
        const precio = tarifa?.precio_aplicado ?? 0;
        const cantidad = cantidadPax(cantidades[categoria] ?? "");
        const maximo = Math.max((tarifa?.pendientes ?? 0) - (tarifa?.por_acreditar ?? 0), 0);
        return <div key={categoria}>
          <Label htmlFor={`${id}-${categoria}`}>{label}</Label>
          <Input id={`${id}-${categoria}`} name={`cantidad_${categoria}`} type="number" min={0} max={maximo} step={1}
            disabled={precio <= 0 || maximo === 0} value={cantidades[categoria] ?? ""}
            aria-describedby={`${id}-${categoria}-detalle`}
            onChange={(e) => setCantidades((current) => ({ ...current, [categoria]: e.target.value }))} />
          <input type="hidden" name={`aplicado_${categoria}`} value={precio.toFixed(2)} />
          <p id={`${id}-${categoria}-detalle`} className="mt-1 text-xs text-slate-600">
            {currency.format(precio)} por persona con IVA · {maximo} disponibles
            {cantidad > 0 && ` · ${currency.format(cantidad * precio)}`}
          </p>
        </div>;
      })}
      <p className="text-sm font-medium sm:col-span-2" aria-live="polite">Importe por personas: {currency.format(coberturaTotal ?? 0)}</p>
    </fieldset>}
    <PagoMoneyFields key={JSON.stringify([state.fields, state.imputaciones, state.solicitudConfirmada, state.successMessage])}
      state={state} coberturaTotal={coberturaTotal}>
      {!porPersonas && destinos ? (equivalent) => (
        <PagoImputacionesFields destinos={destinos} initial={state.imputaciones} equivalent={equivalent} />
      ) : undefined}
    </PagoMoneyFields>
  </>;
}
