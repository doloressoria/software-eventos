import type { Tables } from "../../types/database.types";
import { categoriasPax, type CategoriaPax } from "../eventos/asistentes";
import { parsePaymentDecimal } from "../pagos/validation";

export type TarifaPax = Tables<"v_catering_tarifas">;
export type CoberturaPax = Tables<"catering_coberturas">;
export type FiscalCatering = Pick<Tables<"v_catering_acreditado">,
  "version_calculo" | "neto_vigente" | "neto_exigible" | "porcentaje_facturado" | "base_imponible" |
  "iva_porcentaje" | "iva_calculado" | "iva_exigible" | "iva_cobrado" | "iva_cancelado" | "iva_reservado" |
  "iva_pendiente" | "ajuste_redondeo">;
export type ComponenteCatering = Tables<"catering_cobro_componentes">;
export type OpcionCobertura = { id: string; label: string; tarifas: TarifaPax[]; fiscal?: FiscalCatering };

export function totalesCobertura(tarifas: TarifaPax[]) {
  const total = { pax: 0, cubiertos: 0, por_acreditar: 0, pendientes: 0, excedente: 0, saldo_categoria: 0 };
  for (const tarifa of tarifas) {
    for (const key of ["pax", "cubiertos", "por_acreditar", "pendientes", "excedente"] as const) total[key] += tarifa[key] ?? 0;
    total.saldo_categoria += Math.round((tarifa.saldo_categoria ?? 0) * 100);
  }
  total.saldo_categoria /= 100;
  return total;
}

export function importeReasignable(cantidad: number, precio: number, componente?: ComponenteCatering) {
  const nominal = cantidad * Math.round(precio * 100);
  const disponible = componente ? Math.round(((componente.capital_ars ?? componente.objetivo_ars)
    - (componente.ajuste_ars - componente.ajuste_iva_ars) - componente.capital_reasignado_ars) * 100) : nominal;
  return Math.max(0, Math.min(nominal, disponible)) / 100;
}

export function cantidadPax(value: string) {
  const cantidad = Number(value);
  return /^\d{1,10}$/.test(value) && cantidad > 0 && cantidad <= 2147483647 ? cantidad : 0;
}

export function lineasCobertura(form: FormData, permitirVacio = false) {
  const lineas = [];
  for (const [categoria] of categoriasPax) {
    const value = form.get(`cantidad_${categoria}`);
    if (value === null || value === "" || value === "0") continue;
    const cantidad = cantidadPax(String(value));
    const precio = parsePaymentDecimal(String(form.get(`aplicado_${categoria}`) ?? ""), 2, 10);
    if (!cantidad || precio === null) return null;
    lineas.push({ categoria, cantidad, precio_aplicado: precio });
  }
  return lineas.length || permitirVacio ? lineas : null;
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
