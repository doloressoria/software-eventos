"use client";

import { useId, useState } from "react";
import { FieldError, Input, Label } from "@/components/ui/form";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { pagoFormaPagoOptions, paymentEquivalent, type PagoFormState } from "@/lib/pagos/validation";

export function PagoMoneyFields({ state }: { state: PagoFormState }) {
  const id = useId();
  const [moneda, setMoneda] = useState(state.fields.moneda);
  const [forma, setForma] = useState(state.fields.forma_pago);
  const [monto, setMonto] = useState(state.fields.monto);
  const [cotizacion, setCotizacion] = useState(state.fields.moneda === "USD" ? state.fields.tipo_cambio : "");
  const rate = moneda === "ARS" ? "1" : cotizacion;
  const equivalent = paymentEquivalent(monto, rate);
  const changeCurrency = (value: string) => {
    setMoneda(value);
    if (forma.startsWith("efectivo_")) setForma(value === "USD" ? "efectivo_dolares" : "efectivo_pesos");
    else if (value === "USD") setForma("transferencia");
  };
  const labels: Record<string, string> = { efectivo_pesos: "Efectivo ARS", efectivo_dolares: "Efectivo USD", transferencia: "Transferencia", cheque: "Cheque", retenciones: "Retenciones" };
  return <>
    <div>
      <Label htmlFor={`${id}-moneda`}>Moneda del pago</Label>
      <Select name="moneda" value={moneda} onValueChange={changeCurrency} required>
        <SelectTrigger id={`${id}-moneda`} aria-invalid={Boolean(state.errors.moneda)} aria-describedby={state.errors.moneda ? `${id}-moneda-error` : undefined}><SelectValue /></SelectTrigger>
        <SelectContent><SelectItem value="ARS">ARS · Pesos</SelectItem><SelectItem value="USD">USD · Dólares</SelectItem></SelectContent>
      </Select>
      {state.errors.moneda && <FieldError id={`${id}-moneda-error`}>{state.errors.moneda}</FieldError>}
    </div>
    <div>
      <Label htmlFor={`${id}-forma`}>Forma de pago</Label>
      <Select name="forma_pago" value={forma} onValueChange={setForma} required>
        <SelectTrigger id={`${id}-forma`} aria-invalid={Boolean(state.errors.forma_pago)} aria-describedby={state.errors.forma_pago ? `${id}-forma-error` : undefined}><SelectValue /></SelectTrigger>
        <SelectContent>{pagoFormaPagoOptions.filter(option => moneda === "USD" ? ["transferencia", "efectivo_dolares"].includes(option) : option !== "efectivo_dolares").map(option => <SelectItem key={option} value={option}>{labels[option]}</SelectItem>)}</SelectContent>
      </Select>
      {state.errors.forma_pago && <FieldError id={`${id}-forma-error`}>{state.errors.forma_pago}</FieldError>}
    </div>
    <div>
      <Label htmlFor={`${id}-monto`}>Importe original ({moneda})</Label>
      <Input id={`${id}-monto`} name="monto" type="number" min="0.01" step="0.01" required value={monto} onChange={e => setMonto(e.target.value)} aria-invalid={Boolean(state.errors.monto)} aria-describedby={state.errors.monto ? `${id}-monto-error` : undefined} />
      {state.errors.monto && <FieldError id={`${id}-monto-error`}>{state.errors.monto}</FieldError>}
    </div>
    <div>
      <Label htmlFor={`${id}-cotizacion`}>Cotización (ARS por {moneda})</Label>
      <Input id={`${id}-cotizacion`} name="tipo_cambio" type="number" min="0.0001" step="0.0001" required readOnly={moneda === "ARS"} value={rate} onChange={e => setCotizacion(e.target.value)} aria-invalid={Boolean(state.errors.tipo_cambio)} aria-describedby={state.errors.tipo_cambio ? `${id}-cotizacion-error` : undefined} />
      {state.errors.tipo_cambio && <FieldError id={`${id}-cotizacion-error`}>{state.errors.tipo_cambio}</FieldError>}
    </div>
    <p className="md:col-span-2 text-sm font-medium" aria-live="polite">
      Equivalente en pesos: {equivalent === null ? "Ingresá importe y cotización" : new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS" }).format(equivalent)}
    </p>
    <div>
      <Label htmlFor={`${id}-banco`}>Banco / referencia de transferencia</Label>
      <Input id={`${id}-banco`} name="banco" defaultValue={state.fields.banco} />
    </div>
    <div>
      <Label htmlFor={`${id}-cheque`}>Número de cheque (si corresponde)</Label>
      <Input id={`${id}-cheque`} name="numero_cheque" defaultValue={state.fields.numero_cheque} />
    </div>
    <div className="md:col-span-2">
      <label htmlFor={`${id}-garantia`} className="flex items-center gap-2 text-sm"><input id={`${id}-garantia`} type="checkbox" name="es_garantia" aria-invalid={Boolean(state.errors.es_garantia)} aria-describedby={state.errors.es_garantia ? `${id}-garantia-error` : undefined} defaultChecked={state.fields.es_garantia === "on"} /> Garantía (no reduce deuda ni cuenta como cobro)</label>
      {state.errors.es_garantia && <FieldError id={`${id}-garantia-error`}>{state.errors.es_garantia}</FieldError>}
    </div>
  </>;
}
