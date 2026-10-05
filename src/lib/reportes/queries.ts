import { redirect } from "next/navigation";
import { getCurrentProfile, type CurrentProfile } from "@/lib/auth";
import { getAssignedActiveSalones } from "@/lib/eventos/queries";
import {
  getMoneyAmount,
  isOrdinaryPayment,
  sumGuarantees,
  sumOrdinaryPayments,
} from "@/lib/pagos/calculos";
import {
  buildReportesFinancieros,
  type ReporteFinancieroEvento,
  type ReportesFinancierosData,
} from "@/lib/reportes/financieros-calculos";
import { logSupabaseError } from "@/lib/supabase/errors";
import { createClient } from "@/lib/supabase/server";
import type { Enums, Tables } from "@/types/database.types";

export type {
  ReportesFinancierosCategoriaRow,
  ReportesFinancierosData,
  ReportesFinancierosEventoRow,
  ReportesFinancierosMesRow,
  ReportesFinancierosMetricas,
  ReportesFinancierosSalonRow,
  ReportesFinancierosVendedorRow,
} from "@/lib/reportes/financieros-calculos";

type EstadoEvento = Enums<"estado_evento">;

export type ReportesGeneralesFilters = {
  estado?: EstadoEvento;
  eventoId?: string;
  fechaDesde?: string;
  fechaHasta?: string;
  lugar?: string;
  salonId?: string;
  vendedorId?: string;
};

export type ReportesGeneralesSearchParams = Record<
  string,
  string | string[] | undefined
>;

export type ReportesGeneralesRow = {
  cantidad: number;
  id: string;
  label: string;
};

export type ReportesAnticipacionMetricas = {
  anticipacion_maxima: number | null;
  anticipacion_mediana: number | null;
  anticipacion_minima: number | null;
  anticipacion_promedio: number | null;
  eventos_analizados: number;
  eventos_fecha_inconsistente: number;
  eventos_sin_fecha_contrato: number;
};

export type ReportesAnticipacionDistribucionRow = {
  cantidad: number;
  id: string;
  label: string;
  porcentaje: number;
};

export type ReportesAnticipacionSalonRow = {
  anticipacion_maxima: number | null;
  anticipacion_minima: number | null;
  anticipacion_promedio: number | null;
  eventos: number;
  eventos_analizados: number;
  eventos_fecha_inconsistente: number;
  eventos_sin_fecha_contrato: number;
  id: string;
  label: string;
};

export type ReportesAnticipacionTipoRow = {
  anticipacion_promedio: number | null;
  eventos_analizados: number;
  id: string;
  label: string;
};

export type ReportesAnticipacionAtipicoRow = {
  cliente: string;
  dias_anticipacion: number | null;
  fecha_contrato: string | null;
  fecha_evento: string;
  id: string;
  motivo: "fecha_inconsistente" | "sin_fecha_contrato";
  salon: string;
};

export type ReportesAnticipacionMesRow = {
  anticipacion_promedio: number | null;
  eventos_analizados: number;
  key: string;
  label: string;
};

export type ReportesAnticipacionData = {
  atipicos: ReportesAnticipacionAtipicoRow[];
  distribucion: ReportesAnticipacionDistribucionRow[];
  evolucionMensual: ReportesAnticipacionMesRow[];
  metricas: ReportesAnticipacionMetricas;
  porSalon: ReportesAnticipacionSalonRow[];
  porTipoEvento: ReportesAnticipacionTipoRow[];
};

export type ReportesGeneralesPendiente = {
  cliente: string;
  fechaEvento: string;
  id: string;
  href: string;
  saldoPendiente: number;
  salon: string;
  totalEstimado: number;
  vendedor: string;
};

export type ReportesGeneralesData = {
  anticipacion: ReportesAnticipacionData;
  filters: ReportesGeneralesFilters;
  metrics: {
    balanceSimple: number;
    eventosTotal: number;
    garantiasRegistradas: number;
    saldoPendiente: number;
    totalEgresos: number;
    totalEstimadoVendido: number;
    totalIngresos: number;
  };
  options: {
    eventos: Pick<
      Tables<"eventos">,
      "cliente_nombre" | "fecha_evento" | "id" | "nombre_evento"
    >[];
    estados: EstadoEvento[];
    salones: Pick<Tables<"salones">, "id" | "nombre">[];
    lugares: string[];
    vendedores: Pick<Tables<"usuarios">, "id" | "full_name" | "email">[];
  };
  pendientes: ReportesGeneralesPendiente[];
  financieros: ReportesFinancierosData;
  porEstado: ReportesGeneralesRow[];
  porSalon: ReportesGeneralesRow[];
  porVendedor: ReportesGeneralesRow[];
  profile: CurrentProfile;
};

type ReporteEvento = Pick<
  Tables<"eventos">,
  | "cliente_nombre"
  | "estado"
  | "fecha_contrato"
  | "fecha_evento"
  | "id"
  | "nombre_evento"
  | "salon_id"
  | "tipo_evento"
  | "vendedor_id"
> & {
  salones: Pick<Tables<"salones">, "nombre"> | null;
  usuarios: Pick<Tables<"usuarios">, "full_name" | "email"> | null;
};

