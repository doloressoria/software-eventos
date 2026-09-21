"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  getAuthorizedActiveEvento,
  getCurrentProfile,
  usuarioTieneSalon,
} from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { logSupabaseError } from "@/lib/supabase/errors";
import {
  type EventoFormState,
  getTodayInputValue,
  validateEventoForm,
} from "@/lib/eventos/validation";
import { generateEventoName } from "@/lib/eventos/types";
import { applyMonthlyServicePricesToEvento } from "@/lib/precios-servicios/precios-mensuales";
import { requireScreenManagement } from "@/lib/roles/access";
import type { Tables, TablesUpdate } from "@/types/database.types";

type EditableEvento = Tables<"eventos">;

export type DeleteEventoState = {
  formError?: string;
};

const DELETE_EVENTO_ERROR =
  "No se pudo eliminar el evento. Verifica los datos e intenta nuevamente.";

export async function createEventoAction(
  _previousState: EventoFormState,
  formData: FormData,
): Promise<EventoFormState> {
  const profile = await getCurrentProfile();

  if (!profile?.activo) {
    redirect("/dashboard");
  }
  await requireScreenManagement("eventos");

  const { state, payload } = validateEventoForm(formData, { mode: "create" });

  if (!payload) {
    return state;
  }

  const supabase = await createClient();
  const vendedorId =
    profile.rol === "admin" ? payload.vendedor_id?.trim() : profile.id;

  if (!vendedorId) {
    return {
      ...state,
      errors: {
        ...state.errors,
        vendedor_id: "Selecciona un vendedor responsable.",
      },
      formError: "Revisa los campos marcados.",
    };
  }

  const accessError = await validateEventoAccess({
    salonId: payload.salon_id,
    vendedorId,
    currentUserId: profile.id,
    currentUserRole: profile.rol,
  });

  if (accessError) {
    return {
      ...state,
      formError: accessError,
    };
  }

  const { data: salon, error: salonError } = await supabase
    .from("salones")
    .select("nombre")
    .eq("id", payload.salon_id)
    .eq("activo", true)
    .is("deleted_at", null)
    .maybeSingle();

  if (salonError) {
    logSupabaseError("createEventoAction obtener salon", salonError);
    return {
      ...state,
      formError: "No se pudo validar el salon seleccionado.",
    };
  }

  if (!salon) {
    return {
      ...state,
      formError: "Selecciona un salon activo disponible.",
    };
  }

  const nombreEvento = generateEventoName({
    fechaEvento: payload.fecha_evento,
    salonNombre: salon.nombre,
    subtipoEvento: payload.subtipo_evento,
    tipoEvento: payload.tipo_evento ?? "",
  });

  if (!nombreEvento) {
    return {
      ...state,
      formError: "No se pudo generar el nombre del evento.",
    };
  }

  const { data, error } = await supabase
    .from("eventos")
    .insert({
      ...payload,
      fecha_carga: getTodayInputValue(),
      nombre_evento: nombreEvento,
      vendedor_id: vendedorId,
      estado: "borrador",
    })
    .select("created_at, id")
    .single();

  if (error) {
    logSupabaseError("createEventoAction insertar evento", error);
    return {
      ...state,
      formError: "No se pudo crear el evento. Intenta nuevamente.",
    };
  }

  const priceResult = await applyMonthlyServicePricesToEvento({
    eventoId: data.id,
  });

  revalidatePath("/eventos");
  revalidatePath(`/eventos/${data.id}`);
  redirect(getEventoRedirectUrl(data.id, "created", priceResult));
}

