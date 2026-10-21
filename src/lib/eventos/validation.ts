import type { Tables, TablesInsert } from "@/types/database.types";
import { isEventoSubtipoForTipo, isEventoTipo } from "@/lib/eventos/types";
import { validateContactos, type ContactoInput } from "../contactos/validation";

export type EventoFormMode = "create" | "edit";

export type EventoFormFields = {
  salon_id: string;
  vendedor_id: string;
  cliente_nombre: string;
  cliente_razon_social: string;
  cliente_cuit_dni: string;
  cliente_direccion: string;
  cliente_ciudad: string;
  cliente_direccion_factura: string;
  cliente_contacto: string;
  fecha_evento: string;
  fecha_carga: string;
  fecha_confirmacion_presupuesto: string;
  estado: string;
  nombre_evento: string;
  tipo_evento: string;
  subtipo_evento: string;
  espacio: string;
  pax_adultos: string;
  pax_jovenes: string;
  pax_menores: string;
  pax_bebes: string;
  tiene_organizador: string;
  organizador_nombre: string;
  organizador_email: string;
  organizador_telefono: string;
  observaciones: string;
};

export type EventoFormErrors = Partial<Record<keyof EventoFormFields, string>>;

export type EventoFormState = {
  fields: EventoFormFields;
  errors: EventoFormErrors;
  formError: string | null;
  contactos: ContactoInput[];
  contactosVersion: string;
  contactosError?: string;
};

export type EventoPayload = Omit<
  TablesInsert<"eventos">,
  "fecha_contrato" | "vendedor_id" | "cliente_contacto"
> & {
  vendedor_id?: string;
};

const ESTADOS_EVENTO = ["borrador", "confirmado", "realizado", "cancelado"];

export const emptyEventoFormState: EventoFormState = {
  fields: {
    salon_id: "",
    vendedor_id: "",
    cliente_nombre: "",
    cliente_razon_social: "",
    cliente_cuit_dni: "",
    cliente_direccion: "",
    cliente_ciudad: "",
    cliente_direccion_factura: "",
    cliente_contacto: "",
    fecha_evento: "",
    fecha_carga: getTodayInputValue(),
    fecha_confirmacion_presupuesto: "",
    estado: "borrador",
    nombre_evento: "",
    tipo_evento: "",
    subtipo_evento: "",
    espacio: "",
    pax_adultos: "",
    pax_jovenes: "",
    pax_menores: "",
    pax_bebes: "",
    tiene_organizador: "false",
    organizador_nombre: "",
    organizador_email: "",
    organizador_telefono: "",
    observaciones: "",
  },
  errors: {},
  formError: null,
  contactos: [],
  contactosVersion: "",
};

export function getEventoFormStateFromEvento(
  evento: Tables<"eventos">,
  contactos: ContactoInput[] = [],
  contactosVersion = "",
): EventoFormState {
  return {
    fields: {
      salon_id: evento.salon_id,
      vendedor_id: evento.vendedor_id,
      cliente_nombre: evento.cliente_nombre,
      cliente_razon_social: evento.cliente_razon_social ?? "",
      cliente_cuit_dni: evento.cliente_cuit_dni ?? "",
      cliente_direccion: evento.cliente_direccion ?? "",
      cliente_ciudad: evento.cliente_ciudad ?? "",
      cliente_direccion_factura: evento.cliente_direccion_factura ?? "",
      cliente_contacto: evento.cliente_contacto ?? "",
      fecha_evento: evento.fecha_evento,
      fecha_carga: evento.fecha_carga,
      fecha_confirmacion_presupuesto:
        evento.fecha_confirmacion_presupuesto ?? "",
      estado: evento.estado,
      nombre_evento: evento.nombre_evento ?? "",
      tipo_evento: evento.tipo_evento ?? "",
      subtipo_evento: evento.subtipo_evento ?? "",
      espacio: evento.espacio ?? "",
      pax_adultos: evento.pax_adultos?.toString() ?? "",
      pax_jovenes: evento.pax_jovenes?.toString() ?? "",
      pax_menores: evento.pax_menores?.toString() ?? "",
      pax_bebes: evento.pax_bebes?.toString() ?? "",
      tiene_organizador: evento.tiene_organizador ? "true" : "false",
      organizador_nombre: evento.organizador_nombre ?? "",
      organizador_email: evento.organizador_email ?? "",
      organizador_telefono: evento.organizador_telefono ?? "",
      observaciones: evento.observaciones ?? "",
    },
    errors: {},
    formError: null,
    contactos,
    contactosVersion,
  };
}

