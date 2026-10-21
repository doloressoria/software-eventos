import type { Enums } from "../../types/database.types";

export const AUDIT_PAGE_SIZE = 25;
export const AUDIT_ACTIONS = [
  "INSERT",
  "UPDATE",
  "DELETE",
  "SOFT_DELETE",
  "RESTORE",
  "ASSIGN",
  "UNASSIGN",
] as const satisfies readonly Enums<"accion_audit">[];
export const AUDITED_TABLES = [
  "evento_contactos",
  "eventos",
  "evento_servicios",
  "pagos",
  "egresos",
  "catering_contratos",
  "catering_items",
  "usuarios",
  "usuario_salon",
  "salones",
  "servicios_catalogo",
  "servicio_precios_mensuales",
  "ipc_indices",
  "actualizaciones_ipc",
] as const;

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type AuditOrder = "asc" | "desc";

export type AuditFilters = {
  action?: Enums<"accion_audit">;
  dateFrom?: string;
  dateTo?: string;
  order: AuditOrder;
  page: number;
  recordId?: string;
  table?: string;
  userId?: string;
};

export type AuditSearchParams = Record<
  string,
  string | string[] | undefined
>;

export function parseAuditFilters(params: AuditSearchParams): AuditFilters {
  const action = firstValue(params.accion);
  const table = cleanValue(firstValue(params.tabla), 80);
  const userId = cleanValue(firstValue(params.usuario), 80);
  const recordId = cleanValue(firstValue(params.registro), 160);
  const dateFrom = parseDate(firstValue(params.desde));
  const dateTo = parseDate(firstValue(params.hasta));
  const order = firstValue(params.orden) === "asc" ? "asc" : "desc";
  const rawPage = Number.parseInt(firstValue(params.pagina) ?? "1", 10);

  return {
    action: AUDIT_ACTIONS.includes(action as Enums<"accion_audit">)
      ? (action as Enums<"accion_audit">)
      : undefined,
    dateFrom,
    dateTo,
    order,
    page: Number.isSafeInteger(rawPage) && rawPage > 0 ? rawPage : 1,
    recordId,
    table:
      table && AUDITED_TABLES.includes(table as (typeof AUDITED_TABLES)[number])
        ? table
        : undefined,
    userId: userId && UUID_PATTERN.test(userId) ? userId : undefined,
  };
}

export function hasAuditFilters(filters: AuditFilters) {
  return Boolean(
    filters.action ||
      filters.dateFrom ||
      filters.dateTo ||
      filters.recordId ||
      filters.table ||
      filters.userId ||
      filters.order === "asc",
  );
}

export function getAuditRange(page: number) {
  const from = (Math.max(1, page) - 1) * AUDIT_PAGE_SIZE;
  return { from, to: from + AUDIT_PAGE_SIZE - 1 };
}

export function getDateBoundary(date: string, boundary: "start" | "end") {
  return `${date}T${boundary === "start" ? "00:00:00.000" : "23:59:59.999"}-03:00`;
}

function firstValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function cleanValue(value: string | undefined, maxLength: number) {
  const cleaned = value?.trim();
  return cleaned ? cleaned.slice(0, maxLength) : undefined;
}

function parseDate(value: string | undefined) {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return undefined;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value
    ? undefined
    : value;
}
