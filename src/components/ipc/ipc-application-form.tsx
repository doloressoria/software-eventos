"use client";

import { useActionState, useState } from "react";
import { SubmitButton } from "@/components/salones/submit-button";
import { Alert } from "@/components/ui/alert";
import { DatePickerField } from "@/components/ui/date-picker-field";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { IpcFormState } from "@/lib/ipc/validation";

type Props = {
  action: (state: IpcFormState, data: FormData) => Promise<IpcFormState>;
  emptyState: IpcFormState;
};
export function IpcApplicationForm({ action, emptyState }: Props) {
  const [state, formAction, pending] = useActionState(action, emptyState);
  const [fields, setFields] = useState(emptyState.fields);
  const current = Object.entries(fields).every(([key, value]) => value.trim() === state.fields[key as keyof typeof fields]);
  return (
    <form action={formAction} className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="space-y-2">
          <Label htmlFor="ipc-periodo">Período del índice</Label>
          <Input id="ipc-periodo" name="periodo" type="month" required value={fields.periodo}
            onChange={(e) => setFields({ ...fields, periodo: e.target.value })}
            aria-invalid={Boolean(state.errors.periodo)} aria-describedby="ipc-periodo-error" />
          <p id="ipc-periodo-error" className="text-sm text-red-700">{state.errors.periodo}</p>
        </div>
        <div className="space-y-2">
          <Label htmlFor="ipc-vigencia">Fecha de vigencia en Argentina</Label>
          <DatePickerField id="ipc-vigencia" name="fecha_vigencia" value={fields.fecha_vigencia} required
            onValueChange={(value) => setFields({ ...fields, fecha_vigencia: value })}
            aria-invalid={Boolean(state.errors.fecha_vigencia)} aria-describedby="ipc-vigencia-error" />
          <p id="ipc-vigencia-error" className="text-sm text-red-700">{state.errors.fecha_vigencia}</p>
        </div>
        <div className="space-y-2">
          <Label htmlFor="ipc-variacion">Variación IPC (%)</Label>
          <Input id="ipc-variacion" name="variacion_porcentual" inputMode="decimal" placeholder="Ej.: 2,5"
            value={fields.variacion_porcentual} onChange={(e) => setFields({ ...fields, variacion_porcentual: e.target.value })}
            aria-invalid={Boolean(state.errors.variacion_porcentual)} aria-describedby="ipc-variacion-help ipc-variacion-error" />
          <p id="ipc-variacion-help" className="text-xs text-slate-500">En blanco usa el índice registrado. Si falta, no se aplicará el ajuste.</p>
          <p id="ipc-variacion-error" className="text-sm text-red-700">{state.errors.variacion_porcentual}</p>
        </div>
      </div>
      {current && state.formError && <Alert variant="destructive">{state.formError}</Alert>}
      {current && state.successMessage && <Alert variant="success">{state.successMessage}</Alert>}
      <SubmitButton pendingLabel="Procesando...">Previsualizar ajuste</SubmitButton>
      {current && state.preview && (
        <div className="space-y-3">
          <p className="text-sm text-slate-600">Estimación con datos actuales y cheques que acreditan hasta la vigencia. La ejecución vuelve a evaluar confirmaciones y saldos.</p>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <caption className="sr-only">Previsualización del IPC por destino</caption>
              <thead><tr>{["Destino", "Saldo anterior", "Incremento", "Saldo proyectado"].map((label) => <th key={label} scope="col" className="p-2 text-left">{label}</th>)}</tr></thead>
              <tbody>{state.preview.map((row) => <tr key={row.evento_servicio_id ?? row.catering_contrato_id}>
                <td className="p-2">{row.evento_nombre} — {row.destino_nombre}</td>
                {[row.saldo_anterior, row.incremento, row.saldo_proyectado].map((value, i) => <td key={i} className="p-2">{money(value)}</td>)}
              </tr>)}</tbody>
            </table>
          </div>
          {!state.preview.length && <p className="text-sm">No hay destinos elegibles con los datos actuales.</p>}
        </div>
      )}
      <p className="text-sm text-slate-600">El IPC se registra como cargo separado del IVA y se cobra por importe. No modifica tarifas ni coberturas PAX. Sólo alcanza eventos confirmados; excluye catering externo. Si la ejecución se demora a otro día, quedará en revisión.</p>
      <label className="flex items-start gap-2 text-sm">
        <input name="confirmar" type="checkbox" value="true" className="mt-1" />
        Confirmo la ejecución automática en la fecha indicada. Para cargar un índice faltante o reprogramar, usá el mismo período.
      </label>
      <button type="submit" name="accion" value="programar" disabled={pending}
        className="rounded-lg bg-teal-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">
        {pending ? "Procesando..." : "Guardar programación"}
      </button>
    </form>
  );
}
function money(value: number) {
  return new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS" }).format(value);
}
