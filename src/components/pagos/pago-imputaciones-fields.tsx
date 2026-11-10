"use client";

import { useId, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/form";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { parsePaymentDecimal, type ImputacionDestino, type ImputacionInput } from "@/lib/pagos/validation";

const money = new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS" });
const emptyLine = { destino: "", importe: "" };

export function PagoImputacionesFields({ destinos, initial, equivalent }: {
  destinos: ImputacionDestino[];
  initial?: ImputacionInput[];
  equivalent: number | null;
}) {
  const id = useId();
  const [lines, setLines] = useState(() => (initial?.length ? initial : [emptyLine])
    .map((line, key) => ({ ...line, key })));
  const nextKey = useRef(lines.length);
  const distributedCents = lines.reduce((sum, line) =>
    sum + Math.round((parsePaymentDecimal(line.importe, 2, 10) ?? 0) * 100), 0);
  const remaining = equivalent === null ? null : (Math.round(equivalent * 100) - distributedCents) / 100;

  function update(key: number, fields: Partial<ImputacionInput>) {
    setLines(lines.map((line) => line.key === key ? { ...line, ...fields } : line));
  }

  return (
    <fieldset className="space-y-3 md:col-span-2">
      <legend className="mb-2 text-sm font-medium">Imputaciones en ARS</legend>
      {lines.map(({ key, destino, importe }, index) => (
        <div className="grid items-end gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,10rem)_auto]" key={key}>
          <div>
            <Label htmlFor={`${id}-destino-${key}`}>Destino {index + 1}</Label>
            <Select name="destino" value={destino} required onValueChange={(value) => update(key, { destino: value })}>
              <SelectTrigger id={`${id}-destino-${key}`}><SelectValue placeholder="Elegí un destino" /></SelectTrigger>
              <SelectContent>
                {destinos.map((option) => (
                  <SelectItem key={option.value} value={option.value}
                    disabled={lines.some((line) => line.key !== key && line.destino === option.value)}>
                    {option.label} · saldo {money.format(option.saldoPendiente)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label htmlFor={`${id}-importe-${key}`}>Importe ARS</Label>
            <Input id={`${id}-importe-${key}`} name="importe_ars" type="number" min="0.01" step="0.01"
              value={importe} onChange={(event) => update(key, { importe: event.target.value })} required />
          </div>
          <Button type="button" variant="secondary" disabled={lines.length === 1}
            aria-label={`Quitar imputación ${index + 1}`}
            onClick={() => setLines(lines.filter((line) => line.key !== key))}>Quitar</Button>
        </div>
      ))}
      <p className="text-sm" aria-live="polite">
        {remaining === null ? "Ingresá el importe y la cotización para calcular el reparto."
          : remaining < 0 ? `Exceso distribuido ${money.format(-remaining)}`
          : `Falta distribuir ${money.format(remaining)}`}
      </p>
      <Button type="button" variant="secondary" disabled={lines.length >= Math.min(50, destinos.length)}
        onClick={() => setLines([...lines, { ...emptyLine, key: nextKey.current++ }])}>Agregar imputación</Button>
    </fieldset>
  );
}
