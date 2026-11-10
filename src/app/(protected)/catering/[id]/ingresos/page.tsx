import Link from "next/link";
import { CateringDetalleNav } from "@/components/catering/catering-detalle-nav";
import { CateringIngresosSection } from "@/components/catering/catering-ingresos-section";
import { buttonVariants } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";
import { getCateringById, getCateringDisplayFields } from "@/lib/catering/queries";
import { canUseScreen, getCurrentScreenPermissions } from "@/lib/roles/access";
import { getCateringIngresos } from "@/lib/catering/pagos-queries";

type CateringIngresosPageProps = {
  params: Promise<{ id: string }>;
};

export default async function CateringIngresosPage({
  params,
}: CateringIngresosPageProps) {
  const { id } = await params;
  const { catering } = await getCateringById(id);
  const display = getCateringDisplayFields(catering);
  const [ingresos, permisos] = await Promise.all([getCateringIngresos(catering.id), getCurrentScreenPermissions()]);

  return (
    <section className="space-y-6">
      <PageHeader
        eyebrow="Ingresos"
        title={display.clienteNombre}
        description="Cobros registrados para este catering, saldo pendiente y carga de nuevos pagos."
        actions={
          <>
            <Link
              href={`/catering/${catering.id}`}
              className={buttonVariants({ variant: "secondary" })}
            >
              Volver al detalle
            </Link>
            <Link href="/catering" className={buttonVariants({ variant: "secondary" })}>
              Volver a catering
            </Link>
          </>
        }
      />

      <CateringDetalleNav active="ingresos" cateringId={catering.id} />

      <CateringIngresosSection cateringId={catering.id} ingresos={ingresos}
        eventoId={catering.eventos ? catering.evento_id ?? undefined : undefined}
        gestionaCatering={canUseScreen(permisos, "catering", true)} />
    </section>
  );
}
