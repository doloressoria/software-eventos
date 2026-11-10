import { getArgentinaPaymentDay } from "./calculos";
import type { Enums } from "../../types/database.types";

export type PagoFormaPago = Enums<"forma_pago">;

export const pagoFormaPagoOptions = [
  "efectivo_pesos",
  "efectivo_dolares",
  "transferencia",
  "cheque",
  "retenciones",
] as const satisfies readonly PagoFormaPago[];

export type PagoFormFields = {
  monto: string;
  moneda: string;
  tipo_cambio: string;
  banco: string;
  numero_cheque: string;
  es_garantia: string;
  fecha_pago: string;
  forma_pago: string;
  concepto: string;
  notas: string;
};

export type PagoFormErrors = Partial<Record<keyof PagoFormFields, string>>;

export type ImputacionInput = { destino: string; importe: string };
export type ImputacionDestino = { value: string; label: string; saldoPendiente: number };

const uuid = /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i;

export function validateImputaciones(form: FormData, equivalente: number | null) {
  const destinos = form.getAll("destino");
  const importes = form.getAll("importe_ars");
  const fields = destinos.slice(0, 50).map((value, index) => ({
    destino: typeof value === "string" ? value.toLowerCase() : "",
    importe: typeof importes[index] === "string" ? importes[index] : "",
  }));
  const lines = fields.map(({ destino, importe }) => {
    const [tipo, id, extra] = destino.split(":");
    const monto = parsePaymentDecimal(importe, 2, 10);
    if (extra !== undefined || !id || !uuid.test(id) || monto === null) return null;
    if (tipo === "servicio") return { evento_servicio_id: id, importe_ars: monto };
    if (tipo === "catering") return { catering_contrato_id: id, importe_ars: monto };
    return null;
  });
  const total = lines.reduce((sum, line) => sum + Math.round((line?.importe_ars ?? 0) * 100), 0);
  const valid = destinos.length > 0 && destinos.length <= 50 && destinos.length === importes.length &&
    new Set(fields.map((line) => line.destino)).size === fields.length && lines.every((line) => line !== null) &&
    equivalente !== null && total === Math.round(equivalente * 100);
  const requestId = getString(form, "solicitud");
  return { fields, lines: valid ? lines : null, requestId: uuid.test(requestId) ? requestId : null };
}

export type PagoFormState = {
  imputaciones?: ImputacionInput[];
  solicitudConfirmada?: string;
  fields: PagoFormFields;
  errors: PagoFormErrors;
  formError: string | null;
  successMessage: string | null;
};

export type PagoPayload = {
  monto: number;
  moneda: "ARS" | "USD";
  tipo_cambio: number;
  banco: string | null;
  numero_cheque: string | null;
  es_garantia: boolean;
  fecha_pago: string;
  forma_pago: (typeof pagoFormaPagoOptions)[number];
  concepto: string | null;
  notas: string | null;
};

export function getEmptyPagoFormState(): PagoFormState {
  return {
    fields: {
      monto: "",
      moneda: "ARS",
      tipo_cambio: "1",
      banco: "",
      numero_cheque: "",
      es_garantia: "",
      fecha_pago: getArgentinaPaymentDay(),
      forma_pago: "transferencia",
      concepto: "",
      notas: "",
    },
    errors: {},
    formError: null,
    successMessage: null,
  };
}

