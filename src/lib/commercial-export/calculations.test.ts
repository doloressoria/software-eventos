import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { cateringAmounts, serviceAmounts, uniquePayments } from "./calculations";
import { exampleCatering, exampleEvent, examplePayment } from "./fixtures";
import { sumOrdinaryPayments } from "../pagos/calculos";

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

test("el diagnóstico coincide con la implementación TS existente sin ejecutar escrituras reales", async () => {
  const data = exampleCatering({ itemCount: 18, paymentCount: 35 });
  let written: Record<string, number> | undefined;
  const results: Record<string, unknown> = { catering_contratos: data.catering, catering_precio_historial: data.history[0], catering_items: data.items, pagos: data.payments };
  const exports: { recalculateCateringTotals?: (id: string) => Promise<void> } = {};
  const dependencies: Record<string, unknown> = {
    "server-only": {}, "@/lib/pagos/calculos": { sumOrdinaryPayments },
    "@/lib/supabase/errors": { logSupabaseError() { assert.fail("Error inesperado"); } },
    "@/lib/supabase/server": { createClient: async () => ({ from(table: string) {
      const chain = { select: () => chain, eq: () => chain, is: () => chain, order: () => chain, limit: () => chain, maybeSingle: () => chain,
        update: (payload: Record<string, number>) => { written = payload; return chain; },
        then: (resolve: (value: unknown) => unknown) => Promise.resolve({ data: results[table], error: null }).then(resolve) };
      return chain;
    } }) },
  };
  runInNewContext(ts.transpileModule(readFileSync("src/lib/catering/recalculate-totals.ts", "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText, { exports, require: (name: string) => { assert.ok(name in dependencies); return dependencies[name]; }, Date });
  await exports.recalculateCateringTotals!(data.catering.id);
  const a = cateringAmounts(data);
  assert.equal(written?.total_con_iva, a.calculatedTotal);
  assert.equal(written?.total_sin_iva, a.calculatedNet);
  assert.equal(written?.total_pagado, a.paid);
});
