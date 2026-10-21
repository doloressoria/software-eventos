"use server";

import { revalidatePath } from "next/cache";
import { getCurrentProfile } from "@/lib/auth";
import { getEventoContactos, type ContactosState } from "@/lib/contactos/queries";
import { contactosPayload, validateContactos } from "@/lib/contactos/validation";
import { createClient } from "@/lib/supabase/server";

export async function guardarContactosAction(
  eventoId: string, previous: ContactosState, form: FormData,
): Promise<ContactosState> {
  const { contactos, error: validationError } = validateContactos(form.get("contactos"));
  const state = { ...previous, contactos, success: undefined, error: undefined };
  if (validationError) return { ...state, error: validationError };
  const profile = await getCurrentProfile();
  if (!profile?.activo) return { ...state, error: "No tenés permiso para guardar contactos." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("guardar_contactos_evento", {
    p_evento_id: eventoId, p_contactos: contactosPayload(contactos),
    p_version: typeof form.get("contactos_version") === "string" ? String(form.get("contactos_version")) : "",
  });
  if (error) {
    return { ...state, error: error.code === "40001"
      ? "Los contactos cambiaron. Recargá y revisá antes de guardar. Tus cambios siguen en el formulario."
      : "No se pudieron guardar los contactos. Se conservaron tus cambios para reintentar." };
  }
  revalidatePath(`/eventos/${eventoId}`);
  revalidatePath(`/eventos/${eventoId}/editar`);
  revalidatePath("/catering", "layout");
  try {
    return { ...await getEventoContactos(eventoId), success: "Contactos guardados." };
  } catch {
    // La escritura ya terminó: no ofrecer reenvío de una lista con ids/version antiguos.
    return { ...state, puedeEditar: false, success: "Contactos guardados. Recargá para verlos actualizados." };
  }
}