// evento_id is nullable at the DB level (catering externo sin evento can
// have pagos/egresos with evento_id null), but these report rows always
// come from queries filtered by .in("evento_id", eventoIds), so it's
// guaranteed non-null here.
type ReportePago = Omit<
  Pick<Tables<"pagos">, "es_garantia" | "evento_id" | "fecha_pago" | "importe_en_pesos">,
  "evento_id"
> & { evento_id: string };

type ReporteEgreso = Omit<
  Pick<Tables<"egresos">, "categoria" | "evento_id" | "fecha_egreso" | "importe_en_pesos">,
  "evento_id"
> & { evento_id: string };

type MovimientoPagoRow = ReportePago & {
  eventos: Pick<
    Tables<"eventos">,
    "deleted_at" | "estado" | "salon_id" | "vendedor_id"
  > | null;
};

type MovimientoEgresoRow = ReporteEgreso & {
  eventos: Pick<
    Tables<"eventos">,
    "deleted_at" | "estado" | "salon_id" | "vendedor_id"
  > | null;
};

type ImporteRow = {
  importe_en_pesos: number | null;
};

type FilterQuery = {
  eq: (column: string, value: string) => unknown;
  gte: (column: string, value: string) => unknown;
  lte: (column: string, value: string) => unknown;
};

type ResumenEventoRow = Pick<
  Tables<"v_resumen_evento">,
  | "id"
  | "saldo_catering"
  | "saldo_servicios"
  | "total_catering"
  | "total_servicios"
>;

const ESTADOS_EVENTO: EstadoEvento[] = [
  "borrador",
  "confirmado",
  "realizado",
  "cancelado",
];
const KIRIA_ID = "kiria";
const SIN_LUGAR = "__sin_lugar__";

type CateringExternoReporte = Pick<
  Tables<"catering_contratos">,
  "id" | "cliente_nombre" | "fecha_evento" | "lugar_evento" | "total_con_iva" | "saldo_pendiente"
>;

type CateringMovimientoPago = Pick<Tables<"pagos">, "catering_contrato_id" | "fecha_pago" | "importe_en_pesos" | "es_garantia">;
type CateringMovimientoEgreso = Pick<Tables<"egresos">, "catering_contrato_id" | "fecha_egreso" | "importe_en_pesos" | "categoria">;

const ANTICIPACION_RANGOS = [
  { id: "0-30", label: "0 a 30 dias", max: 30, min: 0 },
  { id: "31-60", label: "31 a 60 dias", max: 60, min: 31 },
  { id: "61-90", label: "61 a 90 dias", max: 90, min: 61 },
  { id: "91-180", label: "91 a 180 dias", max: 180, min: 91 },
  { id: "180-plus", label: "Mas de 180 dias", max: null, min: 181 },
] as const;

