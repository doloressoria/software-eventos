import assert from "node:assert/strict";
import test from "node:test";
import ExcelJS from "exceljs";
import * as XLSX from "xlsx";
import { buildCommercialWorkbook, exportFilename } from "./workbook";
import { cateringAmounts, PARTIAL_NOTICE, SEPARATE_NOTICE } from "./calculations";
import { exampleCatering, exampleEvent, examplePayment, fixtureId } from "./fixtures";

function texts(book: ExcelJS.Workbook) {
  const result: string[] = [];
  book.eachSheet((sheet) => sheet.eachRow((row) => row.eachCell((cell) => { if (typeof cell.value === "string" && !cell.isMerged) result.push(cell.value); else if (typeof cell.value === "string" && cell.master.address === cell.address) result.push(cell.value); })));
  return result;
}
function amount(book: ExcelJS.Workbook, sheetName: string, label: string, col: number) {
  let value: ExcelJS.CellValue;
  book.getWorksheet(sheetName)!.eachRow((row) => { if (row.getCell(1).value === label) value = row.getCell(col).value; });
  return value;
}

test("evento conserva formato, IVA parcial, divisas, contactos y resultados antes de recalcular", async () => {
  const data = exampleEvent(35);
  const linked = exampleCatering();
  data.caterings = [{ catering: linked.catering, payments: linked.payments }];
  const book = await buildCommercialWorkbook(data);
  assert.equal(book.getWorksheet("CLIENTE")!.getCell("B2").value instanceof Date, true);
  assert.equal(book.getWorksheet("Actualizaciones")!.getCell("G3").value, 0.020408);
  assert.equal(amount(book, "CLIENTE", "Total servicios — detalle", 7), 11420);
  assert.ok(texts(book).includes(SEPARATE_NOTICE));
  for (const text of ["Transferencia ARS", "Transferencia USD", "Efectivo ARS", "Efectivo USD", "Contacto ficticio 4", "Servicio fuera de los bloques originales"]) assert.ok(texts(book).includes(text), text);
  assert.ok(!texts(book).some((t) => /total (general|consolidado)/i.test(t)));
  const buffer = await book.xlsx.writeBuffer();
  const read = XLSX.read(buffer, { type: "buffer", cellDates: true });
  assert.equal(read.Sheets.CLIENTE.B2.t, "d");
  assert.ok(read.Workbook?.Names?.some((name) => name.Name === "_xlnm.Print_Area" && name.Ref.startsWith("'CLIENTE'!$A$1:$G$")));
  const formula = Object.values(read.Sheets.CLIENTE).find((c) => typeof c === "object" && "f" in c && c.f?.startsWith("SUM("));
  assert.equal(formula?.v, 11420);
  const loaded = new ExcelJS.Workbook();
  await loaded.xlsx.load(buffer);
  assert.equal(loaded.getWorksheet("CLIENTE")!.pageSetup.orientation, "landscape");
  assert.equal(loaded.getWorksheet("CLIENTE")!.getColumn(1).width, 37);
  let validations = 0;
  loaded.getWorksheet("CLIENTE")!.eachRow((r) => r.eachCell((c) => { if (c.dataValidation?.type) validations++; }));
  assert.ok(validations >= 35);
  assert.ok(loaded.definedNames.getRanges("TotalServiciosDetalle").ranges.length);
});

test("catering extiende pagos, ítems e historial y reconcilia hojas para cobros legados", async () => {
  const data = exampleCatering({ paymentCount: 35, itemCount: 18 });
  const amounts = cateringAmounts(data);
  const book = await buildCommercialWorkbook(data);
  assert.deepEqual(book.worksheets.map((s) => s.name), ["DC", "INDEC", "% FIJO ", "VALORES TOTALES POR SEPARADO", "Historial de precios"]);
  assert.equal(book.getWorksheet("Historial de precios")!.rowCount, 19);
  assert.ok(texts(book).includes("Adicional ficticio 18"));
  assert.equal(amount(book, "DC", "Total del catering — detalle", 8), data.catering.total_con_iva);
  assert.equal(amount(book, "DC", "Saldo pendiente — detalle", 8), data.catering.saldo_pendiente);
  assert.ok(texts(book).some((text) => text.includes("pantalla de ingresos") && text.includes("mínimo cero")));
  assert.equal(book.getWorksheet("DC")!.getCell("H18").value, 12);
  assert.equal(book.getWorksheet("VALORES TOTALES POR SEPARADO")!.getCell("H11").value, amounts.calculatedTotal);
  for (const name of ["INDEC", "% FIJO "]) {
    let formulas = 0;
    book.getWorksheet(name)!.eachRow((row) => row.eachCell((cell) => { if (cell.formula) formulas++; }));
    assert.equal(formulas, 0);
    assert.equal(book.getWorksheet(name)!.getCell("A2").value, "Valor inicial");
    assert.equal(book.getWorksheet(name)!.getCell(name === "INDEC" ? "G2" : "F2").value, "Valor ajustado");
  }
  const serialized = XLSX.read(await book.xlsx.writeBuffer(), { type: "buffer" });
  const total = Object.values(serialized.Sheets["VALORES TOTALES POR SEPARADO"]).find((v) => typeof v === "object" && "f" in v && v.f?.startsWith("'DC'!"));
  assert.equal(total?.v, data.catering.total_con_iva);
  assert.equal(amount(book, "VALORES TOTALES POR SEPARADO", "Total según precios y adicionales actuales", 8), amounts.calculatedTotal);
  assert.equal(amount(book, "VALORES TOTALES POR SEPARADO", "Diferencia entre total del detalle y desglose actual", 8), 0);
});

