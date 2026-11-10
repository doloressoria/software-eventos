"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getAuthorizedActiveEvento, getCurrentProfile } from "@/lib/auth";
import {
  getEmptyPagoFormState,
  type PagoFormState,
  paymentEquivalent,
  validateImputaciones,
  validatePagoForm,
} from "@/lib/pagos/validation";
import { guardarCobertura } from "@/lib/catering/guardar-cobertura";
import { cantidadPax } from "@/lib/catering/coberturas";
import { createClient } from "@/lib/supabase/server";
import { logSupabaseError } from "@/lib/supabase/errors";

export type DeletePagoState = {
  formError?: string;
};

const CREATE_PAGO_ERROR =
  "No se pudo registrar el pago. Verifica los datos e intenta nuevamente.";
const DELETE_PAGO_ERROR =
  "No se pudo eliminar el pago. Verifica los datos e intenta nuevamente.";

export async function createPagoAction(
  eventoId: string,
  _previousState: PagoFormState,
  formData: FormData,
): Promise<PagoFormState> {
  return savePago(eventoId, null, formData);
}

export async function updatePagoAction(eventoId: string, pagoId: string, _state: PagoFormState, formData: FormData): Promise<PagoFormState> {
  return savePago(eventoId, pagoId, formData);
}

async function savePago(eventoId: string, pagoId: string | null, formData: FormData): Promise<PagoFormState> {
  const profile = await getCurrentProfile();

  if (!profile?.activo) {
    redirect("/dashboard");
  }

  const { state, payload } = validatePagoForm(formData);
  const { fields, lines, requestId } = validateImputaciones(formData, paymentEquivalent(
    state.fields.monto, state.fields.moneda === "ARS" ? "1" : state.fields.tipo_cambio,
  ));
  state.imputaciones = fields;

  if (!payload) {
    return state;
  }

  const evento = await getAuthorizedActiveEvento(eventoId, profile);

  if (!evento) {
    return {
      ...state,
      formError: CREATE_PAGO_ERROR,
    };
  }

  const id = pagoId ?? requestId;
  if (!pagoId && formData.get("modo_pago") === "personas") {
    const result = await guardarCobertura(formData, state, payload, { eventoId });
    if (result.successMessage) revalidateEventoPaths(eventoId);
    return result;
  }
  if (!lines || !id) {
    return { ...state, formError: "Elegí destinos distintos y distribuí el equivalente en ARS al centavo." };
  }

  const supabase = await createClient();
  const values = {
    concepto: payload.concepto,
    es_garantia: payload.es_garantia,
    fecha_pago: payload.fecha_pago,
    forma_pago: payload.forma_pago,
    importe_moneda_original: payload.monto,
    moneda: payload.moneda,
    tipo_cambio: payload.tipo_cambio,
    banco: payload.banco,
    numero_cheque: payload.numero_cheque,
    notas: payload.notas,
  };
  const { data, error } = await supabase.rpc("guardar_pago_distribuido", {
    p_evento: evento.id,
    p_pago: id,
    p_editar: pagoId !== null,
    p_cabecera: values,
    p_imputaciones: lines,
  });

  if (error) {
    logSupabaseError("guardar pago distribuido", { code: error.code });
    const formError = {
      "23505": "Ese intento ya se guardó. Recargá Ingresos antes de registrar otro cobro.",
      "23514": "Revisá que los destinos sigan activos y pertenezcan al evento.",
    }[error.code] ?? CREATE_PAGO_ERROR;
    return { ...state, formError };
  }

  if (!data) {
    return {
      ...state,
      formError: CREATE_PAGO_ERROR,
    };
  }

  revalidateEventoPaths(evento.id);

  return {
    ...(pagoId ? state : { ...getEmptyPagoFormState(), solicitudConfirmada: id }),
    successMessage: pagoId ? "Pago actualizado correctamente." : "Pago registrado correctamente.",
  };
}

export async function reasignarExcedenteAction(
  eventoId: string, pagoId: string, cateringId: string, categoria: string, liberada: number,
  _state: DeletePagoState, formData: FormData,
): Promise<DeletePagoState> {
  const profile = await getCurrentProfile();
  if (!profile?.activo || !await getAuthorizedActiveEvento(eventoId, profile)) return { formError: "Reasignación no autorizada." };
  const cantidad = cantidadPax(String(formData.get("cantidad") ?? ""));
  const [tipo, destino, extra] = String(formData.get("destino") ?? "").split(":");
  if (!cantidad || extra !== undefined || !destino || (tipo !== "servicio" && tipo !== "catering")) {
    return { formError: "Ingresá la cantidad y elegí el destino del excedente." };
  }
  const supabase = await createClient();
  const { error } = await supabase.rpc("reasignar_excedente_catering", {
    p_catering: cateringId, p_pago: pagoId, p_categoria: categoria, p_cantidad: cantidad,
    p_destino: destino, p_es_catering: tipo === "catering", p_liberada_esperada: liberada,
  });
  if (error) {
    logSupabaseError("reasignar excedente de catering", { code: error.code });
    return { formError: "No se pudo reasignar. Revisá el excedente, los destinos, las tarifas históricas y tus permisos." };
  }
  revalidateEventoPaths(eventoId);
  return {};
}

export async function deletePagoAction(
  eventoId: string,
  pagoId: string,
  previousState: DeletePagoState,
  formData: FormData,
): Promise<DeletePagoState> {
  void previousState;
  void formData;

  const profile = await getCurrentProfile();

  if (!profile?.activo) {
    redirect("/dashboard");
  }

  const evento = await getAuthorizedActiveEvento(eventoId, profile);

  if (!evento) {
    return {
      formError: DELETE_PAGO_ERROR,
    };
  }

  const deletedAt = new Date().toISOString();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("pagos")
    .update({
      deleted_at: deletedAt,
    })
    .eq("id", pagoId)
    .eq("evento_id", evento.id)
    .is("deleted_at", null)
    .select("id")
    .maybeSingle();

  if (error) {
    logSupabaseError("deletePagoAction eliminar pago", error);
    return {
      formError: "No se pudo eliminar el pago. Intenta nuevamente.",
    };
  }

  if (!data) {
    return {
      formError: DELETE_PAGO_ERROR,
    };
  }

  revalidateEventoPaths(evento.id);

  return {};
}

function revalidateEventoPaths(eventoId: string) {
  revalidatePath("/eventos");
  revalidatePath(`/eventos/${eventoId}`);
  revalidatePath(`/eventos/${eventoId}/ingresos`);
  revalidatePath(`/eventos/${eventoId}/flujo-dinero`);
  revalidatePath("/reportes", "layout");
  revalidatePath("/catering", "layout");
}