export function validatePagoForm(formData: FormData): {
  state: PagoFormState;
  payload: PagoPayload | null;
} {
  const fields = getPagoFields(formData);
  const errors: PagoFormErrors = {};
  const monto = parsePaymentDecimal(fields.monto, 2, 10);
  const tipoCambio = fields.moneda === "ARS" ? 1 : parsePaymentDecimal(fields.tipo_cambio, 4, 6);
  if (monto === null) errors.monto = "Ingresa un importe positivo con hasta 2 decimales (máximo 9999999999.99).";
  if (fields.moneda !== "ARS" && fields.moneda !== "USD") errors.moneda = "Selecciona ARS o USD.";
  if (tipoCambio === null || (fields.moneda === "ARS" && fields.tipo_cambio !== "1")) {
    errors.tipo_cambio = "Ingresa una cotización positiva en ARS por USD, con hasta 4 decimales (máximo 999999.9999).";
  }
  if (fields.es_garantia !== "" && fields.es_garantia !== "on") errors.es_garantia = "Garantía inválida.";
  const equivalente = paymentEquivalent(fields.monto, fields.moneda === "ARS" ? "1" : fields.tipo_cambio);
  if (equivalente !== null && equivalente > 9999999999.99) errors.monto = "El equivalente en pesos supera el máximo permitido.";
  const fechaPago = fields.fecha_pago.trim();
  const formaPago = fields.forma_pago.trim();
  const formaPagoPermitida = isAllowedFormaPago(formaPago) ? formaPago : null;

  if (!fechaPago) {
    errors.fecha_pago = "Ingresa la fecha de pago.";
  } else if (!isDateInputValue(fechaPago)) {
    errors.fecha_pago = "Ingresa una fecha valida.";
  }

  if ((fields.moneda === "USD" && !["efectivo_dolares", "transferencia"].includes(formaPago)) ||
      (fields.moneda === "ARS" && formaPago === "efectivo_dolares")) {
    errors.forma_pago = "La forma de pago no corresponde a la moneda seleccionada.";
  }

  if (!formaPagoPermitida) {
    errors.forma_pago = "Selecciona una forma de pago valida.";
  }

  if (Object.keys(errors).length > 0 || monto === null || tipoCambio === null || !formaPagoPermitida) {
    return {
      state: {
        fields,
        errors,
        formError: "Revisa los campos marcados.",
        successMessage: null,
      },
      payload: null,
    };
  }

  return {
    state: {
      fields,
      errors: {},
      formError: null,
      successMessage: null,
    },
    payload: {
      monto,
      moneda: fields.moneda as "ARS" | "USD",
      tipo_cambio: tipoCambio,
      banco: nullableTrim(fields.banco),
      numero_cheque: nullableTrim(fields.numero_cheque),
      es_garantia: fields.es_garantia === "on",
      fecha_pago: fechaPago,
      forma_pago: formaPagoPermitida,
      concepto: nullableTrim(fields.concepto),
      notas: nullableTrim(fields.notas),
    },
  };
}

function getPagoFields(formData: FormData): PagoFormFields {
  return {
    monto: getString(formData, "monto"),
    moneda: getString(formData, "moneda"),
    tipo_cambio: getString(formData, "tipo_cambio"),
    banco: getString(formData, "banco"),
    numero_cheque: getString(formData, "numero_cheque"),
    es_garantia: getString(formData, "es_garantia"),
    fecha_pago: getString(formData, "fecha_pago"),
    forma_pago: getString(formData, "forma_pago"),
    concepto: getString(formData, "concepto"),
    notas: getString(formData, "notas"),
  };
}

function getString(formData: FormData, key: string) {
  const value = formData.get(key);

  return typeof value === "string" ? value : "";
}

// Los límites coinciden con numeric(12,2) y numeric(10,4) de PostgreSQL.
export function parsePaymentDecimal(value: string, scale: number, digits: number) {
  const text = value.trim().replace(",", ".");
  if (!new RegExp(`^\\d{1,${digits}}(?:\\.\\d{1,${scale}})?$`).test(text)) return null;
  const number = Number(text);
  return number > 0 ? number : null;
}

// Producto decimal exacto; como numeric(12,2), los empates se alejan de cero.
export function paymentEquivalent(amount: string, rate: string): number | null {
  if (parsePaymentDecimal(amount, 2, 10) === null || parsePaymentDecimal(rate, 4, 6) === null) return null;
  const scaled = (value: string, scale: number) => {
    const [whole, fraction = ""] = value.trim().replace(",", ".").split(".");
    return BigInt(whole + fraction.padEnd(scale, "0"));
  };
  return Number((scaled(amount, 2) * scaled(rate, 4) + BigInt(5000)) / BigInt(10000)) / 100;
}

export function getPagoEditState(pago: {
  importe_moneda_original: number; moneda: string; tipo_cambio: number | null;
  forma_pago: string; fecha_pago: string; banco: string | null; numero_cheque: string | null;
  es_garantia: boolean; concepto: string | null; notas: string | null;
}): PagoFormState {
  return { ...getEmptyPagoFormState(), fields: {
    monto: String(pago.importe_moneda_original), moneda: pago.moneda,
    tipo_cambio: pago.tipo_cambio === null ? "" : String(pago.tipo_cambio),
    forma_pago: pago.forma_pago, fecha_pago: pago.fecha_pago, banco: pago.banco ?? "",
    numero_cheque: pago.numero_cheque ?? "", es_garantia: pago.es_garantia ? "on" : "",
    concepto: pago.concepto ?? "", notas: pago.notas ?? "",
  } };
}

function isAllowedFormaPago(value: string): value is PagoPayload["forma_pago"] {
  return pagoFormaPagoOptions.some((option) => option === value);
}

function nullableTrim(value: string) {
  const trimmed = value.trim();

  return trimmed || null;
}

function isDateInputValue(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }

  const date = new Date(`${value}T00:00:00.000Z`);

  return !Number.isNaN(date.getTime()) && date.toISOString().startsWith(value);
}
