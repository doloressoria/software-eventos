import Link from "next/link";
import { KiriaFilters } from "@/components/reportes/kiria-filters";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { DatePickerField } from "@/components/ui/date-picker-field";
import { EmptyState } from "@/components/ui/empty-state";
import { Label } from "@/components/ui/form";
import { PageHeader } from "@/components/ui/page-header";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  getReportesGenerales,
  type ReportesAnticipacionAtipicoRow,
  type ReportesAnticipacionDistribucionRow,
  type ReportesAnticipacionMesRow,
  type ReportesAnticipacionSalonRow,
  type ReportesAnticipacionTipoRow,
  type ReportesFinancierosCategoriaRow,
  type ReportesFinancierosEventoRow,
  type ReportesFinancierosMesRow,
  type ReportesFinancierosVendedorRow,
  type ReportesGeneralesRow,
  type ReportesGeneralesSearchParams,
} from "@/lib/reportes/queries";

type ReportesPageProps = {
  searchParams?: Promise<ReportesGeneralesSearchParams>;
};

type ReportesTab = "anticipacion" | "financieros" | "resumen";

const REPORTES_TABS: {
  description: string;
  id: ReportesTab;
  label: string;
}[] = [
  {
    description: "Metricas operativas",
    id: "resumen",
    label: "Resumen",
  },
  {
    description: "Reserva vs evento",
    id: "anticipacion",
    label: "Anticipacion",
  },
  {
    description: "Ingresos y egresos",
    id: "financieros",
    label: "Financieros",
  },
];

