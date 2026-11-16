import assert from "node:assert/strict";
import test from "node:test";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { buildReciboPdf } from "./pdf";
import { exampleRecibo } from "./fixtures";

test("PDF emitido es reproducible, conserva datos ficticios y permite múltiples páginas", async () => {
  const { snapshot, recibo } = exampleRecibo();
  const first = await buildReciboPdf(snapshot, recibo);
  assert.equal(first.subarray(0, 5).toString(), "%PDF-");
  assert.equal((first.toString("latin1").match(/\/Type \/Page\b/g) ?? []).length, 1, "el talonario habitual ocupa una página, incluido el pie");
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

test("recibos versión 1 conservan exactamente el PDF emitido antes del rediseño", async () => {
  const { snapshot, recibo } = exampleRecibo();
  snapshot.version = 1;
  const legacy = await buildReciboPdf(snapshot, recibo);
  assert.equal(createHash("sha256").update(legacy).digest("hex"), "e3b5a38e78fbb2730e81e43d07c4acd2d2633e2329527ae0d08ecb809042e9c1");
});
test("talonario conserva filas muy largas en varias páginas sin usar el recorte de PDFKit", async () => {
  const { snapshot, recibo } = exampleRecibo();
  snapshot.imputaciones[0].concepto = "PalabraExtensa".repeat(800);
  const pdf = await buildReciboPdf(snapshot, recibo);
  assert.ok((pdf.toString("latin1").match(/\/Type \/Page\b/g) ?? []).length > 2);
});
