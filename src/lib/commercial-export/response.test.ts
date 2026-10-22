import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import test from "node:test";
import ts from "typescript";
import * as XLSX from "xlsx";
import { exampleCatering } from "./fixtures";
import { ExportError } from "./types";
import { buildCommercialWorkbook, exportFilename } from "./workbook";
import { getDefaultScreenPath, getRequiredScreenPermission } from "../roles/permissions";

function load(path: string, dependencies: Record<string, unknown>) {
  const exports: Record<string, (...args: unknown[]) => Promise<Response>> = {};
  runInNewContext(ts.transpileModule(readFileSync(path, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText, { exports, Response, Uint8Array, require: (name: string) => {
    assert.ok(name in dependencies, `Dependencia sin simular: ${name}`); return dependencies[name];
  } });
  return exports;
}

test("respuesta XLSX privada contiene los resultados y no se almacena en caché compartida", async () => {
  const data = exampleCatering({ linked: false, paymentCount: 0 });
  const loaded = load("src/lib/commercial-export/response.ts", {
    "server-only": {}, "@/lib/supabase/server": { createClient: async () => ({}) },
    "./data": { loadCommercialExport: async () => data }, "./types": { ExportError },
    "./workbook": { buildCommercialWorkbook, exportFilename },
  });
  const response = await loaded.commercialExportResponse("catering", data.catering.id);
  assert.equal(response.status, 200);
  assert.match(response.headers.get("cache-control")!, /private, no-store/);
  assert.equal(response.headers.get("vary"), "Cookie");
  assert.match(response.headers.get("content-disposition")!, /attachment; filename="catering-00000000/);
  assert.match(response.headers.get("content-type")!, /spreadsheetml/);
  const book = XLSX.read(await response.arrayBuffer(), { type: "array" });
  assert.equal(book.Sheets.DC.B3.v, "Cliente externo de demostración");
});

test("errores preservan status y mensaje sin revelar detalles de la base", async () => {
  for (const error of [new ExportError(403, "Sin permiso"), new Error("SENSITIVE_DATABASE_ERROR")]) {
    const loaded = load("src/lib/commercial-export/response.ts", {
      "server-only": {}, "@/lib/supabase/server": { createClient: async () => ({}) },
      "./data": { loadCommercialExport: async () => { throw error; } }, "./types": { ExportError }, "./workbook": {},
    });
    const response = await loaded.commercialExportResponse("evento", "id");
    assert.equal(response.status, error instanceof ExportError ? 403 : 500);
    assert.ok(!(await response.text()).includes("SENSITIVE_DATABASE_ERROR"));
    assert.match(response.headers.get("cache-control")!, /no-store/);
  }
});

test("proxy devuelve JSON 401/403 en las descargas y conserva las cookies de sesión", async () => {
  for (const scenario of ["expired", "inactive", "wrong-screen"] as const) {
    let writtenCookies = 0;
    const loaded = load("src/proxy.ts", {
      "@/lib/supabase/middleware": { updateSession: async () => ({
        claims: scenario === "expired" ? null : { sub: "test-user" }, accessDenied: scenario === "inactive", isAdmin: false,
        permissions: [{ screen: "eventos", can_manage: false }], response: { cookies: { getAll: () => [{ name: "session", value: "refreshed" }] } },
      }) },
      "@/lib/roles/permissions": { getDefaultScreenPath, getRequiredScreenPermission },
      "next/server": { NextResponse: { json: (body: unknown, options: ResponseInit) => Object.assign(Response.json(body, options), { cookies: { set(name: string) { assert.equal(name, "session"); writtenCookies++; } } }) } },
    });
    const response = await loaded.proxy({ nextUrl: { pathname: "/catering/00000000-0000-4000-8000-000000000030/excel" } });
    assert.equal(response.status, scenario === "expired" ? 401 : 403);
    assert.match(response.headers.get("content-type")!, /application\/json/);
    assert.match(response.headers.get("cache-control")!, /no-store/);
    assert.equal(writtenCookies, 1);
  }
});
