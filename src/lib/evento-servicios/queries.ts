import { createClient } from "@/lib/supabase/server";
import {
  getMonthlyServicePricesForEvent,
  type MonthlyServicePriceSuggestions,
} from "@/lib/precios-servicios/precios-mensuales";
import { logSupabaseError } from "@/lib/supabase/errors";
import { roundMoney, toMoneyNumber } from "@/lib/pagos/calculos";
import type { Enums, Tables } from "@/types/database.types";

export type ServicioCatalogoOption = Pick<
  Tables<"servicios_catalogo">,
  "activo" | "categoria" | "descripcion" | "id" | "nombre"
>;

export type EventoServicioItem = Pick<
  Tables<"evento_servicios">,
  | "adicionales_monto"
  | "comisiona_organizador"
  | "created_at"
  | "evento_id"
  | "id"
  | "iva_base_imponible"
  | "iva_porcentaje"
  | "notas"
  | "precio_base"
  | "proveedor"
  | "servicio_id"
  | "total_con_iva"
  | "total_sin_iva"
> & {
  saldo_pendiente: number;
  servicios_catalogo: Pick<
    Tables<"servicios_catalogo">,
    "categoria" | "descripcion" | "nombre"
  > | null;
  total_pagado: number;
};

export type EventoServicioPagoOption = {
  id: string;
  label: string;
  saldoPendiente: number;
};

export async function getEventoValores(eventoId: string) {
  const supabase = await createClient();
  const [catalogoResult, serviciosResult] = await Promise.all([
    supabase
      .from("servicios_catalogo")
      .select("id, nombre, categoria, descripcion, activo")
      .eq("activo", true)
      .order("categoria", { ascending: true })
      .order("nombre", { ascending: true }),
    supabase
      .from("v_evento_servicios_acreditados")
      .select(
        "id, evento_id, servicio_id, precio_base, adicionales_monto, iva_base_imponible, iva_porcentaje, total_sin_iva, total_con_iva, proveedor, total_pagado, saldo_pendiente, notas, comisiona_organizador, created_at, servicios_catalogo(nombre, categoria, descripcion)",
      )
      .eq("evento_id", eventoId)
      .order("created_at", { ascending: true }),
  ]);

  if (catalogoResult.error) {
    logSupabaseError("getEventoValores catalogo", catalogoResult.error);
    throw new Error("No se pudo obtener el catalogo de servicios.");
  }

  if (serviciosResult.error) {
    logSupabaseError("getEventoValores servicios", serviciosResult.error);
    throw new Error("No se pudieron obtener los valores del evento.");
  }

  const catalogo = catalogoResult.data as ServicioCatalogoOption[];
  const monthlyPriceSuggestions = await getMonthlyServicePricesForEvent(
    eventoId,
    catalogo.map((servicio) => servicio.id),
  );
  const servicios = serviciosResult.data as EventoServicioItem[];

  return {
    catalogo,
    monthlyPriceSuggestions,
    opcionesPago: getOpcionesPago(servicios),
    servicios,
    totalEvento: roundMoney(
      servicios.reduce(
        (total, servicio) => total + toMoneyNumber(servicio.total_con_iva),
        0,
      ),
    ),
  };
}

export type EventoValores = Awaited<ReturnType<typeof getEventoValores>>;
export type EventoServicioMonthlyPriceSuggestions = MonthlyServicePriceSuggestions;

export function getCategoriaServicioLabel(value: Enums<"categoria_servicio">) {
  const labels: Record<Enums<"categoria_servicio">, string> = {
    ambientacion: "Ambientacion",
    catering: "Catering",
    dj: "DJ",
    estacionamiento: "Estacionamiento",
    fotografo: "Fotografo",
    garantia: "Garantia",
    sadaic: "SADAIC",
    salon: "Salon",
    sillas_tiffany: "Sillas Tiffany",
    tecnica: "Técnica",
    varios: "Varios",
  };

  return labels[value] ?? value;
}

function getOpcionesPago(
  servicios: EventoServicioItem[],
): EventoServicioPagoOption[] {
  return servicios.map((servicio) => ({
    id: servicio.id,
    label: servicio.servicios_catalogo?.nombre ?? "Servicio sin nombre",
    saldoPendiente: servicio.saldo_pendiente,
  }));
}
