import type { Tables } from "../../types/database.types";
import { categoriasPax, type CategoriaPax } from "../eventos/asistentes";
import { parsePaymentDecimal } from "../pagos/validation";

export type TarifaPax = Tables<"v_catering_tarifas">;
export type CoberturaPax = Tables<"catering_coberturas">;
export type OpcionCobertura = { id: string; label: string; tarifas: TarifaPax[] };

export function cantidadPax(value: string) {
  const cantidad = Number(value);
  return /^\d{1,10}$/.test(value) && cantidad > 0 && cantidad <= 2147483647 ? cantidad : 0;
}

export function lineasCobertura(form: FormData) {
  const lineas = [];
  for (const [categoria] of categoriasPax) {
    const value = form.get(`cantidad_${categoria}`);
    if (value === null || value === "" || value === "0") continue;
    const cantidad = cantidadPax(String(value));
    const precio = parsePaymentDecimal(String(form.get(`aplicado_${categoria}`) ?? ""), 2, 10);
    if (!cantidad || precio === null) return null;
    lineas.push({ categoria, cantidad, precio_aplicado: precio });
  }
  return lineas.length ? lineas : null;
}

export function nombreCategoria(categoria: string) {
  return categoriasPax.find(([key]) => key === categoria)?.[1] ?? categoria;
}

export function totalVistaPrevia(tarifas: Pick<TarifaPax, "categoria" | "precio_aplicado">[], cantidades: Partial<Record<CategoriaPax, string>>) {
  const centavos = tarifas.reduce((total, tarifa) => {
    const cantidad = cantidadPax(cantidades[tarifa.categoria as CategoriaPax] ?? "");
    return total + cantidad * Math.round((tarifa.precio_aplicado ?? 0) * 100);
  }, 0);
  return centavos / 100;
}
