import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import * as validation from "./validation";
import * as calculos from "./calculos";

function setup(catering: boolean, options: { denied?: boolean; failure?: boolean; external?: boolean } = {}) {
  const writes: { table: string; mode: string; values: Record<string, unknown>; filters: string[] }[] = [];
  const invalidations: string[] = [];
  const db = {
    rpc(name: string, values: Record<string, unknown>) {
      writes.push({ table: name, mode: "rpc", values, filters: [] });
      return Promise.resolve({ data: options.failure ? null : "payment", error: options.failure ? { code: "23514" } : null });
    },
    from(table: string) {
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
    "@/lib/roles/access": { requireScreenManagement: async () => {} },
    "@/lib/supabase/server": { createClient: async () => db },
    "@/lib/supabase/errors": { logSupabaseError() {} },
    "@/lib/catering/validation": {}, "@/lib/catering/precio-historial-validation": {}, "@/lib/catering/item-validation": {}, "@/lib/catering/queries": {}, "@/lib/egresos/validation": {},
  };
  const exports: Record<string, (...args: unknown[]) => Promise<validation.PagoFormState>> = {};
  const source = ts.transpileModule(readFileSync(`src/app/(protected)/${catering ? "catering" : "pagos"}/actions.ts`, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  runInNewContext(source, { exports, Date, require: (name: string) => { assert.ok(name in dependencies, name); return dependencies[name]; } });
  return { exports, writes, invalidations };
}

function form() {
  const data = new FormData();
  for (const [k,v] of Object.entries({ ...validation.getEmptyPagoFormState().fields, monto: "100.25", moneda: "USD", tipo_cambio: "1200.1234", forma_pago: "transferencia", banco: "Banco histórico", es_garantia: "on" })) data.set(k,v);
  data.set("solicitud", "00000000-0000-4000-8000-000000000001");
  data.append("destino", "servicio:00000000-0000-4000-8000-000000000002");
  data.append("importe_ars", "60000");
  data.append("destino", "catering:00000000-0000-4000-8000-000000000003");
  data.append("importe_ars", (validation.paymentEquivalent("100.25", "1200.1234")! - 60000).toFixed(2));
  return data;
}

for (const mode of ["evento", "catering asociado", "catering externo"]) {
  const catering = mode !== "evento";
  test(`${mode}: alta y edición escriben orígenes y conservan garantía/banco`, async () => {
    for (const editing of [false, true]) {
      const s = setup(catering, { external: mode === "catering externo" });
      const name = `${editing ? "update" : "create"}${catering ? "Catering" : ""}PagoAction`;
      const args = [catering ? "contract" : "event", ...(editing ? ["payment"] : []), validation.getEmptyPagoFormState(), form()];
      const result = await s.exports[name](...args);
      assert.ok(result.successMessage);
      const [write] = s.writes;
      assert.equal(s.writes.length, 1);
      assert.equal(write.table, catering ? "pagos" : "guardar_pago_distribuido");
      const header = catering ? write.values : write.values.p_cabecera as Record<string, unknown>;
      assert.equal(header.importe_moneda_original, 100.25);
      assert.equal(header.tipo_cambio, 1200.1234);
      assert.equal(header.moneda, "USD");
      assert.equal(header.banco, "Banco histórico");
      assert.equal(header.es_garantia, true);
      assert.equal("importe_en_pesos" in header, false);
      if (!catering) {
        assert.equal(write.values.p_evento, "event");
        assert.equal(write.values.p_editar, editing);
        assert.equal(write.values.p_pago, editing ? "payment" : form().get("solicitud"));
        assert.equal((write.values.p_imputaciones as unknown[]).length, 2);
      } else if (editing) {
        assert.ok(write.filters.includes("id=payment"));
        assert.ok(write.filters.includes("deleted_at=null"));
        assert.ok(write.filters.includes("catering_contrato_id=contract"));
        assert.equal("registrado_por" in header, false);
      }
      if (mode === "catering externo") assert.equal(header.evento_id, null);
    }
  });
  test(`${mode}: acceso denegado no escribe; error SQL conserva el borrador`, async () => {
    const action = `update${catering ? "Catering" : ""}PagoAction`;
    for (const denied of [true, false]) {
      const s = setup(catering, { denied, failure: !denied });
      const result = await s.exports[action](catering ? "contract" : "event", "payment", validation.getEmptyPagoFormState(), form());
      assert.ok(result.formError);
      assert.equal(result.fields.tipo_cambio, "1200.1234");
      assert.equal(s.invalidations.length, 0);
      if (denied) assert.equal(s.writes.length, 0);
    }
  });
  test(`${mode}: baja usa destino autorizado`, async () => {
    const s = setup(catering);
    await s.exports[`delete${catering ? "Catering" : ""}PagoAction`](catering ? "contract" : "event", "payment", {}, new FormData());
    const write = s.writes.find(w => w.table === "pagos")!;
    assert.ok(write.values.deleted_at);
    assert.equal(Object.keys(write.values).length, 1);
    assert.deepEqual(s.writes.map(w => w.table), ["pagos"]);
  });
}

test("el servidor no envía la RPC si falta un centavo", async () => {
  const s = setup(false);
  const data = form();
  data.delete("importe_ars");
  data.append("importe_ars", "60000");
  data.append("importe_ars", (validation.paymentEquivalent("100.25", "1200.1234")! - 60000.01).toFixed(2));
  const result = await s.exports.createPagoAction("event", validation.getEmptyPagoFormState(), data);
  assert.match(result.formError ?? "", /al centavo/);
  assert.equal(result.imputaciones?.length, 2);
  assert.equal(s.writes.length, 0);
});
