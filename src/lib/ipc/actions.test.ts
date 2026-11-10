import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import * as validation from "./validation";

function setup(options: { denied?: boolean; error?: string; count?: number } = {}) {
  const calls: { name: string; args: Record<string, unknown>; range?: number[] }[] = [];
  const rows = Array.from({ length: options.count ?? 1 }, (_, i) => ({
    evento_id: "event", evento_servicio_id: String(i), catering_contrato_id: null,
    evento_nombre: "Evento ficticio", destino_nombre: "Servicio", saldo_anterior: 40000,
    incremento: 4000, saldo_proyectado: 44000,
  }));
  const invalidations: string[] = [];
  const response = (data: unknown) => ({ data: options.error ? null : data, error: options.error ? { code: options.error } : null });
  const deps: Record<string, unknown> = {
    "next/cache": { revalidatePath: (path: string) => invalidations.push(path) },
    "@/lib/auth/require-admin": { requireAdmin: async () => { if (options.denied) throw new Error("denied"); } },
    "@/lib/ipc/validation": validation,
    "@/lib/supabase/errors": { logSupabaseError() {} },
    "@/lib/supabase/server": { createClient: async () => ({
      rpc(name: string, args: Record<string, unknown>) {
        const call = { name, args } as typeof calls[number];
        calls.push(call);
        return {
          range(start: number, end: number) { call.range = [start, end]; return Promise.resolve(response(rows.slice(start, end + 1))); },
          then(resolve: (value: unknown) => unknown) { return Promise.resolve(response("schedule")).then(resolve); },
        };
      },
    }) },
  };
  const exports: { ipcAction?: (state: validation.IpcFormState, data: FormData) => Promise<validation.IpcFormState> } = {};
  const source = ts.transpileModule(readFileSync("src/app/(protected)/admin/actualizaciones-ipc/actions.ts", "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  runInNewContext(source, { exports, require: (name: string) => { assert.ok(name in deps, name); return deps[name]; } });
  const form = new FormData();
  form.set("periodo", "2026-10");
  form.set("fecha_vigencia", validation.getArgentinaDate());
  form.set("variacion_porcentual", "10");
  return { run: () => exports.ipcAction!(validation.getEmptyIpcFormState(), form), form, calls, invalidations };
}

test("preview no escribe y recorre todas las páginas sin truncar más de mil destinos", async () => {
  const s = setup({ count: 1001 });
  const result = await s.run();
  assert.equal(result.preview?.length, 1001);
  assert.equal(result.preview?.at(-1)?.evento_servicio_id, "1000");
  assert.equal(JSON.stringify(s.calls.map((c) => c.range)), "[[0,499],[500,999],[1000,1499]]");
  assert.ok(s.calls.every((c) => c.name === "previsualizar_ipc_programado"));
  assert.equal(s.invalidations.length, 0);
});
test("autorización y confirmación se validan antes de programar; el índice puede faltar", async () => {
  const denied = setup({ denied: true });
  await assert.rejects(denied.run, /denied/);
  assert.equal(denied.calls.length, 0);
  const s = setup();
  s.form.set("accion", "programar");
  assert.match((await s.run()).formError!, /Confirmá/);
  assert.equal(s.calls.length, 0);
  s.form.set("confirmar", "true");
  s.form.set("variacion_porcentual", "");
  assert.ok((await s.run()).successMessage);
  assert.equal(s.calls[0].name, "programar_ipc");
  assert.equal(s.calls[0].args.p_variacion_porcentual, null);
  assert.equal(s.calls[0].args.p_fecha_vigencia, validation.getArgentinaDate());
  assert.equal(s.calls[0].args.p_periodo, "2026-10-01");
});
test("índice faltante conserva formulario y explica por qué no se puede calcular", async () => {
  const s = setup({ error: "P0002" });
  const result = await s.run();
  assert.match(result.formError!, /Falta cargar el índice/);
  assert.equal(result.fields.periodo, "2026-10");
  assert.equal(result.preview, null);
  assert.equal(s.invalidations.length, 0);
});
