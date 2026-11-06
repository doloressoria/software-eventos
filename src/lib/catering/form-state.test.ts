import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import test from "node:test";
import ts from "typescript";
import { getCateringFormStateFromCatering } from "./validation";

type Element = { props: Record<string, unknown> };
function findField(tree: unknown, id: string): Record<string, unknown> | undefined {
  if (Array.isArray(tree)) return tree.map(child => findField(child, id)).find(Boolean);
  if (!tree || typeof tree !== "object" || !("props" in tree)) return;
  const { props } = tree as Element;
  return props.id === id ? props : findField(props.children, id);
}

test("edición de catering recibe nuevos PAX guardados sin remontar los otros campos", () => {
  const states: unknown[] = [];
  let cursor = 0;
  let rerender = false;
  const exports: Record<string, (props: unknown) => unknown> = {};
  const jsx = (_type: unknown, props: Record<string, unknown>) => ({ props });
  runInNewContext(ts.transpileModule(readFileSync("src/components/catering/catering-form.tsx", "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  }).outputText, {
    exports,
    require: (name: string) => {
      if (name === "react") return {
        useActionState: (_action: unknown, initial: unknown) => {
          const index = cursor++;
          if (!(index in states)) states[index] = initial;
          return [states[index], () => {}, false];
        },
        useRef: () => ({ current: null }),
        useState: (initial: unknown) => {
          const index = cursor++;
          if (!(index in states)) states[index] = typeof initial === "function" ? initial() : initial;
          return [states[index], (value: unknown) => { states[index] = value; rerender = true; }];
        },
      };
      if (name === "react/jsx-runtime") return { jsx, jsxs: jsx };
      if (name === "@/components/commercial-export") return { useExportForm() {} };
      if (name === "@/components/ui/button") return { buttonVariants: () => "" };
      if (name === "@/lib/eventos/types") return { EVENT_TYPES: [] };
      assert.ok(name === "next/link" || name.startsWith("@/components/"), `Dependencia sin simular: ${name}`);
      return {};
    },
  });
  const initialState = getCateringFormStateFromCatering({ pax_adultos: 10 } as Parameters<typeof getCateringFormStateFromCatering>[0]);
  function render(state: typeof initialState) {
    let tree: unknown;
    do {
      rerender = false;
      cursor = 0;
      tree = exports.CateringForm({ initialState: state, mode: "edit", isLinkedToEvento: true, ejecutivas: [], lugares: [] });
    } while (rerender);
    return tree;
  }
  assert.equal(findField(render(initialState), "pax_adultos")?.value, "10");
  const updated = { ...initialState, fields: { ...initialState.fields, pax_adultos: "12" } };
  const tree = render(updated);
  assert.equal(findField(tree, "pax_adultos")?.value, "12");
  assert.equal(findField(tree, "notas")?.defaultValue, initialState.fields.notas);
  assert.equal(findField(render(updated), "pax_adultos")?.value, "12");
});
