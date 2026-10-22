"use client";

import { useActionState, useEffect, useRef } from "react";
import { useExportForm } from "@/components/commercial-export";
import { addPrecioHistorialAction } from "@/app/(protected)/catering/actions";
import { SubmitButton } from "@/components/salones/submit-button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { DatePickerField } from "@/components/ui/date-picker-field";
import { EmptyState } from "@/components/ui/empty-state";
import { FieldError, FormAlert, Input, Label } from "@/components/ui/form";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { CateringPrecioHistorialItem } from "@/lib/catering/queries";
import { getEmptyPrecioHistorialFormState } from "@/lib/catering/precio-historial-validation";

type PrecioHistorialSectionProps = {
  cateringId: string;
  historial: CateringPrecioHistorialItem[];
  pax: {
    pax_adultos: number | null;
    pax_jovenes: number | null;
    pax_menores: number | null;
    pax_bebes: number | null;
  };
};

export function PrecioHistorialSection({
  cateringId,
  historial,
  pax,
}: PrecioHistorialSectionProps) {
  const [state, formAction, pending] = useActionState(
    addPrecioHistorialAction.bind(null, cateringId),
    getEmptyPrecioHistorialFormState(pax),
  );
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state.successMessage) {
      formRef.current?.reset();
    }
  }, [state.successMessage]);
  useExportForm(formRef, pending, Boolean(state.successMessage), state);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Historial de precio por persona</CardTitle>
        <CardDescription>
          Cada recotizacion agrega una entrada nueva; el precio vigente es el ultimo de la
          lista. Nada se pisa.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="rounded-lg border border-slate-100">
          {historial.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Fecha</TableHead>
                  <TableHead>Motivo</TableHead>
                  <TableHead className="text-right">Precio x persona</TableHead>
                  <TableHead className="text-right">PAX</TableHead>
                  <TableHead>Cargado por</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {historial.map((entry, index) => (
                  <TableRow key={entry.id} className={index === 0 ? "bg-teal-50/40" : undefined}>
                    <TableCell className="whitespace-nowrap text-slate-600">
                      {formatDate(entry.fecha)}
                      {index === 0 ? (
                        <span className="ml-2 rounded-full border border-teal-200 bg-teal-50 px-2 py-0.5 text-xs font-medium text-teal-700">
                          Vigente
                        </span>
                      ) : null}
                    </TableCell>
                    <TableCell className="text-slate-600">{entry.motivo ?? "-"}</TableCell>
                    <TableCell className="text-right font-medium text-slate-950">
                      {formatCurrency(entry.precio_unitario)}
                    </TableCell>
                    <TableCell className="text-right text-slate-600">
                      {sumPax(entry)}
                    </TableCell>
                    <TableCell className="text-slate-600">
                      {entry.usuarios?.full_name ?? entry.usuarios?.email ?? "-"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <EmptyState
              title="Sin historial de precios"
              description="Todavia no se cargo ningun precio por persona."
            />
          )}
        </div>

        <div className="rounded-lg border border-slate-100 bg-slate-50/60 p-4 sm:p-5">
          <h3 className="text-sm font-semibold text-slate-950">Registrar recotizacion</h3>
          <form ref={formRef} action={formAction} className="mt-4 space-y-5" noValidate>
            <div className="grid gap-5 sm:grid-cols-2">
              <div>
                <Label htmlFor="precio_unitario">Nuevo precio por persona</Label>
                <Input
                  id="precio_unitario"
                  name="precio_unitario"
                  type="number"
                  min="0.01"
                  step="0.01"
                  required
                  defaultValue={state.fields.precio_unitario}
                  aria-invalid={Boolean(state.errors.precio_unitario)}
                  aria-describedby={
                    state.errors.precio_unitario ? "precio_unitario-error" : undefined
                  }
                />
                {state.errors.precio_unitario ? (
                  <FieldError id="precio_unitario-error">
                    {state.errors.precio_unitario}
                  </FieldError>
                ) : null}
              </div>
              <div>
                <Label htmlFor="fecha">Fecha del cambio</Label>
                <DatePickerField
                  key={`fecha-${state.fields.fecha}`}
                  id="fecha"
                  name="fecha"
                  required
                  defaultValue={state.fields.fecha}
                  aria-invalid={Boolean(state.errors.fecha)}
                  aria-describedby={state.errors.fecha ? "fecha-error" : undefined}
                />
                {state.errors.fecha ? (
                  <FieldError id="fecha-error">{state.errors.fecha}</FieldError>
                ) : null}
              </div>
              <div className="sm:col-span-2">
                <Label htmlFor="motivo">Motivo / detalle</Label>
                <Input
                  id="motivo"
                  name="motivo"
                  type="text"
                  defaultValue={state.fields.motivo}
                />
              </div>
              <NumberField
                id="pax_adultos"
                label="Adultos"
                defaultValue={state.fields.pax_adultos}
              />
              <NumberField
                id="pax_jovenes"
                label="Jovenes"
                defaultValue={state.fields.pax_jovenes}
              />
              <NumberField
                id="pax_menores"
                label="Menores"
                defaultValue={state.fields.pax_menores}
              />
              <NumberField
                id="pax_bebes"
                label="Bebes"
                defaultValue={state.fields.pax_bebes}
              />
            </div>

            {state.formError ? <FormAlert>{state.formError}</FormAlert> : null}
            {state.successMessage ? (
              <FormAlert variant="success">{state.successMessage}</FormAlert>
            ) : null}

            <div className="flex justify-end">
              <SubmitButton pendingLabel="Guardando...">
                Registrar nuevo precio
              </SubmitButton>
            </div>
          </form>
        </div>
      </CardContent>
    </Card>
  );
}

function NumberField({
  defaultValue,
  id,
  label,
}: {
  defaultValue: string;
  id: string;
  label: string;
}) {
  return (
    <div>
      <Label htmlFor={id}>{label}</Label>
      <Input id={id} name={id} type="number" min="0" step="1" defaultValue={defaultValue} />
    </div>
  );
}

function sumPax(entry: CateringPrecioHistorialItem) {
  return (
    (entry.pax_adultos ?? 0) +
    (entry.pax_jovenes ?? 0) +
    (entry.pax_menores ?? 0) +
    (entry.pax_bebes ?? 0)
  );
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("es-AR", {
    day: "2-digit",
    month: "2-digit",
    timeZone: "UTC",
    year: "numeric",
  }).format(new Date(`${value}T00:00:00.000Z`));
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat("es-AR", {
    currency: "ARS",
    maximumFractionDigits: 2,
    style: "currency",
  }).format(value);
}
