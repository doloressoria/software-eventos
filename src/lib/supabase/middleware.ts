import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import type { Database } from "@/types/database.types";

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({
    request,
  });

  const supabase = createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => {
            request.cookies.set(name, value);
          });

          supabaseResponse = NextResponse.next({
            request,
          });

          cookiesToSet.forEach(({ name, value, options }) => {
            supabaseResponse.cookies.set(name, value, options);
          });
        },
      },
    },
  );

  const { data } = await supabase.auth.getClaims();
  const claims = data?.claims ?? null;
  let accessDenied = false;
  let isAdmin = false;
  let permissions: Array<{ can_manage: boolean; screen: string }> = [];

  if (claims?.sub) {
    const { data: profile, error } = await supabase
      .from("usuarios")
      .select("activo, rol")
      .eq("id", claims.sub)
      .maybeSingle();

    accessDenied = Boolean(error) || profile?.activo !== true;
    isAdmin = profile?.rol === "admin";

    if (accessDenied) {
      await supabase.auth.signOut({ scope: "local" });
    } else if (profile?.rol !== "admin") {
      const { data: permissionData } = await supabase.rpc(
        "current_user_permissions",
      );
      permissions = permissionData ?? [];
    }
  }

  return { accessDenied, claims, isAdmin, permissions, response: supabaseResponse };
}
