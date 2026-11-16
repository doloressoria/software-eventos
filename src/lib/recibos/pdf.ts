import PDFDocument from "pdfkit";
import { nombreCategoria } from "../catering/coberturas";
import { buildReciboPdfV1 } from "./pdf-v1";
import { reciboNumero, type Recibo, type ReciboSnapshot } from "./types";

const money = (value: number | null) => value === null ? "Sin equivalente histórico" : new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS" }).format(value);
const decimal = (value: number) => new Intl.NumberFormat("es-AR", { maximumFractionDigits: 4 }).format(value);
const date = (value: string | null) => value ? value.slice(0, 10).split("-").reverse().join("/") : "Sin fecha";
const media: Record<string, string> = { efectivo_pesos: "EFECTIVO $", efectivo_dolares: "EFECTIVO USD", efectivo_euros: "EFECTIVO EUR", transferencia: "TRANSFERENCIA", cheque: "CHEQUE", retenciones: "RETENCIONES" };

export async function buildReciboPdf(s: ReciboSnapshot, recibo?: Recibo, anterior?: Recibo) {
  if (s.version === 1) return buildReciboPdfV1(s, recibo, anterior);
  if (s.version !== 2) throw new Error("Versión de recibo no compatible");
  const number = recibo ? reciboNumero(recibo) : "SIN EMITIR";
  const emitted = recibo?.emitido_at ?? "2000-01-01T00:00:00Z";
  const doc = new PDFDocument({ size: "A4", margin: 32, bufferPages: true,
    info: { Title: `Recibo ${number}`, Author: s.marca, CreationDate: new Date(emitted), ModDate: new Date(emitted) } });
  const chunks: Buffer[] = [];
  const output = new Promise<Buffer>((resolve, reject) => {
    doc.on("data", chunk => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
  });
  const left = 32, width = doc.page.width - 64, bottom = 734;
  const font = (size: number, bold = false) => doc.font(bold ? "Helvetica-Bold" : "Helvetica").fontSize(size).fillColor("#222222");
  const put = (value: string, x: number, y: number, w: number, size = 9, bold = false, align: "left" | "right" | "center" = "left") => {
    font(size, bold);
    const remaining = Math.max(0, w - doc.widthOfString(value));
    doc.text(value, x + (align === "center" ? remaining / 2 : align === "right" ? remaining : 0), y, { lineBreak: false });
  };
  const line = (x1: number, y1: number, x2: number, y2: number) => doc.save().lineWidth(.6).strokeColor("#444444").moveTo(x1, y1).lineTo(x2, y2).stroke().restore();
  // PDFKit recorta las filas mayores a una página: separamos líneas sin omitir texto.
  const wrap = (value: string, w: number, size = 9, bold = false) => {
    font(size, bold);
    const lines: string[] = [];
    for (const paragraph of value.split("\n")) {
      let current = "";
      for (const word of paragraph.split(/\s+/).filter(Boolean)) {
        if (current && doc.widthOfString(`${current} ${word}`) > w) { lines.push(current); current = ""; }
        for (const char of (current ? ` ${word}` : word)) {
          if (current && doc.widthOfString(current + char) > w) { lines.push(current); current = ""; }
          current += char;
        }
      }
      lines.push(current);
    }
    return lines;
  };
  const brand = wrap(s.marca, 207, 14, true);
  const headerBottom = 30 + Math.max(88, s.logo_data_url ? 88 : brand.length * 17.5 + 24);
  let y = headerBottom + 12;
  const frame = () => {
    doc.save().lineWidth(.8).strokeColor("#444444").rect(left, 30, width, 774).stroke().restore();
    line(left, headerBottom, left + width, headerBottom);
    line(257, 30, 257, headerBottom); line(325, 30, 325, headerBottom);
    if (s.logo_data_url) doc.image(Buffer.from(s.logo_data_url.split(",")[1], "base64"), 44, 42, { fit: [201, 62], align: "center", valign: "center" });
    else brand.forEach((value, i) => put(value, 44, 43 + i * 17.5, 201, 14, true, "center"));
    doc.rect(280, 41, 22, 22).stroke(); put("X", 280, 43, 22, 17, true, "center");
    ["Documento", "no válido", "como factura"].forEach((value, i) => put(value, 261, 70 + i * 8.5, 60, 7, false, "center"));
    const kind = !recibo ? "VISTA PREVIA" : recibo.tipo === "anulacion" ? "ANULACIÓN" : recibo.tipo === "modificacion" ? "MODIFICACIÓN" : "RECIBO";
    put(kind, 339, 42, 209, 10, true);
    put(`Nº ${number}`, 339, 59, 209, 11, true);
    put("Fecha de emisión", 339, 89, 84, 8);
    const parts = recibo ? new Intl.DateTimeFormat("es-AR", { timeZone: "America/Argentina/Buenos_Aires", day: "2-digit", month: "2-digit", year: "numeric" }).formatToParts(new Date(emitted)) : [];
    ["day", "month", "year"].forEach((part, i) => {
      const x = 425 + i * 40;
      doc.rect(x, 82, 35, 23).stroke();
      put(parts.find(p => p.type === part)?.value ?? "", x, 89, 35, 9, false, "center");
    });
  };
  frame();
  const page = () => { doc.addPage(); frame(); y = headerBottom + 12; };
  const ensure = (height: number) => { if (y + height > bottom) page(); };
  const paragraph = (value: string, bold = false, size = 8.5) => {
    const lines = wrap(value, width - 24, size, bold), lh = size * 1.25;
    if (lines.length * lh + 3 < bottom - headerBottom - 12) ensure(lines.length * lh + 3);
    for (const value of lines) { ensure(lh); put(value, left + 12, y, width - 24, size, bold); y += lh; }
    y += 3;
  };
  const field = (label: string, value: string) => {
    const labelWidth = doc.font("Helvetica-Bold").fontSize(9).widthOfString(label) + 10;
    const lines = wrap(value, width - labelWidth - 24);
    ensure(24); put(label, left + 10, y + 4, labelWidth, 9, true);
    for (const value of lines) {
      ensure(18); put(value, left + 10 + labelWidth, y + 4, width - labelWidth - 24);
      doc.save().dash(1, { space: 2 }); line(left + 10 + labelWidth, y + 17, left + width - 10, y + 17); doc.restore();
      y += 19;
    }
    y += 3;
  };
  const paintRow = (cells: string[][], widths: number[], offset: number, count: number, bold = false, size = 9, minHeight = 23) => {
    const height = Math.max(minHeight, count * size * 1.25 + 12);
    let x = left + 10;
    cells.forEach((values, i) => {
      doc.save().lineWidth(.6).strokeColor("#444444").rect(x, y, widths[i], height).stroke().restore();
      values.slice(offset, offset + count).forEach((value, n) => put(value, x + 6, y + 6 + n * size * 1.25, widths[i] - 12, size, bold,
        bold ? "center" : i === cells.length - 1 ? "right" : "left"));
      x += widths[i];
    });
    y += height;
  };
  const table = (headers: string[], rows: string[][], widths: number[]) => {
    const heading = headers.map((v, i) => wrap(v, widths[i] - 12, 8, true));
    const headingLines = Math.max(...heading.map(v => v.length));
    const headingHeight = Math.max(23, headingLines * 10 + 12);
    const head = () => paintRow(heading, widths, 0, headingLines, true, 8);
    ensure(headingHeight + 24); head();
    for (const values of rows) {
      const cells = values.map((v, i) => wrap(v, widths[i] - 12));
      const length = Math.max(...cells.map(v => v.length));
      const rowHeight = Math.max(23, length * 11.25 + 12);
      if (rowHeight <= bottom - headerBottom - 12 - headingHeight && y + rowHeight > bottom) { page(); head(); }
      let offset = 0;
      while (offset < length) {
        if (y + 24 > bottom) { page(); head(); }
        const count = Math.min(length - offset, Math.floor((bottom - y - 12) / 11.25));
        if (count < 1) { page(); head(); continue; }
        paintRow(cells, widths, offset, count); offset += count;
      }
    }
    y += 8;
  };
  field("Señor/es:", s.cliente ?? "Sin nombre");
  line(left, y, left + width, y); y += 7;
  field(recibo && recibo.tipo !== "recibo" ? "Importe del cobro de referencia:" : "Recibimos la suma de:", `${money(s.pago.importe_en_pesos)}${s.estado_acreditacion.includes("pendiente") ? " - pendiente de acreditación" : ""}`);
  field("Evento a realizarse el día:", date(s.fecha_evento));
  field("Evento:", s.evento);
  const originalPax = s.coberturas.reduce((sum, c) => sum + c.cantidad, 0);
  field("Cantidad / PAX:", s.coberturas.length ? `${originalPax} del cobro (${s.coberturas.reduce((sum, c) => sum + c.cantidad - c.liberada, 0)} vigentes)`
    : `${Object.values(s.pax_evento).reduce((sum, count) => sum + count, 0)} contratados de referencia; este cobro no cubre personas`);
  field("Salón / lugar:", s.lugar ?? "Sin especificar");
  line(left, y, left + width, y); y += 13;
  const innerWidth = width - 20;
  const concepts = [...s.imputaciones].sort((a, b) => Number(b.categoria === "salon") - Number(a.categoria === "salon")).map(i => [i.categoria === "salon" ? "SALÓN" : i.categoria === "catering" || i.catering_contrato_id ? "CATERING" : "SERVICIO", i.concepto, money(i.importe_ars)]);
  while (concepts.length < 4) concepts.push(["", "", ""]);
  table(["CONCEPTO", "OPCIÓN", "IMPORTE ARS"], concepts, [110, innerWidth - 218, 108]);
  if (s.pago.concepto) paragraph(`Concepto del cobro: ${s.pago.concepto}`);
  for (const c of s.coberturas) {
    const model = s.componentes.find(d => d.catering_contrato_id === c.catering_contrato_id)?.version_calculo;
    paragraph(`PAX ${nombreCategoria(c.categoria)}: ${c.cantidad} × ${money(c.precio_aplicado)} = ${money(c.importe_historico)} (${model === 2 ? "capital sin IVA" : "histórico con IVA incluido"}); ${c.liberada} reasignados, ${c.cantidad - c.liberada} vigentes.`);
  }
  if (!s.coberturas.length) paragraph(Object.entries(s.pax_evento).map(([k, v]) => `${nombreCategoria(k)}: ${v}`).join(" · "));
  for (const d of s.componentes) {
    const label = s.imputaciones.find(i => i.catering_contrato_id === d.catering_contrato_id)?.concepto ?? "Catering de origen";
    paragraph(d.version_calculo === 2 ? `${label} · Capital objetivo: ${money(d.capital_ars)} · IVA objetivo: ${money(d.iva_ars)}.`
      : `${label} · Objetivo histórico con IVA incluido: ${money(d.objetivo_ars)}; capital / IVA sin conciliar.`);
    paragraph(`Ajuste: ${money(d.ajuste_ars)} (no es dinero recibido). Objetivo = equivalente real + ajuste.${d.version_calculo === 2 ? ` Ajuste capital: ${money(d.ajuste_ars - d.ajuste_iva_ars)}; ajuste IVA: ${money(d.ajuste_iva_ars)}.` : ""}`);
    if (d.capital_reasignado_ars) paragraph(`Capital real reasignado: ${money(d.capital_reasignado_ars)}. El IVA permanece en el origen.`);
  }
  if (!s.componentes.length) paragraph("Sin desglose explícito de capital / IVA; no se infiere de precios actuales.");
  y += 6;
  const p = s.pago;
  const paymentRows = [[p.forma_pago === "cheque" ? p.numero_cheque ?? "Sin registrar" : media[p.forma_pago] ?? p.forma_pago,
    p.forma_pago === "cheque" ? p.banco ?? "Sin registrar" : p.banco ?? "", money(p.importe_en_pesos)], ["", "", ""],
    [`${p.moneda === "USD" ? "DÓLARES" : `MONEDA ${p.moneda}`}: ${new Intl.NumberFormat("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(p.importe_moneda_original)}`, `COTIZACIÓN: ${p.tipo_cambio === null ? "Sin registrar" : decimal(p.tipo_cambio)} ARS / ${p.moneda}`, "Referencia"]];
  ensure(180);
  table(["CHEQUE Nº / MEDIO", "BANCO / DETALLE", "IMPORTE ARS"], paymentRows, [166, innerWidth - 274, 108]);
  y -= 8;
  const totalLabel = recibo && recibo.tipo !== "recibo" ? "IMPORTE DE REFERENCIA - NO ES UN NUEVO INGRESO" : (s.estado_acreditacion.includes("pendiente") ? "TOTAL RECIBIDO (POR ACREDITAR)" : "TOTAL REALMENTE RECIBIDO $");
  const total = [totalLabel, money(p.importe_en_pesos)].map((v, i) => wrap(v, (i ? 108 : innerWidth - 108) - 12, 10, true));
  ensure(37); paintRow(total, [innerWidth - 108, 108], 0, Math.max(...total.map(v => v.length)), true, 10, 32); y += 9;
  paragraph(`${media[p.forma_pago] ?? p.forma_pago} · Fecha de pago / acreditación: ${date(p.fecha_pago)} · Estado al emitir: ${s.estado_acreditacion}`, true);
  if (s.estado_acreditacion.includes("pendiente")) paragraph("Recibido pendiente de acreditación. No cancela deuda mientras esté pendiente.", true);
  if (s.garantia) paragraph("GARANTÍA: no cancela deuda ordinaria.", true);
  if (recibo?.tipo === "anulacion") paragraph("COBRO ANULADO. Conserva la referencia histórica; no registra una devolución.", true);
  if (anterior) paragraph(`Vinculado a ${reciboNumero(anterior)}. Conserva el comprobante anterior; no representa otro ingreso.`, true);
  if (!recibo) paragraph("Vista previa informativa. Al emitir se guardan los datos actuales y se asigna un número único.");
  ensure(18); paragraph(`Identificador del cobro: ${p.id}`, false, 7);
  line(left + 23, 767, left + 205, 767); line(left + width - 205, 767, left + width - 23, 767);
  put("Firma", left + 23, 774, 182, 8, false, "center"); put("Aclaración", left + width - 205, 774, 182, 8, false, "center");
  const pages = doc.bufferedPageRange();
  for (let i = 0; i < pages.count; i++) {
    doc.switchToPage(i);
    put(`${number} · Página ${i + 1} de ${pages.count} · Documento no válido como factura`, left, 813, width, 7, false, "center");
  }
  doc.end();
  return output;
}
