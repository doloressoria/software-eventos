import type { Tables } from "../../types/database.types";
import type { CoberturaPax, ComponenteCatering } from "../catering/coberturas";

export type ReciboSnapshot = {
  version: 1 | 2;
  marca: string;
  logo_data_url: string | null;
  cliente: string | null;
  evento: string;
  fecha_evento: string | null;
  lugar: string | null;
  pax_evento: Record<string, number>;
  pago: Pick<Tables<"pagos">, "id" | "concepto" | "fecha_pago" | "forma_pago" | "moneda" | "importe_moneda_original" | "tipo_cambio" | "importe_en_pesos" | "banco" | "numero_cheque" | "deleted_at" | "es_garantia">;
  imputaciones: { categoria?: string | null; concepto: string; importe_ars: number | null; catering_contrato_id: string | null }[];
  coberturas: CoberturaPax[];
  componentes: ComponenteCatering[];
  estado_acreditacion: string;
  garantia: boolean;
};
export type Recibo = Tables<"recibos">;
export type ReciboScope = { kind: "eventos" | "catering"; id: string; pagoId: string };
export function reciboPath(scope: ReciboScope) {
  return `/${scope.kind}/${scope.id}/ingresos/recibos/${scope.pagoId}`;
}
export function reciboNumero(recibo: Pick<Recibo, "serie" | "numero">) {
  return `${recibo.serie}-${String(recibo.numero).padStart(8, "0")}`;
}
