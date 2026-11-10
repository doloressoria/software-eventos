import { createClient } from "@/lib/supabase/server";
import { logSupabaseError } from "@/lib/supabase/errors";
import {
  calculatePaymentSummary,
  sumOrdinaryPayments,
  type EstadoCobro,
} from "@/lib/pagos/calculos";
import type { CoberturaPax, OpcionCobertura } from "@/lib/catering/coberturas";
import type { ImputacionDestino } from "@/lib/pagos/validation";
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
  | "registrado_por"
> & {
  catering_coberturas: CoberturaPax[];
  pago_imputaciones: Pick<Tables<"pago_imputaciones">, "evento_servicio_id" | "catering_contrato_id" | "importe_ars">[];
};

export type EventoIngresos = {
  estadoCobro: EstadoCobro;
  cateringDestinos: ImputacionDestino[];
  coberturas: OpcionCobertura[];
  pagos: PagoEvento[];
  saldoPendiente: number;
  totalCobrado: number;
  totalEvento: number;
};

export async function getEventoIngresos(
  eventoId: string,
): Promise<EventoIngresos> {
  const supabase = await createClient();
  const [pagosResult, resumenResult, cateringResult, tarifasResult] = await Promise.all([
    supabase
      .from("pagos")
      .select(
        "id, catering_contrato_id, concepto, created_at, es_garantia, evento_servicio_id, fecha_pago, forma_pago, importe_en_pesos, importe_moneda_original, moneda, tipo_cambio, banco, numero_cheque, notas, registrado_por, catering_coberturas(*), pago_imputaciones(evento_servicio_id,catering_contrato_id,importe_ars)",
      )
      .eq("evento_id", eventoId)
      .is("deleted_at", null)
      .order("fecha_pago", { ascending: false })
      .order("created_at", { ascending: false }),
    supabase
      .from("v_resumen_evento")
      .select("total_catering, total_servicios, ajuste_cobertura_catering")
      .eq("id", eventoId)
      .maybeSingle(),
    supabase.from("v_catering_acreditado").select("id, tipo_servicio, saldo_pendiente")
      .eq("evento_id", eventoId).is("deleted_at", null).order("created_at").order("id"),
    supabase.from("v_catering_tarifas").select("*").eq("evento_id", eventoId),
  ]);

  if (pagosResult.error) {
    logSupabaseError("getEventoIngresos pagos", pagosResult.error);
    throw new Error("No se pudieron obtener los pagos del evento.");
  }

  if (resumenResult.error) {
    logSupabaseError("getEventoIngresos resumen", resumenResult.error);
    throw new Error("No se pudo obtener el resumen financiero del evento.");
  }

  if (cateringResult.error) {
    logSupabaseError("getEventoIngresos destinos de catering", cateringResult.error);
    throw new Error("No se pudieron obtener los destinos de catering.");
  }

  if (tarifasResult.error) {
    logSupabaseError("getEventoIngresos tarifas de catering", tarifasResult.error);
    throw new Error("No se pudieron obtener las tarifas de catering.");
  }

  const cateringDestinos = cateringResult.data.flatMap((c, index) => c.id ? [{
    value: `catering:${c.id}`,
    label: c.tipo_servicio?.trim() ? `Catering · ${c.tipo_servicio.trim()}` : `Catering ${index + 1}`,
    saldoPendiente: toMoneyNumber(c.saldo_pendiente),
  }] : []);
  const pagos = pagosResult.data as PagoEvento[];
  const totalEvento =
    toMoneyNumber(resumenResult.data?.total_catering) +
    toMoneyNumber(resumenResult.data?.total_servicios);
  const resumen = resumenResult.data;
  const ajusteCobertura = resumen?.ajuste_cobertura_catering ?? 0;
  const summary = calculatePaymentSummary({
    payments: pagos, total: totalEvento, saldo: totalEvento + ajusteCobertura - sumOrdinaryPayments(pagos),
  });

  return {
    estadoCobro: summary.estadoCobro,
    cateringDestinos,
    coberturas: cateringDestinos.map(({ value, label }) => {
      const id = value.slice("catering:".length);
      return { id, label, tarifas: tarifasResult.data.filter((row) => row.catering_contrato_id === id) };
    }),
    pagos,
    saldoPendiente: summary.saldoPendiente,
    totalCobrado: summary.totalCobrado,
    totalEvento: summary.totalEvento,
  };
}

function toMoneyNumber(value: number | null | undefined) {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}