export async function updateEventoAction(
  id: string,
  _previousState: EventoFormState,
  formData: FormData,
): Promise<EventoFormState> {
  const profile = await getCurrentProfile();

  if (!profile?.activo) {
    redirect("/dashboard");
  }

  const { state, payload } = validateEventoForm(formData, { mode: "edit" });

  if (!payload) {
    return state;
  }

  const authorizedEvento = await getAuthorizedActiveEvento(id, profile);

  if (!authorizedEvento) {
    return {
      ...state,
      formError:
        "No se pudo actualizar el evento. Verifica los datos e intenta nuevamente.",
    };
  }

  const currentEvento = await getEditableEventoById(id);

  if (!currentEvento) {
    return {
      ...state,
      formError:
        "No se pudo actualizar el evento. Verifica los datos e intenta nuevamente.",
    };
  }

  const vendedorId =
    profile.rol === "admin" ? payload.vendedor_id?.trim() : undefined;

  if (profile.rol === "admin" && !vendedorId) {
    return {
      ...state,
      errors: {
        ...state.errors,
        vendedor_id: "Selecciona un vendedor responsable.",
      },
      formError: "Revisa los campos marcados.",
    };
  }

  const accessError = await validateEventoUpdateAccess({
    salonId: payload.salon_id,
    vendedorId,
    currentUserId: profile.id,
    currentUserRole: profile.rol,
  });

  if (accessError) {
    return {
      ...state,
      formError: accessError,
    };
  }

  const updatePayload: TablesUpdate<"eventos"> = {
    salon_id: payload.salon_id,
    cliente_nombre: payload.cliente_nombre,
    cliente_razon_social: payload.cliente_razon_social,
    cliente_cuit_dni: payload.cliente_cuit_dni,
    cliente_direccion: payload.cliente_direccion,
    cliente_ciudad: payload.cliente_ciudad,
    cliente_direccion_factura: payload.cliente_direccion_factura,
    cliente_contacto: payload.cliente_contacto,
    fecha_evento: payload.fecha_evento,
    fecha_carga: payload.fecha_carga,
    fecha_confirmacion_presupuesto: payload.fecha_confirmacion_presupuesto,
    estado: payload.estado,
    nombre_evento: payload.nombre_evento,
    tipo_evento: payload.tipo_evento,
    subtipo_evento: payload.subtipo_evento,
    espacio: payload.espacio,
    pax_adultos: payload.pax_adultos,
    pax_jovenes: payload.pax_jovenes,
    pax_menores: payload.pax_menores,
    pax_bebes: payload.pax_bebes,
    tiene_organizador: payload.tiene_organizador,
    organizador_nombre: payload.organizador_nombre,
    organizador_email: payload.organizador_email,
    organizador_telefono: payload.organizador_telefono,
    observaciones: payload.observaciones,
    updated_at: new Date().toISOString(),
  };

  if (profile.rol === "admin") {
    updatePayload.vendedor_id = vendedorId;
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("eventos")
    .update(updatePayload)
    .eq("id", id)
    .is("deleted_at", null)
    .select("id")
    .maybeSingle();

  if (error) {
    logSupabaseError("updateEventoAction actualizar evento", error);
    return {
      ...state,
      formError: "No se pudo actualizar el evento. Intenta nuevamente.",
    };
  }

  if (!data) {
    return {
      ...state,
      formError:
        "No se pudo actualizar el evento. Verifica los datos e intenta nuevamente.",
    };
  }

  if (!payload.tiene_organizador) {
    const { error: serviciosError } = await supabase
      .from("evento_servicios")
      .update({
        comisiona_organizador: false,
        updated_at: new Date().toISOString(),
      })
      .eq("evento_id", id);

    if (serviciosError) {
      logSupabaseError(
        "updateEventoAction desmarcar comisiona organizador",
        serviciosError,
      );
      return {
        ...state,
        formError:
          "El evento se actualizo, pero no se pudieron desmarcar los servicios que comisionan.",
      };
    }
  }

  const priceResult = await applyMonthlyServicePricesToEvento({
    eventoId: id,
  });

  revalidatePath("/eventos");
  revalidatePath(`/eventos/${id}`);
  revalidatePath(`/eventos/${id}/editar`);
  redirect(
    getEventoRedirectUrl(id, "updated", priceResult, {
      shouldReviewSalonPrices: authorizedEvento.salon_id !== payload.salon_id,
    }),
  );
}

export async function deleteEventoAction(
  id: string,
  previousState: DeleteEventoState,
  formData: FormData,
): Promise<DeleteEventoState> {
  void previousState;
  void formData;

  const profile = await getCurrentProfile();

  if (!profile?.activo) {
    redirect("/dashboard");
  }

  const authorizedEvento = await getAuthorizedActiveEvento(id, profile);

  if (!authorizedEvento) {
    return {
      formError: DELETE_EVENTO_ERROR,
    };
  }

  const currentEvento = await getEditableEventoById(id);

  if (!currentEvento) {
    return {
      formError: DELETE_EVENTO_ERROR,
    };
  }

  const deletedAt = new Date().toISOString();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("eventos")
    .update({
      deleted_at: deletedAt,
    })
    .eq("id", id)
    .is("deleted_at", null)
    .select("id")
    .maybeSingle();

  if (error) {
    logSupabaseError("deleteEventoAction eliminar evento", error);
    return {
      formError: "No se pudo eliminar el evento. Intenta nuevamente.",
    };
  }

  if (!data) {
    return {
      formError: DELETE_EVENTO_ERROR,
    };
  }

  revalidatePath("/eventos");
  revalidatePath(`/eventos/${id}`);
  redirect("/eventos?deleted=1");
}

async function validateEventoAccess({
  salonId,
  vendedorId,
  currentUserId,
  currentUserRole,
}: {
  salonId: string;
  vendedorId: string;
  currentUserId: string;
  currentUserRole: "admin" | "vendedor" | "ejecutiva_catering";
}) {
  const salonError = await validateSalonActivo(salonId);

  if (salonError) {
    return salonError;
  }

  if (currentUserRole === "ejecutiva_catering") {
    return "Tu rol no tiene permiso para gestionar eventos.";
  }

  if (currentUserRole === "vendedor" && vendedorId !== currentUserId) {
    return "No podes crear eventos para otro vendedor.";
  }

  if (currentUserRole === "vendedor") {
    if (!(await usuarioTieneSalon(vendedorId, salonId))) {
      return "El vendedor seleccionado no tiene asignado ese salon.";
    }
  }

  if (currentUserRole === "admin") {
    return validateVendedorActivo(vendedorId);
  }

  return null;
}

async function validateEventoUpdateAccess({
  salonId,
  vendedorId,
  currentUserId,
  currentUserRole,
}: {
  salonId: string;
  vendedorId?: string;
  currentUserId: string;
  currentUserRole: "admin" | "vendedor" | "ejecutiva_catering";
}) {
  const salonError = await validateSalonActivo(salonId);

  if (salonError) {
    return salonError;
  }

  if (currentUserRole === "ejecutiva_catering") {
    return "Tu rol no tiene permiso para gestionar eventos.";
  }

  if (currentUserRole === "vendedor") {
    const tieneSalon = await usuarioTieneSalon(currentUserId, salonId);

    if (!tieneSalon) {
      return "No podes editar eventos de un salon que no tenes asignado.";
    }

    return null;
  }

  if (!vendedorId) {
    return "Selecciona un vendedor activo.";
  }

  return validateVendedorActivo(vendedorId);
}

async function getEditableEventoById(
  id: string,
): Promise<EditableEvento | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("eventos")
    .select("*")
    .eq("id", id)
    .is("deleted_at", null)
    .maybeSingle();

  if (error) {
    logSupabaseError("updateEventoAction obtener evento actual", error);
    return null;
  }

  return data;
}

