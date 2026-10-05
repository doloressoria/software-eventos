import {
  roundMoney,
  sumGuarantees,
  sumOrdinaryPayments,
} from "../pagos/calculos";

export type ReportesFinancierosMetricas = {
  egresos_pagados: number;
  eventos_incluidos: number;
  garantias_registradas: number;
  ingresos_cobrados: number;
  margen_porcentaje: number | null;
  pendiente_cobro: number;
  promedio_egresos_por_evento: number;
  promedio_ingresos_por_evento: number;
  promedio_resultado_neto_por_evento: number;
  resultado_neto: number;
  total_vendido: number;
};

export type ReportesFinancierosSalonRow = {
  egresos_pagados: number;
  eventos: number;
  id: string;
  ingresos_cobrados: number;
  label: string;
  margen_porcentaje: number | null;
  pendiente_cobro: number;
  resultado_neto: number;
};

export type ReportesFinancierosEventoRow = {
  cliente: string;
  egresos_pagados: number;
  evento: string;
  fecha_evento: string;
  id: string;
  href: string;
  ingresos_cobrados: number;
  margen_porcentaje: number | null;
  pendiente_cobro: number;
  rentabilidad_estado: "equilibrio" | "ganancia" | "perdida";
  resultado_neto: number;
  salon: string;
  total_vendido: number;
  vendedor: string;
};

export type ReportesFinancierosMesRow = {
  egresos_pagados: number;
  ingresos_cobrados: number;
  key: string;
  label: string;
  resultado_neto: number;
};

export type ReportesFinancierosCategoriaRow = {
  cantidad: number;
  egresos_pagados: number;
  id: string;
  label: string;
};

export type ReportesFinancierosVendedorRow = {
  egresos_pagados: number;
  eventos: number;
  id: string;
  ingresos_cobrados: number;
  label: string;
  margen_porcentaje: number | null;
  resultado_neto: number;
};

export type ReportesFinancierosData = {
  egresosPorCategoria: ReportesFinancierosCategoriaRow[];
  evolucionMensual: ReportesFinancierosMesRow[];
  metricas: ReportesFinancierosMetricas;
  porEvento: ReportesFinancierosEventoRow[];
  porSalon: ReportesFinancierosSalonRow[];
  porVendedor: ReportesFinancierosVendedorRow[];
};

export type ReporteFinancieroEvento = {
  cliente: string;
  fecha_evento: string;
  id: string;
  href: string;
  nombre_evento: string;
  salon: string;
  salon_id: string;
  vendedor: string;
  vendedor_id: string;
};

export type ReporteFinancieroPago = {
  es_garantia: boolean;
  evento_id: string;
  fecha_pago: string;
  importe_en_pesos: number | null;
};

export type ReporteFinancieroEgreso = {
  categoria: string;
  evento_id: string;
  fecha_egreso: string;
  importe_en_pesos: number | null;
};

export type ReporteFinancieroResumen = {
  id: string | null;
  saldo_catering: number | null;
  saldo_servicios: number | null;
  total_catering: number | null;
  total_servicios: number | null;
};

