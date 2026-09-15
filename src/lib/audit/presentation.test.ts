import assert from "node:assert/strict";
import test from "node:test";
import {
  formatAuditDateTime,
  formatAuditValue,
  getAuditActivity,
  getAuditChanges,
  getAuditFieldsForAction,
  getAuditObject,
  getDisplayAction,
  getFieldLabel,
  getTableLabel,
} from "./presentation";

test("una creacion presenta principalmente valores nuevos", () => {
  const snapshot = getAuditFieldsForAction("INSERT", null, {
    cliente_nombre: "Ana",
    id: "676b60d7-6d59-44c0-bd84-679012fb03a9",
    estado: "borrador",
  });

  assert.deepEqual(
    snapshot.map(({ field, value }) => ({ field, value })),
    [
      { field: "cliente_nombre", value: "Ana" },
      { field: "estado", value: "borrador" },
    ],
  );
});

test("una eliminacion conserva solo los datos anteriores utiles", () => {
  const snapshot = getAuditFieldsForAction(
    "DELETE",
    { id: "676b60d7-6d59-44c0-bd84-679012fb03a9", precio_base: 100000, proveedor: "KIRIA" },
    null,
  );

  assert.deepEqual(
    snapshot.map(({ field }) => field),
    ["precio_base", "proveedor"],
  );
});

test("una edicion compara solo valores que cambiaron", () => {
  const changes = getAuditChanges(
    { cliente_nombre: "Ana", estado: "borrador" },
    { cliente_nombre: "Ana", estado: "confirmado" },
  );

  assert.equal(changes.length, 1);
  assert.deepEqual(changes[0], {
    after: "confirmado",
    before: "borrador",
    field: "estado",
    label: "Estado",
  });
});

test("clasifica eliminacion logica, restauracion y asignaciones", () => {
  assert.equal(
    getDisplayAction({
      action: "UPDATE",
      afterValue: { deleted_at: "2026-07-13T10:00:00Z" },
      beforeValue: { deleted_at: null },
      table: "eventos",
    }),
    "SOFT_DELETE",
  );
  assert.equal(
    getDisplayAction({
      action: "UPDATE",
      afterValue: { deleted_at: null },
      beforeValue: { deleted_at: "2026-07-13T10:00:00Z" },
      table: "eventos",
    }),
    "RESTORE",
  );
  assert.equal(
    getDisplayAction({
      action: "INSERT",
      afterValue: { salon_id: "salon-1", usuario_id: "user-1" },
      beforeValue: null,
      table: "usuario_salon",
    }),
    "ASSIGN",
  );
  assert.equal(
    getDisplayAction({
      action: "SOFT_DELETE",
      afterValue: { deleted_at: "2026-07-13T10:00:00Z" },
      beforeValue: { deleted_at: null },
      table: "eventos",
    }),
    "SOFT_DELETE",
  );
});

test("tolera JSON nulo o con una estructura inesperada", () => {
  assert.deepEqual(getAuditObject(null), {});
  assert.deepEqual(getAuditObject("texto inesperado"), {});
  assert.deepEqual(getAuditObject(["inesperado"]), {});
});

test("centraliza nombres legibles de entidades y campos", () => {
  assert.equal(getTableLabel("evento_servicios"), "Servicios del evento");
  assert.equal(getTableLabel("ipc_indices"), "Índices IPC");
  assert.equal(getFieldLabel("fecha_evento"), "Fecha del evento");
  assert.equal(getFieldLabel("ipc_indice_id"), "Índice IPC");
  assert.equal(getFieldLabel("campo_futuro"), "Campo futuro");
});

test("formatea importes, fechas y booleanos sin datos tecnicos", () => {
  assert.match(formatAuditValue(100000, "precio_base") ?? "", /100\.000/);
  assert.equal(formatAuditValue(true, "activo"), "Sí");
  assert.equal(formatAuditValue(false, "activo"), "No");
  assert.doesNotMatch(
    formatAuditValue("2026-09-09", "fecha_evento") ?? "",
    /^2026-09-09$/,
  );
  assert.equal(
    formatAuditValue("676b60d7-6d59-44c0-bd84-679012fb03a9"),
    null,
  );
  assert.equal(formatAuditValue({ valor: "tecnico" }), null);
  assert.match(formatAuditDateTime("2026-09-09T21:11:00.000Z"), / · /);
});

test("describe la actividad con lenguaje administrativo", () => {
  assert.equal(
    getAuditActivity("DELETE", "evento_servicios"),
    "Eliminó un servicio del evento",
  );
});
