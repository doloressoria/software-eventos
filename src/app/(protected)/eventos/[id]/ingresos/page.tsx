import Link from "next/link";
import { EventoDetalleNav } from "@/components/eventos/evento-detalle-nav";
import { IngresosEventoSection } from "@/components/pagos/ingresos-evento-section";
import { buttonVariants } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";
import { getEventoById } from "@/lib/eventos/queries";
import { getEventoValores } from "@/lib/evento-servicios/queries";
import { canUseScreen, getCurrentScreenPermissions } from "@/lib/roles/access";
import { getEventoIngresos } from "@/lib/pagos/queries";

type EventoIngresosPageProps = {
  params: Promise<{
    id: string;
  }>;
};

export default async function EventoIngresosPage({
  params,
}: EventoIngresosPageProps) {
  const { id } = await params;
  const { evento, profile } = await getEventoById(id);
  const [ingresos, valores, permisos] = await Promise.all([
    getEventoIngresos(evento.id),
    getEventoValores(evento.id),
    getCurrentScreenPermissions(),
  ]);

  return (
    <section className="space-y-6">
      <PageHeader
        eyebrow="Ingresos"
        title={evento.cliente_nombre}
        description="Cobros registrados para este evento, saldo pendiente y carga de nuevos pagos."
        actions={
          <>
            <Link
              href={`/eventos/${evento.id}`}
              className={buttonVariants({ variant: "secondary" })}
            >
              Volver al detalle
            </Link>
            <Link
              href="/eventos"
              className={buttonVariants({ variant: "secondary" })}
            >
              Volver a eventos
            </Link>
          </>
        }
      />

      <EventoDetalleNav active="ingresos" eventoId={evento.id} />

      <IngresosEventoSection
        eventoId={evento.id}
        ingresos={ingresos}
        servicios={valores.opcionesPago}
        actorId={profile.id}
        admin={profile.rol === "admin"}
        gestionaEventos={canUseScreen(permisos, "eventos", true)}
      />
    </section>
  );
}
