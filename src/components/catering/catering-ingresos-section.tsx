import Link from "next/link";
import { CoberturaDetalle, CoberturaResumen } from "@/components/catering/cobertura-resumen";
import { PagoFechas } from "@/components/pagos/pago-fechas";
import { PagoImporte } from "@/components/pagos/pago-importe";
import {
  createCateringPagoAction,
  deleteCateringPagoAction,
  updateCateringPagoAction,
} from "@/app/(protected)/catering/actions";
import { CateringPagoForm } from "@/components/catering/catering-pago-form";
import { DeleteCateringPagoForm } from "@/components/catering/delete-catering-pago-form";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { CateringIngresos, EstadoCobro } from "@/lib/catering/pagos-queries";
import { getEmptyPagoFormState, getPagoEditState } from "@/lib/pagos/validation";

type CateringIngresosSectionProps = {
  cateringId: string;
  ingresos: CateringIngresos;
  eventoId?: string;
  gestionaCatering: boolean;
};

export function CateringIngresosSection({
  cateringId,
  ingresos,
  eventoId,
  gestionaCatering,
}: CateringIngresosSectionProps) {
  const coberturasSinImputacion = ingresos.coberturas.filter((linea) =>
    !ingresos.pagos.some((pago) => pago.pago_id === linea.pago_id));
  return (
    <Card>
      <CardHeader className="flex flex-col gap-2 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <CardTitle>Ingresos</CardTitle>
          <CardDescription>
            Pagos y garantias registrados; solo los pagos ordinarios acreditados reducen el saldo.
          </CardDescription>
        </div>
        <Badge variant={getEstadoCobroVariant(ingresos.estadoCobro)}>
          {getEstadoCobroLabel(ingresos.estadoCobro)}
        </Badge>
      </CardHeader>
      <CardContent className="space-y-8">
        <dl className="grid gap-4 md:grid-cols-3">
          <SummaryItem label="Total a precios vigentes" value={formatCurrency(ingresos.totalCatering)} />
          <SummaryItem
            label="Ingresos ordinarios"
            value={formatCurrency(ingresos.totalCobrado)}
          />
          <SummaryItem
            label="Saldo pendiente"
            value={formatCurrency(ingresos.saldoPendiente)}
          />
        </dl>

        <CoberturaResumen tarifas={ingresos.tarifas} />
        {eventoId && ingresos.tarifas.some((tarifa) => (tarifa.excedente ?? 0) > 0) && (
          <Link className="text-sm font-medium underline" href={`/eventos/${eventoId}/ingresos`}>Ver opciones de reasignación en Ingresos del evento</Link>
        )}
        {coberturasSinImputacion.length > 0 && <div className="text-sm">
          <h3 className="font-medium">Historial sin imputación activa en este catering</h3>
          <ul className="mt-2 space-y-1">
            {coberturasSinImputacion.map((linea) => <li key={`${linea.pago_id}-${linea.categoria}`}><CoberturaDetalle cobertura={linea} /></li>)}
          </ul>
        </div>}

        <div className="rounded-lg border border-slate-100">
          {ingresos.pagos.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Fecha de registro</TableHead>
                  <TableHead>Pago / acreditación</TableHead>
                  <TableHead>Concepto</TableHead>
                  <TableHead>Forma</TableHead>
                  <TableHead className="text-right">Importe y equivalente ARS</TableHead>
                  <TableHead>Notas</TableHead>
                  <TableHead className="text-right">Accion</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {ingresos.pagos.map((pago) => {
                  const coberturas = ingresos.coberturas.filter((linea) => linea.pago_id === pago.pago_id);
                  return (
                    <TableRow key={pago.id}>
                      <PagoFechas pago={pago} />
                      <TableCell className="font-medium text-slate-950">
                        <div className="flex flex-wrap items-center gap-2">
                          <span>{pago.concepto ?? "-"}</span>
                          {pago.es_garantia ? (
                            <Badge variant="warning">Garantia</Badge>
                          ) : null}
                        </div>
                        {coberturas.map((linea) => <p key={linea.categoria} className="mt-1 text-xs"><CoberturaDetalle cobertura={linea} /></p>)}
                      </TableCell>
                      <TableCell>{getFormaPagoLabel(pago.forma_pago)}</TableCell>
                      <TableCell className="text-right font-medium text-slate-950">
                        {pago.distribuido ? (
                          <span>{formatCurrency(pago.importe_en_pesos ?? 0)} imputados</span>
                        ) : <PagoImporte pago={pago} />}
                      </TableCell>
                      <TableCell className="max-w-xs text-slate-500">
                        {pago.notas ?? "-"}
                      </TableCell>
                      <TableCell className="text-right">
                        {pago.distribuido ? (
                          <span className="text-sm">Se administra en Ingresos del evento</span>
                        ) : (
                          <>
                            {coberturas.length === 0 && <details className="mb-3 text-left">
                              <summary className="cursor-pointer text-sm">Editar pago</summary>
                              <div className="min-w-72 p-3">
                                <CateringPagoForm editing
                                  action={updateCateringPagoAction.bind(null, cateringId, pago.id)}
                                  initialState={getPagoEditState(pago)} />
                              </div>
                            </details>}
                            <DeleteCateringPagoForm action={deleteCateringPagoAction.bind(null, cateringId, pago.id)} />
                          </>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          ) : (
            <EmptyState
              title="No hay pagos registrados"
              description="Registra el primer cobro para empezar a seguir el saldo del catering."
            />
          )}
        </div>

        <div className="rounded-lg border border-slate-100 bg-slate-50/60 p-4 sm:p-5">
          <h3 className="text-sm font-semibold text-slate-950">Registrar nuevo pago</h3>
          <div className="mt-4">
            <CateringPagoForm
              action={createCateringPagoAction.bind(null, cateringId)}
              initialState={getEmptyPagoFormState()}
              coberturas={gestionaCatering ? [{ id: cateringId, label: "Catering", tarifas: ingresos.tarifas }] : undefined}
            />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function SummaryItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-slate-100 bg-slate-50/80 px-4 py-3">
      <dt className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
        {label}
      </dt>
      <dd className="mt-1 text-lg font-semibold text-slate-950">{value}</dd>
    </div>
  );
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat("es-AR", {
    currency: "ARS",
    maximumFractionDigits: 2,
    style: "currency",
  }).format(value);
}

function getEstadoCobroLabel(estado: EstadoCobro) {
  const labels: Record<EstadoCobro, string> = {
    pagado: "Pagado",
    parcial: "Parcial",
    pendiente: "Pendiente",
  };

  return labels[estado];
}

function getEstadoCobroVariant(estado: EstadoCobro) {
  if (estado === "pagado") {
    return "success";
  }

  if (estado === "parcial") {
    return "warning";
  }

  return "neutral";
}

function getFormaPagoLabel(value: string) {
  const labels: Record<string, string> = {
    cheque: "Cheque",
    efectivo_pesos: "Efectivo pesos",
    efectivo_dolares: "Efectivo dolares",
    efectivo_euros: "Efectivo euros",
    retenciones: "Retenciones",
    transferencia: "Transferencia",
  };

  return labels[value] ?? value;
}
