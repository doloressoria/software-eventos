import ExcelJS from "exceljs";
import path from "node:path";
import { cateringAmounts, ordinaryPayments, PARTIAL_NOTICE, paymentAmount, SEPARATE_NOTICE, serviceAmounts, uniquePayments } from "./calculations";
import { roundMoney, sumGuarantees, sumOrdinaryPayments, toMoneyNumber } from "../pagos/calculos";
import { ExportError, type CateringExportData, type CommercialExportData, type EventExportData, type ExportContact, type ExportPayment } from "./types";

const MONEY = '#,##0.00;[Red]-#,##0.00';
const DATE = "dd/mm/yyyy";
const RATE = "0.00%";
type Value = string | number | Date | null;
type Sheet = ExcelJS.Worksheet;
const money = (n: number) => new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS" }).format(n);
const numeric = toMoneyNumber;
const sum = (values: (number | null)[]) => roundMoney(values.reduce<number>((n, v) => n + numeric(v), 0));
function date(value: string | null) { return value ? new Date(`${value.slice(0, 10)}T00:00:00.000Z`) : null; }
function cell(sheet: Sheet, address: string, value: Value, format?: string) {
  if (typeof value === "string" && value.length > 32767) throw new ExportError(422, "Un texto supera el máximo de caracteres de una celda de Excel. Acortá ese campo antes de exportar; no se recortaron datos.");
  const c = sheet.getCell(address);
  c.value = value;
  if (format) c.numFmt = format;
  else if (typeof value === "string") c.numFmt = "@";
  c.alignment = { ...c.alignment, vertical: "middle", wrapText: true };
}

function sheetFromTemplate(book: ExcelJS.Workbook, template: Sheet, name: string, columns: number) {
  const sheet = book.addWorksheet(name, { views: [{ showGridLines: false }] });
  for (let col = 1; col <= columns; col++) sheet.getColumn(col).width = template.getColumn(col).width ?? 18;
  sheet.pageSetup = { paperSize: 9, orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 0,
    margins: { left: 0.25, right: 0.25, top: 0.35, bottom: 0.35, header: 0.15, footer: 0.15 } };
  sheet.headerFooter.oddFooter = "Página &P de &N";
  return sheet;
}

function row(sheet: Sheet, source: Sheet, target: number, original: number, values: Value[], columns = 7) {
  if (target > 1_048_576) throw new ExportError(422, "El detalle supera el máximo de filas de Excel. No se omitió ningún registro: dividí la consulta antes de exportar.");
  const from = source.getRow(original);
  const to = sheet.getRow(target);
  to.height = Math.max(22, Math.min(from.height ?? 22, 42));
  for (let col = 1; col <= columns; col++) {
    const c = to.getCell(col);
    c.style = structuredClone(from.getCell(col).style);
    if (typeof values[col - 1] === "string" && (values[col - 1] as string).length > 32767) throw new ExportError(422, "Un texto supera el máximo de caracteres de una celda de Excel. Acortá ese campo antes de exportar; no se recortaron datos.");
    c.value = values[col - 1] ?? null;
    c.alignment = { ...c.alignment, vertical: "middle", wrapText: true, horizontal: typeof c.value === "number" ? "right" : "left" };
    c.numFmt = typeof c.value === "number" ? MONEY : c.value instanceof Date ? DATE : "@";
  }
  // Long customer-entered text needs height, including identifiers without spaces.
  let lines = 1;
  values.forEach((value, index) => {
    if (typeof value === "string") lines = Math.max(lines, ...value.split("\n").map((s) => Math.ceil(s.length / Math.max(8, (sheet.getColumn(index + 1).width ?? 18) - 3))));
  });
  to.height = Math.max(to.height ?? 22, lines * 15 + 8);
}

function band(sheet: Sheet, source: Sheet, target: number, title: string, columns = 7) {
  row(sheet, source, target, source.name === "DC" ? 34 : 41, [title], columns);
  sheet.mergeCells(target, 1, target, columns);
  sheet.getCell(target, 1).font = { ...sheet.getCell(target, 1).font, bold: true };
  sheet.getRow(target).height = Math.max(26, Math.ceil(title.length / 95) * 17 + 8);
}

