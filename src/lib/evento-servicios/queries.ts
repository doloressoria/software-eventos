import { createClient } from "@/lib/supabase/server";
import {
  getMonthlyServicePricesForEvent,
  type MonthlyServicePriceSuggestions,
} from "@/lib/precios-servicios/precios-mensuales";
import { logSupabaseError } from "@/lib/supabase/errors";
import {
  getMoneyAmount,
  isOrdinaryPayment,
} from "@/lib/pagos/calculos";
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

type PagoServicioRow = Pick<
  Tables<"pagos">,
  | "es_garantia"
  | "evento_servicio_id"
  | "importe_en_pesos"
  | "importe_moneda_original"
  | "moneda"
>;

type EventoServicioRow = Omit<
  EventoServicioItem,
  "saldo_pendiente" | "servicios_catalogo" | "total_pagado"
> & {
  saldo_pendiente: number | null;
  servicios_catalogo: Pick<
    Tables<"servicios_catalogo">,
    "categoria" | "descripcion" | "nombre"
  > | null;
  total_pagado: number | null;
};

export async function getEventoValores(eventoId: string) {
  const supabase = await createClient();
  const [catalogoResult, serviciosResult, pagosResult] = await Promise.all([
    supabase
      .from("servicios_catalogo")
      .select("id, nombre, categoria, descripcion, activo")
      .eq("activo", true)
      .order("categoria", { ascending: true })
      .order("nombre", { ascending: true }),
    supabase
      .from("evento_servicios")
      .select(
        "id, evento_id, servicio_id, precio_base, adicionales_monto, iva_base_imponible, iva_porcentaje, total_sin_iva, total_con_iva, proveedor, total_pagado, saldo_pendiente, notas, comisiona_organizador, created_at, servicios_catalogo(nombre, categoria, descripcion)",
      )
      .eq("evento_id", eventoId)
      .order("created_at", { ascending: true }),
    supabase
      .from("pagos")
      .select(
        "es_garantia, evento_servicio_id, importe_en_pesos, importe_moneda_original, moneda",
      )
      .eq("evento_id", eventoId)
      .is("deleted_at", null)
      .not("evento_servicio_id", "is", null),
  ]);

  if (catalogoResult.error) {
    logSupabaseError("getEventoValores catalogo", catalogoResult.error);
    throw new Error("No se pudo obtener el catalogo de servicios.");
  }

  if (serviciosResult.error) {
    logSupabaseError("getEventoValores servicios", serviciosResult.error);
    throw new Error("No se pudieron obtener los valores del evento.");
  }

  if (pagosResult.error) {
    logSupabaseError("getEventoValores pagos", pagosResult.error);
    throw new Error("No se pudieron obtener los pagos asociados a servicios.");
  }

  const pagosPorServicio = getPagosPorServicio(pagosResult.data as PagoServicioRow[]);
  const catalogo = catalogoResult.data as ServicioCatalogoOption[];
  const monthlyPriceSuggestions = await getMonthlyServicePricesForEvent(
    eventoId,
    catalogo.map((servicio) => servicio.id),
  );
  const servicios = (serviciosResult.data as EventoServicioRow[]).map(
    (servicio) => {
      const totalConIva = toMoneyNumber(servicio.total_con_iva);
      const totalPagado = pagosPorServicio.get(servicio.id) ?? 0;

      return {
        ...servicio,
        saldo_pendiente: roundMoney(totalConIva - totalPagado),
        total_pagado: totalPagado,
      };
    },
  );

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

function getPagosPorServicio(pagos: PagoServicioRow[]) {
  const pagosPorServicio = new Map<string, number>();

  for (const pago of pagos) {
    if (!pago.evento_servicio_id || !isOrdinaryPayment(pago)) {
      continue;
    }

    const monto = getMoneyAmount(pago);
    const current = pagosPorServicio.get(pago.evento_servicio_id) ?? 0;

    pagosPorServicio.set(pago.evento_servicio_id, roundMoney(current + monto));
  }

  return pagosPorServicio;
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

function toMoneyNumber(value: number | null | undefined) {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function roundMoney(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}