export function validateEventoForm(
  formData: FormData,
  options: {
    mode?: EventoFormMode;
  } = {},
): {
  state: EventoFormState;
  payload: EventoPayload | null;
} {
  const mode = options.mode ?? "edit";
  const fields = getEventoFields(formData);
  const contactsResult = validateContactos(formData.get("contactos"));
  const contactosVersion = typeof formData.get("contactos_version") === "string"
    ? String(formData.get("contactos_version")) : "";
  if (mode === "create" && !fields.fecha_carga) {
    fields.fecha_carga = getTodayInputValue();
  }

  const errors: EventoFormErrors = {};
  const salonId = fields.salon_id.trim();
  const vendedorId = fields.vendedor_id.trim();
  const clienteNombre = fields.cliente_nombre.trim();
  const fechaEvento = fields.fecha_evento.trim();
  const fechaCarga = fields.fecha_carga.trim();
  const fechaConfirmacionPresupuesto =
    fields.fecha_confirmacion_presupuesto.trim();
  const estado = fields.estado.trim() || "borrador";
  const tieneOrganizador = fields.tiene_organizador === "true";
  const organizadorNombre = fields.organizador_nombre.trim();
  const organizadorEmail = fields.organizador_email.trim();

  if (!salonId) {
    errors.salon_id = "Selecciona un salon.";
  }

  if (!clienteNombre) {
    errors.cliente_nombre = "Ingresa el nombre del cliente.";
  }

  if (!fechaEvento) {
    errors.fecha_evento = "Ingresa la fecha del evento.";
  } else if (!isDateInputValue(fechaEvento)) {
    errors.fecha_evento = "Ingresa una fecha valida.";
  }

  if (mode === "edit" && !fechaCarga) {
    errors.fecha_carga = "Ingresa la fecha de carga.";
  } else if (fechaCarga && !isDateInputValue(fechaCarga)) {
    errors.fecha_carga = "Ingresa una fecha valida.";
  }

  if (
    fechaConfirmacionPresupuesto &&
    !isDateInputValue(fechaConfirmacionPresupuesto)
  ) {
    errors.fecha_confirmacion_presupuesto = "Ingresa una fecha valida.";
  }

  if (mode === "edit" && !ESTADOS_EVENTO.includes(estado)) {
    errors.estado = "Selecciona un estado valido.";
  }

  const tipoEvento = fields.tipo_evento.trim();
  const subtipoEvento = fields.subtipo_evento.trim();

  if (mode === "create") {
    if (!tipoEvento) {
      errors.tipo_evento = "Selecciona el tipo de evento.";
    } else if (!isEventoTipo(tipoEvento)) {
      errors.tipo_evento = "Selecciona un tipo de evento valido.";
    }

    if (
      tipoEvento &&
      subtipoEvento &&
      !isEventoSubtipoForTipo(tipoEvento, subtipoEvento)
    ) {
      errors.subtipo_evento =
        "Selecciona un subtipo compatible con el tipo de evento.";
    }
  }

  const paxAdultos = parseOptionalInteger(
    fields.pax_adultos,
    "pax_adultos",
    errors,
  );
  const paxJovenes = parseOptionalInteger(
    fields.pax_jovenes,
    "pax_jovenes",
    errors,
  );
  const paxMenores = parseOptionalInteger(
    fields.pax_menores,
    "pax_menores",
    errors,
  );
  const paxBebes = parseOptionalInteger(
    fields.pax_bebes,
    "pax_bebes",
    errors,
  );

  if (tieneOrganizador && !organizadorNombre) {
    errors.organizador_nombre = "Ingresa el nombre del organizador.";
  }

  if (organizadorEmail && !isValidEmail(organizadorEmail)) {
    errors.organizador_email = "Ingresa un email valido.";
  }

  if (Object.keys(errors).length > 0 || contactsResult.error) {
    return {
      state: {
        fields,
        errors,
        formError: "Revisa los campos marcados.",
        contactos: contactsResult.contactos,
        contactosVersion,
        contactosError: contactsResult.error ?? undefined,
      },
      payload: null,
    };
  }

  return {
    state: {
      fields,
      errors: {},
      formError: null,
      contactos: contactsResult.contactos,
      contactosVersion,
    },
    payload: {
      salon_id: salonId,
      vendedor_id: vendedorId || undefined,
      cliente_nombre: clienteNombre,
      cliente_razon_social: nullableTrim(fields.cliente_razon_social),
      cliente_cuit_dni: nullableTrim(fields.cliente_cuit_dni),
      cliente_direccion: nullableTrim(fields.cliente_direccion),
      cliente_ciudad: nullableTrim(fields.cliente_ciudad),
      cliente_direccion_factura: nullableTrim(
        fields.cliente_direccion_factura,
      ),
      fecha_evento: fechaEvento,
      fecha_carga: fechaCarga || getTodayInputValue(),
      fecha_confirmacion_presupuesto: fechaConfirmacionPresupuesto || null,
      estado: estado as Tables<"eventos">["estado"],
      nombre_evento: nullableTrim(fields.nombre_evento),
      tipo_evento: nullableTrim(tipoEvento),
      subtipo_evento: nullableTrim(subtipoEvento),
      espacio: nullableTrim(fields.espacio),
      pax_adultos: paxAdultos,
      pax_jovenes: paxJovenes,
      pax_menores: paxMenores,
      pax_bebes: paxBebes,
      tiene_organizador: tieneOrganizador,
      organizador_nombre: tieneOrganizador ? organizadorNombre : null,
      organizador_email: tieneOrganizador ? nullableTrim(organizadorEmail) : null,
      organizador_telefono: tieneOrganizador
        ? nullableTrim(fields.organizador_telefono)
        : null,
      observaciones: nullableTrim(fields.observaciones),
    },
  };
}