export async function getReportesGenerales(
  searchParams: ReportesGeneralesSearchParams = {},
): Promise<ReportesGeneralesData> {
  const profile = await getActiveProfile();
  const isAdmin = profile.rol === "admin";
  const canSeeKiria = isAdmin || profile.rol === "ejecutiva_catering";
  const filters = parseFilters(searchParams, isAdmin, canSeeKiria);

  const [salones, vendedores] = await Promise.all([
    getSalonesOptions(profile),
    isAdmin ? getVendedoresOptions() : Promise.resolve([]),
  ]);
  const allowedSalonIds = isAdmin || profile.rol === "ejecutiva_catering"
    ? null
    : salones.map((salon) => salon.id);
  const kiria = canSeeKiria ? await getCateringsExternos() : [];
  const lugares = Array.from(new Map(kiria
    .filter((row) => row.lugar_evento?.trim())
    .map((row) => [getLugarKey(row.lugar_evento), row.lugar_evento!.trim()])).values())
    .sort((a, b) => a.localeCompare(b, "es"));
  const salonesOptions = canSeeKiria ? [...salones, { id: KIRIA_ID, nombre: "Kiria" }] : salones;

  if (allowedSalonIds !== null && allowedSalonIds.length === 0) {
    return getEmptyReport({ filters, profile, salones: salonesOptions, vendedores, lugares });
  }

  if (
    filters.salonId &&
    allowedSalonIds !== null &&
    filters.salonId !== KIRIA_ID && !allowedSalonIds.includes(filters.salonId)
  ) {
    return getEmptyReport({ filters, profile, salones: salonesOptions, vendedores, lugares });
  }

  const incluirKiria = canSeeKiria && (!filters.salonId || filters.salonId === KIRIA_ID)
    && !filters.estado && !filters.vendedorId && !filters.eventoId;
  const kiriaParaMovimientos = incluirKiria
    ? kiria.filter((row) => !filters.lugar || getLugarKey(row.lugar_evento) === filters.lugar)
    : [];
  const externos = incluirKiria
    ? kiriaParaMovimientos.filter((row) =>
        (!filters.fechaDesde || (row.fecha_evento ?? "") >= filters.fechaDesde)
        && (!filters.fechaHasta || (row.fecha_evento ?? "") <= filters.fechaHasta))
    : [];
  const { pagos: pagosExternosMovimiento, egresos: egresosExternosMovimiento } = await getMovimientosExternos(kiriaParaMovimientos, filters);
  const externalIds = new Set(externos.map((row) => row.id));
  const pagosExternos = pagosExternosMovimiento.filter((row) => row.catering_contrato_id && externalIds.has(row.catering_contrato_id));
  const egresosExternos = egresosExternosMovimiento.filter((row) => row.catering_contrato_id && externalIds.has(row.catering_contrato_id));

  const [eventosResult, pagosMovimientos, egresosMovimientos] = await Promise.all([
    filters.salonId === KIRIA_ID ? Promise.resolve([]) : getEventosReporte({ allowedSalonIds, filters }),
    filters.salonId === KIRIA_ID ? Promise.resolve([]) : getPagosReporte({ allowedSalonIds, filters }),
    filters.salonId === KIRIA_ID ? Promise.resolve([]) : getEgresosReporte({ allowedSalonIds, filters }),
  ]);

  const eventos = eventosResult;
  const eventoIds = eventos.map((evento) => evento.id);
  const [resumen, pagosEventos, egresosEventos] = await Promise.all([
    getResumenEventos(eventoIds),
    getPagosEventosReporte(eventoIds, filters),
    getEgresosEventosReporte(eventoIds, filters),
  ]);
  const resumenByEvento = new Map(
    resumen
      .filter((row) => row.id)
      .map((row) => [row.id as string, row] as const),
  );
  for (const contrato of externos) {
    resumenByEvento.set(getCateringReportId(contrato.id), {
      id: getCateringReportId(contrato.id),
      total_catering: contrato.total_con_iva,
      total_servicios: 0,
      saldo_catering: contrato.saldo_pendiente,
      saldo_servicios: 0,
    });
  }
  const pagosExternosFinancieros = pagosExternos.map((row) => ({
    ...row, evento_id: getCateringReportId(row.catering_contrato_id!),
  }));
  const pagosExternosTodos = pagosExternosMovimiento.map((row) => ({
    ...row, evento_id: getCateringReportId(row.catering_contrato_id!),
  }));
  const egresosExternosFinancieros = egresosExternos.map((row) => ({
    ...row, evento_id: getCateringReportId(row.catering_contrato_id!),
  }));
  const totalIngresos = sumIngresosCobrados([...pagosMovimientos, ...pagosExternosTodos]);
  const garantiasRegistradas = sumGarantiasRegistradas([...pagosMovimientos, ...pagosExternosTodos]);
  const totalEgresos = sumImporteEnPesos([...egresosMovimientos, ...egresosExternosMovimiento]);
  const totalEstimadoVendido = roundMoney(
    resumen.reduce(
      (total, row) =>
        total +
        toMoneyNumber(row.total_catering) +
        toMoneyNumber(row.total_servicios),
      0,
    ) + externos.reduce((total, row) => total + toMoneyNumber(row.total_con_iva), 0),
  );
  const financieros = buildReportesFinancieros({
    egresos: [...egresosEventos, ...egresosExternosFinancieros],
    eventos: [...eventos.map(toReporteFinancieroEvento), ...externos.map(toReporteFinancieroCatering)],
    pagos: [...pagosEventos, ...pagosExternosFinancieros],
    resumenByEvento,
  });
  const saldoPendiente = financieros.metricas.pendiente_cobro;

  return {
    anticipacion: buildReportesAnticipacion(eventos),
    filters,
    metrics: {
      balanceSimple: roundMoney(totalIngresos - totalEgresos),
      eventosTotal: eventos.length + externos.length,
      garantiasRegistradas,
      saldoPendiente,
      totalEgresos,
      totalEstimadoVendido,
      totalIngresos,
    },
    options: {
      eventos: eventos.map((evento) => ({
        cliente_nombre: evento.cliente_nombre,
        fecha_evento: evento.fecha_evento,
        id: evento.id,
        nombre_evento: evento.nombre_evento,
      })),
      estados: ESTADOS_EVENTO,
      salones: salonesOptions,
      lugares,
      vendedores,
    },
    pendientes: getEventosPendientes(eventos, resumenByEvento, pagosEventos, externos, pagosExternosFinancieros),
    financieros,
    porEstado: groupEventos(eventos, (evento) => ({
      id: evento.estado,
      label: getEstadoLabel(evento.estado),
    })),
    porSalon: [
      ...groupEventos(eventos, (evento) => ({ id: evento.salon_id, label: evento.salones?.nombre ?? "Salon sin nombre" })),
      ...(externos.length ? [{ id: KIRIA_ID, label: "Kiria", cantidad: externos.length }] : []),
    ],
    porVendedor: isAdmin
      ? groupEventos(eventos, (evento) => ({
          id: evento.vendedor_id,
          label:
            evento.usuarios?.full_name ?? evento.usuarios?.email ?? "Sin vendedor",
        }))
      : [],
    profile,
  };
}