function note(sheet: Sheet, source: Sheet, target: number, text: string, columns = 7) {
  row(sheet, source, target, source.name === "DC" ? 83 : 116, [text], columns);
  sheet.mergeCells(target, 1, target, columns);
  sheet.getCell(target, 1).font = { ...sheet.getCell(target, 1).font, bold: false, color: { argb: "FF333333" } };
  sheet.getCell(target, 1).alignment = { vertical: "middle", horizontal: "left", wrapText: true };
  sheet.getRow(target).height = Math.max(28, text.split("\n").reduce((n, line) => n + Math.max(1, Math.ceil(line.length / 120)), 0) * 16 + 8);
}

function total(sheet: Sheet, source: Sheet, target: number, label: string, value: number | null, columns = 7) {
  row(sheet, source, target, source.name === "DC" ? 72 : 90, [], columns);
  sheet.mergeCells(target, 1, target, columns - 1);
  cell(sheet, `A${target}`, label);
  cell(sheet, `${String.fromCharCode(64 + columns)}${target}`, value, MONEY);
  const amount = sheet.getCell(target, columns);
  amount.font = { ...amount.font, bold: true, color: { argb: "FF000000" } };
  amount.fill = { type: "pattern", pattern: "solid", fgColor: { argb: source.name === "DC" ? "FFF0EEDC" : "FFF2F2F2" } };
  amount.alignment = { vertical: "middle", horizontal: "right", wrapText: true };
  sheet.getRow(target).height = Math.max(28, Math.ceil(label.length / 80) * 16 + 8);
}

function finish(sheet: Sheet, lastRow: number, columns = 7) {
  sheet.eachRow((row) => {
    if ((row.height ?? 0) > 409) throw new ExportError(422, "Un texto es demasiado extenso para imprimirse completo en una fila de Excel. Acortá ese campo antes de exportar; no se recortaron datos.");
  });
  // ExcelJS prefixes columns with "$"; rows must be absolute for Calc to honor the print area.
  sheet.pageSetup.printArea = `A$1:${String.fromCharCode(64 + columns)}$${lastRow}`;
}

function paymentLabel(payment: ExportPayment) {
  const labels: Record<string, string> = { efectivo_pesos: "Efectivo", efectivo_dolares: "Efectivo", transferencia: "Transferencia", cheque: "Cheque", retenciones: "Retenciones", efectivo_euros: "Efectivo" };
  return `${labels[payment.forma_pago] ?? payment.forma_pago} ${payment.moneda}`;
}

function paymentBlock(sheet: Sheet, source: Sheet, start: number, title: string, payments: ExportPayment[], debt?: number, columns = 7) {
  let r = start;
  band(sheet, source, r++, title, columns);
  const headers = ["Medio y moneda", "Fecha", "Banco", "N° cheque", "Importe original", "Cotización ARS", "Equivalente ARS"];
  row(sheet, source, r++, source.name === "DC" ? 36 : 42, headers, columns);
  for (const payment of uniquePayments(payments)) {
    row(sheet, source, r, source.name === "DC" ? 37 : 43,
      [paymentLabel(payment), date(payment.fecha_pago), payment.banco, payment.numero_cheque,
        payment.importe_moneda_original, payment.tipo_cambio, payment.importe_en_pesos === null && payment.moneda !== "ARS" ? null : paymentAmount(payment)], columns);
    sheet.getCell(r, 6).numFmt = "0.0000";
    sheet.getCell(r, 6).dataValidation = { type: "decimal", operator: "greaterThan", formulae: [0], allowBlank: true };
    sheet.getCell(r, 2).dataValidation = { type: "date", operator: "between", formulae: [new Date("1900-01-01"), new Date("9999-12-31")], allowBlank: true };
    r++;
    if (payment.concepto || payment.notas) note(sheet, source, r++, [payment.concepto, payment.notas].filter(Boolean).join(" · "), columns);
    if (payment.importe_en_pesos === null && payment.moneda !== "ARS") note(sheet, source, r++, "Este pago no tiene equivalente en pesos guardado. No se convirtió automáticamente.", columns);
  }
  if (!payments.length) note(sheet, source, r++, "Sin pagos registrados.", columns);
  const partial = payments.some((p) => p.importe_en_pesos === null && p.moneda !== "ARS");
  total(sheet, source, r++, partial ? "Subtotal con equivalente ARS disponible — parcial" : "Subtotal de estos pagos (ARS)", sum(payments.map(paymentAmount)), columns);
  if (debt !== undefined) total(sheet, source, r++, "Saldo del servicio — deuda menos cobros ordinarios", roundMoney(debt - sumOrdinaryPayments(payments)), columns);
  return r + 1;
}

