import Link from "next/link";
import { updateSalonStatusAction } from "@/app/(protected)/salones/actions";
import { DeactivateSalonForm } from "@/components/salones/deactivate-salon-form";
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
import { listSalones } from "@/lib/salones/queries";
import { canUseScreen, getCurrentScreenPermissions } from "@/lib/roles/access";

type SalonesPageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export default async function SalonesPage({
  searchParams,
}: SalonesPageProps) {
  const [{ profile, salones }, permissions] = await Promise.all([
    listSalones(),
    getCurrentScreenPermissions(),
  ]);
  const params = searchParams ? await searchParams : {};
  const statusMessage = getStatusMessage(params);
  const isAdmin = profile.rol === "admin";
  const canManage = canUseScreen(permissions, "salones", true);

  return (
    <section className="space-y-6">
      <PageHeader
        eyebrow="Salones"
        title={isAdmin ? "Administracion de salones" : "Mis salones"}
        description={
          isAdmin
            ? "Crea, edita, activa, desactiva y asigna salones disponibles para la operacion de eventos."
            : "Consulta los salones activos asignados a tu usuario vendedor."
        }
        actions={
          canManage ? (
            <>
              {isAdmin ? <Link
                href="/salones/asignaciones"
                className={buttonVariants({ variant: "secondary" })}
              >
                Asignaciones
              </Link> : null}
              {isAdmin ? <Link
                href="/salones/nuevo"
                className={buttonVariants({ variant: "primary" })}
              >
                Nuevo salon
              </Link> : null}
            </>
          ) : null
        }
      />

      {statusMessage ? (
        <Alert
          role="status"
          variant={statusMessage.kind === "error" ? "destructive" : "success"}
          className="font-medium"
        >
          {statusMessage.text}
        </Alert>
      ) : null}

      <Card className="overflow-hidden">
        <CardHeader className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <CardTitle>Listado de salones</CardTitle>
            <p className="mt-1 text-sm text-slate-500">
              {salones.length === 1
                ? "1 salon registrado"
                : `${salones.length} salones registrados`}
            </p>
          </div>
          <Badge variant="primary">{isAdmin ? "Admin" : "Vendedor"}</Badge>
        </CardHeader>

        {salones.length > 0 ? (
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead scope="col">Nombre</TableHead>
                <TableHead scope="col">Direccion</TableHead>
                <TableHead scope="col">Capacidad</TableHead>
                <TableHead scope="col">Estado</TableHead>
                {canManage ? (
                  <TableHead scope="col" className="text-right">
                    Acciones
                  </TableHead>
                ) : null}
              </TableRow>
            </TableHeader>
            <TableBody>
              {salones.map((salon) => (
                <TableRow key={salon.id}>
                  <TableCell>
                    <p className="font-medium text-slate-950">
                      {salon.nombre}
                    </p>
                    {salon.descripcion ? (
                      <p className="mt-1 max-w-md text-sm leading-6 text-slate-500">
                        {salon.descripcion}
                      </p>
                    ) : (
                      <p className="mt-1 text-sm text-slate-400">
                        Sin descripcion
                      </p>
                    )}
                  </TableCell>
                  <TableCell className="text-slate-600">
                    {salon.direccion ?? "-"}
                  </TableCell>
                  <TableCell className="text-slate-600">
                    {salon.capacidad !== null
                      ? `${salon.capacidad} personas`
                      : "-"}
                  </TableCell>
                  <TableCell>
                    <Badge variant={salon.activo ? "success" : "inactive"}>
                      {salon.activo ? "Activo" : "Inactivo"}
                    </Badge>
                  </TableCell>
                  {canManage ? (
                    <TableCell>
                      <div className="flex justify-end gap-2">
                        <Link
                          href={`/salones/${salon.id}/editar`}
                          className={buttonVariants({
                            variant: "secondary",
                            size: "xs",
                          })}
                        >
                          Editar
                        </Link>
                        <DeactivateSalonForm
                          id={salon.id}
                          active={salon.activo}
                          action={updateSalonStatusAction}
                        />
                      </div>
                    </TableCell>
                  ) : null}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        ) : (
          <EmptyState
            title="No hay salones cargados"
            description={
              isAdmin
                ? "Crea el primer salon para empezar a administrar unidades de negocio y asociarlas a eventos."
                : "Todavia no tenes salones activos asignados."
            }
            action={
              isAdmin ? (
                <Link
                  href="/salones/nuevo"
                  className={buttonVariants({ variant: "primary" })}
                >
                  Nuevo salon
                </Link>
              ) : null
            }
          />
        )}
      </Card>
    </section>
  );
}

function getStatusMessage(
  params: Record<string, string | string[] | undefined>,
) {
  if (params.created) {
    return { kind: "success", text: "Salon creado correctamente." };
  }

  if (params.updated) {
    return { kind: "success", text: "Salon actualizado correctamente." };
  }

  if (params.deactivated) {
    return { kind: "success", text: "Salon desactivado correctamente." };
  }

  if (params.activated) {
    return { kind: "success", text: "Salon activado correctamente." };
  }

  if (params.error) {
    return {
      kind: "error",
      text: "No se pudo completar la accion. Intenta nuevamente.",
    };
  }

  return null;
}
