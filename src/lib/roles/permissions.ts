export const screenPermissions = [
  { key: "dashboard", label: "Dashboard" },
  { key: "eventos", label: "Eventos" },
  { key: "catering", label: "Catering" },
  { key: "salones", label: "Salones" },
  { key: "pagos", label: "Pagos" },
  { key: "reportes", label: "Reportes" },
] as const;

export type ScreenPermission = (typeof screenPermissions)[number]["key"];

export function isScreenPermission(value: string): value is ScreenPermission {
  return screenPermissions.some((permission) => permission.key === value);
}

export function getRequiredScreenPermission(pathname: string): {
  manage: boolean;
  screen: ScreenPermission;
} | null {
  if (pathname === "/dashboard") return { screen: "dashboard", manage: false };
  if (pathname.startsWith("/eventos")) {
    return { screen: "eventos", manage: /nuevo|editar|ingresos|egresos|flujo-dinero/.test(pathname) };
  }
  if (pathname.startsWith("/catering")) {
    return { screen: "catering", manage: /nuevo|ingresos|egresos/.test(pathname) };
  }
  if (pathname.startsWith("/salones")) {
    return { screen: "salones", manage: /nuevo|editar|asignaciones/.test(pathname) };
  }
  if (pathname.startsWith("/pagos")) return { screen: "pagos", manage: false };
  if (pathname.startsWith("/reportes")) return { screen: "reportes", manage: false };
  return null;
}

export function getDefaultScreenPath(
  permissions: Array<{ screen: string }>,
) {
  const screen = permissions.find((permission) => isScreenPermission(permission.screen))?.screen;

  return screen === "dashboard" ? "/dashboard" : screen ? `/${screen}` : "/login?error=forbidden";
}
