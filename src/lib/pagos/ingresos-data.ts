import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Tables } from "../../types/database.types";
import type { CoberturaPax, OpcionCobertura } from "../catering/coberturas";
import type { ImputacionDestino } from "./validation";
import { allRows } from "../commercial-export/rows";
import { ExportError } from "../commercial-export/types";
import { calculatePaymentSummary, getArgentinaPaymentDay, sumOrdinaryPayments, toMoneyNumber, type EstadoCobro } from "./calculos";

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
  ajusteCobertura: number;
  fechaSaldo: string;
};

export async function loadEventoIngresos(supabase: SupabaseClient<Database>, eventoId: string): Promise<EventoIngresos> {
  const [pagos, resumenResult, contratos, tarifas] = await Promise.all([
    allRows((start, end) => supabase.from("pagos").select(
      "id, catering_contrato_id, concepto, created_at, es_garantia, evento_servicio_id, fecha_pago, forma_pago, importe_en_pesos, importe_moneda_original, moneda, tipo_cambio, banco, numero_cheque, notas, registrado_por, catering_coberturas(*), pago_imputaciones(evento_servicio_id,catering_contrato_id,importe_ars)",
    ).eq("evento_id", eventoId).is("deleted_at", null)
      .order("fecha_pago", { ascending: false }).order("created_at", { ascending: false }).order("id")
      .range(start, end)),
    supabase.from("v_resumen_evento").select("total_catering,total_servicios,ajuste_cobertura_catering")
      .eq("id", eventoId).maybeSingle(),
    allRows((start, end) => supabase.from("v_catering_acreditado").select("id,tipo_servicio,saldo_pendiente")
      .eq("evento_id", eventoId).is("deleted_at", null).order("created_at").order("id").range(start, end)),
    allRows((start, end) => supabase.from("v_catering_tarifas").select("*").eq("evento_id", eventoId)
      .order("catering_contrato_id").order("categoria").range(start, end)),
  ]);
  if (resumenResult.error || !resumenResult.data) {
    throw new ExportError(500, "No se pudo obtener el resumen financiero del evento.");
  }
  const resumen = resumenResult.data;
  const cateringDestinos = contratos.flatMap((c, index) => c.id ? [{
    value: `catering:${c.id}`,
    label: c.tipo_servicio?.trim() ? `Catering · ${c.tipo_servicio.trim()}` : `Catering ${index + 1}`,
    saldoPendiente: toMoneyNumber(c.saldo_pendiente),
  }] : []);
  const totalEvento = toMoneyNumber(resumen.total_catering) + toMoneyNumber(resumen.total_servicios);
  const ajusteCobertura = toMoneyNumber(resumen.ajuste_cobertura_catering);
  const summary = calculatePaymentSummary({
    payments: pagos, total: totalEvento, saldo: totalEvento + ajusteCobertura - sumOrdinaryPayments(pagos),
  });
  return {
    estadoCobro: summary.estadoCobro, cateringDestinos,
    coberturas: cateringDestinos.map(({ value, label }) => {
      const id = value.slice("catering:".length);
      return { id, label, tarifas: tarifas.filter((row) => row.catering_contrato_id === id) };
    }),
    pagos, saldoPendiente: summary.saldoPendiente, totalCobrado: summary.totalCobrado,
    totalEvento: summary.totalEvento, ajusteCobertura, fechaSaldo: getArgentinaPaymentDay(),
  };
}
