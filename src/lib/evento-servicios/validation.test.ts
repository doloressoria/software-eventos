import assert from "node:assert/strict";
import test from "node:test";
import {
  calculateEventoServicioTotals,
  validateEventoServicioForm,
} from "./validation";

test("servicio nuevo usa 21% aunque el formulario mande otra tasa", () => {
  const formData = new FormData();
  formData.set("servicio_id", "servicio-1");
  formData.set("precio_base", "1000");
  formData.set("adicionales_monto", "0");
  formData.set("iva_base_imponible", "600");
  formData.set("iva_porcentaje", "0");

  const { state, payload } = validateEventoServicioForm(formData);

  assert.equal(state.formError, null);
  assert.equal("iva_porcentaje" in state.fields, false);
  assert.equal("iva_porcentaje" in (payload ?? {}), false);
  assert.equal(payload?.total_sin_iva, 1_000);
  assert.equal(payload?.total_con_iva, 1_126);
  assert.deepEqual(
    calculateEventoServicioTotals({
      adicionalesMonto: 0,
      ivaBaseImponible: 800,
      precioBase: 1_000,
    }),
    { totalConIva: 1_168, totalSinIva: 1_000 },
  );
});
