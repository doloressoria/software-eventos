import Link from "next/link";
import {
  createEventoServicioAction,
  deleteEventoServicioAction,
  updateEventoServicioAction,
} from "@/app/(protected)/evento-servicios/actions";
import { DeleteEventoServicioForm } from "@/components/evento-servicios/delete-evento-servicio-form";
import { EventoServicioForm } from "@/components/evento-servicios/evento-servicio-form";
import { buttonVariants } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import type { EventoCateringItem } from "@/lib/catering/queries";
import type {
  EventoServicioMonthlyPriceSuggestions,
  EventoServicioItem,
  ServicioCatalogoOption,
} from "@/lib/evento-servicios/queries";
import { getCategoriaServicioLabel } from "@/lib/evento-servicios/queries";
import {
  getEmptyEventoServicioFormState,
  getEventoServicioFieldsFromValues,
  getEventoServicioFormState,
} from "@/lib/evento-servicios/validation";

type ValoresEventoSectionProps = {
  catalogo: ServicioCatalogoOption[];
  caterings?: EventoCateringItem[];
  eventoId: string;
  monthlyPriceSuggestions: EventoServicioMonthlyPriceSuggestions;
  servicios: EventoServicioItem[];
  tieneOrganizador: boolean;
  totalEvento: number;
};