function getEventoFields(formData: FormData): EventoFormFields {
  return {
    salon_id: getString(formData, "salon_id"),
    vendedor_id: getString(formData, "vendedor_id"),
    cliente_nombre: getString(formData, "cliente_nombre"),
    cliente_razon_social: getString(formData, "cliente_razon_social"),
    cliente_cuit_dni: getString(formData, "cliente_cuit_dni"),
    cliente_direccion: getString(formData, "cliente_direccion"),
    cliente_ciudad: getString(formData, "cliente_ciudad"),
    cliente_direccion_factura: getString(
      formData,
      "cliente_direccion_factura",
    ),
    cliente_contacto: getString(formData, "cliente_contacto"),
    fecha_evento: getString(formData, "fecha_evento"),
    fecha_carga: getString(formData, "fecha_carga"),
    fecha_confirmacion_presupuesto: getString(
      formData,
      "fecha_confirmacion_presupuesto",
    ),
    estado: getString(formData, "estado"),
    nombre_evento: getString(formData, "nombre_evento"),
    tipo_evento: getString(formData, "tipo_evento"),
    subtipo_evento: getString(formData, "subtipo_evento"),
    espacio: getString(formData, "espacio"),
    pax_adultos: getString(formData, "pax_adultos"),
    pax_jovenes: getString(formData, "pax_jovenes"),
    pax_menores: getString(formData, "pax_menores"),
    pax_bebes: getString(formData, "pax_bebes"),
    tiene_organizador:
      formData.get("tiene_organizador") === "true" ? "true" : "false",
    organizador_nombre: getString(formData, "organizador_nombre"),
    organizador_email: getString(formData, "organizador_email"),
    organizador_telefono: getString(formData, "organizador_telefono"),
    observaciones: getString(formData, "observaciones"),
  };
}

function getString(formData: FormData, key: string) {
  const value = formData.get(key);

  return typeof value === "string" ? value : "";
}

function nullableTrim(value: string) {
  const trimmed = value.trim();

  return trimmed || null;
}

function parseOptionalInteger(
  value: string,
  key: keyof EventoFormFields,
  errors: EventoFormErrors,
) {
  const text = value.trim();

  if (!text) {
    return null;
  }

  const numberValue = Number(text);

  if (!Number.isInteger(numberValue) || numberValue < 0) {
    errors[key] = "Debe ser un numero entero mayor o igual a 0.";
    return null;
  }

  return numberValue;
}

export function getTodayInputValue() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    day: "2-digit",
    month: "2-digit",
    timeZone: "America/Argentina/Buenos_Aires",
    year: "numeric",
  }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));

  return `${values.year}-${values.month}-${values.day}`;
}

function isDateInputValue(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }

  const date = new Date(`${value}T00:00:00.000Z`);

  return !Number.isNaN(date.getTime()) && date.toISOString().startsWith(value);
}

function isValidEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}
