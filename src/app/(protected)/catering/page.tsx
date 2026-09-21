import Link from "next/link";
import { Alert } from "@/components/ui/alert";
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
import { getCateringDisplayFields, listCaterings } from "@/lib/catering/queries";
import { canUseScreen, getCurrentScreenPermissions } from "@/lib/roles/access";

type CateringPageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export default async function CateringPage({ searchParams }: CateringPageProps) {
  const [caterings, permissions] = await Promise.all([
    listCaterings(),
    getCurrentScreenPermissions(),
  ]);
  const canManage = canUseScreen(permissions, "catering", true);
  const params = searchParams ? await searchParams : {};
  const wasDeleted = Boolean(params.deleted);

  return (
    <section className="space-y-6">
      <PageHeader
        eyebrow="Catering"
        title="Panel de caterings"
        description="Catering vinculado a eventos de salon y catering externo contratado directamente."
        actions={canManage ? (
          <Link href="/catering/nuevo" className={buttonVariants({ variant: "primary" })}>
            Nuevo catering
          </Link>
        ) : null}
      />

      {wasDeleted ? (
        <Alert role="status" variant="success" className="font-medium">
          Catering eliminado correctamente.
        </Alert>
      ) : null}

      <Card className="overflow-hidden">
        <CardHeader>
          <CardTitle>
            {caterings.length === 1
              ? "1 catering registrado"
              : `${caterings.length} caterings registrados`}
          </CardTitle>
        </CardHeader>

        {caterings.length > 0 ? (
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead scope="col">Cliente</TableHead>
                <TableHead scope="col">Fecha</TableHead>
                <TableHead scope="col">Salon</TableHead>
                <TableHead scope="col" className="text-right">
                  Total
                </TableHead>
                <TableHead scope="col" className="text-right">
                  Saldo pendiente
                </TableHead>
                <TableHead scope="col" className="text-right">
                  Acciones
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {caterings.map((catering) => {
                const display = getCateringDisplayFields(catering);

                return (
                  <TableRow key={catering.id}>
                    <TableCell>
                      <p className="font-medium text-slate-950">{display.clienteNombre}</p>
                      {catering.tipo_servicio ? (
                        <p className="mt-1 text-sm text-slate-500">{catering.tipo_servicio}</p>
                      ) : null}
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-slate-600">
                      {formatDate(display.fechaEvento)}
                    </TableCell>
                    <TableCell className="text-slate-600">
                      {display.salonNombre ?? "Externo"}
                    </TableCell>
                    <TableCell className="text-right font-medium text-slate-950">
                      {formatCurrency(catering.total_con_iva)}
                    </TableCell>
                    <TableCell className="text-right font-medium text-slate-950">
                      {formatCurrency(catering.saldo_pendiente)}
                    </TableCell>
                    <TableCell>
                      <div className="flex justify-end">
                        <Link
                          href={`/catering/${catering.id}`}
                          className={buttonVariants({ variant: "secondary", size: "xs" })}
                        >
                          Ver
                        </Link>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        ) : (
          <EmptyState
            title="No hay caterings cargados"
            description="Crea el primer catering vinculado a un evento o externo."
            action={canManage ? (
              <Link href="/catering/nuevo" className={buttonVariants({ variant: "secondary" })}>
                Nuevo catering
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
    return "-";
  }

  return new Intl.DateTimeFormat("es-AR", {
    day: "2-digit",
    month: "2-digit",
    timeZone: "UTC",
    year: "numeric",
  }).format(new Date(`${value}T00:00:00.000Z`));
}

function formatCurrency(value: number | null) {
  return new Intl.NumberFormat("es-AR", {
    currency: "ARS",
    maximumFractionDigits: 2,
    style: "currency",
  }).format(value ?? 0);
}
