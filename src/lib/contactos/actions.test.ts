import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import * as validation from "./validation";

test("un error SQL conserva el borrador y la versión; no invalida páginas ni registra contactos", async () => {
  const contacts = [{ ...validation.nuevoContacto(), nombre: "Borrador", observaciones: "No perder" }];
  let attempts = 0;
  const exports: Record<string, (...args: unknown[]) => Promise<{
    contactos: validation.ContactoInput[]; version: string; error?: string; success?: string;
  }>> = {};
  const source = ts.transpileModule(readFileSync("src/app/(protected)/eventos/contactos-actions.ts", "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const dependencies: Record<string, unknown> = {
    "next/cache": { revalidatePath() { assert.fail("No hubo escritura confirmada"); } },
    "@/lib/auth": { getCurrentProfile: async () => ({ activo: true }) },
    "@/lib/contactos/queries": { getEventoContactos() { assert.fail("No debe reemplazar el borrador"); } },
    "@/lib/contactos/validation": validation,
    "@/lib/supabase/server": { createClient: async () => ({
      rpc: async (name: string, args: { p_contactos: unknown; p_version: string }) => {
        attempts++;
        assert.equal(name, "guardar_contactos_evento");
        assert.equal(args.p_version, "original");
        assert.equal(JSON.stringify(args.p_contactos), JSON.stringify(validation.contactosPayload(contacts)));
        return { error: { code: attempts === 1 ? "40001" : "23514" } };
      },
    }) },
  };
  runInNewContext(source, { exports, require: (name: string) => {
    assert.ok(name in dependencies);
    return dependencies[name];
  } });
  const form = new FormData();
  form.set("contactos", JSON.stringify(contacts));
  form.set("contactos_version", "original");
  const initial = { contactos: [], version: "original", contactoAnterior: "  Texto intacto  ", puedeEditar: true };
  for (let i = 0; i < 2; i++) {
    const result = await exports.guardarContactosAction("evento", initial, form);
    assert.equal(JSON.stringify(result.contactos), JSON.stringify(contacts));
    assert.equal(result.version, "original");
    assert.ok(result.error);
    assert.equal(result.success, undefined);
  }
});

test("evento no reescribe cliente_contacto ni acepta una colección ausente", () => {
  const exports: Record<string, (form: FormData, options: { mode: string }) => {
    payload: Record<string, unknown> | null; state: { contactosError?: string };
  }> = {};
  const source = ts.transpileModule(readFileSync("src/lib/eventos/validation.ts", "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  runInNewContext(source, { exports, require: (name: string) => {
    if (name === "../contactos/validation") return validation;
    if (name === "@/lib/eventos/types") return {};
    assert.fail(`Dependencia inesperada: ${name}`);
  } });
  const form = new FormData();
  for (const [name, value] of Object.entries({
    salon_id: "salon", cliente_nombre: "Prueba", fecha_evento: "2026-12-01",
    fecha_carga: "2026-10-21", estado: "borrador",
    cliente_contacto: "  Texto anterior\nNO interpretar  ", contactos: "[]",
  })) form.set(name, value);
  const result = exports.validateEventoForm(form, { mode: "edit" });
  assert.ok(result.payload);
  assert.equal("cliente_contacto" in result.payload, false);
  form.delete("contactos");
  const missing = exports.validateEventoForm(form, { mode: "edit" });
  assert.equal(missing.payload, null);
  assert.ok(missing.state.contactosError);
});
