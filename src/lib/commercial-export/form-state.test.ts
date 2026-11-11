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

test("botón de historial descarga la ruta del evento y respeta borradores y guardados", async () => {
  for (const scenario of ["download", "saving", "cancel"] as const) {
    const requests: string[] = [];
    let clicks = 0;
    const errors: unknown[] = [];
    const exports: Record<string, (props: unknown) => { props: { children: { props: { children: string; onClick: () => Promise<void> } }[] } }> = {};
    runInNewContext(ts.transpileModule(readFileSync("src/components/commercial-export.tsx", "utf8"), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
    }).outputText, {
      exports, setTimeout: () => 1, encodeURIComponent,
      window: { confirm: () => false },
      URL: { createObjectURL: () => "blob:test", revokeObjectURL: () => {} },
      document: { createElement: () => ({ click: () => { clicks++; }, remove: () => {} }), body: { appendChild: () => {} } },
      fetch: async (url: string) => { requests.push(url); return {
        ok: true, redirected: false, blob: async () => ({}),
        headers: { get: (name: string) => name === "content-type" ? "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" : 'attachment; filename="pagos-demo.xlsx"' },
      }; },
      require: (name: string) => {
        if (name === "react") return { createContext: () => ({}), useState: (v: unknown) => [v, (n: unknown) => { errors.push(n); }],
          useContext: () => ({ isSaving: () => scenario === "saving", hasChanges: () => scenario === "cancel", pending: false }) };
        if (name === "react/jsx-runtime") return { jsx: (type: unknown, props: unknown) => ({ type, props }), jsxs: (type: unknown, props: unknown) => ({ type, props }) };
        if (name === "@/components/ui/button") return { buttonVariants: () => "button" };
        assert.equal(name, "@/components/ui/alert"); return {};
      },
    });
    const button = exports.ExportExcelButton({ kind: "pagos", id: "event-id" }).props.children[0].props;
    assert.equal(button.children, "Descargar detalle de pagos");
    await button.onClick();
    assert.equal(clicks, scenario === "download" ? 1 : 0);
    assert.deepEqual(requests, scenario === "download" ? ["/eventos/event-id/ingresos/excel"] : []);
    if (scenario === "saving") assert.ok(errors.some((e) => typeof e === "string" && e.includes("guardado")));
  }
});
