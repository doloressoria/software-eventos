"use server";

import { randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { getAccountProtectionError } from "@/lib/usuarios/rules-core";
import {
  type UsuarioFormState,
  validateUsuarioForm,
  uuidPattern,
} from "@/lib/usuarios/validation";

const INDEFINITE_BAN_DURATION = "876000h";

export async function createUsuarioAction(
  _previousState: UsuarioFormState,
  formData: FormData,
): Promise<UsuarioFormState> {
  await requireAdmin();
  const { payload, state } = validateUsuarioForm(formData);

  if (!payload) return state;

  const selectedRole = await getSelectedRole(payload.roleId);
  if (!selectedRole) {
    return {
      ...state,
      errors: { ...state.errors, roleId: "El rol seleccionado no existe." },
      formError: "Revisa el rol seleccionado.",
    };
  }

  const salonError = await validateActiveSalonIds(payload.salonIds);
  if (salonError) {
    return {
      ...state,
      errors: { ...state.errors, salonIds: salonError },
      formError: "Revisa los salones seleccionados.",
    };
  }

  const temporaryPassword = generateTemporaryPassword();
  const admin = createAdminClient();
  const { data: authData, error: authError } =
    await admin.auth.admin.createUser({
      ban_duration: payload.activo ? "none" : INDEFINITE_BAN_DURATION,
      email: payload.email,
      email_confirm: true,
      password: temporaryPassword,
      user_metadata: { full_name: payload.fullName },
    });

  if (authError || !authData.user) {
    return {
      ...state,
      errors: isDuplicateAuthEmail(authError)
        ? { ...state.errors, email: "Ya existe un usuario con ese email." }
        : state.errors,
      formError: isDuplicateAuthEmail(authError)
        ? "El email ingresado ya esta en uso."
        : "No se pudo crear el acceso del usuario. Intenta nuevamente.",
    };
  }

  const supabase = await createClient();
  const { error: profileError } = await supabase.rpc(
    "admin_create_usuario_profile",
    {
      p_activo: payload.activo,
      p_email: payload.email,
      p_full_name: payload.fullName,
      p_id: authData.user.id,
      p_rol: selectedRole.legacy_rol,
      p_salon_ids: payload.salonIds,
    },
  );

  if (profileError) {
    await cleanupCreatedAuthUser(authData.user.id);
    return {
      ...state,
      errors:
        getRpcErrorCode(profileError) === "duplicate_email"
          ? { ...state.errors, email: "Ya existe un usuario con ese email." }
          : state.errors,
      formError: getUsuarioMutationError(profileError, "crear"),
    };
  }

  const { error: roleError } = await supabase.rpc("admin_assign_usuario_role", {
    p_role_id: selectedRole.id,
    p_usuario_id: authData.user.id,
  });

  if (roleError) {
    await cleanupCreatedAuthUser(authData.user.id);
    return { ...state, formError: "No se pudo asignar el rol del usuario." };
  }

  revalidateUserPaths(authData.user.id);

  return {
    ...state,
    formError: null,
    successMessage: "Usuario creado correctamente.",
    temporaryPassword,
  };
}

export async function updateUsuarioAction(
  id: string,
  _previousState: UsuarioFormState,
  formData: FormData,
): Promise<UsuarioFormState> {
  const actor = await requireAdmin();

  if (!uuidPattern.test(id)) {
    return invalidTargetState(formData);
  }

  const { payload, state } = validateUsuarioForm(formData);
  if (!payload) return state;

  const selectedRole = await getSelectedRole(payload.roleId);
  if (!selectedRole) {
    return {
      ...state,
      errors: { ...state.errors, roleId: "El rol seleccionado no existe." },
      formError: "Revisa el rol seleccionado.",
    };
  }

  const salonError = await validateActiveSalonIds(payload.salonIds);
  if (salonError) {
    return {
      ...state,
      errors: { ...state.errors, salonIds: salonError },
      formError: "Revisa los salones seleccionados.",
    };
  }

  const supabase = await createClient();
  const [targetResult, activeAdminsResult] = await Promise.all([
    supabase.from("usuarios").select("*").eq("id", id).maybeSingle(),
    supabase
      .from("usuarios")
      .select("id", { count: "exact", head: true })
      .eq("rol", "admin")
      .eq("activo", true),
  ]);

  if (targetResult.error || !targetResult.data) {
    return { ...state, formError: "El usuario indicado no existe." };
  }

  const target = targetResult.data;
  const protectionError = getAccountProtectionError({
    activeAdminCount: activeAdminsResult.count ?? 0,
    actorId: actor.id,
    nextActive: payload.activo,
    nextRole: selectedRole.legacy_rol,
    targetId: target.id,
    targetWasActiveAdmin: target.rol === "admin" && target.activo,
  });

  if (protectionError) {
    return { ...state, formError: protectionError };
  }

  const admin = createAdminClient();
  const { data: authData, error: getAuthError } =
    await admin.auth.admin.getUserById(id);

  if (getAuthError || !authData.user) {
    return {
      ...state,
      formError: "No se encontro el acceso de Supabase Auth para este usuario.",
    };
  }

  const previousAuthUser = authData.user;
  const { error: authUpdateError } = await admin.auth.admin.updateUserById(id, {
    ban_duration: payload.activo ? "none" : INDEFINITE_BAN_DURATION,
    email: payload.email,
    email_confirm: true,
    user_metadata: {
      ...previousAuthUser.user_metadata,
      full_name: payload.fullName,
    },
  });

  if (authUpdateError) {
    return {
      ...state,
      errors: isDuplicateAuthEmail(authUpdateError)
        ? { ...state.errors, email: "Ya existe un usuario con ese email." }
        : state.errors,
      formError: isDuplicateAuthEmail(authUpdateError)
        ? "El email ingresado ya esta en uso."
        : "No se pudo actualizar el acceso del usuario.",
    };
  }

  const { error: profileError } = await supabase.rpc("admin_update_usuario", {
    p_activo: payload.activo,
    p_email: payload.email,
    p_full_name: payload.fullName,
    p_id: id,
    p_rol: selectedRole.legacy_rol,
    p_salon_ids: payload.salonIds,
  });

  if (profileError) {
    await rollbackAuthUser({
      activo: target.activo,
      email: target.email,
      fullName: target.full_name,
      id,
      metadata: previousAuthUser.user_metadata,
    });

    return {
      ...state,
      errors:
        getRpcErrorCode(profileError) === "duplicate_email"
          ? { ...state.errors, email: "Ya existe un usuario con ese email." }
          : state.errors,
      formError: getUsuarioMutationError(profileError, "actualizar"),
    };
  }

  const { error: roleError } = await supabase.rpc("admin_assign_usuario_role", {
    p_role_id: selectedRole.id,
    p_usuario_id: id,
  });

  if (roleError) {
    return { ...state, formError: "No se pudo asignar el rol del usuario." };
  }

  revalidateUserPaths(id);
  redirect("/admin/usuarios?updated=1");
}

async function validateActiveSalonIds(salonIds: string[]) {
  if (salonIds.length === 0) return null;

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("salones")
    .select("id")
    .in("id", salonIds)
    .eq("activo", true)
    .is("deleted_at", null);

  if (error || data.length !== salonIds.length) {
    return "Todos los salones deben existir y estar activos.";
  }

  return null;
}

async function getSelectedRole(roleId: string) {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("roles")
    .select("id, legacy_rol")
    .eq("id", roleId)
    .maybeSingle();

  return error ? null : data;
}

function generateTemporaryPassword() {
  return `${randomBytes(12).toString("base64url")}aA1!`;
}

function isDuplicateAuthEmail(error: unknown) {
  if (!error || typeof error !== "object") return false;
  const value = error as { code?: unknown; message?: unknown };
  const normalized = `${String(value.code ?? "")} ${String(value.message ?? "")}`
    .toLowerCase();

  return (
    normalized.includes("email_exists") ||
    normalized.includes("already") ||
    normalized.includes("registered")
  );
}

function getRpcErrorCode(error: { message?: string | null }) {
  const message = error.message?.toLowerCase() ?? "";
  const knownCodes = [
    "duplicate_email",
    "inactive_salon",
    "last_active_admin",
    "not_admin",
    "self_deactivation",
    "self_demotion",
    "user_not_found",
  ];

  return knownCodes.find((code) => message.includes(code)) ?? null;
}

function getUsuarioMutationError(
  error: { message?: string | null },
  operation: "crear" | "actualizar",
) {
  const messages: Record<string, string> = {
    duplicate_email: "Ya existe un usuario con ese email.",
    inactive_salon: "Todos los salones seleccionados deben estar activos.",
    last_active_admin:
      "No se puede desactivar o degradar al ultimo administrador activo.",
    not_admin: "No tenes permisos para administrar usuarios.",
    self_deactivation: "No podes desactivar tu propio usuario.",
    self_demotion: "No podes quitarte tu propio rol de administrador.",
    user_not_found: "El usuario indicado no existe.",
  };
  const code = getRpcErrorCode(error);

  return code
    ? messages[code]
    : `No se pudo ${operation} el usuario. Intenta nuevamente.`;
}

async function cleanupCreatedAuthUser(userId: string) {
  const admin = createAdminClient();
  const { error: profileCleanupError } = await admin
    .from("usuarios")
    .delete()
    .eq("id", userId);
  const { error: authCleanupError } =
    await admin.auth.admin.deleteUser(userId);

  if (profileCleanupError || authCleanupError) {
    console.error(
      "[Usuarios] No se pudo completar el rollback de un alta fallida.",
    );
  }
}

async function rollbackAuthUser({
  activo,
  email,
  fullName,
  id,
  metadata,
}: {
  activo: boolean;
  email: string;
  fullName: string;
  id: string;
  metadata: Record<string, unknown>;
}) {
  const admin = createAdminClient();
  const { error } = await admin.auth.admin.updateUserById(id, {
    ban_duration: activo ? "none" : INDEFINITE_BAN_DURATION,
    email,
    email_confirm: true,
    user_metadata: { ...metadata, full_name: fullName },
  });

  if (error) {
    console.error(
      "[Usuarios] No se pudo completar el rollback de Supabase Auth.",
    );
  }
}

function revalidateUserPaths(id: string) {
  revalidatePath("/admin");
  revalidatePath("/admin/auditoria");
  revalidatePath("/admin/usuarios");
  revalidatePath(`/admin/usuarios/${id}/editar`);
  revalidatePath("/salones/asignaciones");
}

function invalidTargetState(formData: FormData): UsuarioFormState {
  const { state } = validateUsuarioForm(formData);
  return { ...state, formError: "El usuario indicado no es valido." };
}