function parseFilters(
  searchParams: ReportesGeneralesSearchParams,
  includeVendedor: boolean,
  canSeeKiria: boolean,
): ReportesGeneralesFilters {
  const estado = getSingleValue(searchParams.estado);
  const salon = getSingleValue(searchParams.salon);

  return {
    estado: isEstadoEvento(estado) ? estado : undefined,
    eventoId: getUuidLikeValue(searchParams.evento),
    fechaDesde: getDateValue(searchParams.desde),
    fechaHasta: getDateValue(searchParams.hasta),
    salonId: canSeeKiria && salon === KIRIA_ID ? KIRIA_ID : getUuidLikeValue(searchParams.salon),
    lugar: canSeeKiria && salon === KIRIA_ID && getSingleValue(searchParams.lugar) !== "all"
      ? getSingleValue(searchParams.lugar) : undefined,
    vendedorId: includeVendedor
      ? getUuidLikeValue(searchParams.vendedor)
      : undefined,
  };
}

async function getActiveProfile() {
  const profile = await getCurrentProfile();

  if (!profile?.activo) {
    redirect("/dashboard");
  }

  return profile;
}

async function getSalonesOptions(profile: CurrentProfile) {
  if (profile.rol === "vendedor") {
    const salones = await getAssignedActiveSalones(profile.id);

    return salones.map(({ id, nombre }) => ({ id, nombre }));
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("salones")
    .select("id, nombre")
    .eq("activo", true)
    .is("deleted_at", null)
    .order("nombre", { ascending: true });

  if (error) {
    logSupabaseError("getReportesGenerales salones", error);
    throw new Error("No se pudo obtener el listado de salones.");
  }

  return data;
}

async function getVendedoresOptions() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("usuarios")
    .select("id, full_name, email")
    .eq("rol", "vendedor")
    .eq("activo", true)
    .order("full_name", { ascending: true });

  if (error) {
    logSupabaseError("getReportesGenerales vendedores", error);
    throw new Error("No se pudo obtener el listado de vendedores.");
  }

  return data;
}

async function getCateringsExternos(): Promise<CateringExternoReporte[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("catering_contratos")
    .select("id, cliente_nombre, fecha_evento, lugar_evento, total_con_iva, saldo_pendiente")
    .is("evento_id", null)
    .is("deleted_at", null);

  if (error) {
    logSupabaseError("getReportesGenerales catering externo", error);
    throw new Error("No se pudieron obtener los caterings externos del reporte.");
  }
  return data;
}

async function getMovimientosExternos(
  contratos: CateringExternoReporte[],
  filters: ReportesGeneralesFilters,
): Promise<{ pagos: CateringMovimientoPago[]; egresos: CateringMovimientoEgreso[] }> {
  if (!contratos.length) return { pagos: [], egresos: [] };
  const supabase = await createClient();
  // ponytail: IDs travel in the query URL; switch to a joined query if Kiria grows past URL limits.
  const ids = contratos.map((row) => row.id);
  const pagosQuery = supabase.from("pagos")
    .select("catering_contrato_id, fecha_pago, importe_en_pesos, es_garantia")
    .in("catering_contrato_id", ids).is("deleted_at", null);
  const egresosQuery = supabase.from("egresos")
    .select("catering_contrato_id, fecha_egreso, importe_en_pesos, categoria")
    .in("catering_contrato_id", ids).is("deleted_at", null);
  applyDateFilters(pagosQuery, filters, "fecha_pago");
  applyDateFilters(egresosQuery, filters, "fecha_egreso");
  const [pagos, egresos] = await Promise.all([pagosQuery, egresosQuery]);
  if (pagos.error || egresos.error) {
    if (pagos.error) logSupabaseError("getReportesGenerales pagos externos", pagos.error);
    if (egresos.error) logSupabaseError("getReportesGenerales egresos externos", egresos.error);
    throw new Error("No se pudieron obtener los movimientos de Kiria.");
  }
  return { pagos: pagos.data, egresos: egresos.data };
}

function getLugarKey(value: string | null) {
  return value?.trim().toLocaleLowerCase("es-AR") || SIN_LUGAR;
}

function getCateringReportId(id: string) {
  return `catering:${id}`;
}

async function getEventosReporte({
  allowedSalonIds,
  filters,
}: {
  allowedSalonIds: string[] | null;
  filters: ReportesGeneralesFilters;
}) {
  const supabase = await createClient();
  const query = supabase
    .from("eventos")
    .select(
      "id, cliente_nombre, estado, fecha_contrato, fecha_evento, nombre_evento, salon_id, tipo_evento, vendedor_id, salones(nombre), usuarios(full_name, email)",
    )
    .is("deleted_at", null)
    .order("fecha_evento", { ascending: true });

  applyEventoFilters(query, filters);

  if (allowedSalonIds !== null) {
    query.in("salon_id", allowedSalonIds);
  }

  const { data, error } = await query;

  if (error) {
    logSupabaseError("getReportesGenerales eventos", error);
    throw new Error("No se pudieron obtener los eventos del reporte.");
  }

  return data as ReporteEvento[];
}

async function getPagosReporte({
  allowedSalonIds,
  filters,
}: {
  allowedSalonIds: string[] | null;
  filters: ReportesGeneralesFilters;
}) {
  const supabase = await createClient();
  const query = supabase
    .from("pagos")
    .select(
      "evento_id, fecha_pago, importe_en_pesos, es_garantia, eventos!inner(salon_id, vendedor_id, estado, deleted_at)",
    )
    .is("deleted_at", null)
    .is("eventos.deleted_at", null);

  applyMovimientoFilters(query, filters, "fecha_pago");

  if (allowedSalonIds !== null) {
    query.in("eventos.salon_id", allowedSalonIds);
  }

  const { data, error } = await query;

  if (error) {
    logSupabaseError("getReportesGenerales pagos", error);
    throw new Error("No se pudieron obtener los ingresos del reporte.");
  }

  return data as MovimientoPagoRow[];
}