test("diferencias se informan sin forzar conciliación ni reemplazar el detalle", async () => {
  const data = exampleCatering({ mismatch: true, paymentCount: 0 });
  const book = await buildCommercialWorkbook(data);
  assert.equal(amount(book, "DC", "Total del catering — detalle", 8), 2247.75);
  assert.equal(amount(book, "DC", "Total según precios y adicionales actuales (incluye comisión e IVA)", 8), 2147.75);
  assert.ok(texts(book).some((text) => text.startsWith("El total del detalle es") && text.includes("Diferencia:")));
  assert.ok(texts(book).includes("El desglose no concilia con el total del detalle. La diferencia se informa por separado y no se distribuye entre conceptos."));
});

test("catering externo sin pagos y sin precio no hereda valores de referencia", async () => {
  const data = exampleCatering({ linked: false, paymentCount: 0, itemCount: 0 });
  data.history = [];
  const book = await buildCommercialWorkbook(data);
  assert.equal(book.getWorksheet("DC")!.getCell("B3").value, "Cliente externo de demostración");
  assert.equal(book.getWorksheet("DC")!.getCell("B12").value, null);
  assert.ok(texts(book).includes("Sin pagos registrados."));
  assert.ok(texts(book).some((t) => t.startsWith("No hay un precio vigente")));
  assert.ok(!texts(book).includes("El desglose actual coincide con el total del detalle."));
});

test("permisos parciales no dejan datos restringidos ni importes en otras hojas", async () => {
  const event = exampleEvent(0);
  const linked = exampleCatering();
  linked.catering.tipo_servicio = "SECRETO_CONTRATO";
  linked.catering.total_con_iva = 987654321;
  event.caterings = [{ catering: linked.catering, payments: linked.payments }];
  event.cateringAllowed = false;
  const book = await buildCommercialWorkbook(event);
  assert.ok(texts(book).includes(PARTIAL_NOTICE));
  assert.ok(!texts(book).includes("SECRETO_CONTRATO"));
  book.eachSheet((s) => s.eachRow((r) => r.eachCell((c) => assert.notEqual(c.value, 987654321))));
  linked.eventAllowed = false;
  linked.event!.cliente_nombre = "SECRETO_EVENTO";
  const cateringBook = await buildCommercialWorkbook(linked);
  assert.ok(!texts(cateringBook).includes("SECRETO_EVENTO"));
});

test("textos de usuarios son texto literal, números y fechas conservan tipos", async () => {
  const data = exampleEvent(1);
  data.event.cliente_nombre = "=SUM(1,2)";
  data.event.cliente_cuit_dni = "000000123";
  data.contacts[0].nombre = "+1+1";
  data.payments[0] = { ...examplePayment(1), banco: "@SUM(A1:A2)", numero_cheque: "000023", forma_pago: "cheque", notas: "-1+1" };
  const book = await buildCommercialWorkbook(data);
  const read = XLSX.read(await book.xlsx.writeBuffer(), { type: "buffer", cellDates: true });
  assert.equal(read.Sheets.CLIENTE.B1.v, "=SUM(1,2)");
  assert.equal(read.Sheets.CLIENTE.B1.t, "s");
  assert.equal(read.Sheets.CLIENTE.B1.f, undefined);
  for (const text of ["000023", "@SUM(A1:A2)"]) {
    const c = Object.values(read.Sheets.CLIENTE).find((c) => typeof c === "object" && "v" in c && c.v === text);
    assert.equal(c?.t, "s");
    assert.equal(c?.f, undefined);
  }
});

test("plantillas privadas contienen sólo etiquetas estáticas, sin fórmulas, datos ni comentarios", async () => {
  for (const kind of ["evento", "catering"]) {
    const book = new ExcelJS.Workbook();
    await book.xlsx.readFile(`resources/commercial-excel/${kind}.xlsx`);
    assert.equal(book.creator, undefined);
    book.eachSheet((sheet) => sheet.eachRow((row) => row.eachCell((cell) => {
      if (cell.value !== null) assert.equal(typeof cell.value, "string");
      assert.equal(cell.formula, undefined);
      assert.equal(cell.note, undefined);
      assert.equal(cell.hyperlink, undefined);
    })));
  }
});

