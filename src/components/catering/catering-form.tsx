"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { EventoPickerField } from "@/components/catering/evento-picker-field";
import { SubmitButton } from "@/components/salones/submit-button";
import { buttonVariants } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
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
import { EVENT_TYPES } from "@/lib/eventos/types";
import type { EventoBuscadorResult } from "@/lib/catering/queries";
import type { CateringFormMode, CateringFormState } from "@/lib/catering/validation";

type EjecutivaOption = { id: string; full_name: string; email: string };
type CateringFormProps = {
  action: (
    previousState: CateringFormState,
    formData: FormData,
  ) => Promise<CateringFormState>;
  cancelHref?: string;
  ejecutivas: EjecutivaOption[];
  initialState: CateringFormState;
  isLinkedToEvento?: boolean;
  lockedEvento?: EventoBuscadorResult | null;
  mode: CateringFormMode;
  pendingLabel?: string;
  lugares: string[];
  submitLabel?: string;
};

export function CateringForm({
  action,
  cancelHref = "/catering",
  ejecutivas,
  initialState,
  isLinkedToEvento = false,
  lockedEvento = null,
  mode,
  pendingLabel = "Creando...",
  lugares,
  submitLabel = "Crear catering",
}: CateringFormProps) {
  const [state, formAction] = useActionState(action, initialState);
  const [conEvento, setConEvento] = useState(
    mode === "edit"
      ? isLinkedToEvento
      : lockedEvento
        ? true
        : state.fields.con_evento === "true",
  );
  const [pax, setPax] = useState(() => ({
    pax_adultos: state.fields.pax_adultos || (lockedEvento?.pax_adultos?.toString() ?? ""),
    pax_jovenes: state.fields.pax_jovenes || (lockedEvento?.pax_jovenes?.toString() ?? ""),
    pax_menores: state.fields.pax_menores || (lockedEvento?.pax_menores?.toString() ?? ""),
    pax_bebes: state.fields.pax_bebes || (lockedEvento?.pax_bebes?.toString() ?? ""),
  }));

  function setPaxFromEvento(evento: EventoBuscadorResult) {
    setPax({
      pax_adultos: evento.pax_adultos?.toString() ?? "",
      pax_jovenes: evento.pax_jovenes?.toString() ?? "",
      pax_menores: evento.pax_menores?.toString() ?? "",
      pax_bebes: evento.pax_bebes?.toString() ?? "",
    });
  }

  return (
    <form action={formAction} className="flex max-w-4xl flex-col gap-6" noValidate>
      {mode === "create" && lockedEvento ? (
        <Card>
          <CardHeader>
            <CardTitle>Vinculo con un evento</CardTitle>
            <CardDescription>
              Este catering se esta cargando desde el detalle de un evento y queda vinculado
              a el.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <input type="hidden" name="con_evento" value="true" />
            <Label>Evento vinculado</Label>
            <div className="mt-2">
              <EventoPickerField
                name="evento_id"
                error={state.errors.evento_id}
                initialEvento={lockedEvento}
                onSelect={setPaxFromEvento}
              />
            </div>
          </CardContent>
        </Card>
      ) : mode === "create" ? (
        <Card>
          <CardHeader>
            <CardTitle>Vinculo con un evento</CardTitle>
            <CardDescription>
              Define si este catering pertenece a un evento ya cargado en un salon o si es
              catering externo, sin evento de salon.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="max-w-xs">
              <Label htmlFor="con_evento">¿Esta asociado a un evento de salon?</Label>
              <Select
                name="con_evento"
                value={conEvento ? "true" : "false"}
                onValueChange={(value) => setConEvento(value === "true")}
              >
                <SelectTrigger id="con_evento">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="true">Si, esta vinculado a un evento</SelectItem>
                  <SelectItem value="false">No, es catering externo</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {conEvento ? (
              <div className="mt-5">
                <Label>Evento vinculado</Label>
                <div className="mt-2">
                  <EventoPickerField name="evento_id" error={state.errors.evento_id} onSelect={setPaxFromEvento} />
                </div>
                <p className="mt-2 text-xs text-slate-500">
                  Cliente, fecha, salon, tipo y personas se completan desde el evento seleccionado.
                </p>
              </div>
            ) : null}
          </CardContent>
        </Card>
      ) : isLinkedToEvento ? (
        <input type="hidden" name="con_evento" value="true" />
      ) : (
        <input type="hidden" name="con_evento" value="false" />
      )}

      {!conEvento ? (
        <Card>
          <CardHeader>
            <CardTitle>Cliente y evento</CardTitle>
            <CardDescription>
              Datos propios de este catering, ya que no esta vinculado a un evento de salon.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid gap-5 sm:grid-cols-2">
              <div>
                <Label htmlFor="cliente_nombre">Nombre del cliente</Label>
                <Input
                  id="cliente_nombre"
                  name="cliente_nombre"
                  type="text"
                  required
                  defaultValue={state.fields.cliente_nombre}
                  aria-invalid={Boolean(state.errors.cliente_nombre)}
                  aria-describedby={
                    state.errors.cliente_nombre ? "cliente_nombre-error" : undefined
                  }
                />
                {state.errors.cliente_nombre ? (
                  <FieldError id="cliente_nombre-error">
                    {state.errors.cliente_nombre}
                  </FieldError>
                ) : null}
              </div>
              <TextField
                id="cliente_razon_social"
                label="Razon social"
                defaultValue={state.fields.cliente_razon_social}
              />
              <TextField
                id="cliente_cuit_dni"
                label="CUIT / DNI"
                defaultValue={state.fields.cliente_cuit_dni}
              />
              <TextField
                id="cliente_contacto"
                label="Contacto"
                defaultValue={state.fields.cliente_contacto}
              />
              <div>
                <Label htmlFor="fecha_evento">Fecha del evento</Label>
                <DatePickerField
                  id="fecha_evento"
                  name="fecha_evento"
                  required
                  defaultValue={state.fields.fecha_evento}
                  aria-invalid={Boolean(state.errors.fecha_evento)}
                  aria-describedby={
                    state.errors.fecha_evento ? "fecha_evento-error" : undefined
                  }
                />
                {state.errors.fecha_evento ? (
                  <FieldError id="fecha_evento-error">
                    {state.errors.fecha_evento}
                  </FieldError>
                ) : null}
              </div>
              <div>
                <Label htmlFor="lugar_evento">Lugar del evento</Label>
                <Input
                  id="lugar_evento"
                  name="lugar_evento"
                  list="lugares-catering"
                  required={mode === "create"}
                  defaultValue={state.fields.lugar_evento}
                  aria-invalid={Boolean(state.errors.lugar_evento)}
                  aria-describedby={state.errors.lugar_evento ? "lugar_evento-error" : undefined}
                />
                <datalist id="lugares-catering">
                  {lugares.map((lugar) => <option key={lugar} value={lugar} />)}
                </datalist>
                {state.errors.lugar_evento ? <FieldError id="lugar_evento-error">{state.errors.lugar_evento}</FieldError> : null}
              </div>
              <div>
                <Label htmlFor="tipo_evento">Tipo de evento</Label>
                <Select name="tipo_evento" defaultValue={state.fields.tipo_evento}>
                  <SelectTrigger id="tipo_evento">
                    <SelectValue placeholder="Seleccionar tipo" />
                  </SelectTrigger>
                  <SelectContent>
                    {EVENT_TYPES.map((type) => (
                      <SelectItem key={type} value={type}>
                        {type}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Servicio y responsable</CardTitle>
          <CardDescription>
            Tipo de servicio contratado y ejecutiva de catering responsable.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-5 sm:grid-cols-2">
            <TextField
              id="tipo_servicio"
              label="Tipo de servicio (ej: Fiesta XV - Formal)"
              defaultValue={state.fields.tipo_servicio}
            />
            <div>
              <Label htmlFor="ejecutiva_id">Ejecutiva de catering</Label>
              <Select name="ejecutiva_id" defaultValue={state.fields.ejecutiva_id}>
                <SelectTrigger
                  id="ejecutiva_id"
                  aria-invalid={Boolean(state.errors.ejecutiva_id)}
                >
                  <SelectValue
                    placeholder={
                      ejecutivas.length === 0
                        ? "No hay ejecutivas de catering activas"
                        : "Seleccionar ejecutiva"
                    }
                  />
                </SelectTrigger>
                <SelectContent>
                  {ejecutivas.map((ejecutiva) => (
                    <SelectItem key={ejecutiva.id} value={ejecutiva.id}>
                      {ejecutiva.full_name} - {ejecutiva.email}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {state.errors.ejecutiva_id ? (
                <FieldError id="ejecutiva_id-error">
                  {state.errors.ejecutiva_id}
                </FieldError>
              ) : null}
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>PAX</CardTitle>
          <CardDescription>Cantidad de asistentes desglosada.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-5 sm:grid-cols-4">
            <NumberField
              id="pax_adultos"
              label="Adultos"
              value={pax.pax_adultos}
              onChange={(value) => setPax((current) => ({ ...current, pax_adultos: value }))}
              error={state.errors.pax_adultos}
            />
            <NumberField
              id="pax_jovenes"
              label="Jovenes"
              value={pax.pax_jovenes}
              onChange={(value) => setPax((current) => ({ ...current, pax_jovenes: value }))}
              error={state.errors.pax_jovenes}
            />
            <NumberField
              id="pax_menores"
              label="Menores"
              value={pax.pax_menores}
              onChange={(value) => setPax((current) => ({ ...current, pax_menores: value }))}
              error={state.errors.pax_menores}
            />
            <NumberField
              id="pax_bebes"
              label="Bebes"
              value={pax.pax_bebes}
              onChange={(value) => setPax((current) => ({ ...current, pax_bebes: value }))}
              error={state.errors.pax_bebes}
            />
          </div>
        </CardContent>
      </Card>

      {mode === "create" ? (
        <Card>
          <CardHeader>
            <CardTitle>Precio por persona</CardTitle>
            <CardDescription>
              Primer valor del historial de precios. Los proximos cambios se cargan desde el
              detalle del catering.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid gap-5 sm:grid-cols-2">
              <div>
                <Label htmlFor="precio_unitario_inicial">Precio por persona</Label>
                <Input
                  id="precio_unitario_inicial"
                  name="precio_unitario_inicial"
                  type="number"
                  min="0.01"
                  step="0.01"
                  required
                  defaultValue={state.fields.precio_unitario_inicial}
                  aria-invalid={Boolean(state.errors.precio_unitario_inicial)}
                  aria-describedby={
                    state.errors.precio_unitario_inicial
                      ? "precio_unitario_inicial-error"
                      : undefined
                  }
                />
                {state.errors.precio_unitario_inicial ? (
                  <FieldError id="precio_unitario_inicial-error">
                    {state.errors.precio_unitario_inicial}
                  </FieldError>
                ) : null}
              </div>
              <TextField
                id="precio_motivo_inicial"
                label="Motivo / detalle"
                defaultValue={state.fields.precio_motivo_inicial}
              />
            </div>
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Comision e IVA</CardTitle>
          <CardDescription>
            Comision del organizador (si aplica) e IVA general del catering.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-5 sm:grid-cols-3">
            <MoneyField
              id="comision_organizador_monto"
              label="Comision organizador"
              defaultValue={state.fields.comision_organizador_monto}
              error={state.errors.comision_organizador_monto}
            />
            <PercentageField
              id="iva_comision"
              label="IVA de la comision (%)"
              defaultValue={state.fields.iva_comision}
              error={state.errors.iva_comision}
            />
            <PercentageField
              id="iva_porcentaje"
              label="IVA del catering (%)"
              defaultValue={state.fields.iva_porcentaje}
              error={state.errors.iva_porcentaje}
            />
          </div>

          <div className="mt-5">
            <Label htmlFor="notas">Notas</Label>
            <Textarea
              id="notas"
              name="notas"
              rows={3}
              defaultValue={state.fields.notas}
            />
          </div>

          {state.formError ? (
            <div className="mt-5">
              <FormAlert>{state.formError}</FormAlert>
            </div>
          ) : null}
        </CardContent>
      </Card>

      <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
        <Link href={cancelHref} className={buttonVariants({ variant: "secondary" })}>
          Cancelar
        </Link>
        <SubmitButton pendingLabel={pendingLabel}>{submitLabel}</SubmitButton>
      </div>
    </form>
  );
}

function TextField({
  defaultValue,
  id,
  label,
}: {
  defaultValue: string;
  id: keyof CateringFormState["fields"];
  label: string;
}) {
  return (
    <div>
      <Label htmlFor={id}>{label}</Label>
      <Input id={id} name={id} type="text" defaultValue={defaultValue} />
    </div>
  );
}

function NumberField({
  value,
  onChange,
  error,
  id,
  label,
}: {
  value: string;
  onChange: (value: string) => void;
  error?: string;
  id: keyof CateringFormState["fields"];
  label: string;
}) {
  const errorId = `${id}-error`;

  return (
    <div>
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        name={id}
        type="number"
        min="0"
        step="1"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        aria-invalid={Boolean(error)}
        aria-describedby={error ? errorId : undefined}
      />
      {error ? <FieldError id={errorId}>{error}</FieldError> : null}
    </div>
  );
}

function MoneyField({
  defaultValue,
  error,
  id,
  label,
}: {
  defaultValue: string;
  error?: string;
  id: keyof CateringFormState["fields"];
  label: string;
}) {
  const errorId = `${id}-error`;

  return (
    <div>
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        name={id}
        type="number"
        min="0"
        step="0.01"
        defaultValue={defaultValue}
        aria-invalid={Boolean(error)}
        aria-describedby={error ? errorId : undefined}
      />
      {error ? <FieldError id={errorId}>{error}</FieldError> : null}
    </div>
  );
}

function PercentageField({
  defaultValue,
  error,
  id,
  label,
}: {
  defaultValue: string;
  error?: string;
  id: keyof CateringFormState["fields"];
  label: string;
}) {
  const errorId = `${id}-error`;

  return (
    <div>
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        name={id}
        type="number"
        min="0"
        max="100"
        step="0.01"
        defaultValue={defaultValue}
        aria-invalid={Boolean(error)}
        aria-describedby={error ? errorId : undefined}
      />
      {error ? <FieldError id={errorId}>{error}</FieldError> : null}
    </div>
  );
}
