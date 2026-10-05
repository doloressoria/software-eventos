import assert from "node:assert/strict";
import test from "node:test";
import { buildReportesFinancieros } from "../reportes/financieros-calculos";
import {
  calculateServicioPaymentTotals,
  calculateMoneyFlow,
  calculatePaymentSummary,
  IVA_PORCENTAJE,
  sumGuarantees,
  sumOrdinaryPayments,
  type PaymentMoneyRow,
} from "./calculos";

type ServicioPayment = PaymentMoneyRow & { forma_pago: string };

function payment(
  amount: number,
  forma_pago = "transferencia",
  extra: Partial<ServicioPayment> = {},
): ServicioPayment {
  return {
    es_garantia: false,
    forma_pago,
    importe_en_pesos: amount,
    ...extra,
  };
}

test("efectivo se imputa completo al neto sin aumentar la base IVA", () => {
  const totals = calculateServicioPaymentTotals(
    [payment(605, "efectivo_pesos")],
    100,
    1_000,
  );

  assert.equal(totals.totalEfectivo, 605);
  assert.equal(totals.netoNoEfectivo, 0);
  assert.equal(totals.ivaPagadoNoEfectivo, 0);
  assert.equal(totals.ivaBaseImponible, 100);
  assert.equal(totals.totalPagado, 605);
});

test("transferencia, cheque y retenciones separan 21% incluido", () => {
  for (const forma of ["transferencia", "cheque", "retenciones"]) {
    const totals = calculateServicioPaymentTotals([payment(605, forma)], 0, 1_000);
    assert.equal(totals.netoNoEfectivo, 500);
    assert.equal(totals.ivaPagadoNoEfectivo, 105);
    assert.equal(totals.totalPagado, 605);
  }
  assert.equal(IVA_PORCENTAJE, 0.21);
});

test("pago no efectivo dentro de la base actual no la cambia", () => {
  assert.equal(
    calculateServicioPaymentTotals([payment(605)], 600, 1_000)
      .ivaBaseImponible,
    600,
  );
});

test("pagos no efectivos acumulados elevan la base sin superar el neto", () => {
  const payments = [payment(605), payment(363)];
  const totals = calculateServicioPaymentTotals(payments, 600, 1_000);

  assert.equal(totals.netoNoEfectivo, 800);
  assert.equal(totals.ivaPagadoNoEfectivo, 168);
  assert.equal(totals.ivaBaseImponible, 800);
  assert.equal(totals.totalPagado, 968);
  assert.equal(
    calculateServicioPaymentTotals([payment(1_815)], 600, 1_000)
      .ivaBaseImponible,
    1_000,
  );
});

test("garantias y pagos eliminados no afectan importe ni base", () => {
  const totals = calculateServicioPaymentTotals(
    [
      payment(605, "transferencia", { es_garantia: true }),
      payment(605, "transferencia", {
        deleted_at: "2026-09-01T12:00:00Z",
      }),
    ],
    300,
    1_000,
  );

  assert.equal(totals.totalPagado, 0);
  assert.equal(totals.netoNoEfectivo, 0);
  assert.equal(totals.ivaBaseImponible, 300);
});

test("eliminar un pago no reduce una base ya aumentada", () => {
  const before = calculateServicioPaymentTotals([payment(968)], 600, 1_000);
  const after = calculateServicioPaymentTotals([], before.ivaBaseImponible, 1_000);

  assert.equal(before.ivaBaseImponible, 800);
  assert.equal(after.ivaBaseImponible, 800);
  assert.equal(after.totalPagado, 0);
});

test("un servicio historico con IVA 0 recibe la tasa fija en el nuevo calculo", () => {
  const historico = {
    iva_base_imponible: 600,
    iva_porcentaje: 0,
    total_sin_iva: 1_000,
  };
  const totals = calculateServicioPaymentTotals(
    [payment(605)],
    historico.iva_base_imponible,
    historico.total_sin_iva,
  );

  assert.equal(totals.ivaPorcentaje, 0.21);
  assert.equal(totals.ivaBaseImponible, 600);
  assert.equal(totals.totalPagado, 605);
});

test("efectivo y transferencia suman todo lo cobrado; solo transferencia eleva IVA", () => {
  const totals = calculateServicioPaymentTotals(
    [payment(300, "efectivo_pesos"), payment(605)],
    400,
    1_000,
  );

  assert.equal(totals.totalEfectivo, 300);
  assert.equal(totals.netoNoEfectivo, 500);
  assert.equal(totals.ivaPagadoNoEfectivo, 105);
  assert.equal(totals.ivaBaseImponible, 500);
  assert.equal(totals.totalPagado, 905);
});

test("redondea neto e IVA por pago antes de acumular", () => {
  const totals = calculateServicioPaymentTotals(
    [payment(0.01), payment(0.02), payment(1)],
    0,
    100,
  );

  assert.equal(totals.netoNoEfectivo, 0.86);
  assert.equal(totals.ivaPagadoNoEfectivo, 0.17);
  assert.equal(totals.totalPagado, 1.03);
  assert.equal(totals.netoNoEfectivo + totals.ivaPagadoNoEfectivo, totals.totalPagado);
});

