import { CoberturaDetalle, CoberturaResumen } from "@/components/catering/cobertura-resumen";
import { ReasignarExcedenteForm } from "@/components/catering/reasignar-excedente-form";
import { isChequePending } from "@/lib/pagos/calculos";
import { PagoFechas } from "@/components/pagos/pago-fechas";
import { PagoImporte } from "@/components/pagos/pago-importe";
import { createPagoAction, deletePagoAction, reasignarExcedenteAction, updatePagoAction } from "@/app/(protected)/pagos/actions";
import { DeletePagoForm } from "@/components/pagos/delete-pago-form";
import { PagoForm } from "@/components/pagos/pago-form";
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
import { getEmptyPagoFormState, getPagoEditState } from "@/lib/pagos/validation";
import type { EventoIngresos, EstadoCobro, PagoEvento } from "@/lib/pagos/queries";
import type { EventoServicioPagoOption } from "@/lib/evento-servicios/queries";

type IngresosEventoSectionProps = {
  eventoId: string;
  ingresos: EventoIngresos;
  servicios: EventoServicioPagoOption[];
  actorId: string;
  admin: boolean;
  gestionaEventos: boolean;
};

export function IngresosEventoSection({
  eventoId,
  ingresos,
  servicios,
  actorId,
  admin,
  gestionaEventos,
}: IngresosEventoSectionProps) {
  const destinos = [
    ...servicios.map((servicio) => ({
      value: `servicio:${servicio.id}`, label: servicio.label, saldoPendiente: servicio.saldoPendiente,
    })),
    ...ingresos.cateringDestinos,
  ];
  const labels = new Map(destinos.map((d) => [d.value, d.label]));
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
          <SummaryItem
            label={ingresos.coberturas.length ? "Total a precios vigentes" : "Total evento"}
            value={formatCurrency(ingresos.totalEvento)}
          />
          <SummaryItem
            label="Ingresos ordinarios"
            value={formatCurrency(ingresos.totalCobrado)}
          />
          <SummaryItem
            label="Saldo pendiente"
            value={formatCurrency(ingresos.saldoPendiente)}
          />
        </dl>

        {ingresos.coberturas.map(({ id, label, tarifas }) => (
          <CoberturaResumen key={id} label={label} tarifas={tarifas} />
        ))}

        <div className="rounded-lg border border-slate-100">
          {ingresos.pagos.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Fecha de registro</TableHead>
                  <TableHead>Pago / acreditación</TableHead>
                  <TableHead>Concepto</TableHead>
                  <TableHead>Imputaciones</TableHead>
                  <TableHead>Forma</TableHead>
                  <TableHead className="text-right">Importe y equivalente ARS</TableHead>
                  <TableHead>Notas</TableHead>
                  <TableHead className="text-right">Accion</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {ingresos.pagos.map((pago) => {
                  const lineas = lineasPago(pago);
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
                      </TableCell>
                      <TableCell>
                        {lineas.length === 0 ? "Sin imputación" : (
                          <ul className="space-y-1">
                            {lineas.map((linea) => (
                              <li key={linea.destino}>
                                {labels.get(linea.destino) ?? "Destino del pago"}
                                {linea.importe && ` · ${formatCurrency(Number(linea.importe))}`}
                              </li>
                            ))}
                          </ul>
                        )}
                        {pago.catering_coberturas.map((cobertura) => {
                          const tarifa = ingresos.coberturas.find((c) => c.id === cobertura.catering_contrato_id)
                            ?.tarifas.find((t) => t.categoria === cobertura.categoria);
                          const maximo = Math.min(tarifa?.excedente ?? 0, cobertura.cantidad - cobertura.liberada);
                          const elegibles = destinos.filter((d) => d.value !== `catering:${cobertura.catering_contrato_id}`);
                          return <div key={cobertura.categoria} className="mt-2 text-sm">
                            <CoberturaDetalle cobertura={cobertura} />
                            {gestionaEventos && (admin || pago.registrado_por === actorId) && maximo > 0
                              && elegibles.length > 0 && tarifa?.tarifas_historicas === 1 && !isChequePending(pago) && (
                              <ReasignarExcedenteForm key={cobertura.liberada}
                                action={reasignarExcedenteAction.bind(null, eventoId, pago.id, cobertura.catering_contrato_id, cobertura.categoria, cobertura.liberada)}
                                destinos={elegibles} maximo={maximo} precio={cobertura.precio_aplicado} />
                            )}
                          </div>;
                        })}
                      </TableCell>
                      <TableCell>{getFormaPagoLabel(pago.forma_pago)}</TableCell>
                      <TableCell className="text-right font-medium text-slate-950">
                        <PagoImporte pago={pago} />
                      </TableCell>
                      <TableCell className="max-w-xs text-slate-500">
                        {pago.notas ?? "-"}
                      </TableCell>
                      <TableCell className="text-right">
                        {pago.catering_coberturas.length === 0 && <details className="mb-3 text-left">
                          <summary className="cursor-pointer text-sm">Editar pago</summary>
                          <div className="min-w-72 p-3">
                            <PagoForm editing action={updatePagoAction.bind(null, eventoId, pago.id)}
                              initialState={{ ...getPagoEditState(pago), imputaciones: lineas }} destinos={destinos} />
                          </div>
                        </details>}
                        <DeletePagoForm
                          action={deletePagoAction.bind(
                            null,
                            eventoId,
                            pago.id,
                          )}
                        />
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          ) : (
            <EmptyState
              title="No hay pagos registrados"
              description="Registra el primer cobro para empezar a seguir el saldo del evento."
            />
          )}
        </div>

        <div className="rounded-lg border border-slate-100 bg-slate-50/60 p-4 sm:p-5">
          <h3 className="text-sm font-semibold text-slate-950">
            Registrar nuevo pago
          </h3>
          <div className="mt-4">
            {destinos.length ? (
              <PagoForm action={createPagoAction.bind(null, eventoId)}
                initialState={getEmptyPagoFormState()} destinos={destinos} coberturas={gestionaEventos ? ingresos.coberturas : undefined} />
            ) : <p className="text-sm">Agregá un servicio o vinculá un catering para registrar un cobro.</p>}
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

function lineasPago(pago: PagoEvento) {
  if (pago.pago_imputaciones.length) {
    return pago.pago_imputaciones.map((linea) => ({
      destino: linea.evento_servicio_id
        ? `servicio:${linea.evento_servicio_id}` : `catering:${linea.catering_contrato_id}`,
      importe: String(linea.importe_ars),
    }));
  }
  const destino = pago.evento_servicio_id ? `servicio:${pago.evento_servicio_id}`
    : pago.catering_contrato_id ? `catering:${pago.catering_contrato_id}` : null;
  return destino ? [{ destino, importe: pago.importe_en_pesos?.toString() ?? "" }] : [];
}