function contactsBlock(sheet: Sheet, source: Sheet, start: number, contacts: ExportContact[], legacy: string | null, columns = 7) {
  let r = start;
  band(sheet, source, r++, "CONTACTOS ACTUALES", columns);
  if (!contacts.length) note(sheet, source, r++, "No hay contactos actuales disponibles para esta descarga.", columns);
  for (const contact of contacts) {
    note(sheet, source, r++, `${contact.nombre}${contact.es_principal ? " · Principal" : ""}`, columns);
    note(sheet, source, r++, [contact.telefono, contact.correo, contact.relacion, contact.observaciones].filter(Boolean).join(" · ") || "Sin otros datos de contacto.", columns);
  }
  if (legacy) note(sheet, source, r++, `Contacto anterior — texto conservado: ${legacy}`, columns);
  return r;
}

function eventWorkbook(book: ExcelJS.Workbook, template: ExcelJS.Workbook, data: EventExportData) {
  const source = template.getWorksheet("CLIENTE")!;
  const sheet = sheetFromTemplate(book, source, "CLIENTE", 7);
  for (let r = 1; r <= 6; r++) row(sheet, source, r, r, []);
  for (const range of ["B1:G1", "F2:G2", "B3:D3", "F3:G3", "B4:D4", "F4:G4", "B5:D5", "F5:G5", "B6:D6", "E6:G6"]) sheet.mergeCells(range);
  const e = data.event;
  cell(sheet, "A1", "CLIENTE"); cell(sheet, "B1", e.cliente_nombre);
  cell(sheet, "A2", "FECHA"); cell(sheet, "B2", date(e.fecha_evento), DATE);
  cell(sheet, "C2", "PAX"); cell(sheet, "D2", sum([e.pax_adultos, e.pax_jovenes, e.pax_menores, e.pax_bebes]), "0");
  cell(sheet, "E2", "SALÓN"); cell(sheet, "F2", e.salones?.nombre ?? null);
  cell(sheet, "A3", "CATERING"); cell(sheet, "B3", data.cateringAllowed ? "Ver hoja Catering" : "Información no incluida");
  cell(sheet, "E3", "TIPO"); cell(sheet, "F3", e.tipo_evento);
  cell(sheet, "A4", "AMBIENTACIÓN"); cell(sheet, "B4", data.services.filter((s) => s.servicios_catalogo?.categoria === "ambientacion").map((s) => s.proveedor).filter(Boolean).join(" / ") || null);
  cell(sheet, "E4", "ORGANIZADOR"); cell(sheet, "F4", e.organizador_nombre);
  cell(sheet, "A5", "EVENTO"); cell(sheet, "B5", e.nombre_evento);
  cell(sheet, "E5", "COMISIÓN"); cell(sheet, "F5", e.comision_organizador, MONEY);
  cell(sheet, "A6", "VENDEDOR"); cell(sheet, "B6", e.usuarios?.full_name ?? e.usuarios?.email ?? null);
  cell(sheet, "E6", `PAX: adultos ${e.pax_adultos ?? "—"}, jóvenes ${e.pax_jovenes ?? "—"}, menores ${e.pax_menores ?? "—"}, bebés ${e.pax_bebes ?? "—"}`);
  sheet.getRow(1).height = Math.max(34, Math.ceil(e.cliente_nombre.length / 90) * 17 + 8);
  sheet.getRow(4).height = Math.max(36, Math.ceil((e.organizador_nombre?.length ?? 0) / 35) * 17 + 8);
  sheet.getRow(6).height = 36;
  if (e.organizador_email || e.organizador_telefono || e.organizador_externo) note(sheet, source, 7,
    `Organizador: ${[e.organizador_email, e.organizador_telefono, e.organizador_externo].filter(Boolean).join(" · ")}`);
  let r = 8;
  band(sheet, source, r++, "SERVICIOS Y ADICIONALES");
  row(sheet, source, r++, 9, ["Servicio", "Base ARS", "Adicionales ARS", "Comisiona", "Proveedor", "Neto ARS", "Total ARS"]);
  const serviceRows: number[] = [];
  const payments = uniquePayments(data.payments);
  for (const service of data.services) {
    serviceRows.push(r);
    row(sheet, source, r++, 9, [service.servicios_catalogo?.nombre ?? "Servicio sin catálogo", service.precio_base,
      service.adicionales_monto, service.comisiona_organizador ? "Sí" : "No", service.proveedor, service.total_sin_iva, service.total_con_iva]);
    if (service.notas) note(sheet, source, r++, service.notas);
  }
  if (!data.services.length) note(sheet, source, r++, "Sin servicios contratados guardados.");
  const eventTotal = sum(data.services.map((s) => s.total_con_iva));
  total(sheet, source, r, "Total servicios — detalle", eventTotal);
  book.definedNames.add(`'CLIENTE'!$G$${r}`, "TotalServiciosDetalle");
  if (serviceRows.length) sheet.getCell(`G${r}`).value = { formula: `SUM(G${serviceRows[0]}:G${r - 1})`, result: eventTotal };
  r += 2;
  if (!data.updates.length) note(sheet, source, r++, "No hay antecedentes de actualización disponibles para esta descarga. Los precios actuales se conservan sin reconstruir ajustes.");
  band(sheet, source, r++, "IVA PARCIAL Y SALDOS POR SERVICIO");
  row(sheet, source, r++, 28, ["Servicio", "Neto ARS", "Base IVA ARS", "IVA %", "IVA ARS", "Pagado ARS", "Saldo ARS"]);
  for (const service of data.services) {
    const amounts = serviceAmounts(service, payments);
    row(sheet, source, r, 28, [service.servicios_catalogo?.nombre ?? "Servicio sin catálogo", service.total_sin_iva,
      service.iva_base_imponible, service.iva_porcentaje, roundMoney(numeric(service.total_con_iva) - numeric(service.total_sin_iva)), amounts.paid, amounts.balance]);
    sheet.getCell(r++, 4).numFmt = RATE;
    if (numeric(service.total_pagado) !== amounts.paid) note(sheet, source, r++, `Los cobros del detalle de ${service.servicios_catalogo?.nombre ?? "este servicio"} suman ${money(amounts.paid)}. El cobrado acumulado guardado es ${money(numeric(service.total_pagado))}. Se exportan los cobros ordinarios del detalle.`);
    if (roundMoney(numeric(service.saldo_pendiente)) !== amounts.balance) {
      note(sheet, source, r++, `El saldo mostrado en el detalle de ${service.servicios_catalogo?.nombre ?? "este servicio"} es ${money(amounts.balance)}. El saldo guardado es ${money(numeric(service.saldo_pendiente))}. Se exporta el saldo del detalle.`);
    }
  }
  r++;
  for (const service of data.services) r = paymentBlock(sheet, source, r, `PAGOS — ${service.servicios_catalogo?.nombre ?? "Servicio sin catálogo"}`,
    ordinaryPayments(payments).filter((p) => p.evento_servicio_id === service.id), numeric(service.total_con_iva));
  total(sheet, source, r++, "Total servicios — detalle", eventTotal);
  book.definedNames.add(`'CLIENTE'!$G$${r}`, "CobrosServicios");
  total(sheet, source, r++, "Cobros ordinarios de servicios", sumOrdinaryPayments(payments));
  book.definedNames.add(`'CLIENTE'!$G$${r}`, "SaldoServiciosDetalle");
  total(sheet, source, r++, "Saldo servicios — detalle (deuda menos cobros)", roundMoney(eventTotal - sumOrdinaryPayments(payments)));
  note(sheet, source, r++, "Un saldo negativo indica un importe a favor. Las garantías se muestran por separado y no reducen la deuda.");
  r = paymentBlock(sheet, source, r + 1, "GARANTÍAS — SERVICIOS", payments.filter((p) => p.es_garantia));
  band(sheet, source, r++, "DATOS DE FACTURACIÓN");
  for (const [label, value] of [["Razón social", e.cliente_razon_social], ["CUIT / DNI", e.cliente_cuit_dni], ["Dirección de factura", e.cliente_direccion_factura], ["Dirección", e.cliente_direccion], ["Ciudad", e.cliente_ciudad]] as const) note(sheet, source, r++, `${label}: ${value ?? "Sin dato guardado"}`);
  note(sheet, source, r++, "El evento no guarda un monto final de factura ni una empresa emisora. No se completaron esos importes desde la referencia.");
  r = contactsBlock(sheet, source, r + 1, data.contacts, e.cliente_contacto);
  if (e.observaciones) note(sheet, source, r++, `Observaciones: ${e.observaciones}`);
  note(sheet, source, r++, PARTIAL_NOTICE);
  note(sheet, source, r++, "Este total corresponde a servicios. Los contratos de catering se presentan por separado cuando el usuario tiene permiso para consultarlos.");
  finish(sheet, r);
  sheet.views = [{ state: "frozen", ySplit: 9, showGridLines: false }];

  const cateringSheet = sheetFromTemplate(book, source, "Catering", 7);
  let cr = 1;
  band(cateringSheet, source, cr++, "CATERING VINCULADO — SUBTOTALES SEPARADOS");
  note(cateringSheet, source, cr++, PARTIAL_NOTICE);
  if (data.services.length) note(cateringSheet, source, cr++, SEPARATE_NOTICE);
  if (!data.cateringAllowed) note(cateringSheet, source, cr++, "La información de catering no está incluida por los permisos de esta descarga.");
  else if (!data.caterings.length) note(cateringSheet, source, cr++, "No hay contratos de catering disponibles para esta descarga.");
  for (const { catering, payments: contractPayments } of data.cateringAllowed ? data.caterings : []) {
    const own = uniquePayments(contractPayments);
    band(cateringSheet, source, cr++, catering.tipo_servicio ?? "Contrato de catering");
    total(cateringSheet, source, cr++, "Total del catering — detalle", numeric(catering.total_con_iva));
    total(cateringSheet, source, cr++, "Saldo pendiente — detalle", numeric(catering.saldo_pendiente));
    total(cateringSheet, source, cr++, "Cobrado acumulado guardado", catering.total_pagado);
    total(cateringSheet, source, cr++, "Cobros ordinarios registrados", sumOrdinaryPayments(own));
    total(cateringSheet, source, cr++, "Garantías registradas", sumGuarantees(own));
    if (numeric(catering.total_pagado) !== sumOrdinaryPayments(own)) note(cateringSheet, source, cr++, `El cobrado acumulado guardado es ${money(numeric(catering.total_pagado))} y los pagos ordinarios disponibles suman ${money(sumOrdinaryPayments(own))}. El saldo del detalle utiliza el acumulado guardado.`);
    cr = paymentBlock(cateringSheet, source, cr + 1, "PAGOS ORDINARIOS DEL CONTRATO", ordinaryPayments(own));
    cr = paymentBlock(cateringSheet, source, cr, "GARANTÍAS DEL CONTRATO", own.filter((p) => p.es_garantia));
  }
  finish(cateringSheet, cr);

  if (data.updates.length) {
    const updates = sheetFromTemplate(book, source, "Actualizaciones", 7);
    band(updates, source, 1, "ACTUALIZACIONES REGISTRADAS — ANTECEDENTES QUE NO SE SUMAN AL PRECIO VIGENTE");
    row(updates, source, 2, 42, ["Servicio", "Inicio", "Ajuste", "Tipo", "Valor inicial", "Valor ajustado", "Porcentaje"]);
    data.updates.forEach((update, index) => {
      row(updates, source, index + 3, 43, [data.services.find((s) => s.id === update.evento_servicio_id)?.servicios_catalogo?.nombre ?? "Servicio",
        date(update.fecha_inicio), date(update.fecha_ajuste), update.tipo === "ipc" ? "IPC" : "Porcentaje fijo", update.valor_inicial, update.valor_ajustado, update.porcentaje_aplicado === null ? null : update.porcentaje_aplicado / 100]);
      updates.getCell(index + 3, 7).numFmt = RATE;
    });
    finish(updates, data.updates.length + 2);
  }
}

