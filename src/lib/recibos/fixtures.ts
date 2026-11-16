import type { Recibo, ReciboSnapshot } from "./types";
import { fixtureId } from "../commercial-export/fixtures";

export function exampleRecibo(lines = 2): { snapshot: ReciboSnapshot; recibo: Recibo } {
  const snapshot: ReciboSnapshot = {
    version: 2, marca: "Salón ficticio de prueba", logo_data_url: null,
    cliente: "Cliente ficticio con un nombre largo para comprobar el ajuste de renglones del documento",
    evento: "Celebración de prueba con cena, recepción y servicios adicionales", fecha_evento: "2026-12-20",
    lugar: "Salón ficticio - espacio de recepción y jardín", pax_evento: { adultos: 100, jovenes: 20, menores: 10, bebes: 0 },
    pago: { id: fixtureId(200), concepto: "Pago de catering y salón", fecha_pago: "2026-11-16", forma_pago: "transferencia", moneda: "USD",
      importe_moneda_original: 83.33, tipo_cambio: 1200, importe_en_pesos: 99996, banco: null, numero_cheque: null, deleted_at: null, es_garantia: false },
    imputaciones: Array.from({ length: lines }, (_, i) => ({ categoria: i === 0 ? "catering" : i === 1 ? "salon" : "varios", concepto: i === 0 ? "Catering" : `Salón y servicio adicional ${i} de prueba con descripción larga para revisar que el concepto se conserve completo`, importe_ars: i === 0 ? 79996 : (Math.floor(2000000 / (lines - 1)) + (i <= 2000000 % (lines - 1) ? 1 : 0)) / 100, catering_contrato_id: i === 0 ? fixtureId(201) : null })),
    coberturas: [{ pago_id: fixtureId(200), catering_contrato_id: fixtureId(201), categoria: "adultos", cantidad: 5, liberada: 1, precio_aplicado: 20000, importe_historico: 100000 }],
    componentes: [{ pago_id: fixtureId(200), catering_contrato_id: fixtureId(201), version_calculo: 2, explicito: true, objetivo_ars: 100000, capital_ars: 100000, iva_ars: 0, ajuste_ars: 4, ajuste_iva_ars: 0, capital_reasignado_ars: 20000 }],
    estado_acreditacion: "Acreditado", garantia: false,
  };
  return { snapshot, recibo: { id: fixtureId(202), pago_id: snapshot.pago.id, evento_id: fixtureId(203), catering_contrato_id: null, serie: "REC", numero: 1,
    revision: 1, tipo: "recibo", anterior_id: null, emitido_at: "2026-11-16T15:00:00Z", emitido_por: fixtureId(204), snapshot: JSON.parse(JSON.stringify(snapshot)), fuente: {} } };
}
