import type { Tables } from "../../types/database.types";

export type ExportPayment = Pick<Tables<"pagos">,
  | "id" | "evento_id" | "evento_servicio_id" | "catering_contrato_id"
  | "concepto" | "fecha_pago" | "forma_pago" | "moneda" | "banco"
  | "numero_cheque" | "importe_moneda_original" | "tipo_cambio"
  | "importe_en_pesos" | "es_garantia" | "deleted_at" | "notas"
>;
export type ExportContact = Pick<Tables<"evento_contactos">,
  "nombre" | "telefono" | "correo" | "relacion" | "observaciones" | "es_principal"
>;
export type ExportEvent = Tables<"eventos"> & {
  salones: { nombre: string } | null;
  usuarios: { full_name: string | null; email: string } | null;
};
export type ExportService = Tables<"evento_servicios"> & {
  servicios_catalogo: { nombre: string; categoria: string } | null;
};
export type ExportCatering = Tables<"catering_contratos"> & {
  usuarios: { full_name: string | null; email: string } | null;
  salones: { nombre: string } | null;
};
export type CateringSummary = {
  catering: ExportCatering;
  payments: ExportPayment[];
};
export type EventExportData = {
  kind: "evento";
  event: ExportEvent;
  services: ExportService[];
  payments: ExportPayment[];
  updates: Tables<"actualizaciones_ipc">[];
  contacts: ExportContact[];
  cateringAllowed: boolean;
  caterings: CateringSummary[];
};
export type CateringExportData = CateringSummary & {
  kind: "catering";
  event: ExportEvent | null;
  eventAllowed: boolean;
  contacts: ExportContact[];
  items: Tables<"catering_items">[];
  history: Tables<"catering_precio_historial">[];
};
export type CommercialExportData = EventExportData | CateringExportData;

export class ExportError extends Error {
  constructor(public status: number, message: string) { super(message); }
}
