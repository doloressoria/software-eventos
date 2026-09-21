import { canAccessSalonWithAssignments } from "@/lib/auth/event-access-core";
import { createClient } from "@/lib/supabase/server";
import { logSupabaseError } from "@/lib/supabase/errors";
import { requireScreenManagement } from "@/lib/roles/access";
import type { CurrentProfile } from "@/lib/auth/get-current-profile";
import type { Tables } from "@/types/database.types";

export type AuthorizedActiveEvento = Pick<
  Tables<"eventos">,
  "id" | "salon_id" | "vendedor_id" | "tiene_organizador"
>;

export async function getAuthorizedActiveEvento(
  eventoId: string,
  profile: CurrentProfile,
): Promise<AuthorizedActiveEvento | null> {
  await requireScreenManagement("eventos");

  if (!profile.activo) {
    return null;
  }

  const supabase = await createClient();
  const { data: evento, error } = await supabase
    .from("eventos")
    .select("id, salon_id, vendedor_id, tiene_organizador")
    .eq("id", eventoId)
    .is("deleted_at", null)
    .maybeSingle();

  if (error) {
    logSupabaseError("getAuthorizedActiveEvento obtener evento", error);
    return null;
  }

  if (!evento) {
    return null;
  }

  const canAccess = await canAccessSalon(profile, evento.salon_id);

  return canAccess ? evento : null;
}

export async function canAccessSalon(
  profile: CurrentProfile,
  salonId: string,
) {
  if (!profile.activo) {
    return false;
  }

  if (profile.rol === "admin") {
    return true;
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("usuario_salon")
    .select("usuario_id, salon_id")
    .eq("usuario_id", profile.id)
    .eq("salon_id", salonId);

  if (error) {
    logSupabaseError("canAccessSalon validar asignacion", error);
    return false;
  }

  return canAccessSalonWithAssignments({
    assignments: data,
    profile,
    salonId,
  });
}

export async function usuarioTieneSalon(usuarioId: string, salonId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("usuario_salon")
    .select("usuario_id, salon_id")
    .eq("usuario_id", usuarioId)
    .eq("salon_id", salonId);

  if (error) {
    logSupabaseError("usuarioTieneSalon validar asignacion", error);
    return false;
  }

  return data.some(
    (assignment) =>
      assignment.usuario_id === usuarioId && assignment.salon_id === salonId,
  );
}
