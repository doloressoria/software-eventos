import PDFDocument from "pdfkit";
import { nombreCategoria } from "../catering/coberturas";
import { reciboNumero, type Recibo, type ReciboSnapshot } from "./types";

const money = (value: number | null) => value === null ? "Sin equivalente histórico" : new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS" }).format(value);
const date = (value: string | null) => value ? value.slice(0, 10).split("-").reverse().join("/") : "Sin fecha";
const media: Record<string, string> = { efectivo_pesos: "Efectivo pesos", efectivo_dolares: "Efectivo dólares", efectivo_euros: "Efectivo euros", transferencia: "Transferencia", cheque: "Cheque", retenciones: "Retenciones" };

export async function buildReciboPdfV1(s: ReciboSnapshot, recibo?: Recibo, anterior?: Recibo) {
  if (s.version !== 1) throw new Error("Versión de recibo no compatible");
  const emitted = recibo?.emitido_at ?? "2000-01-01T00:00:00Z";
  const number = recibo ? reciboNumero(recibo) : "VISTA PREVIA - SIN EMITIR";
  const doc = new PDFDocument({ size: "A4", margin: 44, bufferPages: true,
    info: { Title: `Recibo ${number}`, Author: s.marca, CreationDate: new Date(emitted), ModDate: new Date(emitted) } });
  const chunks: Buffer[] = [];
  const output = new Promise<Buffer>((resolve, reject) => {
    doc.on("data", chunk => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
  });
  const text = (value: string, bold = false, size = 10) => {
    doc.font(bold ? "Helvetica-Bold" : "Helvetica").fontSize(size).fillColor("#172a35");
    const height = doc.heightOfString(value, { width: doc.page.width - 88, lineGap: 2 }) + 6;
    if (height < 700 && doc.y + height > doc.page.height - 44) doc.addPage();
    doc.text(value, { paragraphGap: 6, lineGap: 2 });
  };
  const section = (label: string) => {
    if (doc.y > 700) doc.addPage();
    doc.moveDown(.5); text(label, true, 12);
  };
  if (s.logo_data_url) {
    const bytes = Buffer.from(s.logo_data_url.split(",")[1], "base64");
    doc.image(bytes, 44, 44, { fit: [120, 55] });
    doc.y = 110;
  }
  text(s.marca, true, 20);
  text(`${recibo?.tipo === "anulacion" ? "ANULACIÓN" : recibo?.tipo === "modificacion" ? "MODIFICACIÓN DE COBRO" : "RECIBO"} ${number}`, true, 15);
  text("Documento no válido como factura", true);
  if (recibo) text(`Emitido: ${new Intl.DateTimeFormat("es-AR", { timeZone: "America/Argentina/Buenos_Aires", dateStyle: "short", timeStyle: "short" }).format(new Date(emitted))} (Argentina)`);
  else text("Vista previa informativa. La emisión guarda los datos actuales y asigna un número único.");
  if (anterior) text(`Vinculado a ${reciboNumero(anterior)}. Conserva el comprobante anterior; no representa otro ingreso.`, true);
  section("Cliente y evento");
  text(`Cliente: ${s.cliente ?? "Sin nombre"}`);
  text(`Evento: ${s.evento} · Fecha: ${date(s.fecha_evento)}`);
  text(`Salón / lugar: ${s.lugar ?? "Sin especificar"}`);
  text(`PAX contratados de referencia: ${Object.entries(s.pax_evento).map(([k, v]) => `${nombreCategoria(k)} ${v}`).join(" · ")}`);
  section("Conceptos e imputaciones (ARS)");
  if (s.pago.concepto) text(s.pago.concepto);
  for (const [i, line] of s.imputaciones.entries()) text(`${i + 1}. ${line.concepto} - ${money(line.importe_ars)}`);
  if (s.coberturas.length) {
    section("Personas de este cobro - tarifas históricas");
    for (const c of s.coberturas) {
      const component = s.componentes.find(d => d.catering_contrato_id === c.catering_contrato_id);
      text(`${nombreCategoria(c.categoria)}: ${c.cantidad} × ${money(c.precio_aplicado)} = ${money(c.importe_historico)} (${component?.version_calculo === 2 ? "capital sin IVA" : "histórico con IVA incluido"}). Reasignados: ${c.liberada}; vigentes: ${c.cantidad - c.liberada}.`);
    }
  }
  if (s.componentes.length) {
    section("Desglose explícito - no suma otro ingreso");
    for (const d of s.componentes) {
      const label = s.imputaciones.find(i => i.catering_contrato_id === d.catering_contrato_id)?.concepto ?? "Catering de origen";
      text(label, true);
      text(d.version_calculo === 2
        ? `Capital objetivo: ${money(d.capital_ars)} · IVA objetivo: ${money(d.iva_ars)}`
        : `Objetivo histórico con IVA incluido: ${money(d.objetivo_ars)}. Capital / IVA sin conciliación.`);
      text(`Ajuste: ${money(d.ajuste_ars)} (no es dinero recibido). Objetivo = equivalente real + ajuste.`);
      if (d.version_calculo === 2) text(`Ajuste capital: ${money(d.ajuste_ars - d.ajuste_iva_ars)} · Ajuste IVA: ${money(d.ajuste_iva_ars)}`);
      if (d.capital_reasignado_ars) text(`Capital real reasignado: ${money(d.capital_reasignado_ars)}. El IVA permanece en el origen.`);
    }
  } else text("Sin desglose explícito de capital / IVA; no se infiere a partir de precios actuales.");
  const p = s.pago;
  const paymentLines: [string, boolean?, number?][] = [
    [`${media[p.forma_pago] ?? p.forma_pago} · Fecha de pago / acreditación: ${date(p.fecha_pago)}`],
    [`Moneda original: ${p.moneda} · Importe original: ${new Intl.NumberFormat("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(p.importe_moneda_original)}`],
    [`Cotización histórica ARS por ${p.moneda}: ${p.tipo_cambio === null ? "Sin registrar" : new Intl.NumberFormat("es-AR", { maximumFractionDigits: 4 }).format(p.tipo_cambio)}`],
  ];
  if (p.forma_pago === "cheque") paymentLines.push([`Banco: ${p.banco ?? "Sin registrar"} · Cheque Nº: ${p.numero_cheque ?? "Sin registrar"}`]);
  paymentLines.push([`Estado al emitir: ${s.estado_acreditacion}`, true]);
  if (s.estado_acreditacion.includes("pendiente")) paymentLines.push(["Recibido pendiente de acreditación. No cancela deuda mientras esté pendiente."]);
  if (s.garantia) paymentLines.push(["GARANTÍA: no cancela deuda ordinaria.", true]);
  if (recibo?.tipo === "anulacion") paymentLines.push(["COBRO ANULADO. Este documento conserva la referencia histórica; no registra una devolución.", true]);
  paymentLines.push([`${recibo && recibo.tipo !== "recibo" ? "Dinero del cobro de referencia (no es un nuevo ingreso)" : "Total realmente recibido / equivalente ARS"}: ${money(p.importe_en_pesos)}`, true, 13],
    [`Identificador del cobro: ${p.id}`, false, 8]);
  const paymentHeight = paymentLines.reduce((height, [value, bold, size]) => {
    doc.font(bold ? "Helvetica-Bold" : "Helvetica").fontSize(size ?? 10);
    return height + doc.heightOfString(value, { width: doc.page.width - 88, lineGap: 2 }) + 6;
  }, 90);
  if (paymentHeight < 700 && doc.y + paymentHeight > doc.page.height - 44) doc.addPage();
  section("Medio y dinero recibido");
  for (const [value, bold, size] of paymentLines) text(value, bold, size);
  if (doc.y > 720) doc.addPage();
  doc.moveDown(1);
  text("Firma: _____________________________________");
  text("Aclaración: _________________________________");
  const pages = doc.bufferedPageRange();
  for (let i = 0; i < pages.count; i++) {
    doc.switchToPage(i);
    doc.font("Helvetica").fontSize(8).fillColor("#52616b").text(`${number} · Página ${i + 1} de ${pages.count} · Documento no válido como factura`, 44, 806, { lineBreak: false });
  }
  doc.end();
  return output;
}
