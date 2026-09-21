import Link from "next/link";
import { updateUsuarioAction } from "@/app/(protected)/admin/usuarios/actions";
import { UsuarioForm } from "@/components/usuarios/usuario-form";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";
import { getUsuarioEditPageData } from "@/lib/usuarios/queries";
import type { UsuarioFormState } from "@/lib/usuarios/validation";

type EditarUsuarioPageProps = {
  params: Promise<{ id: string }>;
};

export default async function EditarUsuarioPage({
  params,
}: EditarUsuarioPageProps) {
  const { id } = await params;
  const { currentProfile, roleId, roles, salonIds, salones, user } =
    await getUsuarioEditPageData(id);
  const initialState: UsuarioFormState = {
    errors: {},
    fields: {
      activo: user.activo,
      email: user.email,
      fullName: user.full_name,
      roleId,
      salonIds,
    },
    formError: null,
    successMessage: null,
    temporaryPassword: null,
  };

  return (
    <section className="space-y-6">
      <PageHeader
        eyebrow="Admin / Usuarios"
        title={`Editar ${user.full_name}`}
        description="Los cambios de email y estado se sincronizan con Supabase Auth y el perfil de la aplicacion."
        actions={
          <div className="flex flex-wrap items-center gap-3">
            <Badge variant={user.activo ? "success" : "inactive"}>
              {user.activo ? "Activo" : "Inactivo"}
            </Badge>
            <Link
              href="/admin/usuarios"
              className={buttonVariants({ variant: "secondary" })}
            >
              Volver al listado
            </Link>
          </div>
        }
      />
      <UsuarioForm
        action={updateUsuarioAction.bind(null, id)}
        initialState={initialState}
        isSelf={currentProfile.id === user.id}
        mode="edit"
        roles={roles}
        salones={salones}
      />
    </section>
  );
}
