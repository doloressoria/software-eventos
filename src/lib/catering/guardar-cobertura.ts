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
  const lineas = lineasCobertura(form);
  const uuid = /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i;
  if (!payload) return state;
  if (!uuid.test(cateringId) || !uuid.test(solicitud) || !lineas || payload.es_garantia) {
    return { ...state, formError: "Elegí un catering y las cantidades a cubrir con un cobro ordinario." };
  }

  const supabase = await createClient();
  const { monto, ...cabecera } = payload;
  const { data, error } = await supabase.rpc("guardar_pago_por_personas", {
    p_catering: cateringId,
    p_pago: solicitud,
    p_cabecera: { ...cabecera, importe_moneda_original: monto },
    p_coberturas: lineas,
    ...(eventoId ? { p_evento_esperado: eventoId } : {}),
  });
  if (error || !data) {
    if (error) logSupabaseError("guardar pago por personas", { code: error.code });
    return {
      ...state,
      formError: error?.code === "23514"
        ? "Revisá que el equivalente coincida y que sigan vigentes los precios y los PAX disponibles. Recargá si cambiaron."
        : "No se pudo registrar el cobro por personas. Verificá tus permisos o recargá Ingresos.",
    };
  }
  return { ...getEmptyPagoFormState(), solicitudConfirmada: data, successMessage: "Pago por personas registrado correctamente." };
}
