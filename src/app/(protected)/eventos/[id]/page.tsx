import Link from "next/link";
import { deleteEventoAction } from "@/app/(protected)/eventos/actions";
import { EventoDetalleNav } from "@/components/eventos/evento-detalle-nav";
import { DeleteEventoForm } from "@/components/eventos/delete-evento-form";
import { ValoresEventoSection } from "@/components/evento-servicios/valores-evento-section";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { getEventoById } from "@/lib/eventos/queries";
import { getEventoValores } from "@/lib/evento-servicios/queries";
import { getEventoCaterings } from "@/lib/catering/queries";
import { getEventoContactos } from "@/lib/contactos/queries";
import { ContactosSection } from "@/components/eventos/contactos-section";

type EventoDetallePageProps = {
  params: Promise<{
    id: string;
  }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export default async function EventoDetallePage({
  params,
  searchParams,
}: EventoDetallePageProps) {
  const { id } = await params;
  const paramsQuery = searchParams ? await searchParams : {};
  const { evento } = await getEventoById(id);
  const [valores, caterings, contactos] = await Promise.all([
    getEventoValores(evento.id),
    getEventoCaterings(evento.id),
    getEventoContactos(evento.id),
  ]);
  const wasCreated = Boolean(paramsQuery.created);
  const wasUpdated = Boolean(paramsQuery.updated);
  const preciosAutocompletados = getSearchParamValue(
    paramsQuery.precios_autocompletados,
  );
  const preciosFaltantes = getSearchParamValue(paramsQuery.precios_faltantes);
  const revisarPreciosSalon = Boolean(paramsQuery.revisar_precios_salon);

  return (
    <section className="space-y-6">
      <PageHeader
        eyebrow="Evento"
        title={evento.cliente_nombre}
        description="Detalle comercial inicial del evento, salon asignado y responsable de venta."
        actions={
          <>
            <Link
              href={`/eventos/${evento.id}/editar`}
              className={buttonVariants({ variant: "primary" })}
            >
              Editar
            </Link>
            <Link
              href={`/eventos/${evento.id}/flujo-dinero`}
              className={buttonVariants({ variant: "secondary" })}
            >
              Ver flujo de dinero
            </Link>
            <DeleteEventoForm
              action={deleteEventoAction.bind(null, evento.id)}
            />
            <Link
              href="/eventos"
              className={buttonVariants({ variant: "secondary" })}
            >
              Volver a eventos
            </Link>
          </>
        }
      />

      {wasCreated || wasUpdated ? (
        <Alert
          role="status"
          variant="success"
          className="font-medium"
        >
          {wasUpdated
            ? "Evento actualizado correctamente."
            : "Evento creado correctamente."}
        </Alert>
      ) : null}

      {preciosAutocompletados ? (
        <Alert role="status" variant="success" className="font-medium">
          Se autocompletaron {preciosAutocompletados} servicios con precios
          mensuales vigentes.
        </Alert>
      ) : null}

      {preciosFaltantes ? (
        <Alert variant="warning" className="font-medium">
          No hay precio mensual cargado para: {preciosFaltantes}. Podes cargar
          esos valores manualmente en los servicios del evento.
        </Alert>
      ) : null}

      {revisarPreciosSalon ? (
        <Alert variant="warning" className="font-medium">
          El salon del evento cambio. No se sobrescribieron precios ya cargados;
          revisa los servicios dependientes del salon antes de confirmar valores.
        </Alert>
      ) : null}

      <EventoDetalleNav active="detalle" eventoId={evento.id} />

      <div className="grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
        <Card>
          <CardHeader className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <CardTitle>Datos del evento</CardTitle>
            <Badge variant={getEstadoVariant(evento.estado)}>
              {getEstadoLabel(evento.estado)}
            </Badge>
          </CardHeader>
          <CardContent>
            <dl className="grid gap-4 sm:grid-cols-2">
              <DetailItem label="Salon" value={evento.salones?.nombre} />
              <DetailItem
                label="Vendedor"
                value={evento.usuarios?.full_name ?? evento.usuarios?.email}
              />
              <DetailItem
                label="Fecha del evento"
                value={formatDate(evento.fecha_evento)}
              />
              <DetailItem
                label="Fecha de carga"
                value={formatDate(evento.fecha_carga)}
              />
              <DetailItem
                label="Confirmacion de presupuesto"
                value={formatDate(evento.fecha_confirmacion_presupuesto)}
              />
              <DetailItem
                label="Primer ingreso"
                value={formatDate(evento.fecha_contrato)}
              />
              <DetailItem label="Nombre del evento" value={evento.nombre_evento} />
              <DetailItem label="Tipo de evento" value={evento.tipo_evento} />
              <DetailItem label="Subtipo de evento" value={evento.subtipo_evento} />
              <DetailItem label="Espacio" value={evento.espacio} />
            </dl>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Asistentes</CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-1">
              <DetailItem label="Adultos" value={formatNumber(evento.pax_adultos)} />
              <DetailItem label="Jovenes" value={formatNumber(evento.pax_jovenes)} />
              <DetailItem label="Menores" value={formatNumber(evento.pax_menores)} />
              <DetailItem label="Bebes" value={formatNumber(evento.pax_bebes)} />
            </dl>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Cliente</CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <DetailItem label="Nombre" value={evento.cliente_nombre} />
            <DetailItem
              label="Razon social"
              value={evento.cliente_razon_social}
            />
            <DetailItem label="CUIT / DNI" value={evento.cliente_cuit_dni} />
            <DetailItem label="Direccion" value={evento.cliente_direccion} />
            <DetailItem label="Ciudad" value={evento.cliente_ciudad} />
            <DetailItem
              label="Direccion de factura"
              value={evento.cliente_direccion_factura}
            />
          </dl>
        </CardContent>
      </Card>

      <ContactosSection eventoId={evento.id} initial={contactos} />

      <Card>
        <CardHeader>
          <CardTitle>Informacion comercial</CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="grid gap-4 sm:grid-cols-2">
            <DetailItem
              label="Tiene organizador externo"
              value={evento.tiene_organizador ? "Si" : "No"}
            />
            {evento.tiene_organizador ? (
              <>
                <DetailItem
                  label="Nombre del organizador"
                  value={evento.organizador_nombre}
                />
                <DetailItem
                  label="Email del organizador"
                  value={evento.organizador_email}
                />
                <DetailItem
                  label="Telefono del organizador"
                  value={evento.organizador_telefono}
                />
              </>
            ) : null}
            <div className="sm:col-span-2">
              <DetailItem label="Observaciones" value={evento.observaciones} />
            </div>
          </dl>
        </CardContent>
      </Card>

      <ValoresEventoSection
        catalogo={valores.catalogo}
        caterings={caterings}
        eventoId={evento.id}
        tieneOrganizador={evento.tiene_organizador}
        monthlyPriceSuggestions={valores.monthlyPriceSuggestions}
        servicios={valores.servicios}
        totalEvento={valores.totalEvento}
      />
    </section>
  );
}

function getSearchParamValue(value: string | string[] | undefined) {
  if (Array.isArray(value)) {
    return value[0];
  }

  return value;
}

function DetailItem({
  label,
  value,
}: {
  label: string;
  value: number | string | null | undefined;
}) {
  return (
    <div className="rounded-xl border border-slate-100 bg-slate-50/60 px-4 py-3">
      <dt className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
        {label}
      </dt>
      <dd className="mt-1 text-sm font-medium text-slate-950">
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

function formatNumber(value: number | null) {
  return value === null ? null : value;
}

function getEstadoLabel(estado: string) {
  const labels: Record<string, string> = {
    borrador: "Borrador",
    cancelado: "Cancelado",
    confirmado: "Confirmado",
    realizado: "Realizado",
  };

  return labels[estado] ?? estado;
}

function getEstadoVariant(estado: string) {
  if (estado === "confirmado" || estado === "realizado") {
    return "success";
  }

  if (estado === "cancelado") {
    return "danger";
  }

  return "neutral";
}
