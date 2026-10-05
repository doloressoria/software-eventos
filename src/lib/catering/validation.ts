import { isEventoTipo } from "../eventos/types";
import type { Tables } from "../../types/database.types";

export type CateringFormMode = "create" | "edit";

export type CateringFormFields = {
  con_evento: string;
  evento_id: string;
  cliente_nombre: string;
  cliente_razon_social: string;
  cliente_cuit_dni: string;
  cliente_contacto: string;
  fecha_evento: string;
  lugar_evento: string;
  tipo_evento: string;
  tipo_servicio: string;
  ejecutiva_id: string;
  pax_adultos: string;
  pax_jovenes: string;
  pax_menores: string;
  pax_bebes: string;
  comision_organizador_monto: string;
  iva_comision: string;
  iva_porcentaje: string;
  notas: string;
  precio_unitario_inicial: string;
  precio_motivo_inicial: string;
};

export type CateringFormErrors = Partial<Record<keyof CateringFormFields, string>>;

export type CateringFormState = {
  fields: CateringFormFields;
  errors: CateringFormErrors;
  formError: string | null;
};

export type CateringPayload = {
  con_evento: boolean;
  evento_id: string | null;
  cliente_nombre: string | null;
  cliente_razon_social: string | null;
  cliente_cuit_dni: string | null;
  cliente_contacto: string | null;
  fecha_evento: string | null;
  lugar_evento: string | null;
  tipo_evento: string | null;
  tipo_servicio: string | null;
  ejecutiva_id: string;
  pax_adultos: number | null;
  pax_jovenes: number | null;
  pax_menores: number | null;
  pax_bebes: number | null;
  comision_organizador_monto: number;
  iva_comision: number;
  iva_porcentaje: number;
  notas: string | null;
  precio_unitario_inicial: number;
  precio_motivo_inicial: string | null;
};

export function getEmptyCateringFormState(): CateringFormState {
  return {
    fields: {
      con_evento: "true",
      evento_id: "",
      cliente_nombre: "",
      cliente_razon_social: "",
      cliente_cuit_dni: "",
      cliente_contacto: "",
      fecha_evento: "",
      lugar_evento: "",
      tipo_evento: "",
      tipo_servicio: "",
      ejecutiva_id: "",
      pax_adultos: "",
      pax_jovenes: "",
      pax_menores: "",
      pax_bebes: "",
      comision_organizador_monto: "0",
      iva_comision: "0",
      iva_porcentaje: "21",
      notas: "",
      precio_unitario_inicial: "",
      precio_motivo_inicial: "Cotizacion inicial",
    },
    errors: {},
    formError: null,
  };
}

export function getCateringFormStateFromCatering(
  catering: Tables<"catering_contratos">,
): CateringFormState {
  return {
    fields: {
      con_evento: catering.evento_id ? "true" : "false",
      evento_id: catering.evento_id ?? "",
      cliente_nombre: catering.cliente_nombre ?? "",
      cliente_razon_social: catering.cliente_razon_social ?? "",
      cliente_cuit_dni: catering.cliente_cuit_dni ?? "",
      cliente_contacto: catering.cliente_contacto ?? "",
      fecha_evento: catering.fecha_evento ?? "",
      lugar_evento: catering.lugar_evento ?? "",
      tipo_evento: catering.tipo_evento ?? "",
      tipo_servicio: catering.tipo_servicio ?? "",
      ejecutiva_id: catering.ejecutiva_id ?? "",
      pax_adultos: catering.pax_adultos?.toString() ?? "",
      pax_jovenes: catering.pax_jovenes?.toString() ?? "",
      pax_menores: catering.pax_menores?.toString() ?? "",
      pax_bebes: catering.pax_bebes?.toString() ?? "",
      comision_organizador_monto: formatFormNumber(
        catering.comision_organizador_monto ?? 0,
      ),
      iva_comision: formatFormNumber(rateToPercentage(catering.iva_comision ?? 0)),
      iva_porcentaje: formatFormNumber(rateToPercentage(catering.iva_porcentaje ?? 0)),
      notas: catering.notas ?? "",
      precio_unitario_inicial: "",
      precio_motivo_inicial: "",
    },
    errors: {},
    formError: null,
  };
}

