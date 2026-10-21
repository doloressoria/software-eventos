import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import * as validation from "./validation";
import * as calculos from "./calculos";

function setup(catering: boolean, options: { denied?: boolean; failure?: boolean; external?: boolean } = {}) {
  const writes: { table: string; mode: string; values: Record<string, unknown>; filters: string[] }[] = [];
  const recalculated: string[] = [];
  const invalidations: string[] = [];
  const db = { from(table: string) {
    let write: typeof writes[number] | undefined;
    const filters: string[] = [];
    const chain = {
      insert(values: Record<string, unknown>) { write = { table, mode: "insert", values, filters }; writes.push(write); return chain; },
      update(values: Record<string, unknown>) { write = { table, mode: "update", values, filters }; writes.push(write); return chain; },
      select() { return chain; },
      eq(k: string, v: string) { filters.push(`${k}=${v}`); return chain; },
      is(k: string, v: unknown) { filters.push(`${k}=${v}`); return chain; },
      maybeSingle() { return chain; },
      then(resolve: (v: unknown) => unknown) {
        const data = options.denied ? null : table === "catering_contratos" ? { id: "contract", evento_id: options.external ? null : "event" } : { id: "payment", evento_servicio_id: "old-service" };
        return Promise.resolve({ data, error: write && options.failure ? { code: "23514" } : null }).then(resolve);
      },
    };
    return chain;
  } };
  const dependencies: Record<string, unknown> = {
    "next/cache": { revalidatePath: (path: string) => invalidations.push(path) },
    "next/navigation": { redirect() { throw new Error("redirect"); } },
    "@/lib/auth": { getCurrentProfile: async () => ({ id: "actor", activo: true }), getAuthorizedActiveEvento: async () => options.denied ? null : { id: "event" } },
    "@/lib/pagos/validation": validation,
    "@/lib/pagos/calculos": calculos,
    "@/lib/evento-servicios/recalculate-totals": { recalculateEventoServicioTotals: async (id: string) => recalculated.push(id) },
    "@/lib/catering/recalculate-totals": { recalculateCateringTotals: async (id: string) => recalculated.push(id) },
    "@/lib/roles/access": { requireScreenManagement: async () => {} },
    "@/lib/supabase/server": { createClient: async () => db },
    "@/lib/supabase/errors": { logSupabaseError() {} },
    "@/lib/catering/validation": {}, "@/lib/catering/precio-historial-validation": {}, "@/lib/catering/item-validation": {}, "@/lib/catering/queries": {}, "@/lib/egresos/validation": {},
  };
  const exports: Record<string, (...args: unknown[]) => Promise<validation.PagoFormState>> = {};
  const source = ts.transpileModule(readFileSync(`src/app/(protected)/${catering ? "catering" : "pagos"}/actions.ts`, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  runInNewContext(source, { exports, Date, require: (name: string) => { assert.ok(name in dependencies, name); return dependencies[name]; } });
  return { exports, writes, recalculated, invalidations };
}

function form() {
  const data = new FormData();
  for (const [k,v] of Object.entries({ ...validation.getEmptyPagoFormState().fields, monto: "100.25", moneda: "USD", tipo_cambio: "1200.1234", forma_pago: "transferencia", banco: "Banco histórico", evento_servicio_id: "service", es_garantia: "on" })) data.set(k,v);
  return data;
}

for (const mode of ["evento", "catering asociado", "catering externo"]) {
  const catering = mode !== "evento";
  test(`${mode}: alta y edición escriben orígenes, conservan garantía/banco y recalculan`, async () => {
    for (const editing of [false, true]) {
      const s = setup(catering, { external: mode === "catering externo" });
      const name = `${editing ? "update" : "create"}${catering ? "Catering" : ""}PagoAction`;
      const args = [catering ? "contract" : "event", ...(editing ? ["payment"] : []), validation.getEmptyPagoFormState(), form()];
      const result = await s.exports[name](...args);
      assert.ok(result.successMessage);
      const write = s.writes.find(w => w.table === "pagos")!;
      assert.equal(write.values.importe_moneda_original, 100.25);
      assert.equal(write.values.tipo_cambio, 1200.1234);
      assert.equal(write.values.moneda, "USD");
      assert.equal(write.values.banco, "Banco histórico");
      assert.equal(write.values.es_garantia, true);
      assert.equal("importe_en_pesos" in write.values, false);
      if (editing) {
        assert.ok(write.filters.includes("id=payment"));
        assert.ok(write.filters.includes("deleted_at=null"));
        assert.ok(write.filters.includes(catering ? "catering_contrato_id=contract" : "evento_id=event"));
        assert.equal("registrado_por" in write.values, false);
      }
      if (mode === "catering externo") assert.equal(write.values.evento_id, null);
      assert.ok(s.recalculated.includes(catering ? "contract" : "service"));
      if (!catering && editing) assert.ok(s.recalculated.includes("old-service"));
    }
  });
  test(`${mode}: acceso denegado no escribe; error SQL conserva el borrador`, async () => {
    const action = `update${catering ? "Catering" : ""}PagoAction`;
    for (const denied of [true, false]) {
      const s = setup(catering, { denied, failure: !denied });
      const result = await s.exports[action](catering ? "contract" : "event", "payment", validation.getEmptyPagoFormState(), form());
      assert.ok(result.formError);
      assert.equal(result.fields.tipo_cambio, "1200.1234");
      assert.equal(s.recalculated.length, 0);
      assert.equal(s.invalidations.length, 0);
      if (denied) assert.equal(s.writes.length, 0);
    }
  });
  test(`${mode}: baja usa destino autorizado y recalcula`, async () => {
    const s = setup(catering);
    await s.exports[`delete${catering ? "Catering" : ""}PagoAction`](catering ? "contract" : "event", "payment", {}, new FormData());
    const write = s.writes.find(w => w.table === "pagos")!;
    assert.ok(write.values.deleted_at);
    assert.equal(Object.keys(write.values).length, 1);
    assert.ok(s.recalculated.includes(catering ? "contract" : "old-service"));
  });
}
