export type EstadoCobro = "pendiente" | "parcial" | "pagado";

export const IVA_PORCENTAJE = 0.21;

export type MoneyRow = {
  deleted_at?: string | null;
  importe_en_pesos: number | null;
  importe_moneda_original?: number | null;
  moneda?: string;
};

export type PaymentMoneyRow = MoneyRow & {
  es_garantia: boolean;
};

export function isActiveMoneyRow(row: MoneyRow) {
  return !row.deleted_at;
}

export function isOrdinaryPayment(payment: PaymentMoneyRow) {
  return isActiveMoneyRow(payment) && !payment.es_garantia;
}

export function getActiveOrdinaryPayments<T extends PaymentMoneyRow>(
  payments: T[],
) {
  return payments.filter(isOrdinaryPayment);
}

export function getMoneyAmount(row: MoneyRow) {
  if (
    typeof row.importe_en_pesos === "number" &&
    Number.isFinite(row.importe_en_pesos)
  ) {
    return row.importe_en_pesos;
  }

  if (row.moneda && row.moneda !== "ARS") {
    return 0;
  }

  return toMoneyNumber(row.importe_moneda_original);
}

export function sumMoneyRows(rows: MoneyRow[]) {
  return roundMoney(
    rows.reduce(
      (total, row) =>
        total + (isActiveMoneyRow(row) ? getMoneyAmount(row) : 0),
      0,
    ),
  );
}

export function sumOrdinaryPayments(payments: PaymentMoneyRow[]) {
  return sumMoneyRows(getActiveOrdinaryPayments(payments));
}

export function isNonCashPayment(payment: { forma_pago: string }) {
  return payment.forma_pago !== "efectivo_pesos";
}

export function calculateServicioPaymentTotals(
  payments: (PaymentMoneyRow & { forma_pago: string })[],
  currentBase: number,
  totalSinIva: number,
) {
  const ordinaryPayments = getActiveOrdinaryPayments(payments);
  let totalEfectivo = 0;
  let netoNoEfectivo = 0;
  let ivaPagadoNoEfectivo = 0;

  for (const payment of ordinaryPayments) {
    const amount = getMoneyAmount(payment);

    if (!isNonCashPayment(payment)) {
      totalEfectivo = roundMoney(totalEfectivo + amount);
      continue;
    }

    const neto = roundMoney(amount / (1 + IVA_PORCENTAJE));
    netoNoEfectivo = roundMoney(netoNoEfectivo + neto);
    ivaPagadoNoEfectivo = roundMoney(
      ivaPagadoNoEfectivo + roundMoney(amount - neto),
    );
  }

  return {
    ivaBaseImponible: Math.min(
      totalSinIva,
      Math.max(currentBase, netoNoEfectivo),
    ),
    ivaPagadoNoEfectivo,
    ivaPorcentaje: IVA_PORCENTAJE,
    netoNoEfectivo,
    totalEfectivo,
    totalPagado: sumOrdinaryPayments(ordinaryPayments),
  };
}

export function sumGuarantees(payments: PaymentMoneyRow[]) {
  return sumMoneyRows(
    payments.filter(
      (payment) => isActiveMoneyRow(payment) && payment.es_garantia,
    ),
  );
}

export function calculatePaymentSummary({
  payments,
  total,
}: {
  payments: PaymentMoneyRow[];
  total: number;
}) {
  const totalCobrado = sumOrdinaryPayments(payments);
  const totalEvento = roundMoney(Math.max(toMoneyNumber(total), 0));
  const saldoPendiente = Math.max(roundMoney(totalEvento - totalCobrado), 0);

  return {
    estadoCobro: getEstadoCobro({ totalCobrado, totalEvento }),
    garantiasRegistradas: sumGuarantees(payments),
    saldoPendiente,
    totalCobrado,
    totalEvento,
  };
}

export function calculateMoneyFlow({
  expenses,
  payments,
}: {
  expenses: MoneyRow[];
  payments: PaymentMoneyRow[];
}) {
  const totalIngresos = sumOrdinaryPayments(payments);
  const totalEgresos = sumMoneyRows(expenses);

  return {
    saldoNeto: roundMoney(totalIngresos - totalEgresos),
    totalEgresos,
    totalIngresos,
  };
}

export function roundMoney(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function toMoneyNumber(value: number | null | undefined) {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function getEstadoCobro({
  totalCobrado,
  totalEvento,
}: {
  totalCobrado: number;
  totalEvento: number;
}): EstadoCobro {
  if (totalCobrado === 0 || totalEvento === 0) {
    return "pendiente";
  }

  return totalCobrado < totalEvento ? "parcial" : "pagado";
}
