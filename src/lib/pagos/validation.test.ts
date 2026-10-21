import assert from "node:assert/strict";
import test from "node:test";
import { getEmptyPagoFormState, getPagoEditState, paymentEquivalent, validatePagoForm } from "./validation";
import { calculateServicioPaymentTotals, calculateMoneyFlow, calculatePaymentSummary } from "./calculos";

function form(values: Record<string, string> = {}) {
  const data = new FormData();
  for (const [k, v] of Object.entries({ ...getEmptyPagoFormState().fields, monto: "100", moneda: "USD", forma_pago: "efectivo_dolares", tipo_cambio: "1200", ...values })) data.set(k, v);
  return data;
}

test("cotizaciones independientes, mezcla ARS/USD y garantías conservan equivalentes históricos", () => {
  const rows = [form(), form({ tipo_cambio: "1300", forma_pago: "transferencia", banco: "Banco original" }), form({ moneda: "ARS", tipo_cambio: "1", forma_pago: "efectivo_pesos", monto: "500" })].map(data => {
    const { payload } = validatePagoForm(data);
    assert.ok(payload);
    return { ...payload, importe_moneda_original: payload.monto, importe_en_pesos: paymentEquivalent(String(payload.monto), String(payload.tipo_cambio))! };
  });
  assert.equal(rows[0].tipo_cambio, 1200);
  assert.equal(rows[1].tipo_cambio, 1300);
  assert.equal(rows[1].banco, "Banco original");
  assert.equal(calculateMoneyFlow({ expenses: [], payments: rows.slice(0, 2) }).totalIngresos, 250000);
  assert.equal(calculatePaymentSummary({ payments: [...rows, { ...rows[0], es_garantia: true }], total: 300000 }).saldoPendiente, 49500);
});

test("USD exige cotización manual positiva; ARS exige 1; combinaciones incompatibles se rechazan", () => {
  for (const tipo_cambio of ["", "0", "-1", "NaN", "Infinity", "1e3", "1000000", "0.00001"]) assert.equal(validatePagoForm(form({ tipo_cambio })).payload, null);
  const missing = form(); missing.delete("tipo_cambio");
  assert.equal(validatePagoForm(missing).payload, null);
  for (const forma_pago of ["efectivo_pesos", "cheque", "retenciones", "efectivo_euros"]) assert.equal(validatePagoForm(form({ forma_pago })).payload, null);
  for (const [moneda, forma_pago, tipo_cambio] of [["ARS", "efectivo_dolares", "1"], ["ARS", "transferencia", "2"], ["EUR", "transferencia", "1200"]]) assert.equal(validatePagoForm(form({ moneda, forma_pago, tipo_cambio })).payload, null);
});

test("producto decimal exacto, redondeo a centavos y límites de PostgreSQL", () => {
  assert.equal(paymentEquivalent("1.01", "1.5"), 1.52);
  assert.equal(paymentEquivalent("0.01", "0.5"), 0.01);
  assert.equal(paymentEquivalent("100.25", "1200.1234"), 120312.37);
  assert.equal(paymentEquivalent("1,01", "1,5"), 1.52);
  for (const monto of ["0", "-1", "1.001", "NaN", "10000000000"]) assert.equal(validatePagoForm(form({ monto })).payload, null);
  assert.equal(validatePagoForm(form({ monto: "9999999999.99", tipo_cambio: "2" })).payload, null);
});

test("igual equivalente ARS tiene igual IVA en efectivo ARS/USD y transferencia ARS/USD", () => {
  for (const [ars, usd] of [["efectivo_pesos", "efectivo_dolares"], ["transferencia", "transferencia"]]) {
    const row = { importe_en_pesos: 121000, es_garantia: false };
    assert.deepEqual(calculateServicioPaymentTotals([{ ...row, moneda: "ARS", forma_pago: ars }], 0, 200000), calculateServicioPaymentTotals([{ ...row, moneda: "USD", importe_moneda_original: 100, forma_pago: usd }], 0, 200000));
  }
});

test("edición recupera datos históricos sin inventar una cotización ausente", () => {
  const historical = { importe_moneda_original: 100, moneda: "USD", tipo_cambio: 1300, forma_pago: "transferencia", fecha_pago: "2026-10-21", banco: "Original", numero_cheque: null, es_garantia: true, concepto: "Pago", notas: "Referencia", evento_servicio_id: "servicio" };
  const state = getPagoEditState(historical);
  const data = new FormData();
  for (const [k,v] of Object.entries(state.fields)) data.set(k,v);
  assert.equal(validatePagoForm(data).payload?.tipo_cambio, 1300);
  assert.equal(validatePagoForm(data).payload?.es_garantia, true);
  assert.equal(state.fields.banco, "Original");
  assert.equal(getPagoEditState({ ...historical, tipo_cambio: null }).fields.tipo_cambio, "");
});