export function buildReportesFinancieros({
  egresos,
  eventos,
  pagos,
  resumenByEvento,
}: {
  egresos: ReporteFinancieroEgreso[];
  eventos: ReporteFinancieroEvento[];
  pagos: ReporteFinancieroPago[];
  resumenByEvento: Map<string, ReporteFinancieroResumen>;
}): ReportesFinancierosData {
  const ingresos_cobrados = sumIngresosCobrados(pagos);
  const egresos_pagados = sumImporteEnPesos(egresos);
  const resultado_neto = roundMoney(ingresos_cobrados - egresos_pagados);
  const eventos_incluidos = eventos.length;
  const ingresosByEvento = groupImportesByEvento(
    pagos.filter((pago) => !pago.es_garantia),
  );
  const total_vendido = roundMoney(
    eventos.reduce(
      (total, evento) =>
        total + getTotalVendidoEstimado(resumenByEvento.get(evento.id)),
      0,
    ),
  );
  const pendiente_cobro = roundMoney(
    eventos.reduce(
      (total, evento) =>
        total +
        getPendienteCobroEstimado(
          resumenByEvento.get(evento.id),
          ingresosByEvento.get(evento.id) ?? 0,
        ),
      0,
    ),
  );

  return {
    egresosPorCategoria: getEgresosPorCategoria(egresos),
    evolucionMensual: getEvolucionMensual(pagos, egresos),
    metricas: {
      egresos_pagados,
      eventos_incluidos,
      garantias_registradas: sumGarantiasRegistradas(pagos),
      ingresos_cobrados,
      margen_porcentaje: getMargenPorcentaje(resultado_neto, ingresos_cobrados),
      pendiente_cobro,
      promedio_egresos_por_evento: getPromedioPorEvento(
        egresos_pagados,
        eventos_incluidos,
      ),
      promedio_ingresos_por_evento: getPromedioPorEvento(
        ingresos_cobrados,
        eventos_incluidos,
      ),
      promedio_resultado_neto_por_evento: getPromedioPorEvento(
        resultado_neto,
        eventos_incluidos,
      ),
      resultado_neto,
      total_vendido,
    },
    porEvento: getFinancierosPorEvento({
      egresos,
      eventos,
      pagos,
      resumenByEvento,
    }),
    porSalon: getFinancierosPorSalon({
      egresos,
      eventos,
      pagos,
      resumenByEvento,
    }),
    porVendedor: getFinancierosPorVendedor({ egresos, eventos, pagos }),
  };
}

function getFinancierosPorEvento({
  egresos,
  eventos,
  pagos,
  resumenByEvento,
}: {
  egresos: ReporteFinancieroEgreso[];
  eventos: ReporteFinancieroEvento[];
  pagos: ReporteFinancieroPago[];
  resumenByEvento: Map<string, ReporteFinancieroResumen>;
}): ReportesFinancierosEventoRow[] {
  const ingresosByEvento = groupImportesByEvento(
    pagos.filter((pago) => !pago.es_garantia),
  );
  const egresosByEvento = groupImportesByEvento(egresos);

  return eventos
    .map((evento) => {
      const ingresos_cobrados = ingresosByEvento.get(evento.id) ?? 0;
      const egresos_pagados = egresosByEvento.get(evento.id) ?? 0;
      const resultado_neto = roundMoney(ingresos_cobrados - egresos_pagados);
      const resumen = resumenByEvento.get(evento.id);

      return {
        cliente: evento.cliente,
        egresos_pagados,
        evento: evento.nombre_evento,
        fecha_evento: evento.fecha_evento,
        id: evento.id,
        href: evento.href,
        ingresos_cobrados,
        margen_porcentaje: getMargenPorcentaje(resultado_neto, ingresos_cobrados),
        pendiente_cobro: getPendienteCobroEstimado(
          resumen,
          ingresos_cobrados,
        ),
        rentabilidad_estado: getRentabilidadEstado(resultado_neto),
        resultado_neto,
        salon: evento.salon,
        total_vendido: getTotalVendidoEstimado(resumen),
        vendedor: evento.vendedor,
      };
    })
    .sort((a, b) => a.fecha_evento.localeCompare(b.fecha_evento));
}

