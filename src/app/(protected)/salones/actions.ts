"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireScreenManagement } from "@/lib/roles/access";
import { createClient } from "@/lib/supabase/server";
import {
  type SalonFormState,
  validateSalonForm,
} from "@/lib/salones/validation";

export async function createSalonAction(
  _previousState: SalonFormState,
  formData: FormData,
): Promise<SalonFormState> {
  await requireScreenManagement("salones");

  const { state, payload } = validateSalonForm(formData);

  if (!payload) {
    return state;
  }

  const supabase = await createClient();
  const { error } = await supabase.from("salones").insert(payload);

  if (error) {
    return {
      ...state,
      formError: "No se pudo crear el salon. Intenta nuevamente.",
    };
  }

  revalidatePath("/salones");
  redirect("/salones?created=1");
}

export async function updateSalonAction(
  id: string,
  _previousState: SalonFormState,
  formData: FormData,
): Promise<SalonFormState> {
  await requireScreenManagement("salones");

  const { state, payload } = validateSalonForm(formData);

  if (!payload) {
    return state;
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("salones")
    .update({
      ...payload,
      deleted_at: payload.activo ? null : new Date().toISOString(),
    })
    .eq("id", id);

  if (error) {
    return {
      ...state,
      formError: "No se pudo actualizar el salon. Intenta nuevamente.",
    };
  }

  revalidatePath("/salones");
  revalidatePath(`/salones/${id}/editar`);
  redirect("/salones?updated=1");
}

export async function updateSalonStatusAction(formData: FormData) {
  await requireScreenManagement("salones");

  const id = formData.get("id");
  const active = formData.get("active");

  if (typeof id !== "string" || !id) {
    redirect("/salones?error=invalid-id");
  }

  if (active !== "true" && active !== "false") {
    redirect("/salones?error=invalid-status");
  }

  const isActive = active === "true";
  const supabase = await createClient();
  const { error } = await supabase
    .from("salones")
    .update({
      activo: isActive,
      deleted_at: isActive ? null : new Date().toISOString(),
    })
    .eq("id", id);

  if (error) {
    redirect("/salones?error=status");
  }

  revalidatePath("/salones");
  revalidatePath("/salones/asignaciones");
  redirect(isActive ? "/salones?activated=1" : "/salones?deactivated=1");
}
