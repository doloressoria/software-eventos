import type { CoberturaPax, TarifaPax } from "@/lib/catering/coberturas";
import { calculatePaymentSummary, toMoneyNumber, type EstadoCobro } from "@/lib/pagos/calculos";
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
  | "tipo_cambio"
  | "banco"
  | "numero_cheque"
  | "moneda"
  | "notas"
> & { pago_id: string } & (
  | { distribuido: true; importe_moneda_original: null }
  | { distribuido: false; importe_moneda_original: number }
);

export type CateringIngresos = {
  estadoCobro: EstadoCobro;
  tarifas: TarifaPax[];
  coberturas: CoberturaPax[];
  pagos: PagoCatering[];
  saldoPendiente: number;
  totalCobrado: number;
  totalCatering: number;
};

export async function getCateringIngresos(
  cateringContratoId: string,
): Promise<CateringIngresos> {
  const supabase = await createClient();
  const [pagosResult, cateringResult, tarifasResult, coberturasResult] = await Promise.all([
    supabase
      .from("v_pago_imputaciones")
      .select(
        "id, pago_id, concepto, created_at, es_garantia, distribuido, fecha_pago, forma_pago, importe_en_pesos, importe_moneda_original, moneda, tipo_cambio, banco, numero_cheque, notas",
      )
      .eq("catering_contrato_id", cateringContratoId)
      .is("deleted_at", null)
      .order("fecha_pago", { ascending: false })
      .order("created_at", { ascending: false }),
    supabase
      .from("v_catering_acreditado")
      .select("total_con_iva, total_pagado, saldo_pendiente")
      .eq("id", cateringContratoId)
      .maybeSingle(),
    supabase.from("v_catering_tarifas").select("*").eq("catering_contrato_id", cateringContratoId),
    supabase.from("catering_coberturas").select("*").eq("catering_contrato_id", cateringContratoId).order("pago_id"),
  ]);

  if (pagosResult.error) {
    logSupabaseError("getCateringIngresos pagos", pagosResult.error);
    throw new Error("No se pudieron obtener los pagos del catering.");
  }

  if (cateringResult.error) {
    logSupabaseError("getCateringIngresos catering", cateringResult.error);
    throw new Error("No se pudo obtener el total del catering.");
  }

  if (tarifasResult.error || coberturasResult.error) {
    throw new Error("No se pudo obtener la cobertura por personas.");
  }

  const pagos = pagosResult.data as PagoCatering[];
  const totalCatering = toMoneyNumber(cateringResult.data?.total_con_iva);
  const summary = calculatePaymentSummary({ payments: pagos, total: totalCatering, saldo: cateringResult.data?.saldo_pendiente ?? undefined });

  return {
    estadoCobro: summary.estadoCobro,
    pagos,
    tarifas: tarifasResult.data,
    coberturas: coberturasResult.data,
    saldoPendiente: summary.saldoPendiente,
    totalCobrado: toMoneyNumber(cateringResult.data?.total_pagado),
    totalCatering: summary.totalEvento,
  };
}
