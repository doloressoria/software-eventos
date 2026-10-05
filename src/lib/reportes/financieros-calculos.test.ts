import assert from "node:assert/strict";
import test from "node:test";
import {
  buildReportesFinancieros,
  type ReporteFinancieroEgreso,
  type ReporteFinancieroEvento,
  type ReporteFinancieroPago,
  type ReporteFinancieroResumen,
} from "./financieros-calculos";

const eventos: ReporteFinancieroEvento[] = [
  {
    cliente: "Cliente A",
    fecha_evento: "2026-06-10",
    id: "evento-1",
    href: "/eventos/evento-1/flujo-dinero",
    nombre_evento: "Evento A",
    salon: "Salon Norte",
    salon_id: "salon-1",
    vendedor: "Vendedora Uno",
    vendedor_id: "vendedor-1",
  },
  {
    cliente: "Cliente B",
    fecha_evento: "2026-06-20",
    id: "evento-2",
    href: "/eventos/evento-2/flujo-dinero",
    nombre_evento: "Evento B",
    salon: "Salon Sur",
    salon_id: "salon-2",
    vendedor: "Vendedor Dos",
    vendedor_id: "vendedor-2",
  },
];

const resumenByEvento = new Map<string, ReporteFinancieroResumen>([
  [
    "evento-1",
    {
      id: "evento-1",
      saldo_catering: 100,
      saldo_servicios: 50,
      total_catering: 1_000,
      total_servicios: 500,
    },
  ],
]);

test("consolida ingresos, egresos, neto, margen y promedios sin contar garantias", () => {
  const pagos: ReporteFinancieroPago[] = [
    {
      es_garantia: false,
      evento_id: "evento-1",
      fecha_pago: "2026-06-01",
      importe_en_pesos: 1_000,
    },
    {
      es_garantia: true,
      evento_id: "evento-1",
      fecha_pago: "2026-06-02",
      importe_en_pesos: 300,
    },
    {
      es_garantia: false,
      evento_id: "evento-2",
      fecha_pago: "2026-06-05",
      importe_en_pesos: 500,
    },
  ];
  const egresos: ReporteFinancieroEgreso[] = [
    {
      categoria: "Catering",
      evento_id: "evento-1",
      fecha_egreso: "2026-06-03",
      importe_en_pesos: 400,
    },
    {
      categoria: "Personal",
      evento_id: "evento-2",
      fecha_egreso: "2026-06-04",
      importe_en_pesos: 250,
    },
  ];

  const reporte = buildReportesFinancieros({
    egresos,
    eventos,
    pagos,
    resumenByEvento,
  });

  assert.equal(reporte.metricas.ingresos_cobrados, 1_500);
  assert.equal(reporte.metricas.egresos_pagados, 650);
  assert.equal(reporte.metricas.resultado_neto, 850);
  assert.equal(reporte.metricas.margen_porcentaje, 56.67);
  assert.equal(reporte.metricas.garantias_registradas, 300);
  assert.equal(reporte.metricas.promedio_ingresos_por_evento, 750);
  assert.equal(reporte.metricas.promedio_egresos_por_evento, 325);
  assert.equal(reporte.metricas.promedio_resultado_neto_por_evento, 425);
});