function cateringWorkbook(book: ExcelJS.Workbook, template: ExcelJS.Workbook, data: CateringExportData) {
  const source = template.getWorksheet("DC")!;
  const sheet = sheetFromTemplate(book, source, "DC", 17);
  // The reference reserves 15 prices; only the current one has a valid mapping.
  [36, 38, 20, 20, 20, 16, 22, 22].forEach((width, index) => { sheet.getColumn(index + 1).width = width; });
  sheet.pageSetup.paperSize = 8 as ExcelJS.PaperSize; // ExcelJS's enum omits the OOXML value for A3.
  const c = data.catering;
  const amounts = cateringAmounts(data);
  const e = data.eventAllowed ? data.event : null;
  for (let r = 1; r <= 18; r++) row(sheet, source, r, r, [], 17);
  for (const [address, label] of Object.entries({ A1: "Tipo de evento", A2: "Tipo de servicio", A3: "Cliente", A4: "Fecha", C4: "Adultos", D4: "Jóvenes", E4: "Menores", F4: "Bebés",
    A5: "PAX comida", A6: "PAX después del postre", A7: "PAX final", A8: "Salón / lugar", A9: "Organizador / agencia", A10: "Ejecutiva",
    A11: "Razón social", A12: "Precio vigente por persona", A13: "Precio cierre alimentos sin IVA", A14: "Precio cierre bebidas sin IVA" })) cell(sheet, address, label);
  cell(sheet, "B1", e?.tipo_evento ?? c.tipo_evento); cell(sheet, "B2", c.tipo_servicio);
  cell(sheet, "B3", e?.cliente_nombre ?? c.cliente_nombre);
  cell(sheet, "B4", date(e?.fecha_evento ?? c.fecha_evento), DATE);
  [c.pax_adultos, c.pax_jovenes, c.pax_menores, c.pax_bebes].forEach((pax, index) => cell(sheet, `${String.fromCharCode(67 + index)}5`, pax, "0"));
  cell(sheet, "B5", c.pax_comida, "0"); cell(sheet, "B6", c.pax_post_postre, "0"); cell(sheet, "B7", c.pax_final, "0");
  cell(sheet, "B8", e?.salones?.nombre ?? (c.evento_id ? c.salones?.nombre ?? null : `Kiria · ${c.lugar_evento ?? "Sin lugar guardado"}`));
  cell(sheet, "B9", e?.organizador_nombre ?? "Sin dato disponible para esta descarga");
  cell(sheet, "B10", c.usuarios?.full_name ?? c.usuarios?.email ?? null); cell(sheet, "B11", e?.cliente_razon_social ?? c.cliente_razon_social);
  cell(sheet, "B12", amounts.unitPrice, MONEY); cell(sheet, "B13", c.precio_cierre_alimentos_sin_iva, MONEY); cell(sheet, "B14", c.precio_cierre_bebidas_sin_iva, MONEY);
  note(sheet, source, 15, "El precio vigente es general. No se guarda un desglose histórico entre alimentos y bebidas ni una asignación de pagos a versiones de precios.", 8);
  cell(sheet, "C17", "Precio vigente");
  row(sheet, source, 18, 18, ["Concepto", "Descripción", "Precio unitario ARS", null, null, null, "PAX guardados", amounts.pax], 8);
  sheet.getCell("H18").numFmt = "0";
  row(sheet, source, 19, 19, ["Precio general sin desglose", c.tipo_servicio, amounts.unitPrice, null, null, null, "Importe por PAX", amounts.paxSubtotal], 8);
  let r = 20;
  const itemLabels: Record<string, string> = { alimentos: "Alimentos — ítem guardado", bebidas_alcoholicas: "Bebidas — ítem guardado", adicional_alimentos: "Adicional de alimentos", adicional_bebidas: "Adicional de bebidas", adicional_otros: "Adicional otros" };
  for (const item of data.items) {
    const extra = item.categoria.startsWith("adicional_");
    row(sheet, source, r++, 21, [itemLabels[item.categoria] ?? "Ítem sin clasificación", item.descripcion, item.precio_unitario, null, null, null,
      extra ? "Importe adicional" : "Precio guardado", item.precio_unitario], 8);
  }
  if (!data.items.length) note(sheet, source, r++, "Sin adicionales guardados.", 8);
  r = Math.max(r + 1, 32);
  total(sheet, source, r++, "Subtotal según precio vigente × PAX y precios de ítems", amounts.subtotal, 8);
  band(sheet, source, r++, "TOTALES DEL DETALLE COMERCIAL", 8);
  const officialTotalRow = r;
  book.definedNames.add(`'DC'!$H$${r}`, "TotalCateringDetalle");
  total(sheet, source, r++, "Total del catering — detalle", amounts.storedTotal, 8);
  book.definedNames.add(`'DC'!$H$${r}`, "SaldoCateringDetalle");
  total(sheet, source, r++, "Saldo pendiente — detalle", amounts.detailBalance, 8);
  total(sheet, source, r++, "Cobrado acumulado guardado utilizado por el detalle", c.total_pagado, 8);
  total(sheet, source, r++, "Cobros ordinarios registrados", amounts.paid, 8);
  total(sheet, source, r++, "Garantías registradas — no reducen el saldo", amounts.guarantees, 8);
  if (amounts.difference !== 0) note(sheet, source, r++, `El total del detalle es ${money(amounts.storedTotal)} y el desglose según los datos actuales suma ${money(amounts.calculatedTotal)}. Diferencia: ${money(amounts.difference)}. Se mantiene el total del detalle.`, 8);
  if (amounts.storedPaid !== amounts.paid) note(sheet, source, r++, `El cobrado acumulado guardado es ${money(amounts.storedPaid)} y los pagos ordinarios disponibles suman ${money(amounts.paid)}. El saldo del detalle utiliza el acumulado guardado.`, 8);
  if (amounts.detailBalance !== amounts.incomeBalance) note(sheet, source, r++, `El saldo del detalle es ${money(amounts.detailBalance)}. En la pantalla de ingresos, el saldo pendiente es ${money(amounts.incomeBalance)}, calculado con los cobros ordinarios y con mínimo cero.`, 8);
  if (amounts.unitPrice === null) note(sheet, source, r++, "No hay un precio vigente por persona guardado. El total del detalle se conserva sin reconstruir precios.", 8);
  if (!data.eventAllowed) note(sheet, source, r++, `${PARTIAL_NOTICE} Los datos del evento vinculado no están incluidos.`, 8);
  note(sheet, source, r++, "Los saldos negativos del detalle indican un importe a favor. No se asignaron PAX ni precios a los pagos.", 8);
  r = paymentBlock(sheet, source, r + 1, "PAGOS ORDINARIOS", ordinaryPayments(data.payments), undefined, 8);
  r = paymentBlock(sheet, source, r, "GARANTÍAS", uniquePayments(data.payments).filter((p) => p.es_garantia), undefined, 8);
  band(sheet, source, r++, "COMISIÓN Y REVISIÓN DEL DESGLOSE ACTUAL", 8);
  for (const [label, value] of [["Comisión organizador", c.comision_organizador_monto], ["IVA de la comisión según tasa guardada", amounts.commissionVat],
    ["IVA del precio vigente y los ítems según tasa guardada", amounts.vat], ["Total según precios y adicionales actuales (incluye comisión e IVA)", amounts.calculatedTotal],
    ["Total sin IVA guardado", c.total_sin_iva]] as const) total(sheet, source, r++, label, value, 8);
  note(sheet, source, r++, `Tasa de IVA catering: ${c.iva_porcentaje === null ? "sin dato guardado" : `${c.iva_porcentaje * 100} %`}. Tasa de IVA comisión: ${c.iva_comision === null ? "sin dato guardado" : `${c.iva_comision * 100} %`}.`, 8);
  band(sheet, source, r++, "FACTURACIÓN", 8);
  for (const [label, value] of [["Monto con factura", c.monto_con_factura], ["Monto sin factura", c.monto_sin_factura]] as const) total(sheet, source, r++, label, value, 8);
  if (c.monto_con_factura !== null && c.monto_sin_factura !== null && roundMoney(c.monto_con_factura + c.monto_sin_factura) !== amounts.storedTotal) note(sheet, source, r++, `Los montos con y sin factura guardados suman ${money(roundMoney(c.monto_con_factura + c.monto_sin_factura))}. El total del detalle es ${money(amounts.storedTotal)}. No se ajustaron los datos de facturación.`, 8);
  for (const [label, value] of [["Emite factura", c.emite_factura === null ? null : c.emite_factura ? "Sí" : "No"], ["Razón social", c.factura_razon_social], ["CUIT", c.factura_cuit], ["Dirección", c.factura_direccion], ["Concepto", c.factura_concepto], ["Contacto administrativo", c.factura_contacto_admin]] as const) note(sheet, source, r++, `${label}: ${value ?? "Sin dato guardado"}`, 8);
  r = contactsBlock(sheet, source, r + 1, data.contacts, e?.cliente_contacto ?? (!c.evento_id ? c.cliente_contacto : null), 8);
  if (c.notas) note(sheet, source, r++, `Observaciones: ${c.notas}`, 8);
  finish(sheet, r, 8);

  for (const name of ["INDEC", "% FIJO "]) {
    const columns = name === "INDEC" ? 9 : 6;
    const aux = sheetFromTemplate(book, template.getWorksheet(name)!, name, columns);
    const original = template.getWorksheet(name)!;
    const rows = name === "INDEC" ? 29 : 43;
    for (let i = 1; i <= rows; i++) row(aux, original, i, i, [], columns);
    const headers = name === "INDEC"
      ? ["Valor inicial", "Fecha inicio", "Mes inicial", "Mes ajuste", "INDEC mes anterior", "% INDEC IPC", "Valor ajustado", "Índice IPC", "Mes del índice"]
      : ["Valor inicial", "Fecha inicio", "Mes inicial", "Mes ajuste", "Porcentaje fijo", "Valor ajustado"];
    for (const headerRow of name === "INDEC" ? [2, 9, 17, 24] : [2, 13, 24, 35]) row(aux, original, headerRow, headerRow, headers, columns);
    const title = name === "INDEC" ? "ACTUALIZACIÓN SEGÚN INDEC" : "ACTUALIZACIÓN SEGÚN PORCENTAJE FIJO";
    band(aux, source, 1, title, columns);
    if (name !== "INDEC") for (const titleRow of [12, 23, 34]) band(aux, source, titleRow, title, columns);
    note(aux, source, 3, "Sin datos aplicables guardados para este catering. No se completaron índices, porcentajes ni fechas.", columns);
    finish(aux, 4, columns);
  }
  const totals = sheetFromTemplate(book, source, "VALORES TOTALES POR SEPARADO", 8);
  for (let col = 1; col <= 7; col++) totals.getColumn(col).width = 14;
  totals.getColumn(8).width = 22;
  let tr = 1;
  band(totals, source, tr++, "VALORES TOTALES POR SEPARADO", 8);
  tr++;
  total(totals, source, tr++, "Precio general × PAX — sin desglose alimentos/bebidas", amounts.paxSubtotal, 8);
  for (const category of ["alimentos", "bebidas_alcoholicas", "adicional_alimentos", "adicional_bebidas", "adicional_otros"]) total(totals, source, tr++, itemLabels[category], sum(data.items.filter((i) => i.categoria === category).map((i) => i.precio_unitario)), 8);
  total(totals, source, tr++, "Comisión organizador", amounts.commission, 8);
  total(totals, source, tr++, "IVA del desglose actual (catering y comisión)", roundMoney(amounts.vat + amounts.commissionVat), 8);
  total(totals, source, tr++, "Total según precios y adicionales actuales", amounts.calculatedTotal, 8);
  total(totals, source, tr, "Total del catering — detalle", amounts.storedTotal, 8);
  totals.getCell(`H${tr}`).value = { formula: `'DC'!H${officialTotalRow}`, result: amounts.storedTotal };
  tr++;
  total(totals, source, tr++, "Diferencia entre total del detalle y desglose actual", amounts.difference, 8);
  note(totals, source, tr++, amounts.unitPrice === null ? "No puede verificarse el desglose completo porque falta el precio vigente por persona. El total del detalle se conserva." : amounts.difference ? "El desglose no concilia con el total del detalle. La diferencia se informa por separado y no se distribuye entre conceptos." : "El desglose actual coincide con el total del detalle.", 8);
  finish(totals, tr, 8);

  const history = sheetFromTemplate(book, source, "Historial de precios", 7);
  [19, 24, 22, 14, 14, 14, 14].forEach((width, index) => { history.getColumn(index + 1).width = width; });
  band(history, source, 1, "HISTORIAL REAL DE PRECIOS — SIN ASIGNACIÓN A PAGOS");
  row(history, source, 2, 36, ["Fecha", "Motivo", "Precio por persona", "Adultos", "Jóvenes", "Menores", "Bebés"]);
  data.history.forEach((entry, index) => {
    row(history, source, index + 3, 37, [date(entry.fecha), entry.motivo, entry.precio_unitario, entry.pax_adultos, entry.pax_jovenes, entry.pax_menores, entry.pax_bebes]);
    for (let col = 4; col <= 7; col++) history.getCell(index + 3, col).numFmt = "0";
  });
  if (!data.history.length) note(history, source, 3, "Sin precios históricos guardados.");
  finish(history, Math.max(3, data.history.length + 2));
}

export async function buildCommercialWorkbook(data: CommercialExportData) {
  const template = new ExcelJS.Workbook();
  await template.xlsx.readFile(path.join(process.cwd(), "resources", "commercial-excel", `${data.kind}.xlsx`));
  const book = new ExcelJS.Workbook();
  book.creator = "Software Eventos";
  book.lastModifiedBy = "Software Eventos";
  book.created = new Date(); book.modified = new Date();
  book.calcProperties.fullCalcOnLoad = true;
  if (data.kind === "evento") eventWorkbook(book, template, data);
  else cateringWorkbook(book, template, data);
  return book;
}

export function exportFilename(kind: "evento" | "catering", id: string, now = new Date()) {
  const day = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Argentina/Buenos_Aires", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
  return `${kind}-${id.replace(/[^a-zA-Z0-9-]/g, "").slice(0, 64)}-${day}.xlsx`;
}
