import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { buildReciboPdf } from "./pdf";
import { exampleRecibo } from "./fixtures";

test("PDF emitido es reproducible, conserva datos ficticios y permite múltiples páginas", async () => {
  const { snapshot, recibo } = exampleRecibo();
  const first = await buildReciboPdf(snapshot, recibo);
  assert.equal(first.subarray(0, 5).toString(), "%PDF-");
  assert.deepEqual(await buildReciboPdf(snapshot, recibo), first, "re-descarga idéntica");
  const kiria = { ...snapshot, marca: "Kiria", logo_data_url: `data:image/png;base64,${readFileSync("public/kiria-catering.png").toString("base64")}` };
  const withLogo = await buildReciboPdf(kiria, recibo);
  assert.ok(withLogo.length > first.length);
  assert.deepEqual(await buildReciboPdf(kiria, recibo), withLogo, "logo persistido reproduce el mismo PDF");
  const long = await buildReciboPdf(exampleRecibo(50).snapshot, recibo);
  assert.ok((long.toString("latin1").match(/\/Type \/Page\b/g) ?? []).length > 2);
  snapshot.estado_acreditacion = "Recibido pendiente de acreditación";
  snapshot.garantia = true;
  snapshot.pago.forma_pago = "cheque"; snapshot.pago.numero_cheque = "000000123";
  assert.ok((await buildReciboPdf(snapshot, recibo)).length > 1000);
  assert.ok((await buildReciboPdf(snapshot, { ...recibo, tipo: "anulacion" }, recibo)).length > 1000);
  await assert.rejects(buildReciboPdf({ ...snapshot, version: 99 } as unknown as typeof snapshot), /Versión/);
});
