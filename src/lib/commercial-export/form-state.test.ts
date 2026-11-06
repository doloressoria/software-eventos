import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import test from "node:test";
import ts from "typescript";

test("exportación espera la sincronización de selects y conserva la detección de borradores", () => {
  const frames = new Map<number, () => void>();
  let nextFrame = 0;
  const exports: Record<string, (...args: unknown[]) => { props: { value: {
    register: (ref: unknown) => () => void;
    hasChanges: () => boolean;
    isSaving: () => boolean;
    update: (ref: unknown, pending: boolean, saved: boolean) => void;
  } } }> = {};
  runInNewContext(ts.transpileModule(readFileSync("src/components/commercial-export.tsx", "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  }).outputText, {
    exports,
    FormData: class {
      constructor(form: { entries: [string, string][] }) { return form.entries; }
    },
    requestAnimationFrame: (callback: () => void) => { frames.set(++nextFrame, callback); return nextFrame; },
    cancelAnimationFrame: (id: number) => frames.delete(id),
    require: (name: string) => {
      if (name === "react") return {
        createContext: () => ({ Provider: "provider" }), useRef: (current: unknown) => ({ current }),
        useState: (value: unknown) => [value, () => {}], useCallback: (fn: unknown) => fn,
        useMemo: (fn: () => unknown) => fn(),
      };
      if (name === "react/jsx-runtime") return { jsx: (type: unknown, props: unknown) => ({ type, props }) };
      assert.ok(["@/components/ui/button", "@/components/ui/alert"].includes(name), `Dependencia sin simular: ${name}`);
      return {};
    },
  });
  const scope = exports.ExportExcelScope({ children: null }).props.value;
  const form = { entries: [["servicio_id", "primer-option-temporal"], ["precio", "100"]] as [string, string][] };
  const ref = { current: form };
  const unregister = scope.register(ref);
  form.entries[0][1] = "";
  for (const callback of frames.values()) callback();
  assert.equal(scope.hasChanges(), false);
  form.entries.push(["$ACTION_REF_new", "react-metadata"]);
  assert.equal(scope.hasChanges(), false);
  form.entries[1][1] = "120";
  assert.equal(scope.hasChanges(), true);
  scope.update(ref, true, false);
  assert.equal(scope.isSaving(), true);
  scope.update(ref, false, false);
  assert.equal(scope.hasChanges(), true, "un error al guardar conserva el borrador");
  scope.update(ref, false, true);
  assert.equal(scope.hasChanges(), false);
  form.entries[1][1] = "130";
  assert.equal(scope.hasChanges(), true);
  unregister();
  assert.equal(scope.hasChanges(), false);
  assert.equal(frames.size, 0, "el desmontaje cancela el frame pendiente");
});
