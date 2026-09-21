import assert from "node:assert/strict";
import test from "node:test";
import { validateUsuarioForm } from "./validation";

const salonId = "11111111-1111-4111-8111-111111111111";

function validFormData() {
  const formData = new FormData();
  formData.set("full_name", "  Usuario Prueba  ");
  formData.set("email", "  USUARIO@Example.com ");
  formData.set("role_id", salonId);
  formData.set("activo", "on");
  formData.append("salon_ids", salonId);
  return formData;
}

test("normaliza un usuario valido y elimina asignaciones duplicadas", () => {
  const formData = validFormData();
  formData.append("salon_ids", salonId);
  const result = validateUsuarioForm(formData);

  assert.deepEqual(result.payload, {
    activo: true,
    email: "usuario@example.com",
    fullName: "Usuario Prueba",
    roleId: salonId,
    salonIds: [salonId],
  });
});

test("rechaza nombre, email, rol e ids invalidos", () => {
  const formData = new FormData();
  formData.set("full_name", " ");
  formData.set("email", "email-invalido");
  formData.set("role_id", "no-es-uuid");
  formData.append("salon_ids", "no-es-uuid");
  const result = validateUsuarioForm(formData);

  assert.equal(result.payload, null);
  assert.ok(result.state.errors.fullName);
  assert.ok(result.state.errors.email);
  assert.ok(result.state.errors.roleId);
  assert.ok(result.state.errors.salonIds);
});

test("un rol valido conserva las asignaciones de salones", () => {
  const formData = validFormData();
  const result = validateUsuarioForm(formData);

  assert.deepEqual(result.payload?.salonIds, [salonId]);
});

test("rechaza un rol sin UUID", () => {
  const formData = validFormData();
  formData.set("role_id", "rol-invalido");
  const result = validateUsuarioForm(formData);

  assert.equal(result.payload, null);
  assert.ok(result.state.errors.roleId);
});
