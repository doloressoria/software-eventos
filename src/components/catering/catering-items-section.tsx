"use client";

import { useActionState, useEffect, useRef } from "react";
import { useExportForm } from "@/components/commercial-export";
import {
  addCateringItemAction,
  deleteCateringItemAction,
} from "@/app/(protected)/catering/actions";
import { DeleteCateringItemForm } from "@/components/catering/delete-catering-item-form";
import { SubmitButton } from "@/components/salones/submit-button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { FieldError, FormAlert, Input, Label } from "@/components/ui/form";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  CATERING_ADICIONAL_CATEGORIAS,
  getCateringAdicionalLabel,
  type CateringAdicionalCategoria,
} from "@/lib/catering/types";
import { getEmptyCateringItemFormState } from "@/lib/catering/item-validation";
import type { CateringItemRow } from "@/lib/catering/queries";

type CateringItemsSectionProps = {
  cateringId: string;
  items: CateringItemRow[];
};

export function CateringItemsSection({ cateringId, items }: CateringItemsSectionProps) {
  const [state, formAction, pending] = useActionState(
    addCateringItemAction.bind(null, cateringId),
    getEmptyCateringItemFormState(),
  );
  const formRef = useRef<HTMLFormElement>(null);
  const total = items.reduce((sum, item) => sum + (item.precio_unitario ?? 0), 0);

  useEffect(() => {
    if (state.successMessage) {
      formRef.current?.reset();
    }
  }, [state.successMessage]);
  useExportForm(formRef, pending, Boolean(state.successMessage), state);

  return (
    <Card>
      <CardHeader className="flex flex-col gap-2 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <CardTitle>Adicionales</CardTitle>
          <CardDescription>
            Alimentos, bebidas alcoholicas y otros adicionales fuera del precio por persona.
          </CardDescription>
        </div>
        <div className="rounded-lg border border-slate-100 bg-slate-50/80 px-4 py-3 text-right">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
            Total adicionales
          </p>
          <p className="mt-1 text-lg font-semibold text-slate-950">
            {formatCurrency(total)}
          </p>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="rounded-lg border border-slate-100">
          {items.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Tipo</TableHead>
                  <TableHead>Detalle</TableHead>
                  <TableHead className="text-right">Precio</TableHead>
                  <TableHead className="text-right">Accion</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((item) => (
                  <TableRow key={item.id}>
                    <TableCell className="text-slate-600">
                      {getCateringAdicionalLabel(
                        item.categoria as CateringAdicionalCategoria,
                      )}
                    </TableCell>
                    <TableCell className="font-medium text-slate-950">
                      {item.descripcion}
                    </TableCell>
                    <TableCell className="text-right text-slate-950">
                      {formatCurrency(item.precio_unitario ?? 0)}
                    </TableCell>
                    <TableCell className="text-right">
                      <DeleteCateringItemForm
                        action={deleteCateringItemAction.bind(null, cateringId, item.id)}
                      />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <EmptyState
              title="Sin adicionales cargados"
              description="Agrega adicionales de alimentos, bebidas u otros si corresponde."
            />
          )}
        </div>

        <div className="rounded-lg border border-slate-100 bg-slate-50/60 p-4 sm:p-5">
          <h3 className="text-sm font-semibold text-slate-950">Agregar adicional</h3>
          <form ref={formRef} action={formAction} className="mt-4 space-y-5" noValidate>
            <div className="grid gap-5 sm:grid-cols-3">
              <div>
                <Label htmlFor="categoria">Tipo</Label>
                <Select name="categoria" defaultValue={state.fields.categoria}>
                  <SelectTrigger id="categoria">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CATERING_ADICIONAL_CATEGORIAS.map((categoria) => (
                      <SelectItem key={categoria} value={categoria}>
                        {getCateringAdicionalLabel(categoria)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="descripcion">Detalle</Label>
                <Input
                  id="descripcion"
                  name="descripcion"
                  type="text"
                  required
                  defaultValue={state.fields.descripcion}
                  aria-invalid={Boolean(state.errors.descripcion)}
                  aria-describedby={
                    state.errors.descripcion ? "descripcion-error" : undefined
                  }
                />
                {state.errors.descripcion ? (
                  <FieldError id="descripcion-error">
                    {state.errors.descripcion}
                  </FieldError>
                ) : null}
              </div>
              <div>
                <Label htmlFor="precio_unitario">Precio</Label>
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
            </div>

            {state.formError ? <FormAlert>{state.formError}</FormAlert> : null}
            {state.successMessage ? (
              <FormAlert variant="success">{state.successMessage}</FormAlert>
            ) : null}

            <div className="flex justify-end">
              <SubmitButton pendingLabel="Agregando...">Agregar adicional</SubmitButton>
            </div>
          </form>
        </div>
      </CardContent>
    </Card>
  );
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat("es-AR", {
    currency: "ARS",
    maximumFractionDigits: 2,
    style: "currency",
  }).format(value);
}