async function getEgresosReporte({
  allowedSalonIds,
  filters,
}: {
  allowedSalonIds: string[] | null;
  filters: ReportesGeneralesFilters;
}) {
  const supabase = await createClient();
  const query = supabase
    .from("egresos")
    .select(
      "evento_id, fecha_egreso, importe_en_pesos, eventos!inner(salon_id, vendedor_id, estado, deleted_at)",
    )
    .is("deleted_at", null)
    .is("eventos.deleted_at", null);

  applyMovimientoFilters(query, filters, "fecha_egreso");

  if (allowedSalonIds !== null) {
    query.in("eventos.salon_id", allowedSalonIds);
  }

  const { data, error } = await query;

  if (error) {
    logSupabaseError("getReportesGenerales egresos", error);
    throw new Error("No se pudieron obtener los egresos del reporte.");
  }

  return data as MovimientoEgresoRow[];
}

async function getPagosEventosReporte(
  eventoIds: string[],
  filters: ReportesGeneralesFilters,
) {
  if (eventoIds.length === 0) {
    return [];
  }

  const supabase = await createClient();
  const query = supabase
    .from("pagos")
    .select("evento_id, fecha_pago, importe_en_pesos, es_garantia")
    .in("evento_id", eventoIds)
    .is("deleted_at", null);

  applyDateFilters(query, filters, "fecha_pago");

  const { data, error } = await query;

  if (error) {
    logSupabaseError("getReportesGenerales pagos eventos", error);
    throw new Error("No se pudieron obtener los pagos por evento del reporte.");
  }

  return data as ReportePago[];
}

async function getEgresosEventosReporte(
  eventoIds: string[],
  filters: ReportesGeneralesFilters,
) {
  if (eventoIds.length === 0) {
    return [];
  }

  const supabase = await createClient();
  const query = supabase
    .from("egresos")
    .select("categoria, evento_id, fecha_egreso, importe_en_pesos")
    .in("evento_id", eventoIds)
    .is("deleted_at", null);

  applyDateFilters(query, filters, "fecha_egreso");

  const { data, error } = await query;

  if (error) {
    logSupabaseError("getReportesGenerales egresos eventos", error);
    throw new Error("No se pudieron obtener los egresos por evento del reporte.");
  }

  return data as ReporteEgreso[];
}

