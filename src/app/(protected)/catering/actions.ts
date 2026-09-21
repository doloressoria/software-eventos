"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getCurrentProfile } from "@/lib/auth";
import {
  getEmptyCateringFormState,
  validateCateringForm,
  type CateringFormState,
} from "@/lib/catering/validation";
import {
  validatePrecioHistorialForm,
  type PrecioHistorialFormState,
} from "@/lib/catering/precio-historial-validation";
import {
  getEmptyCateringItemFormState,
  validateCateringItemForm,
  type CateringItemFormState,
} from "@/lib/catering/item-validation";
import { recalculateCateringTotals } from "@/lib/catering/recalculate-totals";
import { searchEventosParaCatering } from "@/lib/catering/queries";
import { getEmptyPagoFormState, validatePagoForm, type PagoFormState } from "@/lib/pagos/validation";
import {
  getEmptyEgresoFormState,
  validateEgresoForm,
  type EgresoFormState,
} from "@/lib/egresos/validation";
import { createClient } from "@/lib/supabase/server";
import { logSupabaseError } from "@/lib/supabase/errors";
import { requireScreenManagement } from "@/lib/roles/access";
import type { TablesUpdate } from "@/types/database.types";

export type DeleteCateringState = { formError?: string };
export type DeleteCateringItemState = { formError?: string };
export type DeletePagoState = { formError?: string };
export type DeleteEgresoState = { formError?: string };

const CREATE_ERROR =
  "No se pudo guardar el catering. Verifica los datos e intenta nuevamente.";
const NOT_FOUND_ERROR = "No se encontro el catering o no tenes acceso.";

export async function searchEventosCateringAction(query: string) {
  const profile = await getCurrentProfile();

  if (!profile?.activo) {
    return [];
  }

  return searchEventosParaCatering(query);
}

export async function createCateringAction(
  _previousState: CateringFormState,
  formData: FormData,
): Promise<CateringFormState> {
  const profile = await getCurrentProfile();

  if (!profile?.activo) {
    redirect("/dashboard");
  }
  await requireScreenManagement("catering");

  const { state, payload } = validateCateringForm(formData, { mode: "create" });

  if (!payload) {
    return state;
  }

  const supabase = await createClient();

  if (payload.con_evento && payload.evento_id) {
    const { data: existe, error } = await supabase.rpc("catering_evento_existe", {
      p_evento_id: payload.evento_id,
    });

    if (error || !existe) {
      return {
        ...state,
        errors: { ...state.errors, evento_id: "El evento seleccionado no es valido." },
        formError: "Revisa los campos marcados.",
      };
    }
  }

  const { data, error } = await supabase
    .from("catering_contratos")
    .insert({
      evento_id: payload.evento_id,
      cliente_nombre: payload.cliente_nombre,
      cliente_razon_social: payload.cliente_razon_social,
      cliente_cuit_dni: payload.cliente_cuit_dni,
      cliente_contacto: payload.cliente_contacto,
      fecha_evento: payload.fecha_evento,
      salon_id: payload.salon_id,
      tipo_evento: payload.tipo_evento,
      tipo_servicio: payload.tipo_servicio,
      ejecutiva_id: payload.ejecutiva_id,
      pax_adultos: payload.pax_adultos,
      pax_jovenes: payload.pax_jovenes,
      pax_menores: payload.pax_menores,
      pax_bebes: payload.pax_bebes,
      comision_organizador_monto: payload.comision_organizador_monto,
      iva_comision: payload.iva_comision,
      iva_porcentaje: payload.iva_porcentaje,
      notas: payload.notas,
      total_pagado: 0,
    })
    .select("id")
    .maybeSingle();

  if (error) {
    logSupabaseError("createCateringAction insertar catering", error);
    return { ...state, formError: "No se pudo crear el catering. Intenta nuevamente." };
  }

  if (!data) {
    return { ...state, formError: CREATE_ERROR };
  }

  const { error: historialError } = await supabase
    .from("catering_precio_historial")
    .insert({
      catering_contrato_id: data.id,
      precio_unitario: payload.precio_unitario_inicial,
      motivo: payload.precio_motivo_inicial,
      pax_adultos: payload.pax_adultos,
      pax_jovenes: payload.pax_jovenes,
      pax_menores: payload.pax_menores,
      pax_bebes: payload.pax_bebes,
      usuario_id: profile.id,
    });

  if (historialError) {
    logSupabaseError("createCateringAction insertar precio inicial", historialError);
  }

  await recalculateCateringTotals(data.id);

  revalidatePath("/catering");

  if (payload.evento_id) {
    revalidatePath(`/eventos/${payload.evento_id}`);
  }

  redirect(`/catering/${data.id}?created=1`);
}

