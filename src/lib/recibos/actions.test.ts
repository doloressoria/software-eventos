import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import test from "node:test";
import ts from "typescript";
import { reciboPath } from "./types";

test("acción emite sólo después de autorización, conserva errores y redirige al recibo persistido", async () => {
  const scope = { kind: "eventos" as const, id: "event", pagoId: "payment" };
  let permitted = true, fail = false, writes = 0;
  const exports: { emitirReciboAction?: (input: typeof scope) => Promise<{ error?: string }> } = {};
  runInNewContext(ts.transpileModule(readFileSync("src/lib/recibos/actions.ts", "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText,
    { exports, require: (name: string) => ({
      "next/navigation": { redirect: (path: string) => { throw new Error(`REDIRECT:${path}`); } },
      "../supabase/server": { createClient: async () => ({ rpc: async (rpc: string, args: { p_pago: string }) => {
        writes++; assert.equal(rpc, "emitir_recibo"); assert.equal(args.p_pago, scope.pagoId);
        return { data: "receipt", error: fail ? { code: "42501", message: "PRIVATE" } : null };
      } }) },
      "./data": { loadReciboContext: async () => { if (!permitted) throw new Error("PRIVATE"); } },
      "./types": { reciboPath },
    } as Record<string, unknown>)[name] });
  permitted = false;
  assert.ok((await exports.emitirReciboAction!(scope)).error);
  assert.equal(writes, 0);
  permitted = true; fail = true;
  assert.ok(!(await exports.emitirReciboAction!(scope)).error?.includes("PRIVATE"));
  fail = false;
  await assert.rejects(exports.emitirReciboAction!(scope), /REDIRECT:\/eventos\/event\/ingresos\/recibos\/payment/);
  assert.equal(writes, 2);
});
