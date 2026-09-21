import Link from "next/link";
import { RoleForm } from "@/components/roles/role-form";
import { buttonVariants } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";

export default function NuevoRolPage() {
  return <section className="space-y-6">
    <PageHeader eyebrow="Admin / Roles" title="Nuevo rol" description="Crea un rol operativo y selecciona sus módulos." actions={<Link href="/admin/roles" className={buttonVariants({ variant: "secondary" })}>Volver a roles</Link>} />
    <RoleForm />
  </section>;
}