function getFinancierosPorSalon({
  egresos,
  eventos,
  pagos,
  resumenByEvento,
}: {
  egresos: ReporteFinancieroEgreso[];
  eventos: ReporteFinancieroEvento[];
  pagos: ReporteFinancieroPago[];
  resumenByEvento: Map<string, ReporteFinancieroResumen>;
}): ReportesFinancierosSalonRow[] {
  const ingresosByEvento = groupImportesByEvento(
    pagos.filter((pago) => !pago.es_garantia),
  );
  const egresosByEvento = groupImportesByEvento(egresos);
  const groups = new Map<string, ReportesFinancierosSalonRow>();

  for (const evento of eventos) {
    const current = groups.get(evento.salon_id) ?? {
      egresos_pagados: 0,
      eventos: 0,
      id: evento.salon_id,
      ingresos_cobrados: 0,
      label: evento.salon,
      margen_porcentaje: null,
      pendiente_cobro: 0,
      resultado_neto: 0,
    };

    current.eventos += 1;
    current.ingresos_cobrados = roundMoney(
      current.ingresos_cobrados + (ingresosByEvento.get(evento.id) ?? 0),
    );
    current.egresos_pagados = roundMoney(
      current.egresos_pagados + (egresosByEvento.get(evento.id) ?? 0),
    );
    current.pendiente_cobro = roundMoney(
      current.pendiente_cobro +
        getPendienteCobroEstimado(
          resumenByEvento.get(evento.id),
          ingresosByEvento.get(evento.id) ?? 0,
        ),
    );
    current.resultado_neto = roundMoney(
      current.ingresos_cobrados - current.egresos_pagados,
    );
    current.margen_porcentaje = getMargenPorcentaje(
      current.resultado_neto,
      current.ingresos_cobrados,
    );

    groups.set(evento.salon_id, current);
  }

  return Array.from(groups.values()).sort((a, b) => {
    if (b.resultado_neto !== a.resultado_neto) {
      return b.resultado_neto - a.resultado_neto;
    }

    return a.label.localeCompare(b.label, "es");
  });
}

function getFinancierosPorVendedor({
  egresos,
  eventos,
  pagos,
}: {
  egresos: ReporteFinancieroEgreso[];
  eventos: ReporteFinancieroEvento[];
  pagos: ReporteFinancieroPago[];
}): ReportesFinancierosVendedorRow[] {
  const ingresosByEvento = groupImportesByEvento(
    pagos.filter((pago) => !pago.es_garantia),
  );
  const egresosByEvento = groupImportesByEvento(egresos);
  const groups = new Map<string, ReportesFinancierosVendedorRow>();

  for (const evento of eventos) {
    if (!evento.vendedor_id) continue;
    const current = groups.get(evento.vendedor_id) ?? {
      egresos_pagados: 0,
      eventos: 0,
      id: evento.vendedor_id,
      ingresos_cobrados: 0,
      label: evento.vendedor,
      margen_porcentaje: null,
      resultado_neto: 0,
    };

    current.eventos += 1;
    current.ingresos_cobrados = roundMoney(
      current.ingresos_cobrados + (ingresosByEvento.get(evento.id) ?? 0),
    );
    current.egresos_pagados = roundMoney(
      current.egresos_pagados + (egresosByEvento.get(evento.id) ?? 0),
    );
    current.resultado_neto = roundMoney(
      current.ingresos_cobrados - current.egresos_pagados,
    );
    current.margen_porcentaje = getMargenPorcentaje(
      current.resultado_neto,
      current.ingresos_cobrados,
    );

    groups.set(evento.vendedor_id, current);
  }

  return Array.from(groups.values()).sort((a, b) => {
    if (b.resultado_neto !== a.resultado_neto) {
      return b.resultado_neto - a.resultado_neto;
    }

    return a.label.localeCompare(b.label, "es");
  });
}

function getEvolucionMensual(
  pagos: ReporteFinancieroPago[],
  egresos: ReporteFinancieroEgreso[],
): ReportesFinancierosMesRow[] {
  const months = new Map<string, ReportesFinancierosMesRow>();

  for (const pago of pagos) {
    if (pago.es_garantia) {
      continue;
    }

    const month = getMonthRow(months, pago.fecha_pago);
    month.ingresos_cobrados = roundMoney(
      month.ingresos_cobrados + toMoneyNumber(pago.importe_en_pesos),
    );
    month.resultado_neto = roundMoney(
      month.ingresos_cobrados - month.egresos_pagados,
    );
  }

  for (const egreso of egresos) {
    const month = getMonthRow(months, egreso.fecha_egreso);
    month.egresos_pagados = roundMoney(
      month.egresos_pagados + toMoneyNumber(egreso.importe_en_pesos),
    );
    month.resultado_neto = roundMoney(
      month.ingresos_cobrados - month.egresos_pagados,
    );
  }

  return Array.from(months.values()).sort((a, b) => a.key.localeCompare(b.key));
}

