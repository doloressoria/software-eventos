import assert from "node:assert/strict";
import test from "node:test";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../../types/database.types";
import { allRows, loadCommercialExport } from "./data";
import { exampleCatering, exampleEvent, fixtureId } from "./fixtures";
import { ExportError } from "./types";

function database({ screens = ["eventos", "catering"], active = true, authenticated = true, denied = "", failure = "" }: {
  screens?: readonly string[]; active?: boolean; authenticated?: boolean; denied?: string; failure?: string;
} = {}) {
  const event = exampleEvent();
  const catering = exampleCatering();
  const reads: string[] = [];
  const selections: string[] = [];
  const rows: Record<string, object[]> = {
    usuarios: [{ id: fixtureId(99), rol: "vendedor", activo: active }], eventos: [event.event],
    evento_servicios: event.services, pagos: [...event.payments, ...catering.payments.map((p) => ({ ...p, id: `contract-${p.id}` }))],
    catering_contratos: [catering.catering], catering_items: catering.items, catering_precio_historial: catering.history,
    evento_contactos: event.contacts.map((c) => ({ ...c, evento_id: event.event.id, deleted_at: null })), actualizaciones_ipc: event.updates,
  };
  const client = {
    auth: { getUser: async () => ({ data: { user: authenticated ? { id: fixtureId(99) } : null }, error: null }) },
    rpc: async (name: string) => { assert.equal(name, "current_user_permissions"); return { data: screens.map((screen) => ({ screen, can_manage: false })), error: null }; },
    from(table: string) {
      reads.push(table);
      let values = (denied === table ? [] : rows[table] ?? []) as Record<string, unknown>[];
      const chain = {
        select: (selection: string) => { selections.push(selection); return chain; },
        eq: (key: string, value: unknown) => { values = values.filter((r) => r[key] === value); return chain; },
        in: (key: string, options: unknown[]) => { values = values.filter((r) => options.includes(r[key])); return chain; },
        is: (key: string, value: unknown) => { values = values.filter((r) => (r[key] ?? null) === value); return chain; },
        not: (key: string, op: string, value: unknown) => { assert.equal(op, "is"); values = values.filter((r) => (r[key] ?? null) !== value); return chain; },
        order: () => chain,
        range: (start: number, end: number) => { values = values.slice(start, end + 1); return chain; },
        maybeSingle: async () => ({ data: values[0] ?? null, error: failure === table ? {} : null }),
        then: (resolve: (value: unknown) => unknown) => Promise.resolve({ data: values, error: failure === table ? {} : null }).then(resolve),
      };
      return chain;
    },
  } as unknown as SupabaseClient<Database>;
  return { client, reads, selections, event, catering };
}

test("exportar evento sin permiso catering no consulta contratos ni sus pagos ni vistas", async () => {
  const db = database({ screens: ["eventos"] });
  const data = await loadCommercialExport(db.client, "evento", db.event.event.id);
  assert.equal(data.kind, "evento");
  if (data.kind !== "evento") return;
  assert.equal(data.cateringAllowed, false);
  assert.deepEqual(data.caterings, []);
  assert.ok(data.payments.every((p) => !p.catering_contrato_id));
  assert.ok(!db.reads.includes("catering_contratos"));
  assert.ok(!db.reads.some((r) => r.startsWith("v_")));
});

test("catering sin permiso evento no lee fila, contactos ni joins del evento", async () => {
  const db = database({ screens: ["catering"] });
  const data = await loadCommercialExport(db.client, "catering", db.catering.catering.id);
  assert.equal(data.kind, "catering");
  if (data.kind !== "catering") return;
  assert.equal(data.eventAllowed, false);
  assert.equal(data.event, null);
  assert.deepEqual(data.contacts, []);
  assert.ok(!db.reads.includes("eventos"));
  assert.ok(!db.reads.includes("evento_contactos"));
  assert.ok(!db.selections.some((s) => s.includes("eventos(")));
});

test("contratos filtrados por RLS no se recuperan mediante resúmenes", async () => {
  const db = database({ denied: "catering_contratos" });
  const data = await loadCommercialExport(db.client, "evento", db.event.event.id);
  assert.equal(data.kind, "evento");
  if (data.kind === "evento") assert.deepEqual(data.caterings, []);
  assert.ok(!db.reads.some((r) => r.startsWith("v_")));
});

test("sin sesión, usuario inactivo, pantalla denegada o registro inaccesible no se exporta", async () => {
  for (const [options, kind, id, status] of [
    [{ authenticated: false }, "evento", fixtureId(1), 401], [{ active: false }, "evento", fixtureId(1), 403],
    [{ screens: ["catering"] }, "evento", fixtureId(1), 403], [{ screens: ["eventos"] }, "catering", fixtureId(30), 403],
    [{ denied: "eventos" }, "evento", fixtureId(1), 404], [{ denied: "catering_contratos" }, "catering", fixtureId(30), 404],
  ] as const) {
    const db = database(options);
    await assert.rejects(loadCommercialExport(db.client, kind, id), (error: unknown) => error instanceof ExportError && error.status === status);
    assert.ok(!db.reads.includes("pagos"));
  }
});

test("fallo de una lectura requerida impide entregar un archivo incompleto", async () => {
  const db = database({ failure: "pagos" });
  await assert.rejects(loadCommercialExport(db.client, "evento", fixtureId(1)), /todos los datos/);
});

test("la paginación incluye más de 1000 registros y la página final exacta", async () => {
  const input = Array.from({ length: 1500 }, (_, i) => i);
  let calls = 0;
  const result = await allRows(async (start, end) => { calls++; return { data: input.slice(start, end + 1), error: null }; });
  assert.deepEqual(result, input);
  assert.equal(calls, 4);
  const capped = await allRows(async (start, end) => ({ data: input.slice(start, Math.min(end + 1, start + 100)), error: null }));
  assert.deepEqual(capped, input);
});