test("agrupa por evento, mes, categoria, salon y vendedor sin duplicar importes", () => {
  const pagos: ReporteFinancieroPago[] = [
    {
      es_garantia: false,
      evento_id: "evento-1",
      fecha_pago: "2026-06-01",
      importe_en_pesos: 700,
    },
    {
      es_garantia: false,
      evento_id: "evento-1",
      fecha_pago: "2026-07-01",
      importe_en_pesos: 300,
    },
  ];
  const egresos: ReporteFinancieroEgreso[] = [
    {
      categoria: "Catering",
      evento_id: "evento-1",
      fecha_egreso: "2026-06-03",
      importe_en_pesos: 200,
    },
    {
      categoria: "Catering",
      evento_id: "evento-1",
      fecha_egreso: "2026-06-04",
      importe_en_pesos: 100,
    },
  ];

  const reporte = buildReportesFinancieros({
    egresos,
    eventos,
    pagos,
    resumenByEvento,
  });

  assert.equal(reporte.porEvento[0].id, "evento-1");
  assert.equal(reporte.porEvento[0].ingresos_cobrados, 1_000);
  assert.equal(reporte.porEvento[0].egresos_pagados, 300);
  assert.equal(reporte.porEvento[0].resultado_neto, 700);
  assert.equal(reporte.porEvento[0].rentabilidad_estado, "ganancia");
  assert.equal(reporte.evolucionMensual.length, 2);
  assert.equal(reporte.evolucionMensual[0].key, "2026-06");
  assert.equal(reporte.evolucionMensual[0].ingresos_cobrados, 700);
  assert.equal(reporte.evolucionMensual[0].egresos_pagados, 300);
  assert.equal(reporte.egresosPorCategoria[0].egresos_pagados, 300);
  assert.equal(reporte.porSalon[0].ingresos_cobrados, 1_000);
  assert.equal(reporte.porVendedor[0].ingresos_cobrados, 1_000);
});

test("respeta el universo de eventos ya filtrado por permisos o salon", () => {
  const reporte = buildReportesFinancieros({
    egresos: [
      {
        categoria: "Tecnica",
        evento_id: "evento-1",
        fecha_egreso: "2026-06-12",
        importe_en_pesos: 900,
      },
    ],
    eventos: eventos.filter((evento) => evento.salon_id === "salon-1"),
    pagos: [
      {
        es_garantia: false,
        evento_id: "evento-1",
        fecha_pago: "2026-06-11",
        importe_en_pesos: 500,
      },
    ],
    resumenByEvento,
  });

  assert.equal(reporte.metricas.eventos_incluidos, 1);
  assert.equal(reporte.porEvento.length, 1);
  assert.equal(reporte.porEvento[0].salon, "Salon Norte");
  assert.equal(reporte.porEvento[0].rentabilidad_estado, "perdida");
});

test("evita divisiones por cero cuando no hay ingresos ni eventos", () => {
  const reporte = buildReportesFinancieros({
    egresos: [],
    eventos: [],
    pagos: [],
    resumenByEvento: new Map(),
  });

  assert.equal(reporte.metricas.ingresos_cobrados, 0);
  assert.equal(reporte.metricas.margen_porcentaje, null);
  assert.equal(reporte.metricas.promedio_ingresos_por_evento, 0);
  assert.equal(reporte.metricas.promedio_resultado_neto_por_evento, 0);
});

test("incluye catering externo en Kiria sin atribuirlo a un vendedor", () => {
  const reporte = buildReportesFinancieros({
    eventos: [{
      cliente: "Cliente Kiria",
      fecha_evento: "2026-10-10",
      href: "/catering/contrato-1",
      id: "catering:contrato-1",
      nombre_evento: "Catering externo",
      salon: "Kiria",
      salon_id: "kiria",
      vendedor: "Ejecutiva de catering",
      vendedor_id: "",
    }],
    pagos: [{ evento_id: "catering:contrato-1", fecha_pago: "2026-10-01", importe_en_pesos: 300, es_garantia: false }],
    egresos: [{ evento_id: "catering:contrato-1", fecha_egreso: "2026-10-02", importe_en_pesos: 50, categoria: "Catering" }],
    resumenByEvento: new Map([["catering:contrato-1", {
      id: "catering:contrato-1", total_catering: 1_000, total_servicios: 0,
      saldo_catering: 700, saldo_servicios: 0,
    }]]),
  });

  assert.equal(reporte.metricas.total_vendido, 1_000);
  assert.equal(reporte.metricas.ingresos_cobrados, 300);
  assert.equal(reporte.metricas.egresos_pagados, 50);
  assert.equal(reporte.porSalon[0].label, "Kiria");
  assert.equal(reporte.porEvento[0].href, "/catering/contrato-1");
  assert.equal(reporte.porVendedor.length, 0);
});