const ordinaryPayment: PaymentMoneyRow = {
  es_garantia: false,
  importe_en_pesos: 400,
};
const guarantee: PaymentMoneyRow = {
  es_garantia: true,
  importe_en_pesos: 250,
};

test("evento sin pagos conserva toda la deuda", () => {
  assert.deepEqual(calculatePaymentSummary({ payments: [], total: 1_000 }), {
    estadoCobro: "pendiente",
    garantiasRegistradas: 0,
    saldoPendiente: 1_000,
    totalCobrado: 0,
    totalEvento: 1_000,
  });
});

test("pago ordinario reduce el saldo pendiente", () => {
  const summary = calculatePaymentSummary({
    payments: [ordinaryPayment],
    total: 1_000,
  });

  assert.equal(summary.totalCobrado, 400);
  assert.equal(summary.saldoPendiente, 600);
  assert.equal(summary.estadoCobro, "parcial");
});

test("garantia se conserva separada sin reducir la deuda", () => {
  const summary = calculatePaymentSummary({
    payments: [guarantee],
    total: 1_000,
  });

  assert.equal(summary.garantiasRegistradas, 250);
  assert.equal(summary.totalCobrado, 0);
  assert.equal(summary.saldoPendiente, 1_000);
  assert.equal(summary.estadoCobro, "pendiente");
});

test("pago ordinario y garantia solo contabilizan el pago", () => {
  const summary = calculatePaymentSummary({
    payments: [ordinaryPayment, guarantee],
    total: 1_000,
  });

  assert.equal(summary.garantiasRegistradas, 250);
  assert.equal(summary.totalCobrado, 400);
  assert.equal(summary.saldoPendiente, 600);
});

test("garantia eliminada logicamente no participa en ningun total", () => {
  const deletedGuarantee = {
    ...guarantee,
    deleted_at: "2026-08-24T12:00:00.000Z",
  };

  assert.equal(sumGuarantees([deletedGuarantee]), 0);
  assert.equal(sumOrdinaryPayments([deletedGuarantee]), 0);
});

test("pago ordinario eliminado logicamente no reduce la deuda", () => {
  const summary = calculatePaymentSummary({
    payments: [
      {
        ...ordinaryPayment,
        deleted_at: "2026-08-24T12:00:00.000Z",
      },
    ],
    total: 1_000,
  });

  assert.equal(summary.totalCobrado, 0);
  assert.equal(summary.saldoPendiente, 1_000);
});

test("flujo de dinero excluye garantias de ingresos y saldo neto", () => {
  assert.deepEqual(
    calculateMoneyFlow({
      expenses: [{ importe_en_pesos: 125 }],
      payments: [ordinaryPayment, guarantee],
    }),
    {
      saldoNeto: 275,
      totalEgresos: 125,
      totalIngresos: 400,
    },
  );
});

test("detalle financiero, flujo y reporte usan el mismo ingreso ordinario", () => {
  const payments = [ordinaryPayment, guarantee];
  const detail = calculatePaymentSummary({ payments, total: 1_000 });
  const flow = calculateMoneyFlow({ expenses: [], payments });
  const report = buildReportesFinancieros({
    egresos: [],
    eventos: [
      {
        cliente: "Cliente",
        fecha_evento: "2026-09-01",
        id: "evento-1",
        href: "/eventos/evento-1/flujo-dinero",
        nombre_evento: "Evento",
        salon: "Salon",
        salon_id: "salon-1",
        vendedor: "Vendedor",
        vendedor_id: "vendedor-1",
      },
    ],
    pagos: [
      {
        es_garantia: ordinaryPayment.es_garantia,
        evento_id: "evento-1",
        fecha_pago: "2026-08-01",
        importe_en_pesos: ordinaryPayment.importe_en_pesos,
      },
      {
        es_garantia: guarantee.es_garantia,
        evento_id: "evento-1",
        fecha_pago: "2026-08-02",
        importe_en_pesos: guarantee.importe_en_pesos,
      },
    ],
    resumenByEvento: new Map([
      [
        "evento-1",
        {
          id: "evento-1",
          saldo_catering: 0,
          saldo_servicios: 350,
          total_catering: 0,
          total_servicios: 1_000,
        },
      ],
    ]),
  });

  assert.equal(detail.totalCobrado, 400);
  assert.equal(flow.totalIngresos, detail.totalCobrado);
  assert.equal(report.metricas.ingresos_cobrados, detail.totalCobrado);
  assert.equal(report.metricas.garantias_registradas, 250);
  assert.equal(report.metricas.pendiente_cobro, detail.saldoPendiente);
  assert.equal(report.porEvento[0].pendiente_cobro, detail.saldoPendiente);
});
