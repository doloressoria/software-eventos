import "server-only";

import { sumOrdinaryPayments } from "@/lib/pagos/calculos";
import { createClient } from "@/lib/supabase/server";
import { logSupabaseError } from "@/lib/supabase/errors";

export async function recalculateCateringTotals(cateringContratoId: string) {
  const supabase = await createClient();
  const [contratoResult, precioResult, itemsResult, pagosResult] =
    await Promise.all([
      supabase
        .from("catering_contratos")
        .select(
          "pax_adultos, pax_jovenes, pax_menores, pax_bebes, comision_organizador_monto, iva_comision, iva_porcentaje",
        )
        .eq("id", cateringContratoId)
        .maybeSingle(),
      supabase
        .from("catering_precio_historial")
        .select("precio_unitario")
        .eq("catering_contrato_id", cateringContratoId)
        .order("fecha", { ascending: false })
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase
        .from("catering_items")
        .select("precio_unitario")
        .eq("catering_contrato_id", cateringContratoId),
      supabase
        .from("pagos")
        .select("es_garantia, importe_en_pesos, importe_moneda_original, moneda")
        .eq("catering_contrato_id", cateringContratoId)
        .is("deleted_at", null),
    ]);

  if (contratoResult.error) {
    logSupabaseError(
      "recalculateCateringTotals obtener contrato",
      contratoResult.error,
    );
    return;
  }

  if (!contratoResult.data) {
    return;
  }

  if (precioResult.error) {
    logSupabaseError("recalculateCateringTotals obtener precio", precioResult.error);
    return;
  }

  if (itemsResult.error) {
    logSupabaseError("recalculateCateringTotals obtener adicionales", itemsResult.error);
    return;
  }

  if (pagosResult.error) {
    logSupabaseError("recalculateCateringTotals obtener pagos", pagosResult.error);
    return;
  }

  const contrato = contratoResult.data;
  const precioVigente = toMoneyNumber(precioResult.data?.precio_unitario);
  const paxTotal =
    toIntNumber(contrato.pax_adultos) +
    toIntNumber(contrato.pax_jovenes) +
    toIntNumber(contrato.pax_menores) +
    toIntNumber(contrato.pax_bebes);
  const subtotalPax = roundMoney(precioVigente * paxTotal);
  const adicionalesTotal = roundMoney(
    itemsResult.data.reduce(
      (total, item) => total + toMoneyNumber(item.precio_unitario),
      0,
    ),
  );
  const subtotal = roundMoney(subtotalPax + adicionalesTotal);
  const comisionMonto = toMoneyNumber(contrato.comision_organizador_monto);
  const ivaComisionRate = toMoneyNumber(contrato.iva_comision);
  const ivaPorcentajeRate = toMoneyNumber(contrato.iva_porcentaje);
  const ivaSubtotal = roundMoney(subtotal * ivaPorcentajeRate);
  const comisionIvaMonto = roundMoney(comisionMonto * ivaComisionRate);
  const totalSinIva = roundMoney(subtotal + comisionMonto);
  const totalConIva = roundMoney(
    subtotal + ivaSubtotal + comisionMonto + comisionIvaMonto,
  );
  const totalPagado = sumOrdinaryPayments(pagosResult.data);

  const { error } = await supabase
    .from("catering_contratos")
    .update({
      total_sin_iva: totalSinIva,
      total_con_iva: totalConIva,
      total_pagado: totalPagado,
      updated_at: new Date().toISOString(),
    })
    .eq("id", cateringContratoId);

  if (error) {
    logSupabaseError("recalculateCateringTotals actualizar", error);
  }
}

function toMoneyNumber(value: number | null | undefined) {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function toIntNumber(value: number | null | undefined) {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function roundMoney(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}