test("nombres seguros usan la fecha de Buenos Aires y los textos excesivos fallan explícitamente", async () => {
  assert.equal(exportFilename("evento", "../a\r\n", new Date("2026-10-22T01:00:00Z")), "evento-a-2026-10-21.xlsx");
  const data = exampleEvent(0);
  data.event.cliente_nombre = "a".repeat(32768);
  await assert.rejects(buildCommercialWorkbook(data), /máximo de caracteres/);
  data.event.cliente_nombre = "Cliente ficticio";
  data.event.organizador_nombre = "a".repeat(1000);
  await assert.rejects(buildCommercialWorkbook(data), /imprimirse completo/);
});

test("totales nulos de catering usan el mismo cero que muestra el detalle", async () => {
  const data = exampleCatering({ paymentCount: 0, itemCount: 0 });
  data.catering.total_con_iva = null;
  data.catering.saldo_pendiente = null;
  const book = await buildCommercialWorkbook(data);
  assert.equal(amount(book, "DC", "Total del catering — detalle", 8), 0);
  assert.equal(amount(book, "DC", "Saldo pendiente — detalle", 8), 0);
});

test("un pago USD sin equivalente histórico se muestra ausente, con subtotal parcial", async () => {
  const data = exampleEvent(0);
  data.payments = [{ ...examplePayment(2), importe_en_pesos: null, tipo_cambio: null }];
  const book = await buildCommercialWorkbook(data);
  let found = false;
  book.getWorksheet("CLIENTE")!.eachRow((r) => {
    if (r.getCell(1).value === "Efectivo USD") { found = true; assert.equal(r.getCell(7).value, null); }
  });
  assert.ok(found);
  assert.ok(texts(book).includes("Subtotal con equivalente ARS disponible — parcial"));
});

test("un cheque pendiente aparece separado con su registro y no reduce el saldo exportado", async () => {
  const data = exampleEvent(0);
  data.payments = [{
    ...examplePayment(1, data.services[0].id),
    forma_pago: "cheque",
    fecha_pago: "2099-11-11",
    importe_en_pesos: 726,
  }];
  const book = await buildCommercialWorkbook(data);
  assert.equal(amount(book, "CLIENTE", "Cobros ordinarios de servicios", 7), 0);
  assert.equal(amount(book, "CLIENTE", "Saldo servicios — detalle (deuda menos cobros)", 7), 11420);
  assert.ok(texts(book).includes("CHEQUES PENDIENTES — NO APLICADOS AL SALDO"));
  assert.ok(texts(book).some((text) => text.startsWith("Pendiente · Registrado: 2026-10-19")));
});

test("el Excel separa las imputaciones acreditadas de un único cobro", async () => {
  const data = exampleEvent(0);
  const { catering } = exampleCatering();
  const common = { pago_id: fixtureId(99), forma_pago: "cheque" as const,
    fecha_pago: "2026-01-01", importe_moneda_original: null };
  data.payments = [
    { ...examplePayment(1, data.services[0].id), ...common, importe_en_pesos: 250000 },
    { ...examplePayment(3, data.services[1].id), ...common, importe_en_pesos: 50000 },
  ];
  data.caterings = [{ catering, payments: [{
    ...examplePayment(5, null, catering.id), ...common, importe_en_pesos: 700000,
  }] }];
  const book = await buildCommercialWorkbook(data);
  assert.equal(amount(book, "CLIENTE", "Cobros ordinarios de servicios", 7), 300000);
  assert.equal(amount(book, "Catering", "Cobros ordinarios registrados", 7), 700000);
  assert.equal(texts(book).filter((value) => value.includes(`Imputación del cobro ${common.pago_id}`)).length, 3);
});

test("el Excel de catering conserva el importe histórico y toma el saldo SQL de los PAX pendientes", async () => {
  const data = exampleCatering({ paymentCount: 1, itemCount: 0 });
  data.catering.saldo_pendiente = 225000;
  data.catering.total_pagado = 400000;
  data.tarifas = [{
    categoria: "jovenes", catering_contrato_id: data.catering.id, evento_id: data.catering.evento_id,
    pax: 15, precio_base: 44000, adicional_unitario: 1000, precio_aplicado: 45000,
    cubiertos: 10, cobertura_ars: 400000, excedente: 0, pendientes: 5,
    por_acreditar: 0, saldo_categoria: 225000, tarifas_historicas: 1,
  }];
  data.coberturas = [{
    pago_id: data.payments[0].id, catering_contrato_id: data.catering.id, categoria: "jovenes",
    cantidad: 10, precio_aplicado: 40000, importe_historico: 400000, liberada: 0,
  }];
  const book = await buildCommercialWorkbook(data);
  const sheet = book.getWorksheet("DC")!;
  const rows: (number | null)[][] = [];
  sheet.eachRow((row) => {
    if (row.getCell(1).value === "Jóvenes") rows.push([2, 3, 4, 5, 8].map((col) => row.getCell(col).value as number | null));
  });
  assert.deepEqual(rows, [[15, 44000, 1000, 45000, 225000], [10, 40000, 400000, 0, null]]);
  assert.equal(amount(book, "DC", "Saldo pendiente — detalle", 8), 225000);
});
