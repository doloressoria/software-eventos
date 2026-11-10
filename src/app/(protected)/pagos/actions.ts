"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getAuthorizedActiveEvento, getCurrentProfile } from "@/lib/auth";
import {
  getEmptyPagoFormState,
  type PagoFormState,
  validatePagoForm,
} from "@/lib/pagos/validation";
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

  const eventoServicioId =
    payload.evento_servicio_id ??
    (await getEventoServicioConMayorSaldo(evento.id));

  if (
    eventoServicioId &&
    !(await isEventoServicioForEvento(eventoServicioId, evento.id))
  ) {
    return {
      ...state,
      formError: CREATE_PAGO_ERROR,
    };
  }

  const supabase = await createClient();
  const values = {
    concepto: payload.concepto,
    es_garantia: payload.es_garantia,
    evento_id: evento.id,
    evento_servicio_id: eventoServicioId,
    fecha_pago: payload.fecha_pago,
    forma_pago: payload.forma_pago,
    importe_moneda_original: payload.monto,
    moneda: payload.moneda,
    tipo_cambio: payload.tipo_cambio,
    banco: payload.banco,
    numero_cheque: payload.numero_cheque,
    notas: payload.notas,
  };
  const mutation = pagoId
    ? supabase.from("pagos").update(values).eq("id", pagoId).eq("evento_id", evento.id)
      .is("catering_contrato_id", null).is("deleted_at", null)
    : supabase.from("pagos").insert({ ...values, registrado_por: profile.id });
  const { data, error } = await mutation.select("id").maybeSingle();

  if (error) {
    logSupabaseError("createPagoAction insertar pago", error);
    return {
      ...state,
      formError: "No se pudo registrar el pago. Intenta nuevamente.",
    };
  }

  if (!data) {
    return {
      ...state,
      formError: CREATE_PAGO_ERROR,
    };
  }

  revalidateEventoPaths(evento.id);

  return {
    ...(pagoId ? state : getEmptyPagoFormState()),
    successMessage: pagoId ? "Pago actualizado correctamente." : "Pago registrado correctamente.",
  };
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

async function isEventoServicioForEvento(
  eventoServicioId: string,
  eventoId: string,
) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("evento_servicios")
    .select("id")
    .eq("id", eventoServicioId)
    .eq("evento_id", eventoId)
    .maybeSingle();

  if (error) {
    logSupabaseError("pagos validar servicio del evento", error);
    return false;
  }

  return Boolean(data);
}

async function getEventoServicioConMayorSaldo(eventoId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("v_evento_servicios_acreditados")
    .select("id")
    .eq("evento_id", eventoId)
    .gt("saldo_pendiente", 0)
    .order("saldo_pendiente", { ascending: false })
    .order("id")
    .limit(1)
    .maybeSingle();

  if (error) {
    logSupabaseError("pagos obtener servicios para asignacion automatica", error);
  }

  return data?.id ?? null;
}

function revalidateEventoPaths(eventoId: string) {
  revalidatePath("/eventos");
  revalidatePath(`/eventos/${eventoId}`);
  revalidatePath(`/eventos/${eventoId}/ingresos`);
  revalidatePath(`/eventos/${eventoId}/flujo-dinero`);
  revalidatePath("/reportes", "layout");
}
