import assert from "node:assert/strict";
import test from "node:test";
import { cateringAmounts, serviceAmounts, uniquePayments } from "./calculations";
import { exampleCatering, exampleEvent, examplePayment } from "./fixtures";

test("servicios reflejan el saldo visible y excluyen garantías, bajas y otros destinos", () => {
  const data = exampleEvent(0);
  const paid = { ...examplePayment(1), importe_en_pesos: 125 };
  const payments = [paid, paid, { ...examplePayment(2), deleted_at: "2026-10-21" },
    { ...examplePayment(3), es_garantia: true, importe_en_pesos: 600 }, examplePayment(4, null, data.event.id)];
  assert.deepEqual(serviceAmounts(data.services[0], payments), { total: 10920, paid: 125, balance: 10795, guarantees: 600 });
  assert.throws(() => uniquePayments([paid, { ...paid, importe_en_pesos: 999 }]), /contradictorios/);
});

test("detalle, ingresos y diagnóstico mantienen sus fuentes aun con discrepancias y sobrepagos", () => {
  const data = exampleCatering({ mismatch: true });
  data.catering.total_pagado = 20;
  data.catering.saldo_pendiente = data.catering.total_con_iva! - 20;
  const a = cateringAmounts(data);
  assert.equal(a.calculatedTotal, 2147.75);
  assert.equal(a.storedTotal, 2247.75);
  assert.equal(a.difference, 100);
  assert.equal(a.storedPaid, 20);
  assert.notEqual(a.storedPaid, a.paid);
  assert.equal(a.detailBalance, 2227.75);
  assert.equal(a.incomeBalance, 0);
  assert.ok(a.paid > a.storedTotal);
});
