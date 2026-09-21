import Link from "next/link";
import { saveRoleAction } from "@/app/(protected)/admin/roles/actions";
import { SubmitButton } from "@/components/salones/submit-button";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { checkboxClassName, Input, Label } from "@/components/ui/form";
import { screenPermissions } from "@/lib/roles/permissions";
import type { RoleWithPermissions } from "@/lib/roles/queries";

export function RoleForm({ role }: { role?: RoleWithPermissions }) {
  const enabledScreens = new Set(role?.permissions.map((permission) => permission.screen));
  const managedScreens = new Set(
    role?.permissions
      .filter((permission) => permission.can_manage)
      .map((permission) => permission.screen),
  );

  return (
    <form action={saveRoleAction} className="max-w-4xl space-y-6">
      <input name="role_id" type="hidden" value={role?.id ?? ""} />
      <Card>
        <CardHeader>
          <CardTitle>{role ? "Configurar rol" : "Nuevo rol"}</CardTitle>
          <CardDescription>
            Ver permite entrar al módulo. Gestionar incluye ver y habilita sus altas y cambios dentro de los salones asignados al usuario.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid gap-5 sm:grid-cols-2">
            <div>
              <Label htmlFor="nombre">Nombre</Label>
              <Input id="nombre" name="nombre" required defaultValue={role?.nombre} maxLength={80} />
            </div>
            <div>
              <Label htmlFor="descripcion">Descripción</Label>
              <Input id="descripcion" name="descripcion" defaultValue={role?.descripcion ?? ""} maxLength={240} />
            </div>
          </div>

          <div>
            <h3 className="text-sm font-semibold text-slate-950">Módulos habilitados</h3>
            <div className="mt-3 overflow-hidden rounded-xl border border-slate-200">
              {screenPermissions.map((permission) => (
                <div key={permission.key} className="grid gap-3 border-b border-slate-200 px-4 py-3 last:border-b-0 sm:grid-cols-[1fr_auto] sm:items-center">
                  <label className="flex items-center gap-3 text-sm font-medium text-slate-800">
                    <input
                      className={checkboxClassName}
                      defaultChecked={enabledScreens.has(permission.key)}
                      name="screens"
                      type="checkbox"
                      value={permission.key}
                    />
                    {permission.label}
                  </label>
                  <label className="flex items-center gap-3 text-sm text-slate-600">
                    <input
                      className={checkboxClassName}
                      defaultChecked={managedScreens.has(permission.key)}
                      name="manage_screens"
                      type="checkbox"
                      value={permission.key}
                    />
                    Gestionar
                  </label>
                </div>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
        <Link href="/admin/roles" className={buttonVariants({ variant: "secondary" })}>Cancelar</Link>
        <SubmitButton pendingLabel="Guardando...">Guardar rol</SubmitButton>
      </div>
    </form>
  );
}
