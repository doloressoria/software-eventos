"use client";

import Link from "next/link";
import { useActionState, useMemo, useState } from "react";
import { SubmitButton } from "@/components/salones/submit-button";
import { ContactoAnterior, ContactosFields } from "./contactos-fields";
import { Alert } from "@/components/ui/alert";
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
import type {
  EventoSalon,
  EventoSalonAssignment,
  EventoVendedor,
} from "@/lib/eventos/queries";
import {
  EVENT_SUBTYPES,
  EVENT_TYPES,
  generateEventoName,
  isEventoTipo,
} from "@/lib/eventos/types";
import type {
  EventoFormMode,
  EventoFormState,
} from "@/lib/eventos/validation";

const NO_SUBTIPO_VALUE = "__sin_subtipo__";
const EVENT_STATES = [
  { label: "Borrador", value: "borrador" },
  { label: "Confirmado", value: "confirmado" },
  { label: "Realizado", value: "realizado" },
  { label: "Cancelado", value: "cancelado" },
];

type EventoFormProps = {
  action: (
    previousState: EventoFormState,
    formData: FormData,
  ) => Promise<EventoFormState>;
  assignments: EventoSalonAssignment[];
  cancelHref?: string;
  initialState: EventoFormState;
  isAdmin: boolean;
  mode: EventoFormMode;
  pendingLabel?: string;
  salones: EventoSalon[];
  submitLabel?: string;
  vendedores: EventoVendedor[];
};

