import assert from "node:assert/strict";
import test from "node:test";
import { getRequiredScreenPermission } from "./permissions";

test("las rutas de alta y edición requieren gestionar el módulo", () => {
  assert.deepEqual(getRequiredScreenPermission("/eventos"), {
    manage: false,
    screen: "eventos",
  });
  assert.deepEqual(getRequiredScreenPermission("/eventos/nuevo"), {
    manage: true,
    screen: "eventos",
  });
  assert.deepEqual(getRequiredScreenPermission("/catering/123"), {
    manage: false,
    screen: "catering",
  });
});
