import { getMoneyAmount, isOrdinaryPayment, roundMoney, sumGuarantees, sumOrdinaryPayments, toMoneyNumber } from "../pagos/calculos";
import { totalInvitados } from "../eventos/asistentes";
import type { CateringExportData, ExportPayment, ExportService } from "./types";

export const PARTIAL_NOTICE = "Resumen parcial: incluye únicamente información autorizada.";
export const SEPARATE_NOTICE = "Los servicios y los contratos de catering se presentan por separado porque no se puede confirmar si incluyen cargos compartidos.";

export function uniquePayments(payments: ExportPayment[]) {
  const result = new Map<string, ExportPayment>();
  for (const payment of payments) {
    if (payment.deleted_at) continue;
    const prior = result.get(payment.id);
    if (prior && JSON.stringify(prior) !== JSON.stringify(payment)) throw new Error("Un pago tiene datos contradictorios. Recargá antes de exportar.");
    result.set(payment.id, payment);
  }
  return [...result.values()];
}

export function serviceAmounts(service: ExportService, payments: ExportPayment[]) {
  const own = uniquePayments(payments).filter((p) => p.evento_servicio_id === service.id && !p.catering_contrato_id);
  const paid = sumOrdinaryPayments(own);
  return { total: toMoneyNumber(service.total_con_iva), paid,
    balance: roundMoney(toMoneyNumber(service.total_con_iva) - paid), guarantees: sumGuarantees(own) };
}

export function cateringAmounts(data: CateringExportData) {
  const { catering: c, history, costos } = data;
  const payments = uniquePayments(data.payments);
  const storedTotal = toMoneyNumber(c.total_con_iva);
  const detailBalance = toMoneyNumber(c.saldo_pendiente);
  const calculatedTotal = toMoneyNumber(costos.total_con_iva);
  return {
    pax: totalInvitados(c),
    unitPrice: history[0]?.precio_unitario ?? null,
    paxSubtotal: toMoneyNumber(costos.pax_subtotal),
    extras: toMoneyNumber(costos.extras),
    subtotal: toMoneyNumber(costos.subtotal),
    commission: toMoneyNumber(c.comision_organizador_monto),
    vat: toMoneyNumber(costos.iva),
    commissionVat: toMoneyNumber(costos.iva_comision),
    calculatedTotal,
    storedTotal,
    paid: sumOrdinaryPayments(payments),
    storedPaid: toMoneyNumber(c.total_pagado),
    detailBalance,
    incomeBalance: Math.max(detailBalance, 0),
    guarantees: sumGuarantees(payments),
    difference: roundMoney(storedTotal - calculatedTotal),
  };
}

export function paymentAmount(payment: ExportPayment) { return getMoneyAmount(payment); }
export function ordinaryPayments(payments: ExportPayment[]) { return uniquePayments(payments).filter(isOrdinaryPayment); }
