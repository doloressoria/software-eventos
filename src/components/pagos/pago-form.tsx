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
import { moneyCents, moneyText } from "@/lib/catering/cobro-calculos";
import { cantidadPax, totalVistaPrevia, type OpcionCobertura } from "@/lib/catering/coberturas";
import { categoriasPax, type CategoriaPax } from "@/lib/eventos/asistentes";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PagoImputacionesFields } from "@/components/pagos/pago-imputaciones-fields";
import { useExportForm } from "@/components/commercial-export";

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
  const [state, formAction, pending] = useActionState(action, initialState);
  const id = useId();
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state.successMessage && !editing) {
      if (requestId.current === state.solicitudConfirmada) requestId.current = null;
      formRef.current?.reset();
    }
  }, [state, editing]);
  useExportForm(formRef, pending, Boolean(state.successMessage), state);

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
  const [iva, setIva] = useState("0");
  const [capitalExtra, setCapitalExtra] = useState("0");
  const [cantidades, setCantidades] = useState<Partial<Record<CategoriaPax, string>>>({});
  const opciones = coberturas ?? [];
  const catering = opciones.find((option) => option.id === cateringId) ?? opciones[0];
  const porPersonas = modo === "personas" && catering;
  const tarifas = catering?.tarifas ?? [];
  const separado = catering?.fiscal?.version_calculo === 2;
  const capitalPax = totalVistaPrevia(tarifas, cantidades);
  const extraCents = moneyCents(capitalExtra);
  const ivaCents = moneyCents(iva);
  const coberturaTotal = porPersonas ? capitalPax + (separado ? Number((extraCents ?? BigInt(0)) + (ivaCents ?? BigInt(0))) / 100 : 0) : undefined;
  const ivaDisponible = Math.max((catering?.fiscal?.iva_pendiente ?? 0) - (catering?.fiscal?.iva_reservado ?? 0), 0);

  return <>
    {opciones.length > 0 && <fieldset key={modo} className="md:col-span-2">
      <legend className="mb-2 text-sm font-medium">Modo de pago</legend>
      <div className="flex flex-wrap gap-4">
        <label className="flex items-center gap-2 text-sm"><input type="radio" name="modo_pago" value="importe" checked={modo === "importe"} onChange={() => setModo("importe")} /> Pagar por importe</label>
        <label className="flex items-center gap-2 text-sm"><input type="radio" name="modo_pago" value="personas" checked={modo === "personas"} onChange={() => setModo("personas")} /> Capital / PAX e IVA</label>
      </div>
    </fieldset>}
    {porPersonas && <fieldset className="grid gap-4 rounded-lg border p-4 md:col-span-2 sm:grid-cols-2">
      <legend className="px-1 text-sm font-medium">{separado ? "Capital e IVA a cancelar" : "Personas a cubrir · modelo histórico con IVA incluido"}</legend>
      <input type="hidden" name="version_calculo" value={separado ? "2" : "1"} />
      <input type="hidden" name="cobertura_catering" value={catering.id} />
      {opciones.length > 1 ? <div className="sm:col-span-2">
        <Label htmlFor={`${id}-catering`}>Catering</Label>
        <Select value={catering.id} onValueChange={(value) => {
          setCateringId(value);
          setCantidades({});
          setIva("0");
          setCapitalExtra("0");
        }}>
          <SelectTrigger id={`${id}-catering`}><SelectValue /></SelectTrigger>
          <SelectContent>{opciones.map((opcion) => <SelectItem key={opcion.id} value={opcion.id}>{opcion.label}</SelectItem>)}</SelectContent>
        </Select>
      </div> : null}
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
            {currency.format(precio)} por persona {separado ? "de capital sin IVA" : "con IVA"} · {maximo} disponibles
            {cantidad > 0 && ` · ${currency.format(cantidad * precio)}`}
          </p>
        </div>;
      })}
      {separado && <>
        <div>
          <Label htmlFor={`${id}-capital-extra`}>Otro capital por importe (ARS)</Label>
          <Input id={`${id}-capital-extra`} name="capital_extra_ars" type="number" min="0" max="9999999999.99" step="0.01" value={capitalExtra} onChange={e => setCapitalExtra(e.target.value)} />
          <p className="mt-1 text-xs text-slate-600">Cargos fijos, comisión, su IVA o anticipo: reduce deuda sin cubrir PAX.</p>
        </div>
        <div>
          <Label htmlFor={`${id}-iva`}>IVA catering a cancelar (ARS)</Label>
          <Input id={`${id}-iva`} name="iva_ars" type="number" min="0" max={ivaDisponible} step="0.01" value={iva} onChange={e => setIva(e.target.value)} />
          <button type="button" className="mt-1 text-xs underline" onClick={() => setIva(moneyText(moneyCents(ivaDisponible.toFixed(2))!))}>Incluir todo el IVA disponible: {currency.format(ivaDisponible)}</button>
          <p className="mt-1 text-xs text-slate-600">Podés cobrar sólo IVA, sólo capital o ambos. El IVA no cubre personas.</p>
        </div>
      </>}
      <p className="text-sm font-medium sm:col-span-2" aria-live="polite">Objetivo a cancelar: {currency.format(coberturaTotal ?? 0)}</p>
    </fieldset>}
    {!porPersonas && catering?.fiscal?.version_calculo === 2 && <p className="text-xs text-slate-600 md:col-span-2">Los importes destinados a catering se registran como capital sin cobertura de PAX. Para identificar IVA, elegí Capital / PAX e IVA.</p>}
    <PagoMoneyFields key={JSON.stringify([state.fields, state.imputaciones, state.solicitudConfirmada, state.successMessage])}
      state={state} coberturaTotal={coberturaTotal}>
      {!porPersonas && destinos ? (equivalent) => (
        <PagoImputacionesFields destinos={destinos} initial={state.imputaciones} equivalent={equivalent} />
      ) : undefined}
    </PagoMoneyFields>
  </>;
}
