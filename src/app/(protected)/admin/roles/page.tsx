import Link from "next/link";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { screenPermissions } from "@/lib/roles/permissions";
import { listRoles } from "@/lib/roles/queries";

export default async function RolesPage({ searchParams }: { searchParams?: Promise<{ saved?: string }> }) {
  const [roles, params] = await Promise.all([
    listRoles(),
    searchParams ?? Promise.resolve<{ saved?: string }>({}),
  ]);

  return (
    <section className="space-y-6">
      <PageHeader
        eyebrow="Admin"
        title="Roles y permisos"
        description="Define qué módulos puede ver o gestionar cada rol. Los salones se asignan después a cada usuario."
        actions={<Link href="/admin/roles/nuevo" className={buttonVariants({ variant: "primary" })}>Nuevo rol</Link>}
      />
      {params.saved ? <Alert role="status" variant="success">Rol guardado correctamente.</Alert> : null}
      <div className="grid gap-4 lg:grid-cols-2">
        {roles.map((role) => (
          <Card key={role.id}>
            <CardHeader className="flex-row items-start justify-between gap-4">
              <div>
                <CardTitle>{role.nombre}</CardTitle>
                <p className="mt-1 text-sm text-slate-500">{role.descripcion ?? "Sin descripción"}</p>
              </div>
              <Link href={`/admin/roles/${role.id}/editar`} className={buttonVariants({ size: "xs", variant: "secondary" })}>Editar</Link>
            </CardHeader>
            <CardContent className="flex flex-wrap gap-2">
              {role.permissions.length > 0 ? role.permissions.map((permission) => (
                <Badge key={permission.screen} variant={permission.can_manage ? "primary" : "neutral"}>
                  {screenPermissions.find((item) => item.key === permission.screen)?.label ?? permission.screen}: {permission.can_manage ? "Gestionar" : "Ver"}
                </Badge>
              )) : <span className="text-sm text-slate-500">Sin módulos habilitados</span>}
            </CardContent>
          </Card>
        ))}
      </div>
    </section>
  );
}
