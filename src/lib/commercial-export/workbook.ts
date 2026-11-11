import ExcelJS from "exceljs";
import path from "node:path";
import { nombreCategoria } from "../catering/coberturas";
import { categoriasPax } from "../eventos/asistentes";
import { cateringAmounts, ordinaryPayments, PARTIAL_NOTICE, paymentAmount, SEPARATE_NOTICE, serviceAmounts, uniquePayments } from "./calculations";
import { getArgentinaPaymentDay, isChequePending, roundMoney, sumGuarantees, sumOrdinaryPayments, toMoneyNumber } from "../pagos/calculos";
import { ExportError, type CateringExportData, type CommercialExportData, type EventExportData, type ExportContact, type ExportPayment, type PaymentHistoryExportData } from "./types";

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

function paymentLabel(payment: Pick<ExportPayment, "forma_pago" | "moneda">) {
  const labels: Record<string, string> = { efectivo_pesos: "Efectivo", efectivo_dolares: "Efectivo", transferencia: "Transferencia", cheque: "Cheque", retenciones: "Retenciones", efectivo_euros: "Efectivo" };
  return `${labels[payment.forma_pago] ?? payment.forma_pago} ${payment.moneda}`;
}

function pendingCheques(payments: ExportPayment[]) {
  return uniquePayments(payments).filter((p) => !p.es_garantia && isChequePending(p));
}

