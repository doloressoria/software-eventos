import { camposPreciosCategoria, validarPreciosCategoria } from "./precios-categoria";
import { getTodayInputValue } from "@/lib/catering/validation";

export type PrecioHistorialFormFields = ReturnType<typeof camposPreciosCategoria> & {
  precio_unitario: string;
  motivo: string;
  fecha: string;
  pax_adultos: string;
  pax_jovenes: string;
  pax_menores: string;
  pax_bebes: string;
};

export type PrecioHistorialFormErrors = Partial<
  Record<keyof PrecioHistorialFormFields, string>
>;

export type PrecioHistorialFormState = {
  fields: PrecioHistorialFormFields;
  errors: PrecioHistorialFormErrors;
  formError: string | null;
  successMessage: string | null;
};

export type PrecioHistorialPayload = ReturnType<typeof validarPreciosCategoria> & {
  precio_unitario: number;
  motivo: string | null;
  fecha: string;
  pax_adultos: number | null;
  pax_jovenes: number | null;
  pax_menores: number | null;
  pax_bebes: number | null;
};

export function getEmptyPrecioHistorialFormState(defaults: {
  pax_adultos: number | null;
  pax_jovenes: number | null;
  pax_menores: number | null;
  pax_bebes: number | null;
}): PrecioHistorialFormState {
  return {
    fields: {
      ...camposPreciosCategoria({}),
      precio_unitario: "",
      motivo: "Recotizacion",
      fecha: getTodayInputValue(),
      pax_adultos: defaults.pax_adultos?.toString() ?? "",
      pax_jovenes: defaults.pax_jovenes?.toString() ?? "",
      pax_menores: defaults.pax_menores?.toString() ?? "",
      pax_bebes: defaults.pax_bebes?.toString() ?? "",
    },
    errors: {},
    formError: null,
    successMessage: null,
  };
}

export function validatePrecioHistorialForm(formData: FormData): {
  state: PrecioHistorialFormState;
  payload: PrecioHistorialPayload | null;
} {
  const fields = getFields(formData);
  const errors: PrecioHistorialFormErrors = {};
  const fecha = fields.fecha.trim();
  const precioText = fields.precio_unitario.trim().replace(",", ".");
  let precio: number | null = null;

  if (!precioText) {
    errors.precio_unitario = "Ingresa el nuevo precio por persona.";
  } else {
    const value = Number(precioText);

    if (!Number.isFinite(value) || value <= 0) {
      errors.precio_unitario = "Ingresa un precio valido.";
    } else {
      precio = roundMoney(value);
    }
  }

  if (!fecha) {
    errors.fecha = "Ingresa la fecha del cambio.";
  } else if (!isDateInputValue(fecha)) {
    errors.fecha = "Ingresa una fecha valida.";
  }

  const paxAdultos = parseOptionalInteger(fields.pax_adultos, "pax_adultos", errors);
  const paxJovenes = parseOptionalInteger(fields.pax_jovenes, "pax_jovenes", errors);
  const paxMenores = parseOptionalInteger(fields.pax_menores, "pax_menores", errors);
  const paxBebes = parseOptionalInteger(fields.pax_bebes, "pax_bebes", errors);

  const preciosCategoria = validarPreciosCategoria(fields, errors);

  if (Object.keys(errors).length > 0 || precio === null) {
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
    state: { fields, errors: {}, formError: null, successMessage: null },
    payload: {
      ...preciosCategoria,
      precio_unitario: precio,
      motivo: nullableTrim(fields.motivo),
      fecha,
      pax_adultos: paxAdultos,
      pax_jovenes: paxJovenes,
      pax_menores: paxMenores,
      pax_bebes: paxBebes,
    },
  };
}

function getFields(formData: FormData): PrecioHistorialFormFields {
  return {
    ...camposPreciosCategoria(formData),
    precio_unitario: getString(formData, "precio_unitario"),
    motivo: getString(formData, "motivo"),
    fecha: getString(formData, "fecha"),
    pax_adultos: getString(formData, "pax_adultos"),
    pax_jovenes: getString(formData, "pax_jovenes"),
    pax_menores: getString(formData, "pax_menores"),
    pax_bebes: getString(formData, "pax_bebes"),
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
  key: keyof PrecioHistorialFormFields,
  errors: PrecioHistorialFormErrors,
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