export async function updateCateringAction(
  cateringId: string,
  _previousState: CateringFormState,
  formData: FormData,
): Promise<CateringFormState> {
  const profile = await getCurrentProfile();

  if (!profile?.activo) {
    redirect("/dashboard");
  }

  const current = await getCateringForMutation(cateringId);

  if (!current) {
    return {
      ...getEmptyCateringFormState(),
      formError: NOT_FOUND_ERROR,
    };
  }

  const { state, payload } = validateCateringForm(formData, { mode: "edit" });

  if (!payload) {
    return state;
  }

  const supabase = await createClient();
  const updatePayload: TablesUpdate<"catering_contratos"> = {
    ejecutiva_id: payload.ejecutiva_id,
    tipo_servicio: payload.tipo_servicio,
    pax_adultos: payload.pax_adultos,
    pax_jovenes: payload.pax_jovenes,
    pax_menores: payload.pax_menores,
    pax_bebes: payload.pax_bebes,
    comision_organizador_monto: payload.comision_organizador_monto,
    iva_comision: payload.iva_comision,
    iva_porcentaje: payload.iva_porcentaje,
    notas: payload.notas,
    updated_at: new Date().toISOString(),
  };

  if (!current.evento_id) {
    updatePayload.cliente_nombre = payload.cliente_nombre;
    updatePayload.cliente_razon_social = payload.cliente_razon_social;
    updatePayload.cliente_cuit_dni = payload.cliente_cuit_dni;
    updatePayload.cliente_contacto = payload.cliente_contacto;
    updatePayload.fecha_evento = payload.fecha_evento;
    updatePayload.salon_id = payload.salon_id;
    updatePayload.tipo_evento = payload.tipo_evento;
  }

  const { data, error } = await supabase
    .from("catering_contratos")
    .update(updatePayload)
    .eq("id", cateringId)
    .is("deleted_at", null)
    .select("id")
    .maybeSingle();

  if (error) {
    logSupabaseError("updateCateringAction actualizar", error);
    return { ...state, formError: "No se pudo actualizar el catering. Intenta nuevamente." };
  }

  if (!data) {
    return { ...state, formError: NOT_FOUND_ERROR };
  }

  await recalculateCateringTotals(cateringId);

  revalidatePath("/catering");
  revalidatePath(`/catering/${cateringId}`);

  if (current.evento_id) {
    revalidatePath(`/eventos/${current.evento_id}`);
  }

  return { ...state, formError: null };
}

