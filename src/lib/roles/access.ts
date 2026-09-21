import "server-only";

import { redirect } from "next/navigation";
import { getCurrentProfile } from "@/lib/auth/get-current-profile";
import { createClient } from "@/lib/supabase/server";
import {
  isScreenPermission,
  screenPermissions,
  type ScreenPermission,
} from "./permissions";

export type GrantedScreenPermission = {
  canManage: boolean;
  screen: ScreenPermission;
};

export async function getCurrentScreenPermissions(): Promise<
  GrantedScreenPermission[]
> {
  const profile = await getCurrentProfile();

  if (!profile?.activo) return [];
  if (profile.rol === "admin") {
    return screenPermissions.map(({ key }) => ({ canManage: true, screen: key }));
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("current_user_permissions");

  if (error) {
    throw new Error("No se pudieron obtener los permisos del usuario actual.");
  }

  return (data ?? []).flatMap((permission) =>
    isScreenPermission(permission.screen)
      ? [{ canManage: permission.can_manage, screen: permission.screen }]
      : [],
  );
}

export function canUseScreen(
  permissions: GrantedScreenPermission[],
  screen: ScreenPermission,
  manage = false,
) {
  const permission = permissions.find((item) => item.screen === screen);

  return Boolean(permission && (!manage || permission.canManage));
}

export async function requireScreenManagement(screen: ScreenPermission) {
  const permissions = await getCurrentScreenPermissions();

  if (!canUseScreen(permissions, screen, true)) {
    redirect("/dashboard?error=forbidden");
  }
}
