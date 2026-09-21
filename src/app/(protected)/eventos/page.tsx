import Link from "next/link";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { listEventos } from "@/lib/eventos/queries";
import { canUseScreen, getCurrentScreenPermissions } from "@/lib/roles/access";

type EventosPageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export default async function EventosPage({ searchParams }: EventosPageProps) {
  const [{ eventos, profile }, permissions] = await Promise.all([
    listEventos(),
    getCurrentScreenPermissions(),
  ]);
  const params = searchParams ? await searchParams : {};
  const isAdmin = profile.rol === "admin";
  const canManage = canUseScreen(permissions, "eventos", true);
  const wasDeleted = Boolean(params.deleted);

  return (
    <section className="space-y-6">
      <PageHeader
        eyebrow="Eventos"
        title="Gestion de eventos"
        description="Reservas, fechas, salones asociados y responsable comercial."
        actions={canManage ? (
          <Link
            href="/eventos/nuevo"
            className={buttonVariants({ variant: "primary" })}
          >
            Nuevo evento
          </Link>
        ) : null}
      />

      {wasDeleted ? (
        <Alert
          role="status"
          variant="success"
          className="font-medium"
        >
          Evento eliminado correctamente.
        </Alert>
      ) : null}

      <Card className="overflow-hidden">
        <CardHeader className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <CardTitle>Agenda comercial</CardTitle>
            <p className="mt-1 text-sm text-slate-500">
              {eventos.length === 1
                ? "1 evento registrado"
                : `${eventos.length} eventos registrados`}
            </p>
          </div>
          <Badge variant="primary">{isAdmin ? "Admin" : "Vendedor"}</Badge>
        </CardHeader>

        {eventos.length > 0 ? (
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead scope="col">Fecha</TableHead>
                <TableHead scope="col">Cliente</TableHead>
                <TableHead scope="col">Salon</TableHead>
                <TableHead scope="col">Tipo</TableHead>
                <TableHead scope="col">Estado</TableHead>
                <TableHead scope="col">Vendedor</TableHead>
                <TableHead scope="col" className="text-right">
                  Acciones
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {eventos.map((evento) => (
                <TableRow key={evento.id}>
                  <TableCell className="whitespace-nowrap text-slate-600">
                    {formatDate(evento.fecha_evento)}
                  </TableCell>
                  <TableCell>
                    <p className="font-medium text-slate-950">
                      {evento.nombre_evento ?? evento.cliente_nombre}
                    </p>
                    <p className="mt-1 text-sm text-slate-500">
                      Carga: {formatDate(evento.fecha_carga) ?? "-"}
                    </p>
                    <p className="mt-1 text-sm text-slate-500">
                      Primer ingreso:{" "}
                      {formatDate(evento.fecha_contrato) ?? "-"}
                    </p>
                  </TableCell>
                  <TableCell className="text-slate-600">
                    {evento.salones?.nombre ?? "-"}
                  </TableCell>
                  <TableCell className="text-slate-600">
                    {[evento.tipo_evento, evento.subtipo_evento]
                      .filter(Boolean)
                      .join(" / ") || "-"}
                  </TableCell>
                  <TableCell>
                    <Badge variant={getEstadoVariant(evento.estado)}>
                      {getEstadoLabel(evento.estado)}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-slate-600">
                    {evento.usuarios?.full_name ?? evento.usuarios?.email ?? "-"}
                  </TableCell>
                  <TableCell>
                    <div className="flex justify-end">
                      <Link
                        href={`/eventos/${evento.id}`}
                        className={buttonVariants({
                          variant: "secondary",
                          size: "xs",
                        })}
                      >
                        Ver
                      </Link>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        ) : (
          <EmptyState
            title="No hay eventos cargados"
            description={
              isAdmin
                ? "Crea el primer evento para empezar a ver la agenda comercial."
                : "Todavia no hay eventos en tus salones asignados."
            }
            action={canManage ? (
              <Link
                href="/eventos/nuevo"
                className={buttonVariants({ variant: "secondary" })}
              >
                Preparar nuevo evento
              </Link>
            ) : null}
          />
        )}
      </Card>
    </section>
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
