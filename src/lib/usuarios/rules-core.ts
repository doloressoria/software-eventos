export const userManagementRoles = [
  "admin",
  "vendedor",
  "ejecutiva_catering",
] as const;

export type UserManagementRole = (typeof userManagementRoles)[number];

export const userManagementRoleLabels: Record<UserManagementRole, string> = {
  admin: "Administrador",
  vendedor: "Vendedor",
  ejecutiva_catering: "Ejecutiva de catering",
};

export function isUserManagementRole(
  value: string,
): value is UserManagementRole {
  return (userManagementRoles as readonly string[]).includes(value);
}

export type UserManagementProfile = {
  activo: boolean;
  id: string;
  rol: UserManagementRole;
};

export function canManageUsers(
  profile: UserManagementProfile | null | undefined,
): profile is UserManagementProfile {
  return profile?.activo === true && profile.rol === "admin";
}

export function canUseApplication(
  profile: Pick<UserManagementProfile, "activo"> | null | undefined,
): profile is Pick<UserManagementProfile, "activo"> {
  return profile?.activo === true;
}

export function getAssignmentChanges(
  currentSalonIds: string[],
  nextSalonIds: string[],
) {
  const current = new Set(currentSalonIds);
  const next = new Set(nextSalonIds);

  return {
    added: [...next].filter((id) => !current.has(id)),
    removed: [...current].filter((id) => !next.has(id)),
  };
}

export function isDuplicateEmail(
  users: Array<{ email: string; id: string }>,
  email: string,
  ignoredUserId?: string,
) {
  const normalizedEmail = email.trim().toLowerCase();

  return users.some(
    (user) =>
      user.id !== ignoredUserId &&
      user.email.trim().toLowerCase() === normalizedEmail,
  );
}

export function getAccountProtectionError({
  activeAdminCount,
  actorId,
  nextActive,
  nextRole,
  targetId,
  targetWasActiveAdmin,
}: {
  activeAdminCount: number;
  actorId: string;
  nextActive: boolean;
  nextRole: UserManagementRole;
  targetId: string;
  targetWasActiveAdmin: boolean;
}) {
  const removesActiveAdmin =
    targetWasActiveAdmin && (!nextActive || nextRole !== "admin");

  if (!removesActiveAdmin) {
    return null;
  }

  if (actorId === targetId) {
    return nextActive
      ? "No podes quitarte tu propio rol de administrador."
      : "No podes desactivar tu propio usuario.";
  }

  if (activeAdminCount <= 1) {
    return "No se puede desactivar o degradar al ultimo administrador activo.";
  }

  return null;
}