export function validateCateringForm(
  formData: FormData,
  options: { mode: CateringFormMode },
): {
  state: CateringFormState;
  payload: CateringPayload | null;
} {
  const fields = getCateringFields(formData);
  const errors: CateringFormErrors = {};
  const conEvento = fields.con_evento === "true";
  const eventoId = fields.evento_id.trim();
  const ejecutivaId = fields.ejecutiva_id.trim();
  const tipoServicio = fields.tipo_servicio.trim();

  let clienteNombre: string | null = null;
  let fechaEvento: string | null = null;
  let lugarEvento: string | null = null;
  let tipoEvento: string | null = null;
  let clienteRazonSocial: string | null = null;
  let clienteCuitDni: string | null = null;
  let clienteContacto: string | null = null;

  // Whether a catering is linked to an evento is fixed at creation time and
  // can't change later, so only "create" enforces the con_evento branch
  // (evento_id required vs. cliente/fecha required). "edit" only ever
  // touches the standalone fields when the catering already has no evento
  // (the action decides that from the DB, not from this form), and parses
  // them leniently since the UI won't even render them for a caso-1
  // catering.
  if (options.mode === "create" && conEvento) {
    if (!eventoId) {
      errors.evento_id = "Busca y selecciona el evento vinculado.";
    }
  } else {
    clienteNombre = fields.cliente_nombre.trim() || null;
    fechaEvento = fields.fecha_evento.trim() || null;
    lugarEvento = fields.lugar_evento.trim() || null;
    tipoEvento = fields.tipo_evento.trim() || null;
    clienteRazonSocial = nullableTrim(fields.cliente_razon_social);
    clienteCuitDni = nullableTrim(fields.cliente_cuit_dni);
    clienteContacto = nullableTrim(fields.cliente_contacto);

    if (options.mode === "create" && !clienteNombre) {
      errors.cliente_nombre = "Ingresa el nombre del cliente.";
    }

    if (options.mode === "create" && !fechaEvento) {
      errors.fecha_evento = "Ingresa la fecha del evento.";
    } else if (fechaEvento && !isDateInputValue(fechaEvento)) {
      errors.fecha_evento = "Ingresa una fecha valida.";
    }

    if (options.mode === "create" && !lugarEvento) {
      errors.lugar_evento = "Ingresa el lugar del evento.";
    }

    if (tipoEvento && !isEventoTipo(tipoEvento)) {
      errors.tipo_evento = "Selecciona un tipo de evento valido.";
    }
  }

  if (!ejecutivaId) {
    errors.ejecutiva_id = "Selecciona la ejecutiva de catering responsable.";
  }

  const paxAdultos = parseOptionalInteger(fields.pax_adultos, "pax_adultos", errors);
  const paxJovenes = parseOptionalInteger(fields.pax_jovenes, "pax_jovenes", errors);
  const paxMenores = parseOptionalInteger(fields.pax_menores, "pax_menores", errors);
  const paxBebes = parseOptionalInteger(fields.pax_bebes, "pax_bebes", errors);

  const comisionMonto = parseOptionalMoney(
    fields.comision_organizador_monto,
    "comision_organizador_monto",
    errors,
  );
  const ivaComisionPct = parseOptionalPercentage(
    fields.iva_comision,
    "iva_comision",
    errors,
  );
  const ivaPorcentajePct = parseOptionalPercentage(
    fields.iva_porcentaje,
    "iva_porcentaje",
    errors,
  );

  let precioUnitarioInicial = 0;
  const precioMotivoInicial = nullableTrim(fields.precio_motivo_inicial);

  if (options.mode === "create") {
    const text = normalizeNumberText(fields.precio_unitario_inicial);

    if (!text) {
      errors.precio_unitario_inicial = "Ingresa el precio por persona.";
    } else {
      const value = Number(text);

      if (!Number.isFinite(value) || value <= 0) {
        errors.precio_unitario_inicial = "Ingresa un precio valido.";
      } else {
        precioUnitarioInicial = roundMoney(value);
      }
    }
  }

  if (Object.keys(errors).length > 0) {
    return {
      state: { fields, errors, formError: "Revisa los campos marcados." },
      payload: null,
    };
  }

  return {
    state: { fields, errors: {}, formError: null },
    payload: {
      con_evento: conEvento,
      evento_id: conEvento ? eventoId : null,
      cliente_nombre: clienteNombre,
      cliente_razon_social: clienteRazonSocial,
      cliente_cuit_dni: clienteCuitDni,
      cliente_contacto: clienteContacto,
      fecha_evento: fechaEvento,
      lugar_evento: lugarEvento,
      tipo_evento: tipoEvento,
      tipo_servicio: nullableTrim(tipoServicio),
      ejecutiva_id: ejecutivaId,
      pax_adultos: paxAdultos,
      pax_jovenes: paxJovenes,
      pax_menores: paxMenores,
      pax_bebes: paxBebes,
      comision_organizador_monto: comisionMonto ?? 0,
      iva_comision: percentageToRate(ivaComisionPct ?? 0),
      iva_porcentaje: percentageToRate(ivaPorcentajePct ?? 0),
      notas: nullableTrim(fields.notas),
      precio_unitario_inicial: precioUnitarioInicial,
      precio_motivo_inicial: precioMotivoInicial,
    },
  };
}