function getEventoRedirectUrl(
  eventoId: string,
  statusParam: "created" | "updated",
  priceResult: {
    inserted: number;
    missing: string[];
  },
  options?: {
    shouldReviewSalonPrices?: boolean;
  },
) {
  const params = new URLSearchParams({
    [statusParam]: "1",
  });

  if (priceResult.inserted > 0) {
    params.set("precios_autocompletados", String(priceResult.inserted));
  }

  if (priceResult.missing.length > 0) {
    params.set("precios_faltantes", priceResult.missing.join(", "));
  }

  if (options?.shouldReviewSalonPrices) {
    params.set("revisar_precios_salon", "1");
  }

  return `/eventos/${eventoId}?${params.toString()}`;
}

async function validateSalonActivo(salonId: string) {
  const supabase = await createClient();
  const { data: salon, error: salonError } = await supabase
    .from("salones")
    .select("id")
    .eq("id", salonId)
    .eq("activo", true)
    .is("deleted_at", null)
    .maybeSingle();

  if (salonError) {
    logSupabaseError("validateSalonActivo validar salon", salonError);
    return "No se pudo validar el salon seleccionado.";
  }

  if (!salon) {
    return "Selecciona un salon activo disponible.";
  }

  return null;
}

async function validateVendedorActivo(vendedorId: string) {
  const supabase = await createClient();
  const { data: vendedor, error: vendedorError } = await supabase
    .from("usuarios")
    .select("id")
    .eq("id", vendedorId)
    .eq("rol", "vendedor")
    .eq("activo", true)
    .maybeSingle();

  if (vendedorError) {
    logSupabaseError("validateVendedorActivo validar vendedor", vendedorError);
    return "No se pudo validar el vendedor seleccionado.";
  }

  if (!vendedor) {
    return "Selecciona un vendedor activo.";
  }

  return null;
}
