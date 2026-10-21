import assert from "node:assert/strict";
import test from "node:test";
import { nuevoContacto, validateContactos, contactosPayload } from "./validation";

test("contacto requiere sólo nombre; opcionales vacíos permanecen opcionales", () => {
  const contactos = [{ ...nuevoContacto(), nombre: "  Prueba  " }];
  assert.equal(validateContactos(JSON.stringify(contactos)).error, null);
  assert.deepEqual(contactosPayload(contactos), [{
    id: null, nombre: "Prueba", telefono: null, correo: null,
    relacion: null, observaciones: null, es_principal: false,
  }]);
});

test("rechaza JSON ausente o malformado sin interpretarlo como una baja total", () => {
  for (const value of [null, "", "texto anterior", "null", "{}", "[null]", "[1]"]) {
    assert.ok(validateContactos(value).error);
  }
  assert.equal(validateContactos("[]").error, null);
});

test("errores conservan nombres, correos y observaciones del borrador", () => {
  const contactos = [{ ...nuevoContacto(), nombre: "", correo: "no es correo", observaciones: "Conservar" }];
  const result = validateContactos(JSON.stringify(contactos));
  assert.ok(result.error);
  assert.deepEqual(result.contactos, contactos);
  contactos[0].nombre = "Prueba";
  assert.ok(validateContactos(JSON.stringify(contactos)).error);
  contactos[0].correo = "prueba@example.invalid";
  assert.equal(validateContactos(JSON.stringify(contactos)).error, null);
});

test("rechaza múltiples principales, ids duplicados o inválidos y tipos incorrectos", () => {
  const a = { ...nuevoContacto(), nombre: "A", es_principal: true };
  assert.ok(validateContactos(JSON.stringify([a, a])).error);
  a.es_principal = false;
  a.id = "00000000-0000-0000-0000-000000000001";
  assert.ok(validateContactos(JSON.stringify([a, a])).error);
  a.id = "ajeno";
  assert.ok(validateContactos(JSON.stringify([a])).error);
  assert.ok(validateContactos(JSON.stringify([{ ...a, telefono: 123 }])).error);
  assert.ok(validateContactos(JSON.stringify([{ ...a, es_principal: "true" }])).error);
});
