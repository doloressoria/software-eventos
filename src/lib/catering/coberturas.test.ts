import assert from "node:assert/strict";
import { test } from "node:test";
import { lineasCobertura, totalVistaPrevia } from "./coberturas";
import { validateCateringItemForm } from "./item-validation";
import { camposPreciosCategoria, validarPreciosCategoria } from "./precios-categoria";

test("la vista previa suma centavos de distintas tarifas y el formulario rechaza fracciones de persona", () => {
  const form = new FormData();
  form.set("cantidad_adultos", "3");
  form.set("aplicado_adultos", "100.02");
  form.set("cantidad_jovenes", "2");
  form.set("aplicado_jovenes", "80.03");
  const lineas = lineasCobertura(form);
  assert.ok(lineas);
  assert.deepEqual(lineas, [
    { categoria: "adultos", cantidad: 3, precio_aplicado: 100.02 },
    { categoria: "jovenes", cantidad: 2, precio_aplicado: 80.03 },
  ]);
  assert.equal(totalVistaPrevia(lineas, { adultos: "3", jovenes: "2" }), 460.12);
  form.set("cantidad_jovenes", "2.5");
  assert.equal(lineasCobertura(form), null);
  form.set("cantidad_jovenes", "2147483648");
  assert.equal(lineasCobertura(form), null);
});

test("los precios por categoría distinguen explícitamente cero de un campo vacío", () => {
  const form = new FormData();
  form.set("precio_adultos", "40000,50");
  form.set("precio_jovenes", "0");
  form.set("precio_bebes", "1.001");
  const errors = {};
  assert.deepEqual(validarPreciosCategoria(camposPreciosCategoria(form), errors), {
    precio_adultos: 40000.5, precio_jovenes: 0, precio_menores: null, precio_bebes: null,
  });
  assert.ok("precio_bebes" in errors);
});

test("un adicional fijo conserva su modo histórico y uno por persona exige categorías válidas", () => {
  const form = new FormData();
  form.set("categoria", "adicional_otros");
  form.set("descripcion", "Extra de prueba");
  form.set("precio_unitario", "1000");
  assert.equal(validateCateringItemForm(form).payload?.categorias_pax, null);
  form.set("modo", "persona");
  assert.equal(validateCateringItemForm(form).payload, null);
  form.append("categorias_pax", "adultos");
  form.append("categorias_pax", "jovenes");
  assert.deepEqual(validateCateringItemForm(form).payload?.categorias_pax, ["adultos", "jovenes"]);
  form.append("categorias_pax", "desconocido");
  assert.equal(validateCateringItemForm(form).payload, null);
});
