import Link from "next/link";
import { deleteCateringAction, updateCateringAction } from "@/app/(protected)/catering/actions";
import { CateringDetalleNav } from "@/components/catering/catering-detalle-nav";
import { CateringForm } from "@/components/catering/catering-form";
import { CateringItemsSection } from "@/components/catering/catering-items-section";
import { DeleteCateringForm } from "@/components/catering/delete-catering-form";
import { PrecioHistorialSection } from "@/components/catering/precio-historial-section";
import { Alert } from "@/components/ui/alert";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import {
  getCateringById,
  getCateringDisplayFields,
  getNuevoCateringPageData,
} from "@/lib/catering/queries";
import { getCateringFormStateFromCatering } from "@/lib/catering/validation";

type CateringDetallePageProps = {
  params: Promise<{ id: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export default async function CateringDetallePage({
  params,
  searchParams,
}: CateringDetallePageProps) {
  const { id } = await params;
  const paramsQuery = searchParams ? await searchParams : {};
  const [{ catering, items, precioHistorial, precioVigente }, { ejecutivas, lugares }] =
    await Promise.all([getCateringById(id), getNuevoCateringPageData()]);
  const display = getCateringDisplayFields(catering);
  const wasCreated = Boolean(paramsQuery.created);
  const paxTotal =
    (catering.pax_adultos ?? 0) +
    (catering.pax_jovenes ?? 0) +
    (catering.pax_menores ?? 0) +
    (catering.pax_bebes ?? 0);

  return (
    <section className="space-y-6">
      <PageHeader
        eyebrow="Catering"
        title={display.clienteNombre}
        description={
          catering.evento_id
            ? "Catering vinculado a un evento de salon."
            : "Catering externo, sin evento de salon vinculado."
        }
        actions={
          <>
            <DeleteCateringForm action={deleteCateringAction.bind(null, catering.id)} />
            <Link href="/catering" className={buttonVariants({ variant: "secondary" })}>
              Volver a catering
            </Link>
          </>
        }
      />

      {wasCreated ? (
        <Alert role="status" variant="success" className="font-medium">
          Catering creado correctamente.
        </Alert>
      ) : null}

      <CateringDetalleNav active="detalle" cateringId={catering.id} />

      <div className="grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
        <Card>
          <CardHeader>
            <CardTitle>Datos generales</CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="grid gap-4 sm:grid-cols-2">
              <DetailItem label="Cliente" value={display.clienteNombre} />
              <DetailItem label="Razon social" value={display.clienteRazonSocial} />
              <DetailItem label="CUIT / DNI" value={display.clienteCuitDni} />
              <DetailItem label="Contacto" value={display.clienteContacto} />
              <DetailItem label="Fecha del evento" value={formatDate(display.fechaEvento)} />
              <DetailItem label="Salon" value={display.salonNombre ?? "Externo"} />
              {!catering.evento_id ? <DetailItem label="Lugar" value={display.lugarEvento ?? "Sin especificar"} /> : null}
              <DetailItem label="Tipo de evento" value={display.tipoEvento} />
              <DetailItem label="Tipo de servicio" value={catering.tipo_servicio} />
              {catering.evento_id ? (
                <div className="sm:col-span-2">
                  <Link
                    href={`/eventos/${catering.evento_id}`}
                    className={buttonVariants({ variant: "secondary", size: "sm" })}
                  >
                    Ver evento vinculado
                  </Link>
                </div>
              ) : null}
            </dl>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>PAX y resumen</CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-1">
              <DetailItem label="Adultos" value={catering.pax_adultos} />
              <DetailItem label="Jovenes" value={catering.pax_jovenes} />
              <DetailItem label="Menores" value={catering.pax_menores} />
              <DetailItem label="Bebes" value={catering.pax_bebes} />
              <DetailItem label="PAX total" value={paxTotal} />
              <DetailItem
                label="Precio vigente x persona"
                value={precioVigente !== null ? formatCurrency(precioVigente) : "-"}
              />
            </dl>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Totales</CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <DetailItem
              label="Comision organizador"
              value={formatCurrency(catering.comision_organizador_monto ?? 0)}
            />
            <DetailItem
              label="IVA catering"
              value={formatPercentage(catering.iva_porcentaje)}
            />
            <DetailItem
              label="Total del catering"
              value={formatCurrency(catering.total_con_iva ?? 0)}
              strong
            />
            <DetailItem
              label="Saldo pendiente"
              value={formatCurrency(catering.saldo_pendiente ?? 0)}
              strong
            />
          </dl>
        </CardContent>
      </Card>

      <PrecioHistorialSection
        cateringId={catering.id}
        historial={precioHistorial}
        pax={{
          pax_adultos: catering.pax_adultos,
          pax_jovenes: catering.pax_jovenes,
          pax_menores: catering.pax_menores,
          pax_bebes: catering.pax_bebes,
        }}
      />

      <CateringItemsSection cateringId={catering.id} items={items} />

      <Card>
        <CardHeader>
          <CardTitle>Editar catering</CardTitle>
        </CardHeader>
        <CardContent>
          <CateringForm
            action={updateCateringAction.bind(null, catering.id)}
            cancelHref={`/catering/${catering.id}`}
            ejecutivas={ejecutivas}
            initialState={getCateringFormStateFromCatering(catering)}
            isLinkedToEvento={Boolean(catering.evento_id)}
            mode="edit"
            pendingLabel="Guardando..."
            lugares={lugares}
            submitLabel="Guardar cambios"
          />
        </CardContent>
      </Card>
    </section>
  );
}

function DetailItem({
  label,
  strong = false,
  value,
}: {
  label: string;
  strong?: boolean;
  value: number | string | null | undefined;
}) {
  return (
    <div className="rounded-xl border border-slate-100 bg-slate-50/60 px-4 py-3">
      <dt className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
        {label}
      </dt>
      <dd
        className={
          strong
            ? "mt-1 text-base font-semibold text-slate-950"
            : "mt-1 text-sm font-medium text-slate-950"
        }
      >
        {value ?? "-"}
      </dd>
    </div>
  );
}

function formatDate(value: string | null) {
  if (!value) {
    return null;
  }

  return new Intl.DateTimeFormat("es-AR", {
    day: "2-digit",
    month: "2-digit",
    timeZone: "UTC",
    year: "numeric",
  }).format(new Date(`${value}T00:00:00.000Z`));
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat("es-AR", {
    currency: "ARS",
    maximumFractionDigits: 2,
    style: "currency",
  }).format(value);
}

function formatPercentage(value: number | null) {
  return `${new Intl.NumberFormat("es-AR", {
    maximumFractionDigits: 2,
  }).format((value ?? 0) * 100)}%`;
}
