import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { sumOrdinaryPayments } from "../pagos/calculos";

// Ejecuta los módulos reales con el límite Supabase simulado.
function loadModule(path: string, dependencies: Record<string, unknown>) {
  const output = ts.transpileModule(readFileSync(path, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const exports: Record<string, (...args: unknown[]) => Promise<unknown>> = {};
  runInNewContext(output, {
    exports,
    require: (name: string) => {
      assert.ok(name in dependencies, `Dependencia sin simular: ${name}`);
      return dependencies[name];
    },
    Date,
  });
  return exports;
}

test("alta de adicional usa pax=1 y deja total generado a PostgreSQL", async () => {
  let inserted: Record<string, unknown> | undefined;
  let recalculated = false;
  const loaded = loadModule("src/app/(protected)/catering/actions.ts", {
    "next/cache": { revalidatePath() {} },
    "next/navigation": {},
    "@/lib/auth": { getCurrentProfile: async () => ({ id: "user", activo: true }) },
    "@/lib/catering/validation": {},
    "@/lib/catering/precio-historial-validation": {},
    "@/lib/catering/item-validation": {
      validateCateringItemForm: () => ({
        state: {}, payload: { categoria: "adicional_otros", descripcion: "Extra", precio_unitario: 125 },
      }),
      getEmptyCateringItemFormState: () => ({}),
    },
    "@/lib/catering/recalculate-totals": { recalculateCateringTotals: async () => { recalculated = true; } },
    "@/lib/catering/queries": {},
    "@/lib/pagos/validation": {},
    "@/lib/egresos/validation": {},
    "@/lib/roles/access": { requireScreenManagement: async () => {} },
    "@/lib/supabase/errors": { logSupabaseError() { assert.fail("Error inesperado"); } },
    "@/lib/supabase/server": {
      createClient: async () => ({
        from: (table: string) => {
          assert.equal(table, "catering_items");
          return { insert: async (payload: Record<string, unknown>) => {
            inserted = payload;
            return { error: null };
          } };
        },
      }),
    },
  });
  await loaded.addCateringItemAction("contract", {}, new FormData());
  assert.equal(inserted?.pax, 1);
  assert.equal(inserted?.precio_unitario, 125);
  assert.equal(inserted?.total, undefined);
  assert.equal(recalculated, true);
});

test("recálculo conserva fórmula TS, excluye garantías y no envía saldo generado", async () => {
  let updated: Record<string, number> | undefined;
  const results: Record<string, unknown> = {
    catering_contratos: {
      pax_adultos: 10, pax_jovenes: 2, pax_menores: null, pax_bebes: 0,
      comision_organizador_monto: 200, iva_comision: 0.21, iva_porcentaje: 0.21,
    },
    catering_precio_historial: { precio_unitario: 100 },
    catering_items: [{ precio_unitario: 100 }],
    pagos: [
      { importe_en_pesos: 300, es_garantia: false },
      { importe_en_pesos: 50, es_garantia: true },
    ],
  };
  const loaded = loadModule("src/lib/catering/recalculate-totals.ts", {
    "server-only": {},
    "@/lib/pagos/calculos": { sumOrdinaryPayments },
    "@/lib/supabase/errors": { logSupabaseError() { assert.fail("Error inesperado"); } },
    "@/lib/supabase/server": {
      createClient: async () => ({
        from: (table: string) => {
          const result = { data: results[table], error: null };
          const chain = {
            select: () => chain, eq: () => chain, is: () => chain,
            order: () => chain, limit: () => chain, maybeSingle: () => chain,
            update: (payload: Record<string, number>) => { updated = payload; return chain; },
            then: (resolve: (value: unknown) => unknown) => Promise.resolve(result).then(resolve),
          };
          return chain;
        },
      }),
    },
  });
  await loaded.recalculateCateringTotals("contract");
  assert.equal(updated?.total_sin_iva, 1500); // 12 × 100 + 100 + 200
  assert.equal(updated?.total_con_iva, 1815);
  assert.equal(updated?.total_pagado, 300);
  assert.equal(updated?.saldo_pendiente, undefined);
});
