import { AppHeader } from "@/components/app-header";
import { AppSidebar } from "@/components/app-sidebar";
import { redirect } from "next/navigation";
import { getCurrentProfile } from "@/lib/auth";
import { getCurrentScreenPermissions } from "@/lib/roles/access";
import { canUseApplication } from "@/lib/usuarios/rules-core";

export default async function ProtectedLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const profile = await getCurrentProfile();

  if (!canUseApplication(profile)) {
    redirect("/login?error=inactive");
  }

  const permissions = await getCurrentScreenPermissions();

  return (
    <div className="min-h-screen bg-background lg:flex">
      <AppSidebar
        isAdmin={profile.rol === "admin"}
        permissions={permissions.map((permission) => permission.screen)}
      />
      <div className="flex min-w-0 flex-1 flex-col">
        <AppHeader />
        <main className="flex-1 px-4 py-7 sm:px-6 lg:px-8 lg:py-10">
          <div className="mx-auto w-full max-w-7xl">{children}</div>
        </main>
      </div>
    </div>
  );
}
