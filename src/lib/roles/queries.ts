import { requireAdmin } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Tables } from "@/types/database.types";

export type Role = Tables<"roles">;
export type RolePermission = Tables<"role_permissions">;
export type RoleWithPermissions = Role & { permissions: RolePermission[] };

export async function listRoles(): Promise<RoleWithPermissions[]> {
  await requireAdmin();
  const admin = createAdminClient();
  const [rolesResult, permissionsResult] = await Promise.all([
    admin.from("roles").select("*").order("nombre"),
    admin.from("role_permissions").select("*").order("screen"),
  ]);

  if (rolesResult.error || permissionsResult.error) {
    throw new Error("No se pudieron obtener los roles.");
  }

  return rolesResult.data.map((role) => ({
    ...role,
    permissions: permissionsResult.data.filter(
      (permission) => permission.role_id === role.id,
    ),
  }));
}

export async function getRoleOptions() {
  const roles = await listRoles();

  return roles.map(({ id, nombre }) => ({ id, nombre }));
}

export async function getRole(id: string) {
  const roles = await listRoles();

  return roles.find((role) => role.id === id) ?? null;
}