function paymentBlock(sheet: Sheet, source: Sheet, start: number, title: string, payments: ExportPayment[], debt?: number, columns = 7) {
  let r = start;
  band(sheet, source, r++, title, columns);
  const headers = ["Medio y moneda", "Pago / acreditación", "Banco", "N° cheque", "Importe original", "Cotización ARS", "Importe ARS"];
  row(sheet, source, r++, source.name === "DC" ? 36 : 42, headers, columns);
  for (const payment of uniquePayments(payments)) {
    row(sheet, source, r, source.name === "DC" ? 37 : 43,
      [paymentLabel(payment), date(payment.fecha_pago), payment.banco, payment.numero_cheque,
        payment.importe_moneda_original, payment.tipo_cambio, payment.importe_en_pesos === null && payment.moneda !== "ARS" ? null : paymentAmount(payment)], columns);
    sheet.getCell(r, 6).numFmt = "0.0000";
    sheet.getCell(r, 6).dataValidation = { type: "decimal", operator: "greaterThan", formulae: [0], allowBlank: true };
    sheet.getCell(r, 2).dataValidation = { type: "date", operator: "between", formulae: [new Date("1900-01-01"), new Date("9999-12-31")], allowBlank: true };
    r++;
    const registro = payment.forma_pago === "cheque"
      ? `${isChequePending(payment) ? "Pendiente" : "Acreditado"} · Registrado: ${getArgentinaPaymentDay(new Date(payment.created_at))}`
      : null;
    const imputacion = payment.pago_id && payment.pago_id !== payment.id ? `Imputación del cobro ${payment.pago_id}` : null;
    const details = [registro, imputacion, payment.concepto, payment.notas].filter(Boolean);
    if (details.length) note(sheet, source, r++, details.join(" · "), columns);
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
    if (service.ajuste_ipc) note(sheet, source, r++, `Ajuste IPC incluido en el total: ${money(service.ajuste_ipc)}. Cargo por importe, separado del IVA.`);
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
      service.iva_base_imponible, service.iva_porcentaje, roundMoney(numeric(service.iva_base_imponible) * numeric(service.iva_porcentaje)), amounts.paid, amounts.balance]);
    sheet.getCell(r++, 4).numFmt = RATE;
    if (numeric(service.total_pagado) !== amounts.paid) note(sheet, source, r++, `Los cobros del detalle de ${service.servicios_catalogo?.nombre ?? "este servicio"} suman ${money(amounts.paid)}. El cobrado acreditado es ${money(numeric(service.total_pagado))}. Se exportan los cobros ordinarios del detalle.`);
    if (roundMoney(numeric(service.saldo_pendiente)) !== amounts.balance) {
      note(sheet, source, r++, `El saldo mostrado en el detalle de ${service.servicios_catalogo?.nombre ?? "este servicio"} es ${money(amounts.balance)}. El saldo SQL es ${money(numeric(service.saldo_pendiente))}. Se exporta el saldo del detalle.`);
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
  const pending = pendingCheques(payments);
  if (pending.length) r = paymentBlock(sheet, source, r, "CHEQUES PENDIENTES — NO APLICADOS AL SALDO", pending);
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
    total(cateringSheet, source, cr++, "Cobrado acreditado", catering.total_pagado);
    total(cateringSheet, source, cr++, "Cobros ordinarios registrados", sumOrdinaryPayments(own));
    total(cateringSheet, source, cr++, "Garantías registradas", sumGuarantees(own));
    if (numeric(catering.total_pagado) !== sumOrdinaryPayments(own)) note(cateringSheet, source, cr++, `El cobrado acreditado es ${money(numeric(catering.total_pagado))} y los pagos ordinarios disponibles suman ${money(sumOrdinaryPayments(own))}. El saldo del detalle utiliza el importe acreditado.`);
    cr = paymentBlock(cateringSheet, source, cr + 1, "PAGOS ORDINARIOS DEL CONTRATO", ordinaryPayments(own));
    cr = paymentBlock(cateringSheet, source, cr, "GARANTÍAS DEL CONTRATO", own.filter((p) => p.es_garantia));
    const pending = pendingCheques(own);
    if (pending.length) cr = paymentBlock(cateringSheet, source, cr, "CHEQUES PENDIENTES — NO APLICADOS AL SALDO", pending);
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
    A11: "Razón social", A12: "Precio general vigente sin IVA", A13: "Precio cierre alimentos sin IVA", A14: "Precio cierre bebidas sin IVA" })) cell(sheet, address, label);
  cell(sheet, "B1", e?.tipo_evento ?? c.tipo_evento); cell(sheet, "B2", c.tipo_servicio);
  cell(sheet, "B3", e?.cliente_nombre ?? c.cliente_nombre);
  cell(sheet, "B4", date(e?.fecha_evento ?? c.fecha_evento), DATE);
  [c.pax_adultos, c.pax_jovenes, c.pax_menores, c.pax_bebes].forEach((pax, index) => cell(sheet, `${String.fromCharCode(67 + index)}5`, pax, "0"));
  cell(sheet, "B5", c.pax_comida, "0"); cell(sheet, "B6", c.pax_post_postre, "0"); cell(sheet, "B7", c.pax_final, "0");
  cell(sheet, "B8", e?.salones?.nombre ?? (c.evento_id ? c.salones?.nombre ?? null : `Kiria · ${c.lugar_evento ?? "Sin lugar guardado"}`));
  cell(sheet, "B9", e?.organizador_nombre ?? "Sin dato disponible para esta descarga");
  cell(sheet, "B10", c.usuarios?.full_name ?? c.usuarios?.email ?? null); cell(sheet, "B11", e?.cliente_razon_social ?? c.cliente_razon_social);
  cell(sheet, "B12", amounts.unitPrice, MONEY); cell(sheet, "B13", c.precio_cierre_alimentos_sin_iva, MONEY); cell(sheet, "B14", c.precio_cierre_bebidas_sin_iva, MONEY);
  note(sheet, source, 15, "Los precios por categoría usan el precio general cuando no hay un valor específico. La cobertura conserva el precio aplicado al cobrar.", 8);
  cell(sheet, "C17", "Precio vigente");
  row(sheet, source, 18, 18, ["Concepto", "Descripción", "Precio unitario ARS", null, null, null, "PAX guardados", amounts.pax], 8);
  sheet.getCell("H18").numFmt = "0";
  row(sheet, source, 19, 19, ["Precio general de respaldo", c.tipo_servicio, amounts.unitPrice, null, null, null, "Importe base por PAX", amounts.paxSubtotal], 8);
  let r = 20;
  if (data.tarifas.length > 0) {
    row(sheet, source, r++, 18, ["Categoría", "PAX contratados", "Precio base sin IVA", "Adicional por persona sin IVA", "Precio aplicado con IVA", "Cubiertos", "PAX pendientes", "Saldo de PAX"], 8);
    for (const [categoria, label] of categoriasPax) {
      const tarifa = data.tarifas.find((t) => t.categoria === categoria);
      if (!tarifa) continue;
      row(sheet, source, r, 19, [label, tarifa.pax, tarifa.precio_base, tarifa.adicional_unitario, tarifa.precio_aplicado,
        tarifa.cubiertos, tarifa.pendientes, tarifa.saldo_categoria], 8);
      for (const col of [2, 6, 7]) sheet.getCell(r, col).numFmt = "0";
      r++;
    }
  }
  const itemLabels: Record<string, string> = { alimentos: "Alimentos — ítem guardado", bebidas_alcoholicas: "Bebidas — ítem guardado", adicional_alimentos: "Adicional de alimentos", adicional_bebidas: "Adicional de bebidas", adicional_otros: "Adicional otros" };
  for (const item of data.items) {
    const modo = item.categorias_pax ? `Por persona · ${item.categorias_pax.map(nombreCategoria).join(", ")}` : "Cargo fijo";
    row(sheet, source, r++, 21, [itemLabels[item.categoria] ?? "Ítem sin clasificación", item.descripcion, item.precio_unitario, modo], 8);
  }
  if (!data.items.length) note(sheet, source, r++, "Sin adicionales guardados.", 8);
  r = Math.max(r + 1, 32);
  total(sheet, source, r++, "Subtotal de PAX y adicionales", amounts.subtotal, 8);
  band(sheet, source, r++, "TOTALES DEL DETALLE COMERCIAL", 8);
  const officialTotalRow = r;
  book.definedNames.add(`'DC'!$H$${r}`, "TotalCateringDetalle");
  total(sheet, source, r++, "Total del catering — detalle", amounts.storedTotal, 8);
  book.definedNames.add(`'DC'!$H$${r}`, "SaldoCateringDetalle");
  total(sheet, source, r++, "Saldo pendiente — detalle", amounts.detailBalance, 8);
  if (c.ajuste_ipc) total(sheet, source, r++, "Ajuste IPC incluido — cargo por importe, separado del IVA", c.ajuste_ipc, 8);
  total(sheet, source, r++, "Cobrado acreditado utilizado por el detalle", c.total_pagado, 8);
  total(sheet, source, r++, "Cobros ordinarios registrados", amounts.paid, 8);
  total(sheet, source, r++, "Garantías registradas — no reducen el saldo", amounts.guarantees, 8);
  if (amounts.difference !== 0) note(sheet, source, r++, `El total del detalle es ${money(amounts.storedTotal)} y el desglose según los datos actuales suma ${money(amounts.calculatedTotal)}. Diferencia: ${money(amounts.difference)}. Se mantiene el total del detalle.`, 8);
  if (amounts.storedPaid !== amounts.paid) note(sheet, source, r++, `El cobrado acreditado es ${money(amounts.storedPaid)} y los pagos ordinarios disponibles suman ${money(amounts.paid)}. El saldo del detalle utiliza el importe acreditado.`, 8);
  if (amounts.detailBalance !== amounts.incomeBalance) note(sheet, source, r++, `El saldo del detalle es ${money(amounts.detailBalance)}. En la pantalla de ingresos, el saldo pendiente es ${money(amounts.incomeBalance)}, con mínimo cero.`, 8);
  if (amounts.unitPrice === null) note(sheet, source, r++, "No hay un precio vigente por persona guardado. El total del detalle se conserva sin reconstruir precios.", 8);
  if (!data.eventAllowed) note(sheet, source, r++, `${PARTIAL_NOTICE} Los datos del evento vinculado no están incluidos.`, 8);
  note(sheet, source, r++, "Los saldos negativos del detalle indican un importe a favor.", 8);
  r = paymentBlock(sheet, source, r + 1, "PAGOS ORDINARIOS", ordinaryPayments(data.payments), undefined, 8);
  r = paymentBlock(sheet, source, r, "GARANTÍAS", uniquePayments(data.payments).filter((p) => p.es_garantia), undefined, 8);
  const pending = pendingCheques(data.payments);
  if (pending.length) r = paymentBlock(sheet, source, r, "CHEQUES PENDIENTES — NO APLICADOS AL SALDO", pending, undefined, 8);
  if (data.coberturas.length > 0) {
    band(sheet, source, r++, "COBERTURA HISTÓRICA POR PERSONAS", 8);
    row(sheet, source, r++, 18, ["Categoría", "PAX del cobro", "Precio aplicado con IVA", "Importe original", "PAX reasignados", "Estado"], 8);
    for (const linea of data.coberturas) {
      const pago = data.payments.find((p) => (p.pago_id ?? p.id) === linea.pago_id);
      row(sheet, source, r, 19, [nombreCategoria(linea.categoria), linea.cantidad, linea.precio_aplicado,
        linea.importe_historico, linea.liberada, pago && isChequePending(pago) ? "Por acreditar" : "Acreditado"], 8);
      for (const col of [2, 5]) sheet.getCell(r, col).numFmt = "0";
      r++;
    }
  }
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
  total(totals, source, tr++, "Precios base por categoría × PAX", amounts.paxSubtotal, 8);
  const extras = data.costos.extras_por_tipo;
  for (const category of ["alimentos", "bebidas_alcoholicas", "adicional_alimentos", "adicional_bebidas", "adicional_otros"]) {
    const importe = extras && typeof extras === "object" && !Array.isArray(extras) ? extras[category] : null;
    total(totals, source, tr++, itemLabels[category], typeof importe === "number" ? importe : 0, 8);
  }
  total(totals, source, tr++, "Comisión organizador", amounts.commission, 8);
  total(totals, source, tr++, "IVA del desglose actual (catering y comisión)", roundMoney(amounts.vat + amounts.commissionVat), 8);
  total(totals, source, tr++, "Total según precios y adicionales actuales", amounts.calculatedTotal, 8);
  total(totals, source, tr, "Total del catering — detalle", amounts.storedTotal, 8);
  totals.getCell(`H${tr}`).value = { formula: `'DC'!H${officialTotalRow}`, result: amounts.storedTotal };
  tr++;
  total(totals, source, tr++, "Diferencia entre total del detalle y desglose actual", amounts.difference, 8);
  note(totals, source, tr++, amounts.unitPrice === null ? "No puede verificarse el desglose completo porque falta el precio vigente por persona. El total del detalle se conserva." : amounts.difference ? "El desglose no concilia con el total del detalle. La diferencia se informa por separado y no se distribuye entre conceptos." : "El desglose actual coincide con el total del detalle.", 8);
  finish(totals, tr, 8);

  const history = sheetFromTemplate(book, source, "Historial de precios", 11);
  [19, 24, 22, 14, 14, 14, 14, 18, 18, 18, 18].forEach((width, index) => { history.getColumn(index + 1).width = width; });
  band(history, source, 1, "HISTORIAL DE PRECIOS SIN IVA", 11);
  row(history, source, 2, 36, ["Fecha", "Motivo", "Precio general", "PAX adultos", "PAX jóvenes", "PAX menores", "PAX bebés", "Precio adultos", "Precio jóvenes", "Precio menores", "Precio bebés"], 11);
  data.history.forEach((entry, index) => {
    row(history, source, index + 3, 37, [date(entry.fecha), entry.motivo, entry.precio_unitario, entry.pax_adultos, entry.pax_jovenes, entry.pax_menores, entry.pax_bebes,
      entry.precio_adultos, entry.precio_jovenes, entry.precio_menores, entry.precio_bebes], 11);
    for (let col = 4; col <= 7; col++) history.getCell(index + 3, col).numFmt = "0";
  });
  if (!data.history.length) note(history, source, 3, "Sin precios históricos guardados.");
  finish(history, Math.max(3, data.history.length + 2), 11);
}

