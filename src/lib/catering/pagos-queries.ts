import { calculatePaymentSummary, type EstadoCobro } from "@/lib/pagos/calculos";
import { createClient } from "@/lib/supabase/server";
import { logSupabaseError } from "@/lib/supabase/errors";
import type { Tables } from "@/types/database.types";

export type { EstadoCobro } from "@/lib/pagos/calculos";

export type PagoCatering = Pick<
  Tables<"pagos">,
  | "concepto"
  | "created_at"
  | "es_garantia"
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
>;

export type CateringIngresos = {
  estadoCobro: EstadoCobro;
  pagos: PagoCatering[];
  saldoPendiente: number;
  totalCobrado: number;
  totalCatering: number;
};

export async function getCateringIngresos(
  cateringContratoId: string,
): Promise<CateringIngresos> {
  const supabase = await createClient();
  const [pagosResult, cateringResult] = await Promise.all([
    supabase
      .from("pagos")
      .select(
        "id, concepto, created_at, es_garantia, fecha_pago, forma_pago, importe_en_pesos, importe_moneda_original, moneda, tipo_cambio, banco, numero_cheque, notas",
      )
      .eq("catering_contrato_id", cateringContratoId)
      .is("deleted_at", null)
      .order("fecha_pago", { ascending: false })
      .order("created_at", { ascending: false }),
    supabase
      .from("catering_contratos")
      .select("total_con_iva")
      .eq("id", cateringContratoId)
      .maybeSingle(),
  ]);

  if (pagosResult.error) {
    logSupabaseError("getCateringIngresos pagos", pagosResult.error);
    throw new Error("No se pudieron obtener los pagos del catering.");
  }

  if (cateringResult.error) {
    logSupabaseError("getCateringIngresos catering", cateringResult.error);
    throw new Error("No se pudo obtener el total del catering.");
  }

  const pagos = pagosResult.data as PagoCatering[];
  const totalCatering = toMoneyNumber(cateringResult.data?.total_con_iva);
  const summary = calculatePaymentSummary({ payments: pagos, total: totalCatering });

  return {
    estadoCobro: summary.estadoCobro,
    pagos,
    saldoPendiente: summary.saldoPendiente,
    totalCobrado: summary.totalCobrado,
    totalCatering: summary.totalEvento,
  };
}

function toMoneyNumber(value: number | null | undefined) {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}
