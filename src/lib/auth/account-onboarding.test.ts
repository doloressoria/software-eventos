import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { validateNewPassword } from "./new-password";

function loadModule(path: string, globals: Record<string, unknown>) {
  const exports: Record<string, unknown> = {};
  const { outputText } = ts.transpileModule(readFileSync(path, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  });
  runInNewContext(outputText, { exports, ...globals });
  return exports;
}

test("el correo incluye únicamente el enlace de un uso generado para el destinatario", async () => {
  const env = {
    APP_URL: "https://eventos.example",
    RESEND_API_KEY: "test-key",
    USUARIOS_EMAIL_FROM: "no-reply@eventos.example",
  };
  const requests: Array<{ url: string; body: string }> = [];
  let ok = true;
  let linkUserId = "test-user";
  const { sendPasswordSetupEmail } = loadModule("src/lib/usuarios/welcome-email.ts", {
    require: (name: string) => {
      if (name === "server-only") return {};
      assert.equal(name, "@/lib/supabase/admin");
      return { createAdminClient: () => ({ auth: { admin: {
        generateLink: async ({ type, email }: { type: string; email: string }) => {
          assert.equal(type, "recovery");
          assert.equal(email, "usuario@example.com");
          return { data: { user: { id: linkUserId }, properties: { hashed_token: "test-hash" } } };
        },
      } } }) };
    },
    process: { env },
    URL,
    URLSearchParams,
    AbortSignal,
    fetch: async (url: string, options: RequestInit) => {
      requests.push({ url, body: String(options.body) });
      return { ok };
    },
  }) as { sendPasswordSetupEmail: (id: string, email: string) => Promise<boolean> };

  const send = () => sendPasswordSetupEmail("test-user", "usuario@example.com");
  assert.equal(await send(), true);
  assert.equal(requests[0].url, "https://api.resend.com/emails");
  const body = JSON.parse(requests[0].body);
  assert.deepEqual(body.to, ["usuario@example.com"]);
  assert.doesNotMatch(body.text, /contraseña temporal/i);
  assert.match(body.text, /^https:\/\/eventos\.example\/definir-contrasena#token_hash=test-hash$/m);

  ok = false;
  assert.equal(await send(), false);
  linkUserId = "other-user";
  assert.equal(await send(), false);
  env.RESEND_API_KEY = "";
  assert.equal(await send(), false);
  assert.equal(requests.length, 2);
});

test("el cambio usa la identidad de la sesión y verifica la contraseña antes de actualizar", async () => {
  const calls: Array<[string, unknown]> = [];
  const sessionUser = { email: "usuario@example.com" };
  let user: typeof sessionUser | null = sessionUser;
  let signInError: { code: string } | null = { code: "invalid_credentials" };
  const { changePasswordAction } = loadModule("src/app/(protected)/cambiar-contrasena/actions.ts", {
    TextEncoder,
    require: (name: string) => {
      if (name === "next/navigation") return { redirect: (path: string) => { throw new Error(path); } };
      if (name === "@/lib/auth/new-password") return { validateNewPassword };
      assert.equal(name, "@/lib/supabase/server");
      return { createClient: () => ({ auth: {
        getUser: async () => ({ data: { user } }),
        signInWithPassword: async (credentials: unknown) => {
          calls.push(["sign-in", credentials]);
          return { error: signInError };
        },
        updateUser: async (attributes: unknown) => {
          calls.push(["update", attributes]);
          return { error: null };
        },
      } }) };
    },
  }) as { changePasswordAction: (state: null, data: FormData) => Promise<unknown> };

  const formData = new FormData();
  formData.set("current_password", "Temporal123!");
  formData.set("password", "NuevaSegura123!");
  formData.set("confirmation", "Distinta123!");
  assert.match(JSON.stringify(await changePasswordAction(null, formData)), /no coinciden/);
  assert.equal(calls.length, 0);

  formData.set("confirmation", "NuevaSegura123!");
  assert.match(JSON.stringify(await changePasswordAction(null, formData)), /actual es incorrecta/);
  assert.equal(calls.length, 1);
  assert.equal(calls[0][0], "sign-in");

  signInError = null;
  formData.set("email", "otra-cuenta@example.com");
  assert.equal(JSON.stringify(await changePasswordAction(null, formData)), '{"success":true}');
  assert.deepEqual(JSON.parse(JSON.stringify(calls.slice(1))), [
    ["sign-in", { email: sessionUser.email, password: "Temporal123!" }],
    ["update", { password: "NuevaSegura123!", current_password: "Temporal123!" }],
  ]);

  user = null;
  await assert.rejects(changePasswordAction(null, formData), /\/login\?redirectedFrom=\/cambiar-contrasena/);
  assert.equal(calls.length, 3);
});

test("el formulario verifica el enlace al guardar y conserva la sesión aislada para reintentar", async () => {
  const location = { hash: "#token_hash=test-hash", pathname: "/definir-contrasena" };
  const requests: string[] = [];
  let weak = true;
  const recovery = { current: null };
  const jsx = (type: unknown, props: unknown) => ({ type, props });
  const { SetPasswordForm } = loadModule("src/app/(auth)/definir-contrasena/set-password-form.tsx", {
    URLSearchParams,
    FormData: function (form: FormData) { return form; },
    process: { env: {} },
    window: { location, history: { replaceState: (_: unknown, __: string, path: string) => {
      assert.equal(path, location.pathname);
      location.hash = "";
    } } },
    require: (name: string) => {
      if (name === "react/jsx-runtime") return { jsx, jsxs: jsx };
      if (name === "react") return { useState: (initial: unknown) => [initial, () => {}], useRef: () => recovery };
      if (name === "@/lib/auth/new-password") return { validateNewPassword };
      if (name !== "@supabase/supabase-js") return {};
      return { createClient: (_: string, __: string, { auth }: { auth: { persistSession: boolean } }) => {
        assert.equal(auth.persistSession, false);
        return { auth: {
          verifyOtp: async ({ type, token_hash }: { type: string; token_hash: string }) => {
            assert.equal(type, "recovery");
            assert.equal(token_hash, "test-hash");
            requests.push("verify");
            return { data: { session: {} }, error: null };
          },
          updateUser: async ({ password }: { password: string }) => {
            assert.equal(password, "NuevaSegura123!");
            requests.push("update");
            return { error: weak ? { code: "weak_password" } : null };
          },
          signOut: async ({ scope }: { scope: string }) => { requests.push(scope); },
        } };
      } };
    },
  }) as { SetPasswordForm: () => { props: { method: string; onSubmit: (event: unknown) => Promise<void> } } };

  const { method, onSubmit } = SetPasswordForm().props;
  assert.equal(method, "post");
  assert.deepEqual(requests, []);
  const formData = new FormData();
  formData.set("password", "NuevaSegura123!");
  formData.set("confirmation", "NuevaSegura123!");
  const event = { currentTarget: formData, preventDefault() {} };
  await onSubmit(event);
  assert.deepEqual(requests, ["verify", "update"]);
  assert.equal(location.hash, "");
  weak = false;
  await onSubmit(event);
  assert.deepEqual(requests, ["verify", "update", "update", "local"]);
});
