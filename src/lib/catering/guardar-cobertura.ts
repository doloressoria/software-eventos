import { cateringRounding, moneyCents, moneyText } from "@/lib/catering/cobro-calculos";
import { lineasCobertura } from "@/lib/catering/coberturas";
import { getEmptyPagoFormState, type PagoFormState, type PagoPayload } from "@/lib/pagos/validation";
import { createClient } from "@/lib/supabase/server";
import { logSupabaseError } from "@/lib/supabase/errors";

export async function guardarCobertura(
  form: FormData, state: PagoFormState, payload: PagoPayload | null,
  destino: { eventoId: string } | { cateringId: string },
): Promise<PagoFormState> {
  const eventoId = "eventoId" in destino ? destino.eventoId : undefined;
  const cateringId = "cateringId" in destino ? destino.cateringId : String(form.get("cobertura_catering") ?? "");
  const solicitud = String(form.get("solicitud") ?? "");
  const separado = form.get("version_calculo") === "2";
  const lineas = lineasCobertura(form, separado);
  const uuid = /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i;
  if (!payload) return state;
  if (!uuid.test(cateringId) || !uuid.test(solicitud) || !lineas || payload.es_garantia) {
    return { ...state, formError: "Elegí un catering y las cantidades a cubrir con un cobro ordinario." };
  }

  const paxCents = (lineas ?? []).reduce((sum, line) => sum + BigInt(line.cantidad) * moneyCents(line.precio_aplicado.toFixed(2))!, BigInt(0));
  const extra = separado ? moneyCents(String(form.get("capital_extra_ars") || "0")) : BigInt(0);
  const iva = separado ? moneyCents(String(form.get("iva_ars") || "0")) : BigInt(0);
  if (extra === null || iva === null || paxCents + extra > BigInt(999999999999)) {
    return { ...state, formError: "Revisá el desglose de capital e IVA." };
  }
  const capital = paxCents + extra;
  if (!cateringRounding(moneyText(capital), moneyText(iva), String(payload.monto), String(payload.tipo_cambio), payload.moneda)) {
    return { ...state, formError: "El importe debe coincidir con el objetivo ARS o con su USD recomendado, redondeado a centavos. Usá pago por importe para otro monto." };
  }
  const supabase = await createClient();
  const { monto, ...cabecera } = payload;
  const { data, error } = await supabase.rpc("guardar_pago_por_personas", {
    p_catering: cateringId,
    p_pago: solicitud,
    p_cabecera: { ...cabecera, importe_moneda_original: monto, ...(separado ? { capital_ars: moneyText(capital), iva_ars: moneyText(iva) } : {}) },
    p_coberturas: lineas,
    ...(eventoId ? { p_evento_esperado: eventoId } : {}),
  });
  if (error || !data) {
    if (error) logSupabaseError("guardar pago por personas", { code: error.code });
    return {
      ...state,
      formError: ({
        P2001: "El importe USD está fuera de la política de redondeo. Revisá la sugerencia y la cotización.",
        P2002: "La tarifa cambió. Recargá Ingresos para confirmar el precio vigente.",
        P2003: "No quedan suficientes PAX disponibles; puede haber otro cobro o un cheque pendiente.",
        P2004: "El IVA pendiente cambió o está reservado por otro cheque. Recargá Ingresos.",
        "23514": "Revisá el desglose, las cantidades y los importes.",
        "23505": "La solicitud ya se usó para otro cobro. Recargá Ingresos.",
        "42501": "No tenés permiso para registrar este cobro.",
      } as Record<string, string>)[error?.code ?? ""] ?? "No se pudo registrar el cobro. El borrador se conserva para reintentar.",
    };
  }
  return { ...getEmptyPagoFormState(), solicitudConfirmada: data, successMessage: "Cobro de catering registrado correctamente." };
}
