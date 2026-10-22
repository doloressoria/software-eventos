import type { Tables } from "../../types/database.types";
import type { CateringExportData, EventExportData, ExportCatering, ExportEvent, ExportPayment, ExportService } from "./types";

export const fixtureId = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
export function examplePayment(n: number, serviceId: string | null = fixtureId(2), contractId: string | null = null): ExportPayment {
  const usd = n % 2 === 0;
  const transfer = n % 3 === 0;
  return { id: fixtureId(100 + n), evento_id: fixtureId(1), evento_servicio_id: serviceId, catering_contrato_id: contractId,
    concepto: "Anticipo ficticio", fecha_pago: "2026-10-20", forma_pago: transfer ? "transferencia" : usd ? "efectivo_dolares" : "efectivo_pesos",
    moneda: usd ? "USD" : "ARS", banco: transfer ? "Banco ficticio" : null, numero_cheque: null, importe_moneda_original: usd ? 2 : 125,
    tipo_cambio: usd ? 1000 + n : 1, importe_en_pesos: usd ? 2 * (1000 + n) : 125, es_garantia: n % 7 === 0, deleted_at: null, notas: null };
}

export function exampleEvent(paymentCount = 8): EventExportData {
  const event = {
    id: fixtureId(1), cliente_nombre: "Cliente de demostración", nombre_evento: "Celebración ficticia", tipo_evento: "Social", subtipo_evento: "Cumpleaños",
    fecha_evento: "2027-03-06", cliente_razon_social: "Ejemplo SA", cliente_cuit_dni: "CUIT ficticio", cliente_direccion_factura: "Calle de prueba 123",
    cliente_direccion: "Calle de prueba 123", cliente_ciudad: "Ciudad de ejemplo", cliente_contacto: "Contacto anterior de demostración",
    organizador_nombre: "Organización ficticia", organizador_email: "organizacion@example.invalid", organizador_telefono: "Teléfono ficticio",
    organizador_externo: null, tiene_organizador: true, comision_organizador: 200,
    pax_adultos: 10, pax_jovenes: 2, pax_menores: 0, pax_bebes: 0, salon_id: fixtureId(10), vendedor_id: fixtureId(11),
    salones: { nombre: "Salón de demostración" }, usuarios: { full_name: "Vendedora de ejemplo", email: "ventas@example.invalid" },
    observaciones: "Datos completamente ficticios para revisar el formato.", deleted_at: null, estado: "confirmado", fecha_carga: "2026-10-21",
    fecha_contrato: "2026-10-20", fecha_confirmacion_presupuesto: null, espacio: null, created_at: "2026-10-21T12:00:00Z", updated_at: "2026-10-21T12:00:00Z",
  } as ExportEvent;
  const services = [
    { id: fixtureId(2), evento_id: event.id, servicio_id: fixtureId(12), precio_base: 10000, adicionales_monto: 500,
      iva_base_imponible: 2000, iva_porcentaje: 0.21, total_sin_iva: 10500, total_con_iva: 10920, total_pagado: 0, saldo_pendiente: 10920,
      proveedor: "Proveedor ficticio", notas: "IVA aplicado sólo a la base imponible guardada.", comisiona_organizador: true,
      created_at: event.created_at, updated_at: event.updated_at, servicios_catalogo: { nombre: "Salón", categoria: "salon" } },
    { id: fixtureId(3), evento_id: event.id, servicio_id: fixtureId(13), precio_base: 500, adicionales_monto: 0,
      iva_base_imponible: 0, iva_porcentaje: 0.21, total_sin_iva: 500, total_con_iva: 500, total_pagado: 0, saldo_pendiente: 500,
      proveedor: "Técnica de ejemplo", notas: null, comisiona_organizador: false, created_at: event.created_at, updated_at: event.updated_at,
      servicios_catalogo: { nombre: "Servicio fuera de los bloques originales", categoria: "tecnica" } },
  ] as ExportService[];
  return { kind: "evento", event, services,
    payments: Array.from({ length: paymentCount }, (_, i) => examplePayment(i)),
    contacts: Array.from({ length: 4 }, (_, i) => ({ nombre: `Contacto ficticio ${i + 1}`, telefono: "Teléfono de ejemplo", correo: `contacto${i + 1}@example.invalid`, relacion: i ? "Administración" : "Cliente", observaciones: "Contacto actual guardado.", es_principal: i === 0 })),
    updates: [{ id: fixtureId(20), evento_servicio_id: fixtureId(2), tipo: "ipc", fecha_inicio: "2026-09-01", fecha_ajuste: "2026-10-01", valor_inicial: 9800, valor_ajustado: 10000,
      porcentaje_aplicado: 2.0408, indec_mes_anterior: null, indec_mes_ajuste: null, ipc_indice_id: null, usuario_id: null, created_at: event.created_at }],
    cateringAllowed: true, caterings: [],
  };
}