export default async function ReportesPage({
  searchParams,
}: ReportesPageProps) {
  const params = searchParams ? await searchParams : {};
  const reportes = await getReportesGenerales(params);
  const anticipacion = reportes.anticipacion;
  const activeTab = getActiveTab(params);
  const isAdmin = reportes.profile.rol === "admin";
  const financieros = reportes.financieros;

  return (
    <section className="space-y-6">
      <PageHeader
        eyebrow="Reportes"
        title="Reportes generales"
        description="Metricas operativas y financieras registradas para el periodo seleccionado."
      />

      <Card>
        <CardHeader>
          <CardTitle>Filtros</CardTitle>
          <CardDescription>
            Eventos por fecha del evento; ingresos y egresos por fecha del
            movimiento.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 xl:flex xl:flex-wrap xl:items-end xl:gap-3">
            <input type="hidden" name="tab" value={activeTab} />
            <div className="xl:min-w-0 xl:flex-[1_1_130px]">
              <Label htmlFor="desde">Desde</Label>
              <DatePickerField
                id="desde"
                name="desde"
                defaultValue={reportes.filters.fechaDesde}
                placeholder="Desde"
              />
            </div>
            <div className="xl:min-w-0 xl:flex-[1_1_130px]">
              <Label htmlFor="hasta">Hasta</Label>
              <DatePickerField
                id="hasta"
                name="hasta"
                defaultValue={reportes.filters.fechaHasta}
                placeholder="Hasta"
              />
            </div>
            <KiriaFilters
              salones={reportes.options.salones}
              lugares={reportes.options.lugares}
              salonInicial={reportes.filters.salonId}
              lugarInicial={reportes.filters.lugar}
            />
            {isAdmin ? (
              <div className="xl:min-w-0 xl:flex-[1_1_130px]">
                <Label htmlFor="vendedor">Vendedor</Label>
                <Select
                  name="vendedor"
                  defaultValue={reportes.filters.vendedorId ?? "all"}
                >
                  <SelectTrigger id="vendedor">
                    <SelectValue placeholder="Todos" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos</SelectItem>
                    {reportes.options.vendedores.map((vendedor) => (
                      <SelectItem key={vendedor.id} value={vendedor.id}>
                        {vendedor.full_name || vendedor.email}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ) : null}
            <div className="xl:min-w-0 xl:flex-[1_1_130px]">
              <Label htmlFor="estado">Estado</Label>
              <Select
                name="estado"
                defaultValue={reportes.filters.estado ?? "all"}
              >
                <SelectTrigger id="estado">
                  <SelectValue placeholder="Todos" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  {reportes.options.estados.map((estado) => (
                    <SelectItem key={estado} value={estado}>
                      {getEstadoLabel(estado)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="xl:min-w-0 xl:flex-[1_1_130px]">
              <Label htmlFor="evento">Evento</Label>
              <Select
                name="evento"
                defaultValue={reportes.filters.eventoId ?? "all"}
              >
                <SelectTrigger id="evento">
                  <SelectValue placeholder="Todos" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  {reportes.options.eventos.map((evento) => (
                    <SelectItem key={evento.id} value={evento.id}>
                      {getEventoOptionLabel(evento)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="col-span-full ml-auto flex gap-2 xl:shrink-0">
              <button
                type="submit"
                className={buttonVariants({ variant: "primary" })}
              >
                Aplicar
              </button>
              <Link
                href="/reportes"
                className={buttonVariants({ variant: "secondary" })}
              >
                Limpiar
              </Link>
            </div>
          </form>
        </CardContent>
      </Card>

      <ReportesTabs activeTab={activeTab} params={params} />

      {activeTab === "resumen" ? (
        <dl className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        <SummaryCard
          label="Eventos y caterings"
          value={formatNumber(reportes.metrics.eventosTotal)}
          helper="Cantidad total del periodo"
        />
        <SummaryCard
          label="Cobrado real"
          value={formatCurrency(reportes.metrics.totalIngresos)}
          helper="Pagos activos, sin garantias"
        />
        <SummaryCard
          label="Egresos registrados"
          value={formatCurrency(reportes.metrics.totalEgresos)}
          helper="Egresos activos en pesos"
        />
        <SummaryCard
          label="Resultado neto"
          value={formatCurrency(reportes.metrics.balanceSimple)}
          helper="Ingresos menos egresos"
          valueClassName={
            reportes.metrics.balanceSimple < 0 ? "text-red-700" : "text-emerald-700"
          }
        />
        <SummaryCard
          label="Estimado vendido"
          value={formatCurrency(reportes.metrics.totalEstimadoVendido)}
          helper="Catering y servicios del periodo"
        />
        <SummaryCard
          label="Saldo pendiente"
          value={formatCurrency(reportes.metrics.saldoPendiente)}
          helper="Saldos estimados de eventos"
          valueClassName={
            reportes.metrics.saldoPendiente > 0 ? "text-amber-700" : undefined
          }
        />
        <SummaryCard
          label="Garantias registradas"
          value={formatCurrency(reportes.metrics.garantiasRegistradas)}
          helper="Pagos marcados como garantia"
        />
        </dl>
      ) : null}

      {activeTab === "anticipacion" ? (
        <section className="space-y-6">
        <div>
          <p className="text-sm font-medium uppercase tracking-[0.16em] text-teal-700">
            Anticipacion
          </p>
          <h2 className="mt-2 text-2xl font-semibold tracking-tight text-slate-950">
            Reserva vs fecha del evento
          </h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-500">
            Dias entre la fecha de contrato y la fecha del evento. Los eventos
            sin contrato o con fechas inconsistentes se controlan aparte y no
            entran en el promedio principal.
          </p>
        </div>

        <dl className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <SummaryCard
            label="Anticipacion promedio"
            value={formatNullableDays(
              anticipacion.metricas.anticipacion_promedio,
            )}
            helper="Solo eventos con fechas validas"
          />
          <SummaryCard
            label="Anticipacion minima"
            value={formatNullableDays(anticipacion.metricas.anticipacion_minima)}
            helper="Menor cantidad de dias valida"
          />
          <SummaryCard
            label="Anticipacion maxima"
            value={formatNullableDays(anticipacion.metricas.anticipacion_maxima)}
            helper="Mayor cantidad de dias valida"
          />
          <SummaryCard
            label="Mediana"
            value={formatNullableDays(anticipacion.metricas.anticipacion_mediana)}
            helper="Punto medio de anticipacion"
          />
          <SummaryCard
            label="Eventos analizados"
            value={formatNumber(anticipacion.metricas.eventos_analizados)}
            helper="Incluidos en metricas principales"
          />
          <SummaryCard
            label="Sin fecha de contrato"
            value={formatNumber(
              anticipacion.metricas.eventos_sin_fecha_contrato,
            )}
            helper="Excluidos del promedio"
            valueClassName={
              anticipacion.metricas.eventos_sin_fecha_contrato > 0
                ? "text-amber-700"
                : undefined
            }
          />
          <SummaryCard
            label="Fechas inconsistentes"
            value={formatNumber(
              anticipacion.metricas.eventos_fecha_inconsistente,
            )}
            helper="Contrato posterior o fecha invalida"
            valueClassName={
              anticipacion.metricas.eventos_fecha_inconsistente > 0
                ? "text-red-700"
                : undefined
            }
          />
        </dl>

        <div className="grid gap-6 xl:grid-cols-2">
          <AnticipacionDistribucionTable rows={anticipacion.distribucion} />
          <AnticipacionMensualTable rows={anticipacion.evolucionMensual} />
          <AnticipacionSalonTable rows={anticipacion.porSalon} />
          <AnticipacionTipoTable rows={anticipacion.porTipoEvento} />
        </div>

        <AnticipacionAtipicosTable rows={anticipacion.atipicos} />
        </section>
      ) : null}

      {activeTab === "financieros" ? (
        <section className="space-y-6">
        <div>
          <p className="text-sm font-medium uppercase tracking-[0.16em] text-teal-700">
            Reportes financieros
          </p>
          <h2 className="mt-2 text-2xl font-semibold tracking-tight text-slate-950">
            Ingresos vs egresos
          </h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-500">
            Eventos por fecha del evento y movimientos asociados por fecha de
            pago o egreso. Las garantias se muestran aparte y no se cuentan
            como ingreso real.
          </p>
        </div>

        <dl className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <SummaryCard
            label="Total cobrado"
            value={formatCurrency(financieros.metricas.ingresos_cobrados)}
            helper="Pagos activos sin garantias"
          />
          <SummaryCard
            label="Total egresado"
            value={formatCurrency(financieros.metricas.egresos_pagados)}
            helper="Egresos activos del periodo"
          />
          <SummaryCard
            label="Resultado neto"
            value={formatCurrency(financieros.metricas.resultado_neto)}
            helper="Cobrado menos egresado"
            valueClassName={getMoneyClass(financieros.metricas.resultado_neto)}
          />
          <SummaryCard
            label="Margen"
            value={formatPercent(financieros.metricas.margen_porcentaje)}
            helper="Resultado sobre cobrado"
            valueClassName={getMoneyClass(financieros.metricas.resultado_neto)}
          />
          <SummaryCard
            label="Total vendido"
            value={formatCurrency(financieros.metricas.total_vendido)}
            helper="Servicios y catering incluidos"
          />
          <SummaryCard
            label="Pendiente de cobro"
            value={formatCurrency(financieros.metricas.pendiente_cobro)}
            helper="Saldo estimado del resumen"
            valueClassName={
              financieros.metricas.pendiente_cobro > 0
                ? "text-amber-700"
                : undefined
            }
          />
          <SummaryCard
            label="Garantias"
            value={formatCurrency(financieros.metricas.garantias_registradas)}
            helper="Registradas aparte del ingreso"
          />
          <SummaryCard
            label="Eventos y caterings incluidos"
            value={formatNumber(financieros.metricas.eventos_incluidos)}
            helper="Segun fecha del evento"
          />
          <SummaryCard
            label="Ingreso promedio"
            value={formatCurrency(
              financieros.metricas.promedio_ingresos_por_evento,
            )}
            helper="Cobrado por evento incluido"
          />
          <SummaryCard
            label="Egreso promedio"
            value={formatCurrency(
              financieros.metricas.promedio_egresos_por_evento,
            )}
            helper="Egresado por evento incluido"
          />
          <SummaryCard
            label="Neto promedio"
            value={formatCurrency(
              financieros.metricas.promedio_resultado_neto_por_evento,
            )}
            helper="Resultado por evento incluido"
            valueClassName={getMoneyClass(
              financieros.metricas.promedio_resultado_neto_por_evento,
            )}
          />
        </dl>

        <FinancialMonthlyChart rows={financieros.evolucionMensual} />

        <div className="grid gap-6 xl:grid-cols-2">
          <FinancialSalonTable rows={financieros.porSalon} />
          <FinancialMonthlyTable rows={financieros.evolucionMensual} />
          <FinancialCategoryTable rows={financieros.egresosPorCategoria} />
          {isAdmin ? (
            <FinancialVendedorTable rows={financieros.porVendedor} />
          ) : null}
        </div>

        <FinancialEventTable rows={financieros.porEvento} />
        </section>
      ) : null}

      {activeTab === "resumen" ? (
        <div className="grid gap-6 xl:grid-cols-2">
        <GroupTable
          title="Eventos y caterings por salon"
          description="Eventos de salon y caterings externos de Kiria."
          emptyTitle="No hay eventos por salon"
          rows={reportes.porSalon}
        />
        <GroupTable
          title="Eventos por estado"
          description="Distribucion de eventos activos por estado comercial."
          emptyTitle="No hay eventos por estado"
          rows={reportes.porEstado}
          renderLabel={(row) => (
            <Badge variant={getEstadoVariant(row.id)}>{row.label}</Badge>
          )}
        />
        {isAdmin ? (
          <GroupTable
            title="Eventos por vendedor"
            description="Cantidad de eventos activos agrupados por responsable."
            emptyTitle="No hay eventos por vendedor"
            rows={reportes.porVendedor}
          />
        ) : null}
        <Card>
          <CardHeader>
            <CardTitle>Proximos eventos y caterings con saldo pendiente</CardTitle>
            <CardDescription>
              Eventos futuros del periodo con saldo estimado mayor a cero.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {reportes.pendientes.length > 0 ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Fecha</TableHead>
                    <TableHead>Evento</TableHead>
                    <TableHead>Salon</TableHead>
                    {isAdmin ? <TableHead>Responsable</TableHead> : null}
                    <TableHead className="text-right">Saldo</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {reportes.pendientes.map((evento) => (
                    <TableRow key={evento.id}>
                      <TableCell className="whitespace-nowrap text-slate-600">
                        {formatDate(evento.fechaEvento)}
                      </TableCell>
                      <TableCell>
                        <Link
                          href={evento.href}
                          className="font-medium text-slate-950 transition hover:text-teal-700"
                        >
                          {evento.cliente}
                        </Link>
                        <p className="mt-1 text-sm text-slate-500">
                          Total: {formatCurrency(evento.totalEstimado)}
                        </p>
                      </TableCell>
                      <TableCell className="text-slate-600">
                        {evento.salon}
                      </TableCell>
                      {isAdmin ? (
                        <TableCell className="text-slate-600">
                          {evento.vendedor}
                        </TableCell>
                      ) : null}
                      <TableCell className="text-right font-medium text-amber-700">
                        {formatCurrency(evento.saldoPendiente)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ) : (
              <EmptyState
                title="No hay saldos pendientes proximos"
                description="No se encontraron eventos futuros con saldo pendiente para los filtros actuales."
              />
            )}
          </CardContent>
        </Card>
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
    <Card className="transition hover:border-teal-100 hover:shadow-md hover:shadow-teal-950/5">
      <CardContent>
        <dt className="text-sm font-medium text-slate-500">{label}</dt>
        <dd className={`mt-3 text-3xl font-semibold tracking-tight ${valueClassName}`}>
          {value}
        </dd>
        <p className="mt-2 text-sm leading-6 text-slate-500">{helper}</p>
      </CardContent>
    </Card>
  );
}

function ReportesTabs({
  activeTab,
  params,
}: {
  activeTab: ReportesTab;
  params: ReportesGeneralesSearchParams;
}) {
  return (
    <nav
      aria-label="Secciones de reportes"
      className="grid gap-2 rounded-lg border border-slate-200 bg-white p-1 shadow-sm shadow-slate-950/5 md:grid-cols-3"
    >
      {REPORTES_TABS.map((tab) => {
        const isActive = activeTab === tab.id;

        return (
          <Link
            key={tab.id}
            href={getReportesTabHref(params, tab.id)}
            className={`rounded-md px-4 py-3 text-sm transition ${
              isActive
                ? "bg-teal-700 text-white shadow-sm shadow-teal-950/10"
                : "text-slate-600 hover:bg-slate-50 hover:text-slate-950"
            }`}
            aria-current={isActive ? "page" : undefined}
          >
            <span className="block font-medium">{tab.label}</span>
            <span
              className={`mt-1 block text-xs ${
                isActive ? "text-teal-50" : "text-slate-500"
              }`}
            >
              {tab.description}
            </span>
          </Link>
        );
      })}
    </nav>
  );
}

function AnticipacionDistribucionTable({
  rows,
}: {
  rows: ReportesAnticipacionDistribucionRow[];
}) {
  const hasData = rows.some((row) => row.cantidad > 0);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Distribucion por rangos</CardTitle>
        <CardDescription>
          Eventos validos agrupados por dias de anticipacion.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {hasData ? (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Rango</TableHead>
                <TableHead className="text-right">Eventos</TableHead>
                <TableHead className="text-right">Participacion</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => (
                <TableRow key={row.id}>
                  <TableCell className="font-medium text-slate-950">
                    {row.label}
                  </TableCell>
                  <TableCell className="text-right">
                    {formatNumber(row.cantidad)}
                  </TableCell>
                  <TableCell className="min-w-40 text-right">
                    <div className="flex items-center justify-end gap-3">
                      <div className="h-2 w-24 overflow-hidden rounded-full bg-slate-100">
                        <div
                          className="h-full rounded-full bg-teal-600"
                          style={{ width: `${Math.min(row.porcentaje, 100)}%` }}
                        />
                      </div>
                      <span className="w-14 text-slate-600">
                        {formatPercent(row.porcentaje)}
                      </span>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        ) : (
          <EmptyState
            title="No hay anticipacion por rangos"
            description="No se encontraron eventos con fecha de contrato valida para los filtros actuales."
          />
        )}
      </CardContent>
    </Card>
  );
}

function AnticipacionMensualTable({
  rows,
}: {
  rows: ReportesAnticipacionMesRow[];
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Evolucion mensual</CardTitle>
        <CardDescription>
          Promedio de anticipacion agrupado por mes de fecha del evento.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {rows.length > 0 ? (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Mes</TableHead>
                <TableHead className="text-right">Eventos</TableHead>
                <TableHead className="text-right">Promedio</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => (
                <TableRow key={row.key}>
                  <TableCell className="font-medium text-slate-950">
                    {row.label}
                  </TableCell>
                  <TableCell className="text-right">
                    {formatNumber(row.eventos_analizados)}
                  </TableCell>
                  <TableCell className="text-right">
                    {formatNullableDays(row.anticipacion_promedio)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        ) : (
          <EmptyState
            title="No hay evolucion mensual"
            description="No se encontraron eventos validos para los filtros actuales."
          />
        )}
      </CardContent>
    </Card>
  );
}

function AnticipacionSalonTable({
  rows,
}: {
  rows: ReportesAnticipacionSalonRow[];
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Anticipacion por salon</CardTitle>
        <CardDescription>
          Eventos del periodo por salon, con fechas validas y atipicos.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {rows.length > 0 ? (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Salon</TableHead>
                <TableHead className="text-right">Eventos</TableHead>
                <TableHead className="text-right">Analizados</TableHead>
                <TableHead className="text-right">Promedio</TableHead>
                <TableHead className="text-right">Min</TableHead>
                <TableHead className="text-right">Max</TableHead>
                <TableHead className="text-right">Sin contrato</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => (
                <TableRow key={row.id}>
                  <TableCell className="font-medium text-slate-950">
                    {row.label}
                    {row.eventos_fecha_inconsistente > 0 ? (
                      <p className="mt-1 text-sm text-red-700">
                        {formatNumber(row.eventos_fecha_inconsistente)} con
                        fechas inconsistentes
                      </p>
                    ) : null}
                  </TableCell>
                  <TableCell className="text-right">
                    {formatNumber(row.eventos)}
                  </TableCell>
                  <TableCell className="text-right">
                    {formatNumber(row.eventos_analizados)}
                  </TableCell>
                  <TableCell className="text-right">
                    {formatNullableDays(row.anticipacion_promedio)}
                  </TableCell>
                  <TableCell className="text-right">
                    {formatNullableDays(row.anticipacion_minima)}
                  </TableCell>
                  <TableCell className="text-right">
                    {formatNullableDays(row.anticipacion_maxima)}
                  </TableCell>
                  <TableCell className="text-right text-amber-700">
                    {formatNumber(row.eventos_sin_fecha_contrato)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        ) : (
          <EmptyState
            title="No hay anticipacion por salon"
            description="No se encontraron eventos activos para los filtros actuales."
          />
        )}
      </CardContent>
    </Card>
  );
}

function AnticipacionTipoTable({
  rows,
}: {
  rows: ReportesAnticipacionTipoRow[];
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Anticipacion por tipo</CardTitle>
        <CardDescription>
          Promedio por tipo de evento para registros con fechas validas.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {rows.length > 0 ? (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Tipo</TableHead>
                <TableHead className="text-right">Eventos</TableHead>
                <TableHead className="text-right">Promedio</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => (
                <TableRow key={row.id}>
                  <TableCell className="font-medium text-slate-950">
                    {row.label}
                  </TableCell>
                  <TableCell className="text-right">
                    {formatNumber(row.eventos_analizados)}
                  </TableCell>
                  <TableCell className="text-right">
                    {formatNullableDays(row.anticipacion_promedio)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        ) : (
          <EmptyState
            title="No hay anticipacion por tipo"
            description="No se encontraron eventos validos para agrupar por tipo."
          />
        )}
      </CardContent>
    </Card>
  );
}

function AnticipacionAtipicosTable({
  rows,
}: {
  rows: ReportesAnticipacionAtipicoRow[];
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Eventos con datos atipicos</CardTitle>
        <CardDescription>
          Registros excluidos del promedio por falta de contrato o fechas
          inconsistentes.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {rows.length > 0 ? (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Evento</TableHead>
                <TableHead>Salon</TableHead>
                <TableHead>Contrato</TableHead>
                <TableHead>Fecha evento</TableHead>
                <TableHead className="text-right">Dias</TableHead>
                <TableHead>Motivo</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => (
                <TableRow key={row.id}>
                  <TableCell>
                    <Link
                      href={`/eventos/${row.id}`}
                      className="font-medium text-slate-950 transition hover:text-teal-700"
                    >
                      {row.cliente}
                    </Link>
                  </TableCell>
                  <TableCell className="text-slate-600">{row.salon}</TableCell>
                  <TableCell className="whitespace-nowrap text-slate-600">
                    {row.fecha_contrato ? formatDate(row.fecha_contrato) : "-"}
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-slate-600">
                    {formatDate(row.fecha_evento)}
                  </TableCell>
                  <TableCell className="text-right">
                    {formatNullableDays(row.dias_anticipacion)}
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant={
                        row.motivo === "fecha_inconsistente"
                          ? "danger"
                          : "warning"
                      }
                    >
                      {getAnticipacionMotivoLabel(row.motivo)}
                    </Badge>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        ) : (
          <EmptyState
            title="No hay datos atipicos"
            description="Todos los eventos encontrados tienen fechas de contrato y evento consistentes."
          />
        )}
      </CardContent>
    </Card>
  );
}

function FinancialSalonTable({
  rows,
}: {
  rows: {
    egresos_pagados: number;
    eventos: number;
    id: string;
    ingresos_cobrados: number;
    label: string;
    margen_porcentaje: number | null;
    pendiente_cobro: number;
    resultado_neto: number;
  }[];
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Resultado por salon</CardTitle>
        <CardDescription>
          Eventos filtrados por fecha del evento; pagos y egresos activos
          asociados a esos eventos.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {rows.length > 0 ? (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Salon</TableHead>
                <TableHead className="text-right">Eventos</TableHead>
                <TableHead className="text-right">Cobrado</TableHead>
                <TableHead className="text-right">Egresos</TableHead>
                <TableHead className="text-right">Neto</TableHead>
                <TableHead className="text-right">Margen</TableHead>
                <TableHead className="text-right">Pendiente</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => (
                <TableRow key={row.id}>
                  <TableCell className="font-medium text-slate-950">
                    {row.label}
                  </TableCell>
                  <TableCell className="text-right">
                    {formatNumber(row.eventos)}
                  </TableCell>
                  <TableCell className="text-right">
                    {formatCurrency(row.ingresos_cobrados)}
                  </TableCell>
                  <TableCell className="text-right">
                    {formatCurrency(row.egresos_pagados)}
                  </TableCell>
                  <TableCell
                    className={`text-right font-medium ${getMoneyClass(row.resultado_neto)}`}
                  >
                    {formatCurrency(row.resultado_neto)}
                  </TableCell>
                  <TableCell className="text-right">
                    {formatPercent(row.margen_porcentaje)}
                  </TableCell>
                  <TableCell className="text-right text-amber-700">
                    {formatCurrency(row.pendiente_cobro)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        ) : (
          <EmptyState
            title="No hay datos financieros por salon"
            description="No se encontraron eventos activos para los filtros actuales."
          />
        )}
      </CardContent>
    </Card>
  );
}

function FinancialMonthlyTable({ rows }: { rows: ReportesFinancierosMesRow[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Evolucion mensual</CardTitle>
        <CardDescription>
          Ingresos y egresos reales por fecha de pago o egreso.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {rows.length > 0 ? (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Mes</TableHead>
                <TableHead className="text-right">Cobrado</TableHead>
                <TableHead className="text-right">Egresos</TableHead>
                <TableHead className="text-right">Neto</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => (
                <TableRow key={row.key}>
                  <TableCell className="font-medium text-slate-950">
                    {row.label}
                  </TableCell>
                  <TableCell className="text-right">
                    {formatCurrency(row.ingresos_cobrados)}
                  </TableCell>
                  <TableCell className="text-right">
                    {formatCurrency(row.egresos_pagados)}
                  </TableCell>
                  <TableCell
                    className={`text-right font-medium ${getMoneyClass(row.resultado_neto)}`}
                  >
                    {formatCurrency(row.resultado_neto)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        ) : (
          <EmptyState
            title="No hay movimientos en el periodo"
            description="No se encontraron pagos o egresos activos para las fechas seleccionadas."
          />
        )}
      </CardContent>
    </Card>
  );
}

function FinancialMonthlyChart({ rows }: { rows: ReportesFinancierosMesRow[] }) {
  const maxValue = Math.max(
    ...rows.flatMap((row) => [
      Math.abs(row.ingresos_cobrados),
      Math.abs(row.egresos_pagados),
      Math.abs(row.resultado_neto),
    ]),
    0,
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle>Evolucion financiera</CardTitle>
        <CardDescription>
          Comparacion mensual de ingresos, egresos y resultado neto por fecha
          de movimiento.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {rows.length > 0 ? (
          <div className="space-y-4">
            <div className="flex flex-wrap gap-4 text-xs font-medium text-slate-500">
              <span className="flex items-center gap-2">
                <span className="size-2 rounded-full bg-emerald-600" />
                Ingresos
              </span>
              <span className="flex items-center gap-2">
                <span className="size-2 rounded-full bg-red-500" />
                Egresos
              </span>
              <span className="flex items-center gap-2">
                <span className="size-2 rounded-full bg-teal-700" />
                Neto
              </span>
            </div>
            <div className="space-y-5">
              {rows.map((row) => (
                <div key={row.key} className="grid gap-2 md:grid-cols-[8rem_1fr]">
                  <div className="text-sm font-medium text-slate-950">
                    {row.label}
                  </div>
                  <div className="space-y-2">
                    <FinancialBar
                      label="Ingresos"
                      value={row.ingresos_cobrados}
                      maxValue={maxValue}
                      className="bg-emerald-600"
                    />
                    <FinancialBar
                      label="Egresos"
                      value={row.egresos_pagados}
                      maxValue={maxValue}
                      className="bg-red-500"
                    />
                    <FinancialBar
                      label="Neto"
                      value={row.resultado_neto}
                      maxValue={maxValue}
                      className={
                        row.resultado_neto < 0 ? "bg-red-600" : "bg-teal-700"
                      }
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <EmptyState
            title="No hay evolucion financiera"
            description="No se encontraron pagos o egresos activos para graficar."
          />
        )}
      </CardContent>
    </Card>
  );
}

function FinancialBar({
  className,
  label,
  maxValue,
  value,
}: {
  className: string;
  label: string;
  maxValue: number;
  value: number;
}) {
  const width = maxValue > 0 ? `${(Math.abs(value) / maxValue) * 100}%` : "0%";

  return (
    <div className="grid grid-cols-[4.75rem_1fr_7rem] items-center gap-3 text-xs">
      <span className="text-slate-500">{label}</span>
      <div className="h-2 overflow-hidden rounded-full bg-slate-100">
        <div className={`h-full rounded-full ${className}`} style={{ width }} />
      </div>
      <span className={`text-right font-medium ${getMoneyClass(value)}`}>
        {formatCurrency(value)}
      </span>
    </div>
  );
}

function FinancialEventTable({
  rows,
}: {
  rows: ReportesFinancierosEventoRow[];
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Resultado por evento o catering</CardTitle>
        <CardDescription>
          Detalle comercial por fecha del evento, con cobros reales sin
          garantias.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {rows.length > 0 ? (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Evento</TableHead>
                <TableHead>Cliente</TableHead>
                <TableHead>Fecha</TableHead>
                <TableHead>Salon</TableHead>
                <TableHead>Responsable</TableHead>
                <TableHead className="text-right">Vendido</TableHead>
                <TableHead className="text-right">Cobrado</TableHead>
                <TableHead className="text-right">Egresos</TableHead>
                <TableHead className="text-right">Neto</TableHead>
                <TableHead className="text-right">Margen</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead className="text-right">Pendiente</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => (
                <TableRow key={row.id}>
                  <TableCell>
                    <Link
                      href={row.href}
                      className="font-medium text-slate-950 transition hover:text-teal-700"
                    >
                      {row.evento}
                    </Link>
                  </TableCell>
                  <TableCell className="text-slate-600">{row.cliente}</TableCell>
                  <TableCell className="whitespace-nowrap text-slate-600">
                    {formatDate(row.fecha_evento)}
                  </TableCell>
                  <TableCell className="text-slate-600">{row.salon}</TableCell>
                  <TableCell className="text-slate-600">{row.vendedor}</TableCell>
                  <TableCell className="text-right">
                    {formatCurrency(row.total_vendido)}
                  </TableCell>
                  <TableCell className="text-right">
                    {formatCurrency(row.ingresos_cobrados)}
                  </TableCell>
                  <TableCell className="text-right">
                    {formatCurrency(row.egresos_pagados)}
                  </TableCell>
                  <TableCell
                    className={`text-right font-medium ${getMoneyClass(row.resultado_neto)}`}
                  >
                    {formatCurrency(row.resultado_neto)}
                  </TableCell>
                  <TableCell className="text-right">
                    {formatPercent(row.margen_porcentaje)}
                  </TableCell>
                  <TableCell>
                    <Badge variant={getRentabilidadVariant(row.rentabilidad_estado)}>
                      {getRentabilidadLabel(row.rentabilidad_estado)}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right text-amber-700">
                    {formatCurrency(row.pendiente_cobro)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        ) : (
          <EmptyState
            title="No hay eventos financieros"
            description="No se encontraron eventos activos para los filtros actuales."
          />
        )}
      </CardContent>
    </Card>
  );
}

function FinancialCategoryTable({
  rows,
}: {
  rows: ReportesFinancierosCategoriaRow[];
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Egresos por categoria</CardTitle>
        <CardDescription>
          Distribucion de gastos activos por categoria del egreso.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {rows.length > 0 ? (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Categoria</TableHead>
                <TableHead className="text-right">Registros</TableHead>
                <TableHead className="text-right">Total</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => (
                <TableRow key={row.id}>
                  <TableCell className="font-medium text-slate-950">
                    {row.label}
                  </TableCell>
                  <TableCell className="text-right">
                    {formatNumber(row.cantidad)}
                  </TableCell>
                  <TableCell className="text-right text-red-700">
                    {formatCurrency(row.egresos_pagados)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        ) : (
          <EmptyState
            title="No hay egresos por categoria"
            description="No se encontraron egresos activos para las fechas seleccionadas."
          />
        )}
      </CardContent>
    </Card>
  );
}

function FinancialVendedorTable({
  rows,
}: {
  rows: ReportesFinancierosVendedorRow[];
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Resultado por vendedor</CardTitle>
        <CardDescription>
          Eventos y movimientos agrupados por responsable comercial.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {rows.length > 0 ? (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Vendedor</TableHead>
                <TableHead className="text-right">Eventos</TableHead>
                <TableHead className="text-right">Cobrado</TableHead>
                <TableHead className="text-right">Egresos</TableHead>
                <TableHead className="text-right">Neto</TableHead>
                <TableHead className="text-right">Margen</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => (
                <TableRow key={row.id}>
                  <TableCell className="font-medium text-slate-950">
                    {row.label}
                  </TableCell>
                  <TableCell className="text-right">
                    {formatNumber(row.eventos)}
                  </TableCell>
                  <TableCell className="text-right">
                    {formatCurrency(row.ingresos_cobrados)}
                  </TableCell>
                  <TableCell className="text-right">
                    {formatCurrency(row.egresos_pagados)}
                  </TableCell>
                  <TableCell
                    className={`text-right font-medium ${getMoneyClass(row.resultado_neto)}`}
                  >
                    {formatCurrency(row.resultado_neto)}
                  </TableCell>
                  <TableCell className="text-right">
                    {formatPercent(row.margen_porcentaje)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        ) : (
          <EmptyState
            title="No hay resultado por vendedor"
            description="No se encontraron eventos activos para agrupar por vendedor."
          />
        )}
      </CardContent>
    </Card>
  );
}

function GroupTable({
  description,
  emptyTitle,
  renderLabel,
  rows,
  title,
}: {
  description: string;
  emptyTitle: string;
  renderLabel?: (row: ReportesGeneralesRow) => React.ReactNode;
  rows: ReportesGeneralesRow[];
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
                <TableHead className="text-right">Eventos</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => (
                <TableRow key={row.id}>
                  <TableCell className="font-medium text-slate-950">
                    {renderLabel ? renderLabel(row) : row.label}
                  </TableCell>
                  <TableCell className="text-right font-medium text-slate-950">
                    {formatNumber(row.cantidad)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        ) : (
          <EmptyState
            title={emptyTitle}
            description="No se encontraron datos para los filtros actuales."
          />
        )}
      </CardContent>
    </Card>
  );
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat("es-AR", {
    currency: "ARS",
    maximumFractionDigits: 0,
    style: "currency",
  }).format(value);
}

function getActiveTab(params: ReportesGeneralesSearchParams): ReportesTab {
  const tab = getSingleParamValue(params.tab);

  return isReportesTab(tab) ? tab : "resumen";
}

function getReportesTabHref(
  params: ReportesGeneralesSearchParams,
  tab: ReportesTab,
) {
  const query = new URLSearchParams();

  for (const [key, value] of Object.entries(params)) {
    if (key === "tab") {
      continue;
    }

    const singleValue = getSingleParamValue(value);

    if (singleValue) {
      query.set(key, singleValue);
    }
  }

  query.set("tab", tab);

  return `/reportes?${query.toString()}`;
}

function getSingleParamValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function isReportesTab(value: string | undefined): value is ReportesTab {
  return REPORTES_TABS.some((tab) => tab.id === value);
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("es-AR", {
    day: "2-digit",
    month: "2-digit",
    timeZone: "UTC",
    year: "numeric",
  }).format(new Date(`${value}T00:00:00.000Z`));
}

function formatNumber(value: number) {
  return new Intl.NumberFormat("es-AR").format(value);
}

function formatNullableDays(value: number | null) {
  if (value === null) {
    return "-";
  }

  return `${formatNumber(value)} ${value === 1 ? "dia" : "dias"}`;
}

function getEventoOptionLabel(evento: {
  cliente_nombre: string;
  fecha_evento: string;
  nombre_evento: string | null;
}) {
  return `${formatDate(evento.fecha_evento)} - ${
    evento.nombre_evento ?? evento.cliente_nombre
  }`;
}

function formatPercent(value: number | null) {
  if (value === null) {
    return "-";
  }

  return `${formatNumber(value)}%`;
}

function getMoneyClass(value: number) {
  if (value < 0) {
    return "text-red-700";
  }

  if (value > 0) {
    return "text-emerald-700";
  }

  return "text-slate-950";
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

function getRentabilidadLabel(
  estado: ReportesFinancierosEventoRow["rentabilidad_estado"],
) {
  const labels: Record<
    ReportesFinancierosEventoRow["rentabilidad_estado"],
    string
  > = {
    equilibrio: "Equilibrio",
    ganancia: "Ganancia",
    perdida: "Perdida",
  };

  return labels[estado];
}

function getRentabilidadVariant(
  estado: ReportesFinancierosEventoRow["rentabilidad_estado"],
) {
  if (estado === "ganancia") {
    return "success";
  }

  if (estado === "perdida") {
    return "danger";
  }

  return "warning";
}

function getAnticipacionMotivoLabel(
  motivo: ReportesAnticipacionAtipicoRow["motivo"],
) {
  const labels: Record<ReportesAnticipacionAtipicoRow["motivo"], string> = {
    fecha_inconsistente: "Fecha inconsistente",
    sin_fecha_contrato: "Sin fecha de contrato",
  };

  return labels[motivo];
}
