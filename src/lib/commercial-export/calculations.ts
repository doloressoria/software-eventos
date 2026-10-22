import { calculatePaymentSummary, getMoneyAmount, isOrdinaryPayment, roundMoney, sumGuarantees, sumOrdinaryPayments, toMoneyNumber } from "../pagos/calculos";
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

// Diagnostic only: mirrors recalculateCateringTotals without executing its writes.
export function cateringAmounts(data: CateringExportData) {
  const { catering: c, history, items } = data;
  const payments = uniquePayments(data.payments);
  const pax = [c.pax_adultos, c.pax_jovenes, c.pax_menores, c.pax_bebes].reduce<number>((sum, n) => sum + toMoneyNumber(n), 0);
  const unitPrice = history[0]?.precio_unitario ?? null;
  const paxSubtotal = roundMoney(toMoneyNumber(unitPrice) * pax);
  const extras = roundMoney(items.reduce((sum, item) => sum + toMoneyNumber(item.precio_unitario), 0));
  const subtotal = roundMoney(paxSubtotal + extras);
  const commission = toMoneyNumber(c.comision_organizador_monto);
  const vat = roundMoney(subtotal * toMoneyNumber(c.iva_porcentaje));
  const commissionVat = roundMoney(commission * toMoneyNumber(c.iva_comision));
  const calculatedNet = roundMoney(subtotal + commission);
  const calculatedTotal = roundMoney(subtotal + vat + commission + commissionVat);
  const storedTotal = toMoneyNumber(c.total_con_iva);
  const paid = sumOrdinaryPayments(payments);
  const summary = calculatePaymentSummary({ payments, total: storedTotal });
  return { pax, unitPrice, paxSubtotal, extras, subtotal, commission, vat, commissionVat,
    calculatedNet, calculatedTotal, storedTotal, paid,
    storedPaid: toMoneyNumber(c.total_pagado), detailBalance: toMoneyNumber(c.saldo_pendiente),
    incomeBalance: summary.saldoPendiente, guarantees: sumGuarantees(payments),
    difference: roundMoney(storedTotal - calculatedTotal) };
}

export function paymentAmount(payment: ExportPayment) { return getMoneyAmount(payment); }
export function ordinaryPayments(payments: ExportPayment[]) { return uniquePayments(payments).filter(isOrdinaryPayment); }
