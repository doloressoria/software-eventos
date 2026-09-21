import { notFound } from "next/navigation";
import Link from "next/link";
import { RoleForm } from "@/components/roles/role-form";
import { buttonVariants } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";
import { getRole } from "@/lib/roles/queries";

export default async function EditarRolPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const role = await getRole(id);
  if (!role) notFound();
  return <section className="space-y-6">
    <PageHeader eyebrow="Admin / Roles" title={`Editar ${role.nombre}`} description="Los cambios se aplican a todos los usuarios que tengan este rol." actions={<Link href="/admin/roles" className={buttonVariants({ variant: "secondary" })}>Volver a roles</Link>} />
    <RoleForm role={role} />
  </section>;
}