export function ValoresEventoSection({
  catalogo,
  caterings = [],
  eventoId,
  monthlyPriceSuggestions,
  servicios,
  tieneOrganizador,
  totalEvento,
}: ValoresEventoSectionProps) {
  const totalCatering = caterings.reduce(
    (total, catering) => total + (catering.total_con_iva ?? 0),
    0,
  );
  const gridClassName = tieneOrganizador
    ? "xl:grid-cols-[1.3fr_0.9fr_0.7fr_repeat(7,minmax(0,0.75fr))_auto]"
    : "xl:grid-cols-[1.3fr_0.9fr_repeat(7,minmax(0,0.75fr))_auto]";

  return (
    <Card>
      <CardHeader className="flex flex-col gap-2 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <CardTitle>Valores del evento</CardTitle>
          <CardDescription>
            Servicios facturables pactados para calcular el total del evento.
          </CardDescription>
        </div>
        <div className="flex flex-wrap gap-3">
          <div className="rounded-lg border border-slate-100 bg-slate-50/80 px-4 py-3 text-right">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
              Total servicios
            </p>
            <p className="mt-1 text-lg font-semibold text-slate-950">
              {formatCurrency(totalEvento)}
            </p>
          </div>
          {caterings.length > 0 ? (
            <div className="rounded-lg border border-slate-100 bg-slate-50/80 px-4 py-3 text-right">
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
                Total general (con catering)
              </p>
              <p className="mt-1 text-lg font-semibold text-slate-950">
                {formatCurrency(totalEvento + totalCatering)}
              </p>
            </div>
          ) : null}
        </div>
      </CardHeader>
      <CardContent className="space-y-8">
        {tieneOrganizador ? (
          <div>
            <h3 className="text-sm font-semibold text-slate-950">
              Servicios que comisionan
            </h3>
            <p className="mt-1 text-sm leading-6 text-slate-600">
              Marca los servicios que participan en la comision del organizador.
            </p>
          </div>
        ) : null}

        <div className="rounded-lg border border-slate-100 bg-white">
          {servicios.length > 0 ? (
            <div className="divide-y divide-slate-100">
              <div
                className={`hidden gap-4 bg-slate-50/80 px-5 py-3 text-xs font-semibold uppercase tracking-[0.12em] text-slate-500 xl:grid ${gridClassName}`}
              >
                <div>Servicio</div>
                <div>Proveedor</div>
                {tieneOrganizador ? <div>Comisiona</div> : null}
                <div className="text-right">Base</div>
                <div className="text-right">Adic.</div>
                <div className="text-right">Base IVA</div>
                <div className="text-right">IVA %</div>
                <div className="text-right">Total</div>
                <div className="text-right">Pagado</div>
                <div className="text-right">Saldo</div>
                <div className="text-right">Accion</div>
              </div>
              {servicios.map((servicio) => (
                <details key={servicio.id} className="group">
                  <summary className="list-none px-5 py-5 marker:hidden">
                    <div
                      className={`grid gap-4 xl:items-start ${gridClassName}`}
                    >
                      <div>
                        <div className="font-medium text-slate-950">
                          {servicio.servicios_catalogo?.nombre ??
                            "Servicio sin nombre"}
                        </div>
                        <div className="mt-1 text-xs text-slate-500">
                          {servicio.servicios_catalogo?.categoria
                            ? getCategoriaServicioLabel(
                                servicio.servicios_catalogo.categoria,
                              )
                            : "-"}
                        </div>
                        {servicio.notas ? (
                          <div className="mt-2 text-sm text-slate-500">
                            {servicio.notas}
                          </div>
                        ) : null}
                      </div>
                      <ValueItem
                        label="Proveedor"
                        value={servicio.proveedor ?? "-"}
                      />
                      {tieneOrganizador ? (
                        <ValueItem
                          label="Comisiona"
                          value={servicio.comisiona_organizador ? "Si" : "No"}
                        />
                      ) : null}
                      <ValueItem
                        align="right"
                        label="Base"
                        value={formatCurrencyValue(servicio.precio_base)}
                      />
                      <ValueItem
                        align="right"
                        label="Adic."
                        value={formatCurrencyValue(servicio.adicionales_monto)}
                      />
                      {servicio.ajuste_ipc !== 0 && <ValueItem align="right" label="Ajuste IPC" value={formatCurrencyValue(servicio.ajuste_ipc)} />}
                      <ValueItem
                        align="right"
                        label="Base IVA"
                        value={formatCurrencyValue(
                          servicio.iva_base_imponible,
                        )}
                      />
                      <ValueItem
                        align="right"
                        label="IVA %"
                        value={formatPercentage(servicio.iva_porcentaje)}
                      />
                      <ValueItem
                        align="right"
                        label="Total"
                        strong
                        value={formatCurrencyValue(servicio.total_con_iva)}
                      />
                      <ValueItem
                        align="right"
                        label="Pagado"
                        value={formatCurrency(servicio.total_pagado)}
                      />
                      <ValueItem
                        align="right"
                        label="Saldo"
                        strong
                        value={formatCurrency(servicio.saldo_pendiente)}
                      />
                      <div className="flex items-center justify-end gap-3 xl:flex-col xl:items-end">
                        <span className="inline-flex min-h-9 cursor-pointer items-center justify-center rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-sm font-medium text-slate-700 shadow-sm shadow-slate-950/5 transition hover:border-teal-200 hover:bg-teal-50 hover:text-teal-800 group-open:hidden">
                          Editar
                        </span>
                        <span className="hidden min-h-9 cursor-pointer items-center justify-center rounded-lg border border-slate-200 bg-slate-50 px-3.5 py-2 text-sm font-medium text-slate-700 group-open:inline-flex">
                          Cerrar
                        </span>
                      </div>
                    </div>
                  </summary>
                  <div className="border-t border-slate-100 bg-slate-50/60 px-5 py-5">
                    <div className="mb-4">
                      <h3 className="text-sm font-semibold text-slate-950">
                        Editar servicio facturable
                      </h3>
                      <p className="mt-1 text-sm text-slate-500">
                        Modifica los valores pactados y guarda los cambios.
                      </p>
                    </div>
                    <EventoServicioForm
                      action={updateEventoServicioAction.bind(
                        null,
                        eventoId,
                        servicio.id,
                      )}
                      catalogo={catalogo}
                      formId={`evento-servicio-${servicio.id}`}
                      initialState={getEventoServicioFormState(
                        getEventoServicioFieldsFromValues(servicio),
                      )}
                      monthlyPriceSuggestions={monthlyPriceSuggestions}
                      tieneOrganizador={tieneOrganizador}
                      submitLabel="Guardar cambios"
                      submittingLabel="Guardando..."
                    />
                    <div className="mt-4 flex justify-end">
                      <DeleteEventoServicioForm
                        action={deleteEventoServicioAction.bind(
                          null,
                          eventoId,
                          servicio.id,
                        )}
                      />
                    </div>
                  </div>
                </details>
              ))}
            </div>
          ) : (
            <EmptyState
              title="No hay valores cargados"
              description="Agrega los servicios pactados para calcular el total del evento antes de registrar cobros."
            />
          )}
        </div>

        {caterings.length > 0 ? (
          <div>
            <h3 className="text-sm font-semibold text-slate-950">Catering vinculado</h3>
            <p className="mt-1 text-sm leading-6 text-slate-600">
              Cargado desde la seccion de Catering; el detalle completo esta ahi.
            </p>
            <div className="mt-4 rounded-lg border border-slate-100 bg-white">
              <div className="divide-y divide-slate-100">
                {caterings.map((catering) => (
                  <div
                    key={catering.id}
                    className="grid gap-4 px-5 py-4 sm:grid-cols-[1fr_repeat(3,minmax(0,0.6fr))_auto] sm:items-center"
                  >
                    <div>
                      <p className="font-medium text-slate-950">
                        {catering.tipo_servicio ?? "Catering"}
                      </p>
                      <p className="mt-1 text-xs text-slate-500">
                        PAX{" "}
                        {(catering.pax_adultos ?? 0) +
                          (catering.pax_jovenes ?? 0) +
                          (catering.pax_menores ?? 0) +
                          (catering.pax_bebes ?? 0)}
                      </p>
                    </div>
                    <ValueItem
                      align="right"
                      label="Total"
                      strong
                      value={formatCurrencyValue(catering.total_con_iva)}
                    />
                    <ValueItem
                      align="right"
                      label="Pagado"
                      value={formatCurrencyValue(catering.total_pagado)}
                    />
                    <ValueItem
                      align="right"
                      label="Saldo"
                      strong
                      value={formatCurrencyValue(catering.saldo_pendiente)}
                    />
                    <div className="flex justify-end">
                      <Link
                        href={`/catering/${catering.id}`}
                        className={buttonVariants({ variant: "secondary", size: "xs" })}
                      >
                        Ver detalle
                      </Link>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        ) : null}

        <div className="rounded-lg border border-slate-100 bg-slate-50/60 p-4 sm:p-5">
          <h3 className="text-sm font-semibold text-slate-950">
            Agregar servicio facturable
          </h3>
          <div className="mt-4">
            <EventoServicioForm
              action={createEventoServicioAction.bind(null, eventoId)}
              catalogo={catalogo}
              eventoId={eventoId}
              formId="evento-servicio-nuevo"
              initialState={getEmptyEventoServicioFormState()}
              monthlyPriceSuggestions={monthlyPriceSuggestions}
              resetOnSuccess
              tieneOrganizador={tieneOrganizador}
              submitLabel="Agregar servicio"
              submittingLabel="Agregando..."
              variant="create"
            />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function ValueItem({
  align = "left",
  label,
  strong = false,
  value,
}: {
  align?: "left" | "right";
  label: string;
  strong?: boolean;
  value: string;
}) {
  return (
    <div className={align === "right" ? "xl:text-right" : undefined}>
      <div className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500 xl:hidden">
        {label}
      </div>
      <div
        className={
          strong
            ? "mt-1 text-sm font-semibold text-slate-950 xl:mt-0"
            : "mt-1 text-sm text-slate-700 xl:mt-0"
        }
      >
        {value}
      </div>
    </div>
  );
}

function formatCurrencyValue(value: number | null) {
  return formatCurrency(value ?? 0);
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