async function getResumenEventos(eventoIds: string[]) {
  if (eventoIds.length === 0) {
    return [];
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("v_resumen_evento")
    .select("id, total_catering, total_servicios, saldo_catering, saldo_servicios")
    .in("id", eventoIds);

  if (error) {
    logSupabaseError("getReportesGenerales resumen", error);
    throw new Error("No se pudo obtener el resumen financiero del reporte.");
  }

  return data as ResumenEventoRow[];
}

function applyEventoFilters(query: FilterQuery, filters: ReportesGeneralesFilters) {
  if (filters.fechaDesde) {
    query.gte("fecha_evento", filters.fechaDesde);
  }

  if (filters.fechaHasta) {
    query.lte("fecha_evento", filters.fechaHasta);
  }

  if (filters.salonId) {
    query.eq("salon_id", filters.salonId);
  }

  if (filters.vendedorId) {
    query.eq("vendedor_id", filters.vendedorId);
  }

  if (filters.estado) {
    query.eq("estado", filters.estado);
  }

  if (filters.eventoId) {
    query.eq("id", filters.eventoId);
  }
}

function applyMovimientoFilters(
  query: FilterQuery,
  filters: ReportesGeneralesFilters,
  dateColumn: "fecha_egreso" | "fecha_pago",
) {
  applyDateFilters(query, filters, dateColumn);

  if (filters.salonId) {
    query.eq("eventos.salon_id", filters.salonId);
  }

  if (filters.vendedorId) {
    query.eq("eventos.vendedor_id", filters.vendedorId);
  }

  if (filters.estado) {
    query.eq("eventos.estado", filters.estado);
  }

  if (filters.eventoId) {
    query.eq("evento_id", filters.eventoId);
  }
}

function applyDateFilters(
  query: FilterQuery,
  filters: ReportesGeneralesFilters,
  dateColumn: "fecha_egreso" | "fecha_pago",
) {
  if (filters.fechaDesde) {
    query.gte(dateColumn, filters.fechaDesde);
  }

  if (filters.fechaHasta) {
    query.lte(dateColumn, filters.fechaHasta);
  }
}

function getEventosPendientes(
  eventos: ReporteEvento[],
  resumenByEvento: Map<string, ResumenEventoRow>,
  pagos: ReportePago[],
  externos: CateringExternoReporte[],
  pagosExternos: ReportePago[],
) {
  const today = getTodayInputValue();
  const ingresosByEvento = new Map<string, number>();

  for (const pago of [...pagos, ...pagosExternos]) {
    if (!isOrdinaryPayment(pago)) {
      continue;
    }

    ingresosByEvento.set(
      pago.evento_id,
      roundMoney(
        (ingresosByEvento.get(pago.evento_id) ?? 0) + getMoneyAmount(pago),
      ),
    );
  }

  return [
    ...eventos
    .map((evento) => {
      const resumen = resumenByEvento.get(evento.id);
      const totalEstimado = roundMoney(
        toMoneyNumber(resumen?.total_catering) +
          toMoneyNumber(resumen?.total_servicios),
      );
      const saldoPendiente = Math.max(
        roundMoney(
          totalEstimado - (ingresosByEvento.get(evento.id) ?? 0),
        ),
        0,
      );

      return {
        cliente: evento.nombre_evento ?? evento.cliente_nombre,
        fechaEvento: evento.fecha_evento,
        id: evento.id,
        href: `/eventos/${evento.id}/flujo-dinero`,
        saldoPendiente,
        salon: evento.salones?.nombre ?? "Salon sin nombre",
        totalEstimado,
        vendedor:
          evento.usuarios?.full_name ?? evento.usuarios?.email ?? "Sin vendedor",
      };
    }),
    ...externos.map((contrato) => ({
      cliente: contrato.cliente_nombre ?? "Cliente sin nombre",
      fechaEvento: contrato.fecha_evento ?? "",
      id: getCateringReportId(contrato.id),
      href: `/catering/${contrato.id}/ingresos`,
      saldoPendiente: Math.max(roundMoney(toMoneyNumber(contrato.total_con_iva) - (ingresosByEvento.get(getCateringReportId(contrato.id)) ?? 0)), 0),
      salon: `Kiria · ${contrato.lugar_evento?.trim() || "Sin especificar"}`,
      totalEstimado: toMoneyNumber(contrato.total_con_iva),
      vendedor: "Ejecutiva de catering",
    })),
  ]
    .filter((evento) => evento.fechaEvento >= today && evento.saldoPendiente > 0)
    .sort((a, b) => a.fechaEvento.localeCompare(b.fechaEvento))
    .slice(0, 8);
}

function toReporteFinancieroEvento(
  evento: ReporteEvento,
): ReporteFinancieroEvento {
  return {
    cliente: evento.cliente_nombre,
    fecha_evento: evento.fecha_evento,
    id: evento.id,
    href: `/eventos/${evento.id}/flujo-dinero`,
    nombre_evento: evento.nombre_evento ?? evento.cliente_nombre,
    salon: evento.salones?.nombre ?? "Salon sin nombre",
    salon_id: evento.salon_id,
    vendedor:
      evento.usuarios?.full_name ?? evento.usuarios?.email ?? "Sin vendedor",
    vendedor_id: evento.vendedor_id,
  };
}

function toReporteFinancieroCatering(contrato: CateringExternoReporte): ReporteFinancieroEvento {
  return {
    cliente: contrato.cliente_nombre ?? "Cliente sin nombre",
    fecha_evento: contrato.fecha_evento ?? "",
    id: getCateringReportId(contrato.id),
    href: `/catering/${contrato.id}`,
    nombre_evento: `Catering · ${contrato.lugar_evento?.trim() || "Sin especificar"}`,
    salon: "Kiria",
    salon_id: KIRIA_ID,
    vendedor: "Ejecutiva de catering",
    vendedor_id: "",
  };
}

function buildReportesAnticipacion(
  eventos: ReporteEvento[],
): ReportesAnticipacionData {
  const rows = eventos.map(getAnticipacionEventoRow);
  const validRows = rows.filter(
    (row) => row.motivo === null && row.dias_anticipacion !== null,
  );
  const dias = validRows.map((row) => row.dias_anticipacion as number);

  return {
    atipicos: rows
      .filter((row) => row.motivo !== null)
      .map((row) => ({
        cliente: row.cliente,
        dias_anticipacion: row.dias_anticipacion,
        fecha_contrato: row.fecha_contrato,
        fecha_evento: row.fecha_evento,
        id: row.id,
        motivo: row.motivo as ReportesAnticipacionAtipicoRow["motivo"],
        salon: row.salon,
      }))
      .sort((a, b) => a.fecha_evento.localeCompare(b.fecha_evento)),
    distribucion: buildAnticipacionDistribucion(dias),
    evolucionMensual: buildAnticipacionMensual(validRows),
    metricas: {
      anticipacion_maxima: getMax(dias),
      anticipacion_mediana: getMedian(dias),
      anticipacion_minima: getMin(dias),
      anticipacion_promedio: getAverage(dias),
      eventos_analizados: validRows.length,
      eventos_fecha_inconsistente: rows.filter(
        (row) => row.motivo === "fecha_inconsistente",
      ).length,
      eventos_sin_fecha_contrato: rows.filter(
        (row) => row.motivo === "sin_fecha_contrato",
      ).length,
    },
    porSalon: buildAnticipacionPorSalon(rows),
    porTipoEvento: buildAnticipacionPorTipo(validRows),
  };
}

type AnticipacionEventoRow = {
  cliente: string;
  dias_anticipacion: number | null;
  fecha_contrato: string | null;
  fecha_evento: string;
  id: string;
  motivo: ReportesAnticipacionAtipicoRow["motivo"] | null;
  salon: string;
  salon_id: string;
  tipo_evento: string | null;
};

function getAnticipacionEventoRow(evento: ReporteEvento): AnticipacionEventoRow {
  const cliente = evento.nombre_evento ?? evento.cliente_nombre;
  const salon = evento.salones?.nombre ?? "Salon sin nombre";

  if (!evento.fecha_contrato) {
    return {
      cliente,
      dias_anticipacion: null,
      fecha_contrato: null,
      fecha_evento: evento.fecha_evento,
      id: evento.id,
      motivo: "sin_fecha_contrato",
      salon,
      salon_id: evento.salon_id,
      tipo_evento: evento.tipo_evento,
    };
  }

  const dias_anticipacion = getDaysBetweenDates(
    evento.fecha_contrato,
    evento.fecha_evento,
  );
  const motivo =
    dias_anticipacion === null || dias_anticipacion < 0
      ? "fecha_inconsistente"
      : null;

  return {
    cliente,
    dias_anticipacion,
    fecha_contrato: evento.fecha_contrato,
    fecha_evento: evento.fecha_evento,
    id: evento.id,
    motivo,
    salon,
    salon_id: evento.salon_id,
    tipo_evento: evento.tipo_evento,
  };
}

function buildAnticipacionDistribucion(
  dias: number[],
): ReportesAnticipacionDistribucionRow[] {
  return ANTICIPACION_RANGOS.map((range) => {
    const cantidad = dias.filter(
      (value) =>
        value >= range.min && (range.max === null || value <= range.max),
    ).length;

    return {
      cantidad,
      id: range.id,
      label: range.label,
      porcentaje:
        dias.length > 0 ? roundMetric((cantidad / dias.length) * 100) : 0,
    };
  });
}

function buildAnticipacionMensual(
  rows: AnticipacionEventoRow[],
): ReportesAnticipacionMesRow[] {
  const groups = new Map<string, number[]>();

  for (const row of rows) {
    if (row.dias_anticipacion === null) {
      continue;
    }

    const key = row.fecha_evento.slice(0, 7);
    const current = groups.get(key) ?? [];

    current.push(row.dias_anticipacion);
    groups.set(key, current);
  }

  return Array.from(groups.entries())
    .map(([key, values]) => ({
      anticipacion_promedio: getAverage(values),
      eventos_analizados: values.length,
      key,
      label: formatMonthLabel(key),
    }))
    .sort((a, b) => a.key.localeCompare(b.key));
}

function buildAnticipacionPorSalon(
  rows: AnticipacionEventoRow[],
): ReportesAnticipacionSalonRow[] {
  const groups = new Map<
    string,
    {
      eventos: number;
      inconsistentes: number;
      label: string;
      sinContrato: number;
      values: number[];
    }
  >();

  for (const row of rows) {
    const current = groups.get(row.salon_id) ?? {
      eventos: 0,
      inconsistentes: 0,
      label: row.salon,
      sinContrato: 0,
      values: [],
    };

    current.eventos += 1;

    if (row.motivo === "sin_fecha_contrato") {
      current.sinContrato += 1;
    } else if (row.motivo === "fecha_inconsistente") {
      current.inconsistentes += 1;
    } else if (row.dias_anticipacion !== null) {
      current.values.push(row.dias_anticipacion);
    }

    groups.set(row.salon_id, current);
  }

  return Array.from(groups.entries())
    .map(([id, group]) => ({
      anticipacion_maxima: getMax(group.values),
      anticipacion_minima: getMin(group.values),
      anticipacion_promedio: getAverage(group.values),
      eventos: group.eventos,
      eventos_analizados: group.values.length,
      eventos_fecha_inconsistente: group.inconsistentes,
      eventos_sin_fecha_contrato: group.sinContrato,
      id,
      label: group.label,
    }))
    .sort((a, b) => {
      if (b.eventos !== a.eventos) {
        return b.eventos - a.eventos;
      }

      return a.label.localeCompare(b.label, "es");
    });
}

function buildAnticipacionPorTipo(
  rows: AnticipacionEventoRow[],
): ReportesAnticipacionTipoRow[] {
  const groups = new Map<string, { label: string; values: number[] }>();

  for (const row of rows) {
    if (row.dias_anticipacion === null) {
      continue;
    }

    const label = row.tipo_evento?.trim() || "Sin tipo";
    const current = groups.get(label) ?? { label, values: [] };

    current.values.push(row.dias_anticipacion);
    groups.set(label, current);
  }

  return Array.from(groups.values())
    .map((group) => ({
      anticipacion_promedio: getAverage(group.values),
      eventos_analizados: group.values.length,
      id: group.label,
      label: group.label,
    }))
    .sort((a, b) => {
      if (b.eventos_analizados !== a.eventos_analizados) {
        return b.eventos_analizados - a.eventos_analizados;
      }

      return a.label.localeCompare(b.label, "es");
    });
}

function formatMonthLabel(key: string) {
  const [year, month] = key.split("-");

  return new Intl.DateTimeFormat("es-AR", {
    month: "short",
    timeZone: "UTC",
    year: "numeric",
  }).format(new Date(`${year}-${month}-01T00:00:00.000Z`));
}

function groupEventos(
  eventos: ReporteEvento[],
  getGroup: (evento: ReporteEvento) => Pick<ReportesGeneralesRow, "id" | "label">,
) {
  const groups = new Map<string, ReportesGeneralesRow>();

  for (const evento of eventos) {
    const group = getGroup(evento);
    const current = groups.get(group.id) ?? {
      cantidad: 0,
      id: group.id,
      label: group.label,
    };

    current.cantidad += 1;
    groups.set(group.id, current);
  }

  return Array.from(groups.values()).sort((a, b) => {
    if (b.cantidad !== a.cantidad) {
      return b.cantidad - a.cantidad;
    }

    return a.label.localeCompare(b.label, "es");
  });
}

function getEmptyReport({
  filters,
  profile,
  salones,
  vendedores,
  lugares,
}: {
  filters: ReportesGeneralesFilters;
  profile: CurrentProfile;
  salones: Pick<Tables<"salones">, "id" | "nombre">[];
  vendedores: Pick<Tables<"usuarios">, "id" | "full_name" | "email">[];
  lugares: string[];
}): ReportesGeneralesData {
  return {
    anticipacion: getEmptyAnticipacionReport(),
    filters,
    metrics: {
      balanceSimple: 0,
      eventosTotal: 0,
      garantiasRegistradas: 0,
      saldoPendiente: 0,
      totalEgresos: 0,
      totalEstimadoVendido: 0,
      totalIngresos: 0,
    },
    options: {
      eventos: [],
      estados: ESTADOS_EVENTO,
      salones,
      lugares,
      vendedores,
    },
    pendientes: [],
    financieros: {
      egresosPorCategoria: [],
      evolucionMensual: [],
      metricas: {
        egresos_pagados: 0,
        eventos_incluidos: 0,
        garantias_registradas: 0,
        ingresos_cobrados: 0,
        margen_porcentaje: null,
        pendiente_cobro: 0,
        promedio_egresos_por_evento: 0,
        promedio_ingresos_por_evento: 0,
        promedio_resultado_neto_por_evento: 0,
        resultado_neto: 0,
        total_vendido: 0,
      },
      porEvento: [],
      porSalon: [],
      porVendedor: [],
    },
    porEstado: [],
    porSalon: [],
    porVendedor: [],
    profile,
  };
}

function getEmptyAnticipacionReport(): ReportesAnticipacionData {
  return {
    atipicos: [],
    distribucion: buildAnticipacionDistribucion([]),
    evolucionMensual: [],
    metricas: {
      anticipacion_maxima: null,
      anticipacion_mediana: null,
      anticipacion_minima: null,
      anticipacion_promedio: null,
      eventos_analizados: 0,
      eventos_fecha_inconsistente: 0,
      eventos_sin_fecha_contrato: 0,
    },
    porSalon: [],
    porTipoEvento: [],
  };
}

function sumIngresosCobrados(rows: ReportePago[]) {
  return sumOrdinaryPayments(rows);
}

function sumGarantiasRegistradas(rows: ReportePago[]) {
  return sumGuarantees(rows);
}

function sumImporteEnPesos(rows: ImporteRow[]) {
  return roundMoney(
    rows.reduce((total, row) => total + toMoneyNumber(row.importe_en_pesos), 0),
  );
}

function getSingleValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function getDateValue(value: string | string[] | undefined) {
  const date = getSingleValue(value);

  return date && /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : undefined;
}

function getUuidLikeValue(value: string | string[] | undefined) {
  const id = getSingleValue(value);

  return id && id !== "all" ? id : undefined;
}

function isEstadoEvento(value: string | undefined): value is EstadoEvento {
  return Boolean(value && ESTADOS_EVENTO.includes(value as EstadoEvento));
}

function getEstadoLabel(estado: EstadoEvento) {
  const labels: Record<EstadoEvento, string> = {
    borrador: "Borrador",
    cancelado: "Cancelado",
    confirmado: "Confirmado",
    realizado: "Realizado",
  };

  return labels[estado];
}

function getTodayInputValue() {
  return new Date().toISOString().slice(0, 10);
}

function getDaysBetweenDates(from: string, to: string) {
  const fromDate = getUtcDate(from);
  const toDate = getUtcDate(to);

  if (!fromDate || !toDate) {
    return null;
  }

  return Math.round((toDate.getTime() - fromDate.getTime()) / 86_400_000);
}

function getUtcDate(value: string | null | undefined) {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return null;
  }

  const date = new Date(`${value}T00:00:00.000Z`);

  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) {
    return null;
  }

  return date;
}

function getAverage(values: number[]) {
  if (values.length === 0) {
    return null;
  }

  return roundMetric(values.reduce((total, value) => total + value, 0) / values.length);
}

function getMedian(values: number[]) {
  if (values.length === 0) {
    return null;
  }

  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);

  if (sorted.length % 2 === 1) {
    return sorted[middle];
  }

  return roundMetric((sorted[middle - 1] + sorted[middle]) / 2);
}

function getMin(values: number[]) {
  return values.length > 0 ? Math.min(...values) : null;
}

function getMax(values: number[]) {
  return values.length > 0 ? Math.max(...values) : null;
}

function roundMetric(value: number) {
  return Math.round((value + Number.EPSILON) * 10) / 10;
}

function toMoneyNumber(value: number | null | undefined) {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function roundMoney(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}
