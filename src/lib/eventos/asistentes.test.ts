import assert from "node:assert/strict";
import { test } from "node:test";
import { paxCateringDistinto, totalInvitados } from "./asistentes";

test("el total cuenta las categorías del evento una sola vez y trata nulos como cero", () => {
  const evento = { pax_adultos: 20, pax_jovenes: 15, pax_menores: null, pax_bebes: 0 };
  const igual = { ...evento, pax_menores: 0, pax_bebes: null };
  const menos = { ...evento, pax_adultos: 17 };
  const otraDistribucion = { ...evento, pax_adultos: 19, pax_jovenes: 16 };
  assert.equal(totalInvitados(evento), 35);
  assert.equal(totalInvitados({ pax_adultos: null, pax_jovenes: 0, pax_menores: null, pax_bebes: 0 }), 0);
  assert.deepEqual(paxCateringDistinto(evento, []), []);
  assert.deepEqual(paxCateringDistinto(evento, [igual, menos, otraDistribucion]), [menos, otraDistribucion]);
});