export async function deleteCateringAction(
  cateringId: string,
  previousState: DeleteCateringState,
  formData: FormData,
): Promise<DeleteCateringState> {
  void previousState;
  void formData;

  const profile = await getCurrentProfile();

  if (!profile?.activo) {
    redirect("/dashboard");
  }

  const current = await getCateringForMutation(cateringId);

  if (!current) {
    return { formError: NOT_FOUND_ERROR };
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("catering_contratos")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", cateringId)
    .is("deleted_at", null)
    .select("id")
    .maybeSingle();

  if (error) {
    logSupabaseError("deleteCateringAction eliminar", error);
    return { formError: "No se pudo eliminar el catering. Intenta nuevamente." };
  }

  if (!data) {
    return { formError: NOT_FOUND_ERROR };
  }

  revalidatePath("/catering");

  if (current.evento_id) {
    revalidatePath(`/eventos/${current.evento_id}`);
  }

  redirect("/catering?deleted=1");
}

export async function addPrecioHistorialAction(
  cateringId: string,
  _previousState: PrecioHistorialFormState,
  formData: FormData,
): Promise<PrecioHistorialFormState> {
  const profile = await getCurrentProfile();

  if (!profile?.activo) {
    redirect("/dashboard");
  }
  await requireScreenManagement("catering");

  const { state, payload } = validatePrecioHistorialForm(formData);

  if (!payload) {
    return state;
  }

  const supabase = await createClient();
  const { error } = await supabase.from("catering_precio_historial").insert({
    catering_contrato_id: cateringId,
    precio_unitario: payload.precio_unitario,
    motivo: payload.motivo,
    fecha: payload.fecha,
    pax_adultos: payload.pax_adultos,
    pax_jovenes: payload.pax_jovenes,
    pax_menores: payload.pax_menores,
    pax_bebes: payload.pax_bebes,
    usuario_id: profile.id,
  });

  if (error) {
    logSupabaseError("addPrecioHistorialAction insertar", error);
    return {
      ...state,
      formError: "No se pudo registrar el nuevo precio. Intenta nuevamente.",
    };
  }

  await supabase
    .from("catering_contratos")
    .update({
      pax_adultos: payload.pax_adultos,
      pax_jovenes: payload.pax_jovenes,
      pax_menores: payload.pax_menores,
      pax_bebes: payload.pax_bebes,
    })
    .eq("id", cateringId);

  await recalculateCateringTotals(cateringId);

  revalidatePath(`/catering/${cateringId}`);
  revalidatePath("/catering");

  return {
    ...state,
    fields: { ...state.fields, precio_unitario: "", motivo: "Recotizacion" },
    successMessage: "Precio actualizado correctamente.",
  };
}

export async function addCateringItemAction(
  cateringId: string,
  _previousState: CateringItemFormState,
  formData: FormData,
): Promise<CateringItemFormState> {
  const profile = await getCurrentProfile();

  if (!profile?.activo) {
    redirect("/dashboard");
  }
  await requireScreenManagement("catering");

  const { state, payload } = validateCateringItemForm(formData);

  if (!payload) {
    return state;
  }

  const supabase = await createClient();
  const { error } = await supabase.from("catering_items").insert({
    catering_contrato_id: cateringId,
    categoria: payload.categoria,
    descripcion: payload.descripcion,
    precio_unitario: payload.precio_unitario,
    total: payload.precio_unitario,
  });

  if (error) {
    logSupabaseError("addCateringItemAction insertar", error);
    return { ...state, formError: "No se pudo agregar el adicional. Intenta nuevamente." };
  }

  await recalculateCateringTotals(cateringId);

  revalidatePath(`/catering/${cateringId}`);
  revalidatePath("/catering");

  return {
    ...getEmptyCateringItemFormState(),
    successMessage: "Adicional agregado correctamente.",
  };
}

export async function deleteCateringItemAction(
  cateringId: string,
  itemId: string,
  previousState: DeleteCateringItemState,
  formData: FormData,
): Promise<DeleteCateringItemState> {
  void previousState;
  void formData;

  const profile = await getCurrentProfile();

  if (!profile?.activo) {
    redirect("/dashboard");
  }
  await requireScreenManagement("catering");

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("catering_items")
    .delete()
    .eq("id", itemId)
    .eq("catering_contrato_id", cateringId)
    .select("id")
    .maybeSingle();

  if (error) {
    logSupabaseError("deleteCateringItemAction eliminar", error);
    return { formError: "No se pudo eliminar el adicional. Intenta nuevamente." };
  }

  if (!data) {
    return { formError: "No se encontro el adicional." };
  }

  await recalculateCateringTotals(cateringId);

  revalidatePath(`/catering/${cateringId}`);
  revalidatePath("/catering");

  return {};
}

export async function createCateringPagoAction(
  cateringId: string,
  _previousState: PagoFormState,
  formData: FormData,
): Promise<PagoFormState> {
  const profile = await getCurrentProfile();

  if (!profile?.activo) {
    redirect("/dashboard");
  }

  const { state, payload } = validatePagoForm(formData);

  if (!payload) {
    return state;
  }

  const current = await getCateringForMutation(cateringId);

  if (!current) {
    return { ...state, formError: NOT_FOUND_ERROR };
  }

  const supabase = await createClient();
  const { error } = await supabase.from("pagos").insert({
    catering_contrato_id: cateringId,
    evento_id: current.evento_id,
    concepto: payload.concepto,
    es_garantia: false,
    fecha_pago: payload.fecha_pago,
    forma_pago: payload.forma_pago,
    importe_moneda_original: payload.monto,
    moneda: "ARS",
    notas: payload.notas,
    registrado_por: profile.id,
  });

  if (error) {
    logSupabaseError("createCateringPagoAction insertar", error);
    return { ...state, formError: "No se pudo registrar el pago. Intenta nuevamente." };
  }

  await recalculateCateringTotals(cateringId);
  revalidateCateringPaths(cateringId, current.evento_id);

  return {
    ...getEmptyPagoFormState(),
    successMessage: "Pago registrado correctamente.",
  };
}

export async function deleteCateringPagoAction(
  cateringId: string,
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

  const current = await getCateringForMutation(cateringId);

  if (!current) {
    return { formError: NOT_FOUND_ERROR };
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("pagos")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", pagoId)
    .eq("catering_contrato_id", cateringId)
    .is("deleted_at", null)
    .select("id")
    .maybeSingle();

  if (error) {
    logSupabaseError("deleteCateringPagoAction eliminar", error);
    return { formError: "No se pudo eliminar el pago. Intenta nuevamente." };
  }

  if (!data) {
    return { formError: "No se encontro el pago." };
  }

  await recalculateCateringTotals(cateringId);
  revalidateCateringPaths(cateringId, current.evento_id);

  return {};
}

export async function createCateringEgresoAction(
  cateringId: string,
  _previousState: EgresoFormState,
  formData: FormData,
): Promise<EgresoFormState> {
  const profile = await getCurrentProfile();

  if (!profile?.activo) {
    redirect("/dashboard");
  }

  const { state, payload } = validateEgresoForm(formData);

  if (!payload) {
    return state;
  }

  const current = await getCateringForMutation(cateringId);

  if (!current) {
    return { ...state, formError: NOT_FOUND_ERROR };
  }

  const supabase = await createClient();
  const { error } = await supabase.from("egresos").insert({
    catering_contrato_id: cateringId,
    evento_id: current.evento_id,
    categoria: payload.categoria,
    concepto: payload.concepto,
    fecha_egreso: payload.fecha_egreso,
    forma_pago: payload.forma_pago,
    importe_en_pesos: payload.monto,
    importe_moneda_original: payload.monto,
    moneda: "ARS",
    notas: payload.notas,
    proveedor: payload.proveedor,
    registrado_por: profile.id,
  });

  if (error) {
    logSupabaseError("createCateringEgresoAction insertar", error);
    return { ...state, formError: "No se pudo registrar el egreso. Intenta nuevamente." };
  }

  revalidateCateringPaths(cateringId, current.evento_id);

  return {
    ...getEmptyEgresoFormState(),
    successMessage: "Egreso registrado correctamente.",
  };
}

export async function deleteCateringEgresoAction(
  cateringId: string,
  egresoId: string,
  previousState: DeleteEgresoState,
  formData: FormData,
): Promise<DeleteEgresoState> {
  void previousState;
  void formData;

  const profile = await getCurrentProfile();

  if (!profile?.activo) {
    redirect("/dashboard");
  }

  const current = await getCateringForMutation(cateringId);

  if (!current) {
    return { formError: NOT_FOUND_ERROR };
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("egresos")
    .update({ deleted_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq("id", egresoId)
    .eq("catering_contrato_id", cateringId)
    .is("deleted_at", null)
    .select("id")
    .maybeSingle();

  if (error) {
    logSupabaseError("deleteCateringEgresoAction eliminar", error);
    return { formError: "No se pudo eliminar el egreso. Intenta nuevamente." };
  }

  if (!data) {
    return { formError: "No se encontro el egreso." };
  }

  revalidateCateringPaths(cateringId, current.evento_id);

  return {};
}

async function getCateringForMutation(cateringId: string) {
  await requireScreenManagement("catering");

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("catering_contratos")
    .select("id, evento_id")
    .eq("id", cateringId)
    .is("deleted_at", null)
    .maybeSingle();

  if (error) {
    logSupabaseError("catering obtener para mutacion", error);
    return null;
  }

  return data;
}

function revalidateCateringPaths(cateringId: string, eventoId: string | null) {
  revalidatePath("/catering");
  revalidatePath(`/catering/${cateringId}`);
  revalidatePath(`/catering/${cateringId}/ingresos`);
  revalidatePath(`/catering/${cateringId}/egresos`);

  if (eventoId) {
    revalidatePath(`/eventos/${eventoId}`);
  }
}
