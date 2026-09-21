import { redirect } from "next/navigation";
import { getCurrentProfile, requireAdmin } from "@/lib/auth";
import { requireScreenManagement } from "@/lib/roles/access";
import { createClient } from "@/lib/supabase/server";
import type { Tables } from "@/types/database.types";

export type Salon = Tables<"salones">;
export type UsuarioSalon = Tables<"usuario_salon">;
export type Vendedor = Tables<"usuarios">;

export async function listSalones() {
  const profile = await getCurrentProfile();

  if (!profile?.activo) {
    redirect("/dashboard");
  }

  const supabase = await createClient();
  const query = supabase.from("salones").select("*");

  if (profile.rol === "vendedor") {
    query.eq("activo", true).is("deleted_at", null);
  }

  const { data, error } = await query.order("nombre", { ascending: true });

  if (error) {
    throw new Error("No se pudo obtener el listado de salones.");
  }

  return {
    profile,
    salones: data,
  };
}

export async function getSalonById(id: string) {
  await requireScreenManagement("salones");

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("salones")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (error) {
    throw new Error("No se pudo obtener el salon.");
  }

  return data;
}

export async function getSalonAssignmentsPageData() {
  await requireAdmin();

  const supabase = await createClient();
  const [vendedoresResult, salonesResult, assignmentsResult] =
    await Promise.all([
      supabase
        .from("usuarios")
        .select("*")
        .eq("rol", "vendedor")
        .eq("activo", true)
        .order("full_name", { ascending: true }),
      supabase
        .from("salones")
        .select("*")
        .eq("activo", true)
        .is("deleted_at", null)
        .order("nombre", { ascending: true }),
      supabase
        .from("usuario_salon")
        .select("usuario_id, salon_id, created_at")
        .order("created_at", { ascending: true }),
    ]);

  if (vendedoresResult.error) {
    throw new Error("No se pudo obtener el listado de vendedores.");
  }

  if (salonesResult.error) {
    throw new Error("No se pudo obtener el listado de salones asignables.");
  }

  if (assignmentsResult.error) {
    throw new Error("No se pudieron obtener las asignaciones de salones.");
  }

  return {
    vendedores: vendedoresResult.data,
    salones: salonesResult.data,
    assignments: assignmentsResult.data,
  };
}
