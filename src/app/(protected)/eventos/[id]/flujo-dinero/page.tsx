import { PagoImporte } from "@/components/pagos/pago-importe";
import Link from "next/link";
import { EventoDetalleNav } from "@/components/eventos/evento-detalle-nav";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
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
import {
  getEventoFlujoDinero,
  type FlujoAgrupacion,
  type FlujoMonedaAgrupacion,
} from "@/lib/eventos/flujo-dinero";

type EventoFlujoDineroPageProps = {
  params: Promise<{
    id: string;
  }>;
};

export default async function EventoFlujoDineroPage({
  params,
}: EventoFlujoDineroPageProps) {
  const { id } = await params;
  const flujo = await getEventoFlujoDinero(id);
  const { evento } = flujo;

  return (
    <section className="space-y-6">
      <PageHeader
        eyebrow="Flujo de dinero"
        title={evento.cliente_nombre}
        description={`Vista consolidada de ingresos, egresos y saldo del evento del ${formatDate(evento.fecha_evento)}.`}
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

      <EventoDetalleNav active="flujo-dinero" eventoId={evento.id} />

      <dl className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <SummaryCard
          label="Total evento"
          value={formatOptionalCurrency(flujo.totalEvento)}
          helper="Valor vendido registrado"
        />
        <SummaryCard
          label="Ingresos ordinarios"
          value={formatCurrency(flujo.totalIngresos)}
          helper={`${formatNumber(
            flujo.pagos.filter((pago) => !pago.es_garantia).length,
          )} pagos ordinarios activos`}
        />
        <SummaryCard
          label="Total egresado"
          value={formatCurrency(flujo.totalEgresos)}
          helper={`${formatNumber(flujo.egresos.length)} egresos activos`}
        />
        <SummaryCard
          label="Saldo neto"
          value={formatCurrency(flujo.saldoNeto)}
          helper="Ingresos menos egresos"
          valueClassName={flujo.saldoNeto < 0 ? "text-red-700" : "text-emerald-700"}
        />
      </dl>

      <div className="grid gap-4 lg:grid-cols-3">
        <SummaryCard
          label="Pendiente de cobro"
          value={formatOptionalCurrency(flujo.saldoPendienteCobro)}
          helper="Calculado contra el valor vendido"
        />
        <SummaryCard
          label="Margen simple"
          value={
            flujo.margenSimple === null
              ? "-"
              : `${formatNumber(flujo.margenSimple)}%`
          }
          helper="Saldo neto sobre total evento"
        />
        <SummaryCard
          label="Comision organizador"
          value={formatCurrency(flujo.comisionOrganizador)}
          helper={
            flujo.egresosComisiones > 0
              ? `Egresos por comision: ${formatCurrency(flujo.egresosComisiones)}`
              : "Dato comercial del evento"
          }
        />
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <AgrupacionCard
          title="Ingresos por forma de pago"
          description="Suma en pesos de pagos ordinarios activos, sin garantias."
          emptyDescription="No hay pagos ordinarios activos para agrupar."
          rows={flujo.ingresosPorFormaPago.map((row) => ({
            ...row,
            label: getFormaPagoLabel(row.label),
          }))}
        />
        <MonedaCard rows={flujo.ingresosPorMoneda} />
        <AgrupacionCard
          title="Egresos por categoria"
          description="Suma en pesos de egresos activos."
          emptyDescription="No hay egresos activos para agrupar."
          rows={flujo.egresosPorCategoria}
        />
        <AgrupacionCard
          title="Egresos por proveedor"
          description="Incluye egresos sin proveedor identificado."
          emptyDescription="No hay proveedores para agrupar."
          rows={flujo.egresosPorProveedor}
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Movimientos de pagos</CardTitle>
          <CardDescription>
            Pagos y garantias activos vinculados al evento, servicios o catering.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {flujo.pagos.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Fecha</TableHead>
                  <TableHead>Concepto</TableHead>
                  <TableHead>Forma</TableHead>
                  <TableHead>Moneda</TableHead>
                  <TableHead>Relacion</TableHead>
                  <TableHead className="text-right">Monto pesos</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {flujo.pagos.map((pago) => (
                  <TableRow key={pago.id}>
                    <TableCell>{formatDate(pago.fecha_pago)}</TableCell>
                    <TableCell className="font-medium text-slate-950">
                      <div className="flex flex-wrap items-center gap-2">
                        <span>{pago.concepto ?? "-"}</span>
                        {pago.es_garantia ? (
                          <Badge variant="warning">Garantia</Badge>
                        ) : null}
                      </div>
                    </TableCell>
                    <TableCell>{getFormaPagoLabel(pago.forma_pago)}</TableCell>
                    <TableCell>
                      <Badge>{pago.moneda}</Badge>
                    </TableCell>
                    <TableCell>
                      <RelationBadge
                        cateringContratoId={pago.catering_contrato_id}
                        eventoServicioId={pago.evento_servicio_id}
                      />
                    </TableCell>
                    <TableCell className="text-right font-medium text-slate-950">
                      <PagoImporte pago={pago} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <EmptyState
              title="No hay ingresos registrados"
              description="Cuando se registren pagos activos, apareceran en este resumen."
            />
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Egresos</CardTitle>
          <CardDescription>
            Gastos activos del evento, con proveedor y relacion financiera.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {flujo.egresos.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Fecha</TableHead>
                  <TableHead>Categoria</TableHead>
                  <TableHead>Concepto</TableHead>
                  <TableHead>Proveedor</TableHead>
                  <TableHead>Relacion</TableHead>
                  <TableHead className="text-right">Monto pesos</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {flujo.egresos.map((egreso) => (
                  <TableRow key={egreso.id}>
                    <TableCell>{formatDate(egreso.fecha_egreso)}</TableCell>
                    <TableCell className="font-medium text-slate-950">
                      {egreso.categoria}
                    </TableCell>
                    <TableCell>{egreso.concepto}</TableCell>
                    <TableCell>{egreso.proveedor ?? "-"}</TableCell>
                    <TableCell>
                      <RelationBadge
                        cateringContratoId={egreso.catering_contrato_id}
                        eventoServicioId={egreso.evento_servicio_id}
                      />
                    </TableCell>
                    <TableCell className="text-right font-medium text-slate-950">
                      {formatCurrency(getMontoPesos(egreso))}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <EmptyState
              title="No hay egresos registrados"
              description="Cuando se registren egresos activos, apareceran en este resumen."
            />
          )}
        </CardContent>
      </Card>

      {flujo.serviciosResumen.length > 0 || flujo.cateringResumen.length > 0 ? (
        <div className="grid gap-6 xl:grid-cols-2">
          {flujo.serviciosResumen.length > 0 ? (
            <Card>
              <CardHeader>
                <CardTitle>Servicios</CardTitle>
                <CardDescription>
                  Totales, pagos y egresos relacionados por servicio.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Servicio</TableHead>
                      <TableHead>Proveedor</TableHead>
                      <TableHead className="text-right">Total</TableHead>
                      <TableHead className="text-right">Pagado</TableHead>
                      <TableHead className="text-right">Saldo</TableHead>
                      <TableHead className="text-right">Egresos</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {flujo.serviciosResumen.map((servicio) => (
                      <TableRow key={servicio.id}>
                        <TableCell className="font-medium text-slate-950">
                          {servicio.nombre}
                        </TableCell>
                        <TableCell>{servicio.proveedor ?? "-"}</TableCell>
                        <TableCell className="text-right">
                          {formatCurrency(servicio.total)}
                        </TableCell>
                        <TableCell className="text-right">
                          {formatCurrency(servicio.pagado)}
                        </TableCell>
                        <TableCell className="text-right">
                          {formatCurrency(servicio.saldoPendiente)}
                        </TableCell>
                        <TableCell className="text-right">
                          {formatCurrency(servicio.egresado)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          ) : null}

          {flujo.cateringResumen.length > 0 ? (
            <Card>
              <CardHeader>
                <CardTitle>Catering</CardTitle>
                <CardDescription>
                  Contratos de catering activos y comisiones asociadas.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Contrato</TableHead>
                      <TableHead className="text-right">Total</TableHead>
                      <TableHead className="text-right">Pagado</TableHead>
                      <TableHead className="text-right">Saldo</TableHead>
                      <TableHead className="text-right">Egresos</TableHead>
                      <TableHead className="text-right">Comision</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {flujo.cateringResumen.map((contrato) => (
                      <TableRow key={contrato.id}>
                        <TableCell className="font-medium text-slate-950">
                          {contrato.nombre}
                        </TableCell>
                        <TableCell className="text-right">
                          {formatCurrency(contrato.total)}
                        </TableCell>
                        <TableCell className="text-right">
                          {formatCurrency(contrato.pagado)}
                        </TableCell>
                        <TableCell className="text-right">
                          {formatCurrency(contrato.saldoPendiente)}
                        </TableCell>
                        <TableCell className="text-right">
                          {formatCurrency(contrato.egresado)}
                        </TableCell>
                        <TableCell className="text-right">
                          {formatCurrency(contrato.comisionOrganizador)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

function SummaryCard({
  helper,
  label,
  value,
  valueClassName = "text-slate-950",
}: {
  helper: string;
  label: string;
  value: string;
  valueClassName?: string;
}) {
  return (
    <Card>
      <CardContent className="p-5">
        <dt className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
          {label}
        </dt>
        <dd className={`mt-2 text-2xl font-semibold ${valueClassName}`}>
          {value}
        </dd>
        <p className="mt-1 text-sm text-slate-500">{helper}</p>
      </CardContent>
    </Card>
  );
}

function AgrupacionCard({
  description,
  emptyDescription,
  rows,
  title,
}: {
  description: string;
  emptyDescription: string;
  rows: FlujoAgrupacion[];
  title: string;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>
        {rows.length > 0 ? (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Grupo</TableHead>
                <TableHead className="text-right">Cantidad</TableHead>
                <TableHead className="text-right">Total</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => (
                <TableRow key={row.key}>
                  <TableCell className="font-medium text-slate-950">
                    {row.label}
                  </TableCell>
                  <TableCell className="text-right">
                    {formatNumber(row.cantidad)}
                  </TableCell>
                  <TableCell className="text-right font-medium text-slate-950">
                    {formatCurrency(row.total)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        ) : (
          <EmptyState title="Sin datos" description={emptyDescription} />
        )}
      </CardContent>
    </Card>
  );
}

function MonedaCard({ rows }: { rows: FlujoMonedaAgrupacion[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Ingresos por moneda</CardTitle>
        <CardDescription>
          Total original y equivalente en pesos cuando esta disponible.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {rows.length > 0 ? (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Moneda</TableHead>
                <TableHead className="text-right">Cantidad</TableHead>
                <TableHead className="text-right">Original</TableHead>
                <TableHead className="text-right">Pesos</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => (
                <TableRow key={row.key}>
                  <TableCell>
                    <Badge>{row.moneda}</Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    {formatNumber(row.cantidad)}
                  </TableCell>
                  <TableCell className="text-right">
                    {formatCurrencyByMoneda(row.totalOriginal, row.moneda)}
                  </TableCell>
                  <TableCell className="text-right font-medium text-slate-950">
                    {formatCurrency(row.total)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        ) : (
          <EmptyState
            title="Sin ingresos"
            description="No hay pagos activos para agrupar por moneda."
          />
        )}
      </CardContent>
    </Card>
  );
}

function RelationBadge({
  cateringContratoId,
  eventoServicioId,
}: {
  cateringContratoId: string | null;
  eventoServicioId: string | null;
}) {
  if (eventoServicioId) {
    return <Badge variant="primary">Servicio</Badge>;
  }

  if (cateringContratoId) {
    return <Badge variant="warning">Catering</Badge>;
  }

  return <Badge variant="neutral">Evento</Badge>;
}

function formatDate(value: string) {
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

function formatOptionalCurrency(value: number | null) {
  return value === null ? "-" : formatCurrency(value);
}

function formatCurrencyByMoneda(value: number, moneda: string) {
  return new Intl.NumberFormat("es-AR", {
    currency: moneda,
    maximumFractionDigits: 2,
    style: "currency",
  }).format(value);
}

function formatNumber(value: number) {
  return new Intl.NumberFormat("es-AR", {
    maximumFractionDigits: 2,
  }).format(value);
}

function getFormaPagoLabel(value: string) {
  const labels: Record<string, string> = {
    cheque: "Cheque",
    efectivo_dolares: "Efectivo dolares",
    efectivo_euros: "Efectivo euros",
    efectivo_pesos: "Efectivo pesos",
    retenciones: "Retenciones",
    transferencia: "Transferencia",
  };

  return labels[value] ?? value;
}

function getMontoPesos(row: {
  importe_en_pesos: number | null;
  importe_moneda_original: number;
  moneda: string;
}) {
  if (typeof row.importe_en_pesos === "number" && Number.isFinite(row.importe_en_pesos)) {
    return row.importe_en_pesos;
  }

  if (row.moneda === "ARS") {
    return row.importe_moneda_original;
  }

  return 0;
}