export function EventoForm({
  action,
  assignments,
  cancelHref = "/eventos",
  initialState,
  isAdmin,
  mode,
  pendingLabel = "Creando...",
  salones,
  submitLabel = "Crear evento",
  vendedores,
}: EventoFormProps) {
  const [state, formAction] = useActionState(action, initialState);
  const [selectedSalonId, setSelectedSalonId] = useState(
    state.fields.salon_id,
  );
  const [selectedVendedorId, setSelectedVendedorId] = useState(
    state.fields.vendedor_id,
  );
  const [selectedFechaEvento, setSelectedFechaEvento] = useState(
    state.fields.fecha_evento,
  );
  const [selectedTipoEvento, setSelectedTipoEvento] = useState(
    state.fields.tipo_evento,
  );
  const [selectedEstado, setSelectedEstado] = useState(state.fields.estado);
  const [selectedSubtipoEvento, setSelectedSubtipoEvento] = useState(
    state.fields.subtipo_evento,
  );
  const [selectedTieneOrganizador, setSelectedTieneOrganizador] = useState(
    state.fields.tiene_organizador,
  );

  const selectedSalon = useMemo(
    () => salones.find((salon) => salon.id === selectedSalonId),
    [salones, selectedSalonId],
  );
  const availableSubtypes = isEventoTipo(selectedTipoEvento)
    ? EVENT_SUBTYPES[selectedTipoEvento]
    : [];
  const generatedEventoName = generateEventoName({
    fechaEvento: selectedFechaEvento,
    salonNombre: selectedSalon?.nombre ?? "",
    subtipoEvento: selectedSubtipoEvento,
    tipoEvento: selectedTipoEvento,
  });

  const assignedVendedores = useMemo(() => {
    if (isAdmin) {
      return vendedores;
    }

    if (!selectedSalonId) {
      return vendedores;
    }

    const assignedIds = new Set(
      assignments
        .filter((assignment) => assignment.salon_id === selectedSalonId)
        .map((assignment) => assignment.usuario_id),
    );

    return vendedores.filter((vendedor) => assignedIds.has(vendedor.id));
  }, [assignments, isAdmin, selectedSalonId, vendedores]);

  return (
    <form
      action={formAction}
      className="flex max-w-5xl flex-col gap-6"
      noValidate
    >
      <Card className={mode === "create" ? "order-1" : undefined}>
        <CardHeader>
          <CardTitle>Salon y responsable</CardTitle>
          <CardDescription>
            Define la unidad operativa y el vendedor responsable del evento.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-5 sm:grid-cols-2">
            <div>
              <Label htmlFor="salon_id">Salon</Label>
              <Select
                name="salon_id"
                required
                value={selectedSalonId}
                onValueChange={(value) => {
                  setSelectedSalonId(value);
                  setSelectedVendedorId("");
                }}
              >
                <SelectTrigger
                  id="salon_id"
                  aria-invalid={Boolean(state.errors.salon_id)}
                  aria-describedby={
                    state.errors.salon_id ? "salon_id-error" : undefined
                  }
                >
                  <SelectValue placeholder="Seleccionar salon" />
                </SelectTrigger>
                <SelectContent>
                  {salones.map((salon) => (
                    <SelectItem key={salon.id} value={salon.id}>
                      {getSalonOptionLabel(salon)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {state.errors.salon_id ? (
                <FieldError id="salon_id-error">
                  {state.errors.salon_id}
                </FieldError>
              ) : null}
              {isAdmin &&
              mode === "edit" &&
              selectedSalonId &&
              selectedSalonId !== initialState.fields.salon_id ? (
                <Alert variant="warning" className="mt-2 px-3 py-2">
                  Al cambiar el salon no se recalculan ni sobrescriben valores
                  financieros ya cargados. Revisa servicios, pagos y egresos
                  asociados.
                </Alert>
              ) : null}
            </div>

            {isAdmin ? (
              <div>
                <Label htmlFor="vendedor_id">Vendedor responsable</Label>
                <Select
                  name="vendedor_id"
                  required
                  value={selectedVendedorId}
                  onValueChange={setSelectedVendedorId}
                  disabled={!selectedSalonId}
                >
                  <SelectTrigger
                    id="vendedor_id"
                    aria-invalid={Boolean(state.errors.vendedor_id)}
                    aria-describedby={
                      state.errors.vendedor_id
                        ? "vendedor_id-error"
                        : undefined
                    }
                  >
                    <SelectValue
                      placeholder={
                        selectedSalonId
                          ? "Seleccionar vendedor"
                          : "Primero selecciona un salon"
                      }
                    />
                  </SelectTrigger>
                  <SelectContent>
                    {assignedVendedores.map((vendedor) => (
                      <SelectItem key={vendedor.id} value={vendedor.id}>
                        {vendedor.full_name} - {vendedor.email}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {state.errors.vendedor_id ? (
                  <FieldError id="vendedor_id-error">
                    {state.errors.vendedor_id}
                  </FieldError>
                ) : null}
                {selectedSalonId && assignedVendedores.length === 0 ? (
                  <Alert variant="warning" className="mt-2 px-3 py-2">
                    Este salon no tiene vendedores asignados.
                  </Alert>
                ) : null}
              </div>
            ) : null}
          </div>
        </CardContent>
      </Card>

      <Card className={mode === "create" ? "order-3" : undefined}>
        <CardHeader>
          <CardTitle>Cliente</CardTitle>
          <CardDescription>
            Datos comerciales y de contacto asociados al contrato.
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
                  state.errors.cliente_nombre
                    ? "cliente_nombre-error"
                    : undefined
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
              id="cliente_direccion"
              label="Direccion"
              defaultValue={state.fields.cliente_direccion}
            />
            <TextField
              id="cliente_ciudad"
              label="Ciudad"
              defaultValue={state.fields.cliente_ciudad}
            />
            <div className="sm:col-span-2">
              <TextField
                id="cliente_direccion_factura"
                label="Direccion de factura"
                defaultValue={state.fields.cliente_direccion_factura}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className={mode === "create" ? "order-2" : undefined}>
        <CardHeader>
          <CardTitle>Evento</CardTitle>
          <CardDescription>
            Fecha, tipo de evento, espacio y cantidad estimada de asistentes.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-5 sm:grid-cols-2">
            <div>
              <Label htmlFor="fecha_evento">Fecha del evento</Label>
              <DatePickerField
                id="fecha_evento"
                name="fecha_evento"
                required
                value={selectedFechaEvento}
                onValueChange={setSelectedFechaEvento}
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

            {mode === "create" ? (
              <div>
                <Label>Fecha de carga</Label>
                <p className="mt-2 min-h-10 rounded-lg border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-sm text-slate-600">
                  Se completara al crear el evento: {state.fields.fecha_carga}
                </p>
              </div>
            ) : (
              <div>
                <Label htmlFor="fecha_carga">Fecha de carga</Label>
                <DatePickerField
                  id="fecha_carga"
                  name="fecha_carga"
                  required
                  defaultValue={state.fields.fecha_carga}
                  aria-invalid={Boolean(state.errors.fecha_carga)}
                  aria-describedby={
                    state.errors.fecha_carga ? "fecha_carga-error" : undefined
                  }
                />
                {state.errors.fecha_carga ? (
                  <FieldError id="fecha_carga-error">
                    {state.errors.fecha_carga}
                  </FieldError>
                ) : null}
              </div>
            )}

            <div>
              <Label htmlFor="fecha_confirmacion_presupuesto">
                Fecha de confirmacion de presupuesto
              </Label>
              <DatePickerField
                id="fecha_confirmacion_presupuesto"
                name="fecha_confirmacion_presupuesto"
                defaultValue={state.fields.fecha_confirmacion_presupuesto}
                aria-invalid={Boolean(
                  state.errors.fecha_confirmacion_presupuesto,
                )}
                aria-describedby={
                  state.errors.fecha_confirmacion_presupuesto
                    ? "fecha_confirmacion_presupuesto-error"
                    : undefined
                }
              />
              {state.errors.fecha_confirmacion_presupuesto ? (
                <FieldError id="fecha_confirmacion_presupuesto-error">
                  {state.errors.fecha_confirmacion_presupuesto}
                </FieldError>
              ) : null}
            </div>

            {mode === "create" ? (
              <>
                <div>
                  <Label htmlFor="tipo_evento">Tipo de evento</Label>
                  <Select
                    name="tipo_evento"
                    required
                    value={selectedTipoEvento}
                    onValueChange={(value) => {
                      setSelectedTipoEvento(value);
                      setSelectedSubtipoEvento("");
                    }}
                  >
                    <SelectTrigger
                      id="tipo_evento"
                      aria-invalid={Boolean(state.errors.tipo_evento)}
                      aria-describedby={
                        state.errors.tipo_evento
                          ? "tipo_evento-error"
                          : undefined
                      }
                    >
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
                  {state.errors.tipo_evento ? (
                    <FieldError id="tipo_evento-error">
                      {state.errors.tipo_evento}
                    </FieldError>
                  ) : null}
                </div>

                <div>
                  <input
                    type="hidden"
                    name="subtipo_evento"
                    value={selectedSubtipoEvento}
                  />
                  <Label htmlFor="subtipo_evento">Subtipo de evento</Label>
                  <Select
                    value={selectedSubtipoEvento || NO_SUBTIPO_VALUE}
                    onValueChange={(value) =>
                      setSelectedSubtipoEvento(
                        value === NO_SUBTIPO_VALUE ? "" : value,
                      )
                    }
                    disabled={!isEventoTipo(selectedTipoEvento)}
                  >
                    <SelectTrigger
                      id="subtipo_evento"
                      aria-invalid={Boolean(state.errors.subtipo_evento)}
                      aria-describedby={
                        state.errors.subtipo_evento
                          ? "subtipo_evento-error"
                          : undefined
                      }
                    >
                      <SelectValue
                        placeholder={
                          selectedTipoEvento
                            ? "Seleccionar subtipo"
                            : "Primero selecciona un tipo"
                        }
                      />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={NO_SUBTIPO_VALUE}>
                        Sin subtipo
                      </SelectItem>
                      {availableSubtypes.map((subtype) => (
                        <SelectItem key={subtype} value={subtype}>
                          {subtype}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {state.errors.subtipo_evento ? (
                    <FieldError id="subtipo_evento-error">
                      {state.errors.subtipo_evento}
                    </FieldError>
                  ) : null}
                </div>

                <div className="sm:col-span-2">
                  <Label htmlFor="nombre_evento_preview">
                    Nombre del evento
                  </Label>
                  <Input
                    id="nombre_evento_preview"
                    type="text"
                    readOnly
                    value={generatedEventoName}
                    placeholder="Se generara con fecha, tipo y salon"
                  />
                </div>
              </>
            ) : (
              <>
                <TextField
                  id="nombre_evento"
                  label="Nombre del evento"
                  defaultValue={state.fields.nombre_evento}
                />
                <TextField
                  id="tipo_evento"
                  label="Tipo de evento"
                  defaultValue={state.fields.tipo_evento}
                />
                <TextField
                  id="subtipo_evento"
                  label="Subtipo de evento"
                  defaultValue={state.fields.subtipo_evento}
                />
                <div>
                  <Label htmlFor="estado">Estado</Label>
                  <Select
                    name="estado"
                    required
                    value={selectedEstado}
                    onValueChange={setSelectedEstado}
                  >
                    <SelectTrigger
                      id="estado"
                      aria-invalid={Boolean(state.errors.estado)}
                      aria-describedby={
                        state.errors.estado ? "estado-error" : undefined
                      }
                    >
                      <SelectValue placeholder="Seleccionar estado" />
                    </SelectTrigger>
                    <SelectContent>
                      {EVENT_STATES.map((estado) => (
                        <SelectItem key={estado.value} value={estado.value}>
                          {estado.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {state.errors.estado ? (
                    <FieldError id="estado-error">
                      {state.errors.estado}
                    </FieldError>
                  ) : null}
                </div>
              </>
            )}
            <TextField
              id="espacio"
              label="Espacio"
              defaultValue={state.fields.espacio}
            />
            <NumberField
              id="pax_adultos"
              label="Pax adultos"
              defaultValue={state.fields.pax_adultos}
              error={state.errors.pax_adultos}
            />
            <NumberField
              id="pax_jovenes"
              label="Pax jovenes"
              defaultValue={state.fields.pax_jovenes}
              error={state.errors.pax_jovenes}
            />
            <NumberField
              id="pax_menores"
              label="Pax menores"
              defaultValue={state.fields.pax_menores}
              error={state.errors.pax_menores}
            />
            <NumberField
              id="pax_bebes"
              label="Pax bebes"
              defaultValue={state.fields.pax_bebes}
              error={state.errors.pax_bebes}
            />
          </div>
        </CardContent>
      </Card>

      <Card className={mode === "create" ? "order-4" : undefined}>
        <CardHeader>
          <CardTitle>Contactos del evento</CardTitle>
          <CardDescription>Se guardan junto con el evento y se comparten con su catering asociado.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <ContactoAnterior value={initialState.fields.cliente_contacto} />
          <ContactosFields initial={state.contactos} version={state.contactosVersion} error={state.contactosError} />
        </CardContent>
      </Card>

      <Card className={mode === "create" ? "order-4" : undefined}>
        <CardHeader>
          <CardTitle>Informacion comercial</CardTitle>
          <CardDescription>
            Organizador externo y observaciones iniciales.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-5 sm:grid-cols-2">
            <div>
              <Label htmlFor="tiene_organizador">
                ¿Tiene organizador externo?
              </Label>
              <Select
                name="tiene_organizador"
                value={selectedTieneOrganizador}
                onValueChange={setSelectedTieneOrganizador}
              >
                <SelectTrigger id="tiene_organizador">
                  <SelectValue placeholder="Seleccionar opcion" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="false">No</SelectItem>
                  <SelectItem value="true">Si</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {selectedTieneOrganizador === "true" ? (
              <>
                <div>
                  <Label htmlFor="organizador_nombre">
                    Nombre del organizador
                  </Label>
                  <Input
                    id="organizador_nombre"
                    name="organizador_nombre"
                    type="text"
                    required
                    defaultValue={state.fields.organizador_nombre}
                    aria-invalid={Boolean(state.errors.organizador_nombre)}
                    aria-describedby={
                      state.errors.organizador_nombre
                        ? "organizador_nombre-error"
                        : undefined
                    }
                  />
                  {state.errors.organizador_nombre ? (
                    <FieldError id="organizador_nombre-error">
                      {state.errors.organizador_nombre}
                    </FieldError>
                  ) : null}
                </div>

                <div>
                  <Label htmlFor="organizador_email">Email del organizador</Label>
                  <Input
                    id="organizador_email"
                    name="organizador_email"
                    type="email"
                    defaultValue={state.fields.organizador_email}
                    aria-invalid={Boolean(state.errors.organizador_email)}
                    aria-describedby={
                      state.errors.organizador_email
                        ? "organizador_email-error"
                        : undefined
                    }
                  />
                  {state.errors.organizador_email ? (
                    <FieldError id="organizador_email-error">
                      {state.errors.organizador_email}
                    </FieldError>
                  ) : null}
                </div>

                <TextField
                  id="organizador_telefono"
                  label="Telefono del organizador"
                  defaultValue={state.fields.organizador_telefono}
                />
              </>
            ) : null}

            <div className="sm:col-span-2">
              <Label htmlFor="observaciones">Observaciones</Label>
              <Textarea
                id="observaciones"
                name="observaciones"
                rows={4}
                defaultValue={state.fields.observaciones}
              />
            </div>

            <div className="sm:col-span-2 rounded-lg border border-slate-100 bg-slate-50/70 px-4 py-3">
              <h3 className="text-sm font-semibold text-slate-950">
                Servicios que comisionan
              </h3>
              <p className="mt-1 text-sm leading-6 text-slate-600">
                {mode === "create"
                  ? "Los servicios podran configurarse luego de crear el evento."
                  : "Los servicios se configuran desde el detalle del evento."}
              </p>
            </div>
          </div>

          {state.formError ? (
            <div className="mt-5">
              <FormAlert>{state.formError}</FormAlert>
            </div>
          ) : null}
        </CardContent>
      </Card>

      <div
        className={
          mode === "create"
            ? "order-5 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end"
            : "flex flex-col-reverse gap-3 sm:flex-row sm:justify-end"
        }
      >
        <Link
          href={cancelHref}
          className={buttonVariants({ variant: "secondary" })}
        >
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
  id: keyof EventoFormState["fields"];
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
  defaultValue,
  error,
  id,
  label,
  step = "1",
}: {
  defaultValue: string;
  error?: string;
  id: keyof EventoFormState["fields"];
  label: string;
  step?: string;
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
        step={step}
        defaultValue={defaultValue}
        aria-invalid={Boolean(error)}
        aria-describedby={error ? errorId : undefined}
      />
      {error ? <FieldError id={errorId}>{error}</FieldError> : null}
    </div>
  );
}

function getSalonOptionLabel(salon: EventoSalon) {
  const details = [
    salon.direccion,
    salon.capacidad !== null ? `${salon.capacidad} personas` : null,
  ].filter(Boolean);

  return details.length > 0
    ? `${salon.nombre} - ${details.join(" - ")}`
    : salon.nombre;
}
