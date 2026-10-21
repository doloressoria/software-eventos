import { createClient } from "@/lib/supabase/server";
import { logSupabaseError } from "@/lib/supabase/errors";
import {
  calculatePaymentSummary,
  type EstadoCobro,
} from "@/lib/pagos/calculos";
import type { Tables } from "@/types/database.types";

export type { EstadoCobro } from "@/lib/pagos/calculos";

export type PagoEvento = Pick<
  Tables<"pagos">,
  | "catering_contrato_id"
  | "concepto"
  | "created_at"
  | "es_garantia"
  | "evento_servicio_id"
  | "fecha_pago"
  | "forma_pago"
  | "id"
  | "importe_en_pesos"
  | "importe_moneda_original"
  | "tipo_cambio"
  | "banco"
  | "numero_cheque"
  | "moneda"
  | "notas"
> & {
  evento_servicios: {
    servicios_catalogo: Pick<Tables<"servicios_catalogo">, "nombre"> | null;
  } | null;
};

export type EventoIngresos = {
  estadoCobro: EstadoCobro;
  pagos: PagoEvento[];
  saldoPendiente: number;
  totalCobrado: number;
  totalEvento: number;
};

export async function getEventoIngresos(
  eventoId: string,
): Promise<EventoIngresos> {
  const supabase = await createClient();
  const [pagosResult, resumenResult] = await Promise.all([
    supabase
      .from("pagos")
      .select(
        "id, catering_contrato_id, concepto, created_at, es_garantia, evento_servicio_id, fecha_pago, forma_pago, importe_en_pesos, importe_moneda_original, moneda, tipo_cambio, banco, numero_cheque, notas, evento_servicios(servicios_catalogo(nombre))",
      )
      .eq("evento_id", eventoId)
      .is("deleted_at", null)
      .order("fecha_pago", { ascending: false })
      .order("created_at", { ascending: false }),
    supabase
      .from("v_resumen_evento")
      .select("total_catering, total_servicios")
      .eq("id", eventoId)
      .maybeSingle(),
  ]);

  if (pagosResult.error) {
    logSupabaseError("getEventoIngresos pagos", pagosResult.error);
    throw new Error("No se pudieron obtener los pagos del evento.");
  }

  if (resumenResult.error) {
    logSupabaseError("getEventoIngresos resumen", resumenResult.error);
    throw new Error("No se pudo obtener el resumen financiero del evento.");
  }

  const pagos = pagosResult.data as PagoEvento[];
  const totalEvento =
    toMoneyNumber(resumenResult.data?.total_catering) +
    toMoneyNumber(resumenResult.data?.total_servicios);
  const summary = calculatePaymentSummary({ payments: pagos, total: totalEvento });

  return {
    estadoCobro: summary.estadoCobro,
    pagos,
    saldoPendiente: summary.saldoPendiente,
    totalCobrado: summary.totalCobrado,
    totalEvento: summary.totalEvento,
  };
}

function toMoneyNumber(value: number | null | undefined) {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}
