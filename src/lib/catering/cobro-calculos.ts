import { parsePaymentDecimal, paymentEquivalent } from "../pagos/validation";

export function moneyCents(value: string): bigint | null {
  const text = value.trim().replace(",", ".");
  if (!/^\d{1,10}(?:\.\d{1,2})?$/.test(text)) return null;
  const [whole, fraction = ""] = text.split(".");
  return BigInt(whole + fraction.padEnd(2, "0"));
}

export function moneyText(cents: bigint) {
  const sign = cents < BigInt(0) ? "-" : "";
  const absolute = cents < BigInt(0) ? -cents : cents;
  return `${sign}${absolute / BigInt(100)}.${String(absolute % BigInt(100)).padStart(2, "0")}`;
}

function roundDivide(value: bigint, divisor: bigint) {
  const absolute = value < BigInt(0) ? -value : value;
  const rounded = (absolute + divisor / BigInt(2)) / divisor;
  return value < BigInt(0) ? -rounded : rounded;
}

export function recommendedUsd(target: string, rate: string): string | null {
  const cents = moneyCents(target);
  if (cents === null || cents <= BigInt(0) || parsePaymentDecimal(rate, 4, 6) === null) return null;
  const [whole, fraction = ""] = rate.trim().replace(",", ".").split(".");
  const rateUnits = BigInt(whole + fraction.padEnd(4, "0"));
  const usdCents = roundDivide(cents * BigInt(10000), rateUnits);
  return usdCents > BigInt(0) && usdCents <= BigInt(999999999999) ? moneyText(usdCents) : null;
}

// One operation, one adjustment. Split proportionally; IVA receives the cent remainder.
export function cateringRounding(capital: string, iva: string, amount: string, rate: string, currency: "ARS" | "USD") {
  const capitalCents = moneyCents(capital);
  const ivaCents = moneyCents(iva);
  if (capitalCents === null || ivaCents === null) return null;
  const target = capitalCents + ivaCents;
  if (target <= BigInt(0) || target > BigInt(999999999999)) return null;
  const equivalent = paymentEquivalent(amount, currency === "ARS" ? "1" : rate);
  if (equivalent === null || equivalent <= 0 || equivalent > 9999999999.99) return null;
  const paid = moneyCents(amount);
  if (currency === "USD" ? paid !== moneyCents(recommendedUsd(moneyText(target), rate) ?? "") : paid !== target) return null;
  const equivalentCents = moneyCents(equivalent.toFixed(2))!;
  const adjustment = target - equivalentCents;
  const ivaAdjustment = roundDivide(adjustment * ivaCents, target);
  return { target: Number(target) / 100, equivalent, adjustment: Number(adjustment) / 100,
    ivaAdjustment: Number(ivaAdjustment) / 100, capitalAdjustment: Number(adjustment - ivaAdjustment) / 100 };
}
