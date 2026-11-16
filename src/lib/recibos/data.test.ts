import assert from "node:assert/strict";
import test from "node:test";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../../types/database.types";
import { loadReciboContext } from "./data";
import { exampleRecibo } from "./fixtures";
import { reciboPath } from "./types";

const scope = { kind: "eventos" as const, id: "00000000-0000-4000-8000-000000000001", pagoId: "00000000-0000-4000-8000-000000000002" };
function fake({ auth = true, event = scope.id, catering = null as string | null, documents = false, rpcCode = null as string | null, fail = false } = {}) {
  const sample = exampleRecibo();
  let previews = 0;
  const client = {
    auth: { getUser: async () => ({ data: { user: auth ? { id: "test-user" } : null }, error: null }) },
    from: (table: string) => {
      const query = {
        select: () => query, eq: () => query, order: () => query,
        maybeSingle: async () => ({ data: { id: scope.pagoId, evento_id: event, catering_contrato_id: catering, deleted_at: null }, error: null }),
        range: async (start: number) => ({ data: start === 0 && documents ? [sample.recibo] : [], error: fail ? new Error("private") : null }),
      };
      assert.ok(["pagos", "recibos"].includes(table)); return query;
    },
    rpc: async () => { previews++; return { data: sample.snapshot, error: rpcCode ? { code: rpcCode } : null }; },
  };
  return { client: client as unknown as SupabaseClient<Database>, previews: () => previews };
}
test("contexto exige sesión, pertenencia y permiso completo en RPC; no entrega repartos parciales", async () => {
  await assert.rejects(loadReciboContext(fake({ auth: false }).client, scope), { status: 401 });
  await assert.rejects(loadReciboContext(fake({ event: "otro" }).client, scope), { status: 404 });
  await assert.rejects(loadReciboContext(fake({ rpcCode: "42501" }).client, scope), { status: 403 });
  await assert.rejects(loadReciboContext(fake({ rpcCode: "23514" }).client, scope), { status: 422 });
  await assert.rejects(loadReciboContext(fake().client, { ...scope, id: "malformado" }), { status: 400 });
  const external = { kind: "catering" as const, id: scope.id, pagoId: scope.pagoId };
  await assert.rejects(loadReciboContext(fake({ catering: external.id }).client, external), { status: 404 });
  const allowed = await loadReciboContext(fake({ event: null as unknown as string, catering: external.id }).client, external);
  assert.equal(allowed.snapshot.version, 1);
});
test("re-descarga usa snapshot persistido y aborta si falla lectura de documentos", async () => {
  const f = fake({ documents: true });
  const result = await loadReciboContext(f.client, scope);
  assert.equal(result.documents.length, 1);
  assert.equal(f.previews(), 0, "no recalcula una instantánea emitida");
  await assert.rejects(loadReciboContext(fake({ fail: true }).client, scope), { status: 500 });
  assert.equal(reciboPath(scope), `/eventos/${scope.id}/ingresos/recibos/${scope.pagoId}`);
});
