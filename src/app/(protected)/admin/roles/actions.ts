"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import { isScreenPermission } from "@/lib/roles/permissions";
import { createClient } from "@/lib/supabase/server";

export async function saveRoleAction(formData: FormData) {
  await requireAdmin();

  const roleId = stringValue(formData, "role_id") || null;
  const nombre = stringValue(formData, "nombre");
  const descripcion = stringValue(formData, "descripcion");
  const screens = uniquePermissions(formData.getAll("screens"));
  const manageScreens = uniquePermissions(formData.getAll("manage_screens"));
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("admin_save_role", {
    p_descripcion: descripcion,
    p_manage_screens: manageScreens,
    p_nombre: nombre,
    p_role_id: roleId,
    p_screens: screens,
  });

  if (error || !data) {
    throw new Error("No se pudo guardar el rol. Revisa el nombre y los permisos.");
  }

  revalidatePath("/admin/roles");
  revalidatePath("/admin/usuarios");
  redirect("/admin/roles?saved=1");
}

function stringValue(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

function uniquePermissions(values: FormDataEntryValue[]) {
  return [...new Set(values)].filter(
    (value): value is string => typeof value === "string" && isScreenPermission(value),
  );
}