function paymentHistoryWorkbook(book: ExcelJS.Workbook, template: ExcelJS.Workbook, data: PaymentHistoryExportData) {
  const source = template.getWorksheet("CLIENTE")!;
  const { event, ingresos } = data;
  const payments = ingresos.pagos;
  const ids = new Map(payments.map((p, i) => [p.id, i + 1]));
  const destinations = new Map([
    ...data.servicios.map((s) => [`servicio:${s.id}`, s.servicios_catalogo?.nombre ?? "Servicio sin nombre"] as const),
    ...ingresos.cateringDestinos.map((c) => [c.value, c.label] as const),
  ]);
  const pending = (p: (typeof payments)[number]) => isChequePending(p, ingresos.fechaSaldo);
  const sheet = sheetFromTemplate(book, source, "PAGOS", 12);
  [9, 15, 17, 29, 22, 10, 17, 18, 20, 18, 22, 18].forEach((width, i) => { sheet.getColumn(i + 1).width = width; });
  let r = 1;
  band(sheet, source, r++, "DETALLE DE PAGOS", 12);
  note(sheet, source, r++, `Cliente: ${event.cliente_nombre}\nEvento: ${event.nombre_evento ?? event.tipo_evento ?? "Sin nombre"}\nSalón: ${event.salones?.nombre ?? "No disponible"}`, 12);
  row(sheet, source, r++, 90, ["Fecha del evento", date(event.fecha_evento), "Saldo al", date(ingresos.fechaSaldo)], 12);
  total(sheet, source, r++, "Total a precios vigentes (ARS)", ingresos.totalEvento, 12);
  total(sheet, source, r++, "Ajuste por cobertura histórica de catering (ARS)", ingresos.ajusteCobertura, 12);
  total(sheet, source, r++, "Ingresos ordinarios acreditados (ARS)", ingresos.totalCobrado, 12);
  total(sheet, source, r++, "Saldo pendiente (ARS)", ingresos.saldoPendiente, 12);
  total(sheet, source, r++, "Cheques ordinarios pendientes de acreditación (ARS)", sum(payments.filter((p) => !p.es_garantia && pending(p)).map((p) => p.importe_en_pesos)), 12);
  total(sheet, source, r++, "Garantías registradas (ARS)", sumGuarantees(payments), 12);
  note(sheet, source, r++, "Saldo a la fecha indicada, con mínimo cero: total vigente + ajuste por cobertura histórica − ingresos ordinarios acreditados. Las garantías y los cheques pendientes no reducen el saldo. Para cheques, la fecha de pago / acreditación es su fecha de acreditación prevista.", 12);
  if (payments.some((p) => p.moneda !== "ARS" && p.importe_en_pesos === null)) {
    note(sheet, source, r++, "Hay cobros sin equivalente histórico en ARS. Sus celdas quedan vacías; los totales incluyen únicamente los equivalentes disponibles, igual que Ingresos. No se recalculan con una cotización actual.", 12);
  }
  for (const guarantee of [false, true]) {
    band(sheet, source, r++, guarantee ? "GARANTÍAS" : "COBROS ORDINARIOS", 12);
    row(sheet, source, r++, 42, ["Cobro", "Fecha de registro", "Pago / acreditación", "Concepto", "Medio de pago", "Moneda", "Cotización ARS", "Importe original", "Equivalente ARS", "Estado", "Banco", "N° cheque"], 12);
    const group = payments.filter((p) => p.es_garantia === guarantee);
    for (const p of group) {
      row(sheet, source, r, 43, [ids.get(p.id)!, date(getArgentinaPaymentDay(new Date(p.created_at))), date(p.fecha_pago), p.concepto,
        paymentLabel(p).replace(` ${p.moneda}`, ""), p.moneda, p.moneda === "ARS" ? null : p.tipo_cambio,
        p.importe_moneda_original, p.importe_en_pesos, p.forma_pago === "cheque" ? pending(p) ? "Pendiente" : "Acreditado" : "Registrado", p.banco, p.numero_cheque], 12);
      sheet.getCell(r++, 1).numFmt = "0";
    }
    if (!group.length) note(sheet, source, r++, guarantee ? "Sin garantías registradas." : "Sin cobros ordinarios registrados.", 12);
  }
  sheet.views = [{ state: "frozen", ySplit: 1, showGridLines: false }];
  finish(sheet, r - 1, 12);

  const allocations = sheetFromTemplate(book, source, "IMPUTACIONES", 4);
  [9, 48, 22, 22].forEach((width, i) => { allocations.getColumn(i + 1).width = width; });
  band(allocations, source, 1, "IMPUTACIONES POR DESTINO", 4);
  note(allocations, source, 2, "El número de cobro corresponde a PAGOS. Los importes de esta hoja distribuyen el cobro; no son ingresos adicionales. Las garantías se identifican por separado.", 4);
  row(allocations, source, 3, 42, ["Cobro", "Destino", "Importe imputado ARS", "Tipo"], 4);
  r = 4;
  for (const p of payments) {
    const lines = p.pago_imputaciones.length ? p.pago_imputaciones : [{ evento_servicio_id: p.evento_servicio_id,
      catering_contrato_id: p.catering_contrato_id, importe_ars: p.importe_en_pesos }];
    for (const line of lines) {
      const destination = line.evento_servicio_id ? `servicio:${line.evento_servicio_id}` : line.catering_contrato_id ? `catering:${line.catering_contrato_id}` : null;
      row(allocations, source, r, 43, [ids.get(p.id)!, destination ? destinations.get(destination) ?? `Destino no disponible (${destination})` : "Sin imputación",
        line.importe_ars, p.es_garantia ? "Garantía" : "Cobro ordinario"], 4);
      allocations.getCell(r++, 1).numFmt = "0";
    }
  }
  if (!payments.length) note(allocations, source, r++, "Sin imputaciones registradas.", 4);
  allocations.views = [{ state: "frozen", ySplit: 3, showGridLines: false }];
  finish(allocations, r - 1, 4);

  const pax = sheetFromTemplate(book, source, "PAX", 10);
  [9, 34, 18, 18, 18, 18, 18, 20, 22, 20].forEach((width, i) => { pax.getColumn(i + 1).width = width; });
  band(pax, source, 1, "COBERTURA POR CATEGORÍA", 10);
  note(pax, source, 2, `Cobertura al ${ingresos.fechaSaldo}. Los PAX de cheques pendientes siguen por acreditar. El precio histórico aplicado se conserva aunque el catering se recotice. Los cobros por importe no se convierten a PAX.`, 10);
  row(pax, source, 3, 42, [null, "Destino", "Categoría", "Contratados", "Cubiertos", "Por acreditar", "Pendientes", "Excedente", "Saldo PAX ARS", "Precio vigente ARS"], 10);
  r = 4;
  for (const c of ingresos.coberturas) for (const t of c.tarifas) {
    row(pax, source, r, 43, [null, c.label, nombreCategoria(t.categoria ?? ""), t.pax, t.cubiertos, t.por_acreditar, t.pendientes, t.excedente, t.saldo_categoria, t.precio_aplicado], 10);
    for (let col = 4; col <= 8; col++) pax.getCell(r, col).numFmt = "0";
    r++;
  }
  band(pax, source, r++, "COBERTURA HISTÓRICA POR COBRO", 10);
  row(pax, source, r++, 42, ["Cobro", "Destino", "Categoría", "PAX originales", "Reasignados", "PAX vigentes", "Precio aplicado ARS", "Importe histórico ARS", "Importe vigente ARS", "Estado"], 10);
  let count = 0;
  for (const p of payments) for (const c of p.catering_coberturas) {
    row(pax, source, r, 43, [ids.get(p.id)!, destinations.get(`catering:${c.catering_contrato_id}`) ?? "Destino no disponible",
      nombreCategoria(c.categoria), c.cantidad, c.liberada, c.cantidad - c.liberada, c.precio_aplicado, c.importe_historico,
      roundMoney((c.cantidad - c.liberada) * c.precio_aplicado), pending(p) ? "Por acreditar" : "Acreditado"], 10);
    for (const col of [1, 4, 5, 6]) pax.getCell(r, col).numFmt = "0";
    r++; count++;
  }
  if (!count) note(pax, source, r++, "Sin coberturas históricas registradas.", 10);
  pax.views = [{ state: "frozen", ySplit: 3, showGridLines: false }];
  finish(pax, r - 1, 10);
  for (const output of [sheet, allocations, pax]) {
    if (output.columnCount > 7) output.pageSetup.paperSize = 8 as ExcelJS.PaperSize; // ExcelJS's enum omits A3.
    output.eachRow((line) => {
      const heading = line.getCell(1).value === "Cobro" || (output === pax && line.number === 3);
      const summary = line.getCell(1).isMerged;
      line.eachCell({ includeEmpty: true }, (c) => {
        c.font = { name: "Arial", size: 11, bold: summary ? c.font?.bold : heading };
        if (heading) c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFD9D9D9" } };
        if (!summary) c.border = { bottom: { style: "thin", color: { argb: "FFD9D9D9" } } };
      });
    });
  }
}

export async function buildCommercialWorkbook(data: CommercialExportData) {
  const template = new ExcelJS.Workbook();
  await template.xlsx.readFile(path.join(process.cwd(), "resources", "commercial-excel", `${data.kind === "pagos" ? "evento" : data.kind}.xlsx`));
  const book = new ExcelJS.Workbook();
  book.creator = "Software Eventos";
  book.lastModifiedBy = "Software Eventos";
  book.created = new Date(); book.modified = new Date();
  book.calcProperties.fullCalcOnLoad = true;
  if (data.kind === "pagos") paymentHistoryWorkbook(book, template, data);
  else if (data.kind === "evento") eventWorkbook(book, template, data);
  else cateringWorkbook(book, template, data);
  return book;
}

export function exportFilename(kind: "evento" | "catering" | "pagos", id: string, now = new Date()) {
  const day = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Argentina/Buenos_Aires", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
  return `${kind}-${id.replace(/[^a-zA-Z0-9-]/g, "").slice(0, 64)}-${day}.xlsx`;
}
