import { categoriasPax } from "../eventos/asistentes";
import {
  isCateringAdicionalCategoria,
  type CateringAdicionalCategoria,
} from "./types";

export type CateringItemFormFields = {
  categoria: string;
  descripcion: string;
  precio_unitario: string;
  modo: string;
  categorias_pax: string[];
};

export type CateringItemFormErrors = Partial<
  Record<keyof CateringItemFormFields, string>
>;

export type CateringItemFormState = {
  fields: CateringItemFormFields;
  errors: CateringItemFormErrors;
  formError: string | null;
  successMessage: string | null;
};

export type CateringItemPayload = {
  categoria: CateringAdicionalCategoria;
  descripcion: string;
  precio_unitario: number;
  categorias_pax: string[] | null;
};

export function getEmptyCateringItemFormState(): CateringItemFormState {
  return {
    fields: {
      categoria: "adicional_alimentos",
      descripcion: "",
      precio_unitario: "",
      modo: "fijo",
      categorias_pax: [],
    },
    errors: {},
    formError: null,
    successMessage: null,
  };
}

export function validateCateringItemForm(formData: FormData): {
  state: CateringItemFormState;
  payload: CateringItemPayload | null;
} {
  const fields = getFields(formData);
  const errors: CateringItemFormErrors = {};
  const categoria = fields.categoria.trim();
  const descripcion = fields.descripcion.trim();
  const precioText = fields.precio_unitario.trim().replace(",", ".");
  let precio: number | null = null;

  if (!isCateringAdicionalCategoria(categoria)) {
    errors.categoria = "Selecciona un tipo de adicional valido.";
  }

  if (fields.modo !== "fijo" && fields.modo !== "persona") errors.modo = "Seleccioná cómo se cobra el adicional.";
  if (fields.modo === "persona" && (fields.categorias_pax.length === 0 ||
      new Set(fields.categorias_pax).size !== fields.categorias_pax.length ||
      fields.categorias_pax.some((value) => !categoriasPax.some(([key]) => key === value)))) {
    errors.categorias_pax = "Elegí al menos una categoría válida.";
  }

  if (!descripcion) {
    errors.descripcion = "Ingresa el detalle del adicional.";
  }

  if (!precioText) {
    errors.precio_unitario = "Ingresa el precio del adicional.";
  } else {
    const value = Number(precioText);

    if (!/^\d{1,10}(?:\.\d{1,2})?$/.test(precioText) || value <= 0) {
      errors.precio_unitario = "Ingresa un precio valido.";
    } else {
      precio = value;
    }
  }

  if (Object.keys(errors).length > 0 || precio === null || !isCateringAdicionalCategoria(categoria)) {
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
      categoria,
      descripcion,
      precio_unitario: precio,
      categorias_pax: fields.modo === "persona" ? fields.categorias_pax : null,
    },
  };
}

function getFields(formData: FormData): CateringItemFormFields {
  return {
    categoria: getString(formData, "categoria"),
    descripcion: getString(formData, "descripcion"),
    precio_unitario: getString(formData, "precio_unitario"),
    modo: getString(formData, "modo") || "fijo",
    categorias_pax: formData.getAll("categorias_pax").map(String),
  };
}

function getString(formData: FormData, key: string) {
  const value = formData.get(key);

  return typeof value === "string" ? value : "";
}