function getCateringFields(formData: FormData): CateringFormFields {
  return {
    con_evento: getString(formData, "con_evento") || "true",
    evento_id: getString(formData, "evento_id"),
    cliente_nombre: getString(formData, "cliente_nombre"),
    cliente_razon_social: getString(formData, "cliente_razon_social"),
    cliente_cuit_dni: getString(formData, "cliente_cuit_dni"),
    cliente_contacto: getString(formData, "cliente_contacto"),
    fecha_evento: getString(formData, "fecha_evento"),
    lugar_evento: getString(formData, "lugar_evento"),
    tipo_evento: getString(formData, "tipo_evento"),
    tipo_servicio: getString(formData, "tipo_servicio"),
    ejecutiva_id: getString(formData, "ejecutiva_id"),
    pax_adultos: getString(formData, "pax_adultos"),
    pax_jovenes: getString(formData, "pax_jovenes"),
    pax_menores: getString(formData, "pax_menores"),
    pax_bebes: getString(formData, "pax_bebes"),
    comision_organizador_monto: getString(formData, "comision_organizador_monto"),
    iva_comision: getString(formData, "iva_comision"),
    iva_porcentaje: getString(formData, "iva_porcentaje"),
    notas: getString(formData, "notas"),
    precio_unitario_inicial: getString(formData, "precio_unitario_inicial"),
    precio_motivo_inicial: getString(formData, "precio_motivo_inicial"),
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

function normalizeNumberText(value: string) {
  return value.trim().replace(",", ".");
}

function parseOptionalInteger(
  value: string,
  key: keyof CateringFormFields,
  errors: CateringFormErrors,
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

function parseOptionalMoney(
  value: string,
  key: keyof CateringFormFields,
  errors: CateringFormErrors,
) {
  const text = normalizeNumberText(value);

  if (!text) {
    return 0;
  }

  const numberValue = Number(text);

  if (!Number.isFinite(numberValue) || numberValue < 0) {
    errors[key] = "Ingresa un monto valido.";
    return null;
  }

  return roundMoney(numberValue);
}

function parseOptionalPercentage(
  value: string,
  key: keyof CateringFormFields,
  errors: CateringFormErrors,
) {
  const text = normalizeNumberText(value);

  if (!text) {
    return 0;
  }

  const numberValue = Number(text);

  if (!Number.isFinite(numberValue) || numberValue < 0 || numberValue > 100) {
    errors[key] = "Ingresa un porcentaje entre 0 y 100.";
    return null;
  }

  return roundMoney(numberValue);
}

function isDateInputValue(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }

  const date = new Date(`${value}T00:00:00.000Z`);

  return !Number.isNaN(date.getTime()) && date.toISOString().startsWith(value);
}

function roundMoney(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function percentageToRate(value: number) {
  return Math.round((value / 100 + Number.EPSILON) * 10000) / 10000;
}

function rateToPercentage(value: number) {
  return roundMoney(value * 100);
}

function formatFormNumber(value: number) {
  return String(value);
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
