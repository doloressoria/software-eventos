import { getMoneyAmount } from "@/lib/pagos/calculos";

export function PagoImporte({ pago }: { pago: {
  moneda: string; importe_moneda_original: number; importe_en_pesos: number | null; tipo_cambio: number | null;
} }) {
  const number = (value: number) => new Intl.NumberFormat("es-AR", { maximumFractionDigits: 4 }).format(value);
  return <div>
    <div>{pago.moneda} {number(pago.importe_moneda_original)}</div>
    {pago.moneda !== "ARS" && <div className="text-xs text-slate-500">Cotización: {pago.tipo_cambio === null ? "Sin cotización histórica" : `${number(pago.tipo_cambio)} ARS/${pago.moneda}`}</div>}
    <div className="text-xs">{pago.importe_en_pesos === null && pago.moneda !== "ARS" ? "Equivalente ARS no disponible" : `ARS ${number(getMoneyAmount(pago))}`}</div>
  </div>;
}
