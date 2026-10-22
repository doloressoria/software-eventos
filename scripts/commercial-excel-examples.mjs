import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { mkdir, rm } from "node:fs/promises";
import path from "node:path";

const require = createRequire(import.meta.url);
const build = ".excel-example-build";
const output = path.resolve("outputs/commercial-excel");
try {
  execFileSync("pnpm", ["exec", "tsc", "--outDir", build, "--noEmit", "false", "--module", "commonjs", "--target", "es2022", "--lib", "es2022,dom", "--skipLibCheck", "--esModuleInterop",
    "src/lib/commercial-export/fixtures.ts", "src/lib/commercial-export/workbook.ts"], { stdio: "inherit" });
  const { buildCommercialWorkbook } = require(path.resolve(build, "lib/commercial-export/workbook.js"));
  const { exampleEvent, exampleCatering } = require(path.resolve(build, "lib/commercial-export/fixtures.js"));
  const event = exampleEvent();
  const linked = exampleCatering();
  event.caterings = [{ catering: linked.catering, payments: linked.payments }];
  const cases = [
    ["evento", event], ["catering-asociado", linked],
    ["catering-externo-sin-pagos", exampleCatering({ linked: false, paymentCount: 0 })],
    ["catering-diferencia-y-muchos-registros", exampleCatering({ mismatch: true, paymentCount: 35, itemCount: 18 })],
    ["evento-permisos-parciales", { ...exampleEvent(0), cateringAllowed: false }],
  ];
  await mkdir(output, { recursive: true });
  for (const [name, data] of cases) {
    const workbook = await buildCommercialWorkbook(data);
    await workbook.xlsx.writeFile(path.join(output, `${name}.xlsx`));
    console.log(`Ejemplo ficticio: ${name}.xlsx`);
  }
} finally { await rm(build, { recursive: true, force: true }); }
