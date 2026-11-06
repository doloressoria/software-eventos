import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { runInNewContext } from "node:vm";
import ts from "typescript";

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
});

test("alta usa una RPC atómica; un error conserva borrador sin anunciar éxito", async () => {
  for (const failure of [false, true]) {
    const state = { fields: { cliente_nombre: "LAB", precio_unitario_inicial: "100" } };
    let calls = 0;
    const loaded = loadModule("src/app/(protected)/catering/actions.ts", {
      "next/cache": { revalidatePath() { assert.equal(failure, false); } },
      "next/navigation": { redirect(path: string) { throw new Error(path); } },
      "@/lib/auth": { getCurrentProfile: async () => ({ id: "user", activo: true }) },
      "@/lib/catering/validation": { validateCateringForm: () => ({ state, payload: {
        con_evento: false, cliente_nombre: "LAB", precio_unitario_inicial: 100,
        pax_adultos: 10, precio_motivo_inicial: "Inicial",
      } }) },
      "@/lib/catering/precio-historial-validation": {},
      "@/lib/catering/item-validation": {}, "@/lib/catering/queries": {},
      "@/lib/pagos/validation": {}, "@/lib/egresos/validation": {},
      "@/lib/roles/access": { requireScreenManagement: async () => {} },
      "@/lib/supabase/errors": { logSupabaseError() {} },
      "@/lib/supabase/server": { createClient: async () => ({
        rpc: async (name: string, args: { p_precio: number; p_contrato: Record<string, unknown> }) => {
          calls++;
          assert.equal(name, "crear_catering_con_precio");
          assert.equal(args.p_precio, 100);
          assert.equal(args.p_contrato.pax_adultos, 10);
          assert.equal("total_con_iva" in args.p_contrato, false);
          return { data: failure ? null : "contract", error: failure ? { code: "23514" } : null };
        },
      }) },
    });
    if (failure) {
      const result = await loaded.createCateringAction({}, new FormData()) as { formError: string; fields: unknown };
      assert.ok(result.formError);
      assert.equal(result.fields, state.fields);
    } else {
      await assert.rejects(loaded.createCateringAction({}, new FormData()), /\/catering\/contract\?created=1/);
    }
    assert.equal(calls, 1);
  }
});

test("recotización realiza una escritura; el trigger guarda PAX y total o revierte todo", async () => {
  for (const failure of [false, true]) {
    let writes = 0;
    const state = { fields: { precio_unitario: "110" }, errors: {} };
    const loaded = loadModule("src/app/(protected)/catering/actions.ts", {
      "next/cache": { revalidatePath() { assert.equal(failure, false); } }, "next/navigation": {},
      "@/lib/auth": { getCurrentProfile: async () => ({ id: "user", activo: true }) },
      "@/lib/catering/validation": {},
      "@/lib/catering/precio-historial-validation": { validatePrecioHistorialForm: () => ({
        state, payload: { precio_unitario: 110, pax_adultos: 11 },
      }) },
      "@/lib/catering/item-validation": {}, "@/lib/catering/queries": {},
      "@/lib/pagos/validation": {}, "@/lib/egresos/validation": {},
      "@/lib/roles/access": { requireScreenManagement: async () => {} },
      "@/lib/supabase/errors": { logSupabaseError() {} },
      "@/lib/supabase/server": { createClient: async () => ({ from: (table: string) => {
        assert.equal(table, "catering_precio_historial");
        return { insert: async () => { writes++; return { error: failure ? { code: "23514" } : null }; } };
      } }) },
    });
    const result = await loaded.addPrecioHistorialAction("contract", {}, new FormData()) as { formError?: string; successMessage?: string; fields: unknown };
    assert.equal(Boolean(result.formError), failure);
    assert.equal(Boolean(result.successMessage), !failure);
    if (failure) assert.equal(result.fields, state.fields);
    assert.equal(writes, 1);
  }
});
