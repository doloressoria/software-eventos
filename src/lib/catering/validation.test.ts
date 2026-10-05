import assert from "node:assert/strict";
import test from "node:test";
import { getEmptyCateringFormState, validateCateringForm } from "./validation";

function form(conEvento: boolean) {
  const data = new FormData();
  for (const [key, value] of Object.entries(getEmptyCateringFormState().fields)) {
    data.set(key, value);
  }
  data.set("con_evento", String(conEvento));
  data.set("ejecutiva_id", "ejecutiva-1");
  data.set("precio_unitario_inicial", "100");
  if (conEvento) {
    data.set("evento_id", "evento-1");
  } else {
    data.set("cliente_nombre", "Cliente");
    data.set("fecha_evento", "2026-10-10");
  }
  return data;
}

test("exige lugar al crear catering externo y guarda el texto limpio", () => {
  const data = form(false);
  assert.equal(validateCateringForm(data, { mode: "create" }).state.errors.lugar_evento,
    "Ingresa el lugar del evento.");

  data.set("lugar_evento", "  Club Norte  ");
  const result = validateCateringForm(data, { mode: "create" });
  assert.equal(result.payload?.lugar_evento, "Club Norte");
  assert.equal(result.payload?.evento_id, null);
});

test("un catering vinculado toma el evento y no exige lugar externo", () => {
  const result = validateCateringForm(form(true), { mode: "create" });
  assert.equal(result.payload?.evento_id, "evento-1");
  assert.equal(result.payload?.lugar_evento, null);
});

test("un catering historico puede conservar lugar sin especificar al editar", () => {
  const result = validateCateringForm(form(false), { mode: "edit" });
  assert.equal(result.payload?.lugar_evento, null);
});
