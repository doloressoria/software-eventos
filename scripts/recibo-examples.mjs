import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { mkdirSync, writeFileSync, rmSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
const build = ".recibo-example-build";
try {
  execFileSync("pnpm", ["exec", "tsc", "--outDir", build, "--noEmit", "false", "--module", "commonjs", "--target", "es2022", "--skipLibCheck", "--esModuleInterop", "src/lib/recibos/pdf.ts", "src/lib/recibos/fixtures.ts"], { stdio: "inherit" });
  const require = createRequire(import.meta.url);
  const { buildReciboPdf } = require(resolve(build, "lib/recibos/pdf.js"));
  const { exampleRecibo } = require(resolve(build, "lib/recibos/fixtures.js"));
  const logo = `data:image/png;base64,${readFileSync("public/kiria-catering.png").toString("base64")}`;
  mkdirSync("output/pdf", { recursive: true });
  for (const [file, count] of [["recibo-ficticio.pdf", 2], ["recibo-ficticio-extenso.pdf", 50]]) {
    const { snapshot, recibo } = exampleRecibo(count);
    snapshot.marca = "Kiria"; snapshot.logo_data_url = logo;
    writeFileSync(`output/pdf/${file}`, await buildReciboPdf(snapshot, recibo));
  }
  const { snapshot, recibo } = exampleRecibo();
  snapshot.marca = "Kiria"; snapshot.logo_data_url = logo;
  snapshot.pago.forma_pago = "cheque"; snapshot.pago.numero_cheque = "00000123";
  snapshot.pago.banco = "Banco ficticio"; snapshot.pago.fecha_pago = "2026-12-01";
  snapshot.estado_acreditacion = "Recibido pendiente de acreditación";
  snapshot.garantia = true; snapshot.pago.es_garantia = true;
  snapshot.coberturas = []; snapshot.componentes = [];
  writeFileSync("output/pdf/recibo-cheque-garantia-ficticio.pdf", await buildReciboPdf(snapshot, recibo));
  console.log("3 PDF ficticios en output/pdf; no se emiten documentos en una base real.");
} finally { rmSync(build, { recursive: true, force: true }); }
