import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { runInNewContext } from "node:vm";
import ts from "typescript";

function setup(options: {
  active?: boolean;
  authorized?: boolean;
  permissionDenied?: boolean;
  estado?: string;
  fecha?: string | null;
  missing?: boolean;
  conflict?: boolean;
  error?: boolean;
} = {}) {
  const writes: Record<string, unknown>[] = [];
  const filters: unknown[][] = [];
  const invalidations: string[] = [];
  let updating = false;
  let reads = 0;
  const evento = {
    id: "evento", estado: options.estado ?? "borrador",
    fecha_confirmacion_presupuesto: options.fecha ?? null,
    updated_at: "2026-11-10T20:00:00Z",
  };
  const query = {
    select() { return query; },
    eq(...args: unknown[]) { if (updating) filters.push(args); return query; },
    is(...args: unknown[]) { if (updating) filters.push(args); return query; },
    update(payload: Record<string, unknown>) { updating = true; writes.push(payload); return query; },
    async maybeSingle() {
      if (!updating) { reads++; return { data: options.missing ? null : evento, error: null }; }
      return { data: options.conflict || options.error ? null : { id: evento.id }, error: options.error ? { code: "42501" } : null };
    },
  };
  const dependencies: Record<string, unknown> = {
    "next/cache": { revalidatePath: (path: string) => invalidations.push(path) },
    "next/navigation": { redirect: (path: string) => { throw new Error(`redirect:${path}`); } },
    "@/lib/auth": {
      getCurrentProfile: async () => ({ activo: options.active ?? true }),
      getAuthorizedActiveEvento: async () => {
        if (options.permissionDenied) throw new Error("forbidden");
        return options.authorized === false ? null : { id: evento.id };
      },
    },
    "@/lib/supabase/server": { createClient: async () => ({ from: (table: string) => { assert.equal(table, "eventos"); return query; } }) },
    "@/lib/supabase/errors": { logSupabaseError() {} },
    "@/lib/eventos/validation": { getTodayInputValue: () => "2026-11-10" },
    "@/lib/eventos/types": {},
    "@/lib/precios-servicios/precios-mensuales": {},
    "@/lib/roles/access": {},
    "@/lib/contactos/validation": {},
  };
  const exports: { confirmarEventoAction?: (id: string, state: object, form: FormData) => Promise<{ formError?: string }> } = {};
  const source = ts.transpileModule(readFileSync("src/app/(protected)/eventos/actions.ts", "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  runInNewContext(source, { exports, require: (name: string) => { assert.ok(name in dependencies, name); return dependencies[name]; } });
  return { run: () => exports.confirmarEventoAction!("evento", {}, new FormData()), writes, filters, invalidations, reads: () => reads };
}

test("confirmar solo cambia estado y fecha, conserva fechas previas y actualiza las pantallas", async () => {
  for (const fecha of [null, "2026-10-15"]) {
    const s = setup({ fecha });
    await assert.rejects(s.run, /redirect:\/eventos\/evento\?confirmed=1/);
    assert.equal(JSON.stringify(s.writes), JSON.stringify([{
      estado: "confirmado", fecha_confirmacion_presupuesto: fecha ?? "2026-11-10",
    }]));
    assert.deepEqual(s.filters, [["id", "evento"], ["estado", "borrador"], ["updated_at", "2026-11-10T20:00:00Z"], ["deleted_at", null]]);
    assert.deepEqual(s.invalidations, ["/eventos", "/dashboard", "/reportes", "/admin/actualizaciones-ipc"]);
  }
});

test("rechaza usuarios inactivos, sin permiso de gestión o sin acceso al salón antes de leer y escribir", async () => {
  const inactive = setup({ active: false });
  await assert.rejects(inactive.run, /redirect:\/dashboard/);
  const denied = setup({ permissionDenied: true });
  await assert.rejects(denied.run, /forbidden/);
  const unassigned = setup({ authorized: false });
  assert.ok((await unassigned.run()).formError);
  for (const s of [inactive, denied, unassigned]) {
    assert.equal(s.reads(), 0);
    assert.equal(s.writes.length, 0);
    assert.equal(s.invalidations.length, 0);
  }
});

test("no confirma eventos ausentes, ya confirmados, realizados o cancelados", async () => {
  for (const options of [{ missing: true }, ...["confirmado", "realizado", "cancelado"].map((estado) => ({ estado }))]) {
    const s = setup(options);
    assert.ok((await s.run()).formError);
    assert.equal(s.writes.length, 0);
    assert.equal(s.invalidations.length, 0);
  }
});

test("un error SQL o un cambio concurrente no anuncia éxito ni invalida páginas", async () => {
  for (const options of [{ error: true }, { conflict: true }]) {
    const s = setup(options);
    assert.ok((await s.run()).formError);
    assert.equal(s.invalidations.length, 0);
  }
});
