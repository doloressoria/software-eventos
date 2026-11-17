import assert from "node:assert/strict";
import { test } from "node:test";
import { cotizacionPorPersona } from "./cotizacion";
import { totalInvitados } from "./asistentes";

test("cotización divide los servicios vigentes por todos los PAX del evento", () => {
  const evento = { pax_adultos: 70, pax_jovenes: 20, pax_menores: 8, pax_bebes: 2 };
  assert.equal(cotizacionPorPersona(1_000_000, totalInvitados(evento)), 10_000);
  assert.equal(cotizacionPorPersona(1_200_000, totalInvitados(evento)), 12_000);
  assert.equal(cotizacionPorPersona(1_000_000, totalInvitados({ ...evento, pax_adultos: 170 })), 5_000);
});

test("cotización redondea a centavos y no divide por cero", () => {
  assert.equal(cotizacionPorPersona(100, 3), 33.33);
  assert.equal(cotizacionPorPersona(100.01, 2), 50.01);
  assert.equal(cotizacionPorPersona(0, 100), 0);
  assert.equal(cotizacionPorPersona(1_000_000, 0), null);
  assert.equal(cotizacionPorPersona(0, totalInvitados({ pax_adultos: null, pax_jovenes: null, pax_menores: null, pax_bebes: null })), null);
});