export function exampleCatering({ linked = true, mismatch = false, paymentCount = 8, itemCount = 3 } = {}): CateringExportData {
  const event = exampleEvent().event;
  const items = Array.from({ length: itemCount }, (_, i) => ({ id: fixtureId(300 + i), catering_contrato_id: fixtureId(30), categoria: ["adicional_alimentos", "adicional_bebidas", "adicional_otros"][i % 3], descripcion: `Adicional ficticio ${i + 1}`, precio_unitario: 125, pax: 1, total: 125, orden: i, created_at: event.created_at, updated_at: event.updated_at })) as Tables<"catering_items">[];
  const net = 1200 + itemCount * 125;
  const total = Math.round((net * 1.21 + 242) * 100) / 100;
  const payments = Array.from({ length: paymentCount }, (_, i) => ({ ...examplePayment(i, null, fixtureId(30)), evento_id: linked ? event.id : null }));
  const paid = payments.filter((p) => !p.es_garantia).reduce((sum, p) => sum + (p.importe_en_pesos ?? 0), 0);
  const catering = {
    id: fixtureId(30), evento_id: linked ? event.id : null, cliente_nombre: linked ? null : "Cliente externo de demostración", fecha_evento: linked ? null : "2027-03-06",
    cliente_razon_social: linked ? null : "Ejemplo externo SA", cliente_cuit_dni: "CUIT ficticio", cliente_contacto: linked ? null : "Contacto externo de ejemplo",
    tipo_servicio: "Menú de demostración", tipo_evento: "Social", salon_id: null, lugar_evento: linked ? null : "Predio externo de ejemplo", ejecutiva_id: fixtureId(11),
    pax_adultos: 10, pax_jovenes: 2, pax_menores: 0, pax_bebes: 0, pax_comida: 12, pax_post_postre: 0, pax_final: 12,
    precio_cierre_alimentos_sin_iva: null, precio_cierre_bebidas_sin_iva: null, iva_porcentaje: 0.21, comision_organizador_monto: 200, iva_comision: 0.21,
    total_sin_iva: net + 200, total_con_iva: total + (mismatch ? 100 : 0), total_pagado: paid, saldo_pendiente: total + (mismatch ? 100 : 0) - paid,
    emite_factura: true, monto_con_factura: total, monto_sin_factura: 0, factura_razon_social: "Ejemplo SA", factura_cuit: "CUIT ficticio",
    factura_direccion: "Calle ficticia 123", factura_concepto: "Servicio de ejemplo", factura_contacto_admin: "administracion@example.invalid",
    notas: "Datos ficticios. Los pagos no se asignan a versiones de precios.", deleted_at: null, created_at: event.created_at, updated_at: event.updated_at,
    salones: null, usuarios: { full_name: "Ejecutiva de ejemplo", email: "ejecutiva@example.invalid" },
  } as ExportCatering;
  return { kind: "catering", catering, event: linked ? event : null, eventAllowed: true,
    contacts: linked ? exampleEvent().contacts : [], payments, items,
    history: Array.from({ length: 17 }, (_, i) => ({ id: fixtureId(400 + i), catering_contrato_id: catering.id, fecha: `2026-10-${String(21 - i).padStart(2, "0")}`, precio_unitario: 100 - i,
      motivo: i ? "Recotización ficticia" : "Precio vigente ficticio", pax_adultos: 10, pax_jovenes: 2, pax_menores: 0, pax_bebes: 0, usuario_id: fixtureId(11), created_at: event.created_at })),
  };
}
