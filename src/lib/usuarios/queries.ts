import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import type { Tables } from "@/types/database.types";

export type Usuario = Tables<"usuarios">;
export type UsuarioSalonItem = Pick<
  Tables<"salones">,
  "activo" | "deleted_at" | "id" | "nombre"
>;

export type UsuarioListItem = Usuario & {
  role: Pick<Tables<"roles">, "id" | "legacy_rol" | "nombre"> | null;
  salones: UsuarioSalonItem[];
};

export type UsuarioFilters = {
  estado?: "activo" | "inactivo";
  roleId?: string;
  salonId?: string;
  search?: string;
};

export async function listUsuarios(filters: UsuarioFilters = {}) {
  const currentProfile = await requireAdmin();
  const supabase = await createClient();
  const admin = createAdminClient();
  const [usersResult, salonesResult, assignmentsResult, rolesResult, userRolesResult] = await Promise.all([
    supabase
      .from("usuarios")
      .select("*")
      .order("full_name", { ascending: true }),
    supabase
      .from("salones")
      .select("id, nombre, activo, deleted_at")
      .order("nombre", { ascending: true }),
    supabase.from("usuario_salon").select("usuario_id, salon_id"),
    admin.from("roles").select("id, nombre, legacy_rol").order("nombre"),
    admin.from("usuario_roles").select("usuario_id, role_id"),
  ]);

  if (usersResult.error) {
    throw new Error("No se pudo obtener el listado de usuarios.");
  }
  if (salonesResult.error) {
    throw new Error("No se pudo obtener el listado de salones.");
  }
  if (assignmentsResult.error || rolesResult.error || userRolesResult.error) {
    throw new Error("No se pudieron obtener las asignaciones de usuarios.");
  }

  const salonesById = new Map(
    salonesResult.data.map((salon) => [salon.id, salon]),
  );
  const salonIdsByUsuario = new Map<string, string[]>();
  const roleById = new Map(rolesResult.data.map((role) => [role.id, role]));
  const roleIdByUsuario = new Map(
    userRolesResult.data.map((userRole) => [userRole.usuario_id, userRole.role_id]),
  );

  for (const assignment of assignmentsResult.data) {
    const ids = salonIdsByUsuario.get(assignment.usuario_id) ?? [];
    ids.push(assignment.salon_id);
    salonIdsByUsuario.set(assignment.usuario_id, ids);
  }

  const normalizedSearch = filters.search?.trim().toLowerCase() ?? "";
  const users: UsuarioListItem[] = usersResult.data
    .map((user) => ({
      ...user,
      role: roleById.get(roleIdByUsuario.get(user.id) ?? "") ?? null,
      salones: (salonIdsByUsuario.get(user.id) ?? [])
        .map((salonId) => salonesById.get(salonId))
        .filter((salon): salon is UsuarioSalonItem => Boolean(salon)),
    }))
    .filter((user) => {
      if (filters.roleId && user.role?.id !== filters.roleId) return false;
      if (filters.estado && user.activo !== (filters.estado === "activo")) {
        return false;
      }
      if (
        filters.salonId &&
        !user.salones.some((salon) => salon.id === filters.salonId)
      ) {
        return false;
      }
      if (
        normalizedSearch &&
        !`${user.full_name} ${user.email}`
          .toLowerCase()
          .includes(normalizedSearch)
      ) {
        return false;
      }
      return true;
    });

  return {
    currentProfile,
    filters,
    roles: rolesResult.data,
    salones: salonesResult.data,
    totalUsers: usersResult.data.length,
    users,
  };
}

export async function getUsuarioCreatePageData() {
  await requireAdmin();
  const supabase = await createClient();
  const admin = createAdminClient();
  const [salonesResult, rolesResult] = await Promise.all([
    supabase
    .from("salones")
    .select("id, nombre, activo, deleted_at")
    .eq("activo", true)
    .is("deleted_at", null)
    .order("nombre", { ascending: true }),
    admin.from("roles").select("id, nombre, legacy_rol").order("nombre"),
  ]);

  if (salonesResult.error || rolesResult.error) {
    throw new Error("No se pudieron obtener los salones asignables.");
  }

  return { roles: rolesResult.data, salones: salonesResult.data };
}

export async function getUsuarioEditPageData(id: string) {
  const currentProfile = await requireAdmin();
  const supabase = await createClient();
  const admin = createAdminClient();
  const [userResult, salonesResult, assignmentsResult, rolesResult, userRoleResult] = await Promise.all([
    supabase.from("usuarios").select("*").eq("id", id).maybeSingle(),
    supabase
      .from("salones")
      .select("id, nombre, activo, deleted_at")
      .eq("activo", true)
      .is("deleted_at", null)
      .order("nombre", { ascending: true }),
    supabase
      .from("usuario_salon")
      .select("salon_id")
      .eq("usuario_id", id),
    admin.from("roles").select("id, nombre, legacy_rol").order("nombre"),
    admin.from("usuario_roles").select("role_id").eq("usuario_id", id).maybeSingle(),
  ]);

  if (userResult.error) {
    throw new Error("No se pudo obtener el usuario.");
  }
  if (!userResult.data) notFound();
  if (salonesResult.error || assignmentsResult.error || rolesResult.error || userRoleResult.error) {
    throw new Error("No se pudieron obtener las asignaciones del usuario.");
  }

  const roleId = userRoleResult.data?.role_id;
  if (!roleId) {
    throw new Error("El usuario no tiene un rol configurado.");
  }

  return {
    currentProfile,
    roleId,
    roles: rolesResult.data,
    salonIds: assignmentsResult.data.map((item) => item.salon_id),
    salones: salonesResult.data,
    user: userResult.data,
  };
}
