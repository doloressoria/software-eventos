import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import test from "node:test";
import ts from "typescript";
import { ExportError } from "../commercial-export/types";
import { exampleRecibo } from "./fixtures";
import { buildReciboPdf } from "./pdf";
import * as types from "./types";

function load(file: string, dependencies: Record<string, unknown>) {
  const exports: Record<string, (...args: unknown[]) => Promise<Response>> = {};
  runInNewContext(ts.transpileModule(readFileSync(file,"utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText,
    { exports, Response, Uint8Array, URL, require: (name: string) => { assert.ok(name in dependencies, name); return dependencies[name]; } });
  return exports;
}
const scope = { kind: "eventos", id: "event", pagoId: "payment" };
test("PDF privado, descarga del emitido y rechazo de documentos ajenos o sin emitir", async () => {
  const sample = exampleRecibo();
  let documents = [sample.recibo];
  const response = load("src/lib/recibos/response.ts", {
    "server-only": {}, "../supabase/server": { createClient: async () => ({}) }, "../commercial-export/types": { ExportError },
    "./data": { loadReciboContext: async () => ({ documents, snapshot: sample.snapshot }) }, "./pdf": { buildReciboPdf }, "./types": types,
  }).reciboPdfResponse;
  const get = (query: string) => response(new Request(`https://example.invalid/pdf${query}`), scope);
  const downloaded = await get(`?comprobante=${sample.recibo.id}&descargar=1`);
  assert.equal(downloaded.status, 200);
  assert.match(downloaded.headers.get("cache-control")!, /private, no-store/);
  assert.equal(downloaded.headers.get("vary"), "Cookie");
  assert.match(downloaded.headers.get("content-disposition")!, /attachment; filename="REC-00000001.pdf"/);
  assert.equal(downloaded.headers.get("content-type"), "application/pdf");
  assert.equal((await get("?comprobante=otro")).status, 404);
  documents = [];
  assert.equal((await get("?descargar=1")).status, 409);
  assert.match((await get("")).headers.get("content-disposition")!, /inline/);
});
test("errores PDF no revelan DB y rutas conservan alcance evento/catering", async () => {
  for (const error of [new ExportError(403, "Sin permiso"),new Error("PRIVATE_DATA")]) {
    const response = load("src/lib/recibos/response.ts", { "server-only": {}, "../supabase/server": { createClient: async () => ({}) }, "../commercial-export/types": { ExportError },
      "./data": { loadReciboContext: async () => { throw error; } }, "./pdf": {}, "./types": {} }).reciboPdfResponse;
    const result = await response(new Request("https://example.invalid"), scope);
    assert.equal(result.status, error instanceof ExportError ? 403 : 500);
    assert.ok(!(await result.text()).includes("PRIVATE_DATA"));
  }
  for (const kind of ["eventos", "catering"]) {
    const route = load(`src/app/(protected)/${kind}/[id]/ingresos/recibos/[pagoId]/pdf/route.ts`, { "@/lib/recibos/response": {
      reciboPdfResponse: async (_request: Request, input: types.ReciboScope) => { assert.equal(input.kind, kind); assert.equal(input.id, "x"); assert.equal(input.pagoId, "y"); return new Response(); },
    } });
    await route.GET(new Request("https://example.invalid"), { params: Promise.resolve({ id: "x", pagoId: "y" }) });
  }
});