function getEgresosPorCategoria(
  egresos: ReporteFinancieroEgreso[],
): ReportesFinancierosCategoriaRow[] {
  const groups = new Map<string, ReportesFinancierosCategoriaRow>();

  for (const egreso of egresos) {
    const label = egreso.categoria.trim() || "Sin categoria";
    const current = groups.get(label) ?? {
      cantidad: 0,
      egresos_pagados: 0,
      id: label,
      label,
    };

    current.cantidad += 1;
    current.egresos_pagados = roundMoney(
      current.egresos_pagados + toMoneyNumber(egreso.importe_en_pesos),
    );
    groups.set(label, current);
  }

  return Array.from(groups.values()).sort((a, b) => {
    if (b.egresos_pagados !== a.egresos_pagados) {
      return b.egresos_pagados - a.egresos_pagados;
    }

    return a.label.localeCompare(b.label, "es");
  });
}

function getMonthRow(
  months: Map<string, ReportesFinancierosMesRow>,
  date: string,
) {
  const key = date.slice(0, 7);
  const current = months.get(key) ?? {
    egresos_pagados: 0,
    ingresos_cobrados: 0,
    key,
    label: formatMonthLabel(key),
    resultado_neto: 0,
  };

  months.set(key, current);

  return current;
}

function groupImportesByEvento<T extends { evento_id: string; importe_en_pesos: number | null }>(
  rows: T[],
) {
  const groups = new Map<string, number>();

  for (const row of rows) {
    const current = groups.get(row.evento_id) ?? 0;

    groups.set(
      row.evento_id,
      roundMoney(current + toMoneyNumber(row.importe_en_pesos)),
    );
  }

  return groups;
}

function sumIngresosCobrados(rows: ReporteFinancieroPago[]) {
  return sumOrdinaryPayments(rows);
}

function sumGarantiasRegistradas(rows: ReporteFinancieroPago[]) {
  return sumGuarantees(rows);
}

function sumImporteEnPesos(rows: { importe_en_pesos: number | null }[]) {
  return roundMoney(
    rows.reduce((total, row) => total + toMoneyNumber(row.importe_en_pesos), 0),
  );
}

function getTotalVendidoEstimado(row: ReporteFinancieroResumen | undefined) {
  return roundMoney(
    toMoneyNumber(row?.total_catering) + toMoneyNumber(row?.total_servicios),
  );
}

function getPendienteCobroEstimado(
  row: ReporteFinancieroResumen | undefined,
  totalCobrado: number,
) {
  return Math.max(
    roundMoney(getTotalVendidoEstimado(row) - totalCobrado),
    0,
  );
}

function getPromedioPorEvento(total: number, eventos: number) {
  if (eventos === 0) {
    return 0;
  }

  return roundMoney(total / eventos);
}

function getMargenPorcentaje(resultadoNeto: number, ingresosCobrados: number) {
  if (ingresosCobrados <= 0) {
    return null;
  }

  return roundMoney((resultadoNeto / ingresosCobrados) * 100);
}

function getRentabilidadEstado(
  resultadoNeto: number,
): ReportesFinancierosEventoRow["rentabilidad_estado"] {
  if (resultadoNeto > 0) {
    return "ganancia";
  }

  if (resultadoNeto < 0) {
    return "perdida";
  }

  return "equilibrio";
}

function formatMonthLabel(key: string) {
  const [year, month] = key.split("-");

  return new Intl.DateTimeFormat("es-AR", {
    month: "short",
    timeZone: "UTC",
    year: "numeric",
  }).format(new Date(`${year}-${month}-01T00:00:00.000Z`));
}

function toMoneyNumber(value: number | null | undefined) {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}
