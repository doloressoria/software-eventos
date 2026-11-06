import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import test from "node:test";
import ts from "typescript";

test("login usa POST nativo para no enviar contraseñas en la URL antes de hidratar", () => {
  const exports: Record<string, (props: unknown) => { props: { children: { type: string; props: { method?: string } }[] } }> = {};
  const jsx = (type: string, props: unknown) => ({ type, props });
  runInNewContext(ts.transpileModule(readFileSync("src/app/(auth)/login/login-form.tsx", "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  }).outputText, {
    exports,
    require: (name: string) => {
      if (name === "react") return { useState: (initial: unknown) => [initial, () => {}] };
      if (name === "react/jsx-runtime") return { jsx, jsxs: jsx };
      if (name === "next/navigation") return { useRouter: () => ({}) };
      assert.ok(["@/components/ui/button", "@/components/ui/form", "@/lib/supabase/client"].includes(name));
      return {};
    },
  });
  const form = exports.LoginForm({ redirectTo: "/dashboard" }).props.children.find(child => child?.type === "form");
  assert.equal(form?.props.method?.toLowerCase(), "post");
});
