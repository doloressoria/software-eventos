import { updateSession } from "@/lib/supabase/middleware";
import { getDefaultScreenPath, getRequiredScreenPermission } from "@/lib/roles/permissions";
import { NextResponse, type NextRequest } from "next/server";

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const isPublicRoute = pathname === "/login";
  const { accessDenied, claims, isAdmin, permissions, response } = await updateSession(request);
  const isAuthenticated = Boolean(claims);
  const isExcelDownload = /^\/(eventos|catering)\/[^/]+\/excel$/.test(pathname);
  if (isExcelDownload) {
    const permission = getRequiredScreenPermission(pathname);
    const status = !isAuthenticated ? 401 : accessDenied || (!isAdmin && !permissions.some((p) => p.screen === permission?.screen)) ? 403 : null;
    if (status) {
      const denied = NextResponse.json({ error: status === 401 ? "La sesión venció. Volvé a iniciar sesión para descargar el archivo." : "No tenés permiso para exportar este detalle." },
        { status, headers: { "Cache-Control": "private, no-store", "Vary": "Cookie" } });
      response.cookies.getAll().forEach((cookie) => denied.cookies.set(cookie.name, cookie.value, cookie));
      return denied;
    }
  }

  if (accessDenied) {
    const redirectResponse = NextResponse.redirect(
      new URL("/login?error=inactive", request.url),
    );

    response.cookies.getAll().forEach((cookie) => {
      redirectResponse.cookies.set(cookie.name, cookie.value, cookie);
    });

    return redirectResponse;
  }

  if (isAuthenticated && pathname === "/login" && !request.nextUrl.searchParams.has("error")) {
    return NextResponse.redirect(new URL(isAdmin ? "/dashboard" : getDefaultScreenPath(permissions), request.url));
  }

  if (!isAuthenticated && !isPublicRoute) {
    const redirectUrl = new URL("/login", request.url);
    redirectUrl.searchParams.set("redirectedFrom", pathname);
    return NextResponse.redirect(redirectUrl);
  }

  const requiredPermission = getRequiredScreenPermission(pathname);
  if (
    requiredPermission && !isAdmin &&
    !permissions.some(
      (permission) =>
        permission.screen === requiredPermission.screen &&
        (!requiredPermission.manage || permission.can_manage),
    )
  ) {
    return NextResponse.redirect(new URL(getDefaultScreenPath(permissions), request.url));
  }

  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
