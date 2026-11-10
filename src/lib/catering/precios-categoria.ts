import { categoriasPax, type CategoriaPax } from "../eventos/asistentes";

type PrecioCampo = `precio_${CategoriaPax}`;

export function camposPreciosCategoria(data: FormData | Partial<Record<PrecioCampo, number | null>>) {
  const campo = (nombre: PrecioCampo) => {
    const value = data instanceof FormData ? data.get(nombre) : data[nombre];
    return typeof value === "string" || typeof value === "number" ? String(value) : "";
  };
  return {
    precio_adultos: campo("precio_adultos"),
    precio_jovenes: campo("precio_jovenes"),
    precio_menores: campo("precio_menores"),
    precio_bebes: campo("precio_bebes"),
  };
}

export function validarPreciosCategoria(fields: Record<PrecioCampo, string>, errors: Partial<Record<PrecioCampo, string>>) {
  const precios: Record<PrecioCampo, number | null> = {
    precio_adultos: null, precio_jovenes: null, precio_menores: null, precio_bebes: null,
  };
  for (const [categoria] of categoriasPax) {
    const key = `precio_${categoria}` as const;
    const value = fields[key].trim().replace(",", ".");
    if (value === "") continue;
    if (/^\d{1,10}(?:\.\d{1,2})?$/.test(value)) precios[key] = Number(value);
    else errors[key] = "Ingresá un precio entre 0 y 9999999999,99 con hasta dos decimales.";
  }
  return precios;
}
