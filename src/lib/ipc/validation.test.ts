import assert from "node:assert/strict";
import test from "node:test";
import { getArgentinaDate, validateIpcForm } from "./validation";
function form(values: Record<string, string>) {
  const data = new FormData();
  for (const [key, value] of Object.entries(values)) data.set(key, value);
  return data;
}
const valid = { periodo: "2026-10", fecha_vigencia: "2026-11-20", variacion_porcentual: "2,56789" };
test("separa período y vigencia y normaliza una variación con coma", () => {
  assert.deepEqual(validateIpcForm(form(valid), "2026-11-10").payload,
    { periodo: "2026-10-01", fechaVigencia: "2026-11-20", variacionPorcentual: 2.5679 });
});
test("permite programar sin índice y conserva cero como índice válido", () => {
  assert.equal(validateIpcForm(form({ ...valid, variacion_porcentual: "" }), "2026-11-10").payload?.variacionPorcentual, null);
  assert.equal(validateIpcForm(form({ ...valid, variacion_porcentual: "0" }), "2026-11-10").payload?.variacionPorcentual, 0);
});
test("rechaza fechas imposibles y pasadas, meses inexistentes y variaciones no finitas", () => {
  for (const patch of [{ periodo: "2026-13" }, { fecha_vigencia: "2026-02-30" },
    { fecha_vigencia: "2026-11-09" }, { variacion_porcentual: "-100" },
    { variacion_porcentual: "-99.9999999" }, { variacion_porcentual: "Infinity" },
    { variacion_porcentual: "NaN" }, { variacion_porcentual: "100000000" }, { variacion_porcentual: "0x10" }]) {
    assert.equal(validateIpcForm(form({ ...valid, ...patch }), "2026-11-10").payload, null);
  }
});
test("la vigencia usa medianoche argentina independientemente del timezone del servidor", () => {
  assert.equal(getArgentinaDate(new Date("2026-11-11T02:59:59Z")), "2026-11-10");
  assert.equal(getArgentinaDate(new Date("2026-11-11T03:00:00Z")), "2026-11-11");
});
