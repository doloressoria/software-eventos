import "server-only";

import {
  calculateServicioPaymentTotals,
  sumOrdinaryPayments,
} from "@/lib/pagos/calculos";
import { createClient } from "@/lib/supabase/server";
import { logSupabaseError } from "@/lib/supabase/errors";

export async function recalculateEventoServicioTotals(
  eventoServicioId: string,
) {
  const supabase = await createClient();
  const { data: servicio, error: servicioError } = await supabase
    .from("evento_servicios")
    .select("iva_base_imponible, total_sin_iva")
    .eq("id", eventoServicioId)
    .maybeSingle();

  if (servicioError) {
    logSupabaseError(
      "recalculateEventoServicioTotals obtener servicio",
      servicioError,
    );
    return;
  }

  if (!servicio) {
    return;
  }

  const { data: pagos, error: pagosError } = await supabase
    .from("pagos")
    .select(
      "es_garantia, forma_pago, importe_en_pesos, importe_moneda_original",
    )
    .eq("evento_servicio_id", eventoServicioId)
    .is("deleted_at", null);

  if (pagosError) {
    logSupabaseError("recalculateEventoServicioTotals obtener pagos", pagosError);
    return;
  }

  const totals = calculateServicioPaymentTotals(
    pagos,
    servicio.iva_base_imponible,
    servicio.total_sin_iva ?? 0,
  );
  const { error } = await supabase
    .from("evento_servicios")
    .update({
      ...(totals.ivaBaseImponible > servicio.iva_base_imponible
        ? { iva_base_imponible: totals.ivaBaseImponible }
        : {}),
      iva_porcentaje: totals.ivaPorcentaje,
      total_pagado: totals.totalPagado,
      updated_at: new Date().toISOString(),
    })
    .eq("id", eventoServicioId);

  if (error) {
    logSupabaseError("recalculateEventoServicioTotals actualizar", error);
  }
}

export async function getTotalPagadoEventoServicio(
  eventoServicioId: string,
) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("pagos")
    .select(
      "es_garantia, importe_en_pesos, importe_moneda_original",
    )
    .eq("evento_servicio_id", eventoServicioId)
    .is("deleted_at", null);

  if (error) {
    logSupabaseError("getTotalPagadoEventoServicio", error);
    return 0;
  }

  return sumOrdinaryPayments(data);
}
