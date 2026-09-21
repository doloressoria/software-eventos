import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { requireAdmin } from "@/lib/auth/require-admin";

export default async function AdminPage() {
  await requireAdmin();

  const items = [
    {
      description: "Consulta y edita cualquier evento, sus servicios y movimientos financieros",
      href: "/eventos",
      name: "Edicion global de eventos",
    },
    {
      description: "Alta, roles, estado y asignaciones de salones",
      href: "/admin/usuarios",
      name: "Usuarios y roles",
    },
    {
      description: "Módulos que cada rol puede ver o gestionar",
      href: "/admin/roles",
      name: "Roles y permisos",
    },
    {
      description: "Historial inmutable de cambios realizados en el sistema",
      href: "/admin/auditoria",
      name: "Auditoria",
    },
    {
      description: "Importacion mensual para autocompletar eventos",
      href: "/admin/precios-servicios",
      name: "Precios de servicios",
    },
    {
      description: "Aplicacion auditable de ajustes mensuales sobre servicios impagos",
      href: "/admin/actualizaciones-ipc",
      name: "Actualizaciones por IPC",
    },
    {
      description: "Reservado para administradores",
      href: null,
      name: "Configuracion",
    },
  ];

  return (
    <section className="space-y-6">
      <PageHeader
        eyebrow="Admin"
        title="Administracion del sistema"
        description="Modulo reservado para usuarios, roles, auditoria, salones, permisos y configuracion general."
      />
      <Card>
        <CardContent>
          <div className="grid gap-3 md:grid-cols-3">
            {items.map((item) =>
              item.href ? (
                <Link
                  key={item.name}
                  href={item.href}
                  className="group flex items-center justify-between gap-4 rounded-xl border border-slate-200 bg-slate-50/70 px-4 py-3.5 transition hover:border-teal-100 hover:bg-teal-50/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500 focus-visible:ring-offset-2"
                >
                  <div>
                    <p className="text-sm font-medium text-slate-950">
                      {item.name}
                    </p>
                    <p className="mt-1 text-xs text-slate-500">
                      {item.description}
                    </p>
                  </div>
                  <ArrowRight
                    aria-hidden="true"
                    className="h-4 w-4 shrink-0 text-slate-400 transition group-hover:translate-x-0.5 group-hover:text-teal-700"
                  />
                </Link>
              ) : (
                <div
                  key={item.name}
                  className="rounded-xl border border-slate-200 bg-slate-50/70 px-4 py-3.5 transition hover:border-teal-100 hover:bg-teal-50/50"
                >
                  <p className="text-sm font-medium text-slate-950">
                    {item.name}
                  </p>
                  <p className="mt-1 text-xs text-slate-500">
                    {item.description}
                  </p>
                </div>
              ),
            )}
          </div>
        </CardContent>
      </Card>
    </section>
  );
}
