import type { Json } from "../../types/database.types";

export type AuditJsonObject = Record<string, Json | undefined>;

const TABLE_LABELS: Record<string, string> = {
  actualizaciones_ipc: "Actualizaciones por IPC",
  catering_contratos: "Contratos de catering",
  catering_items: "Ítems de catering",
  egresos: "Egresos",
  evento_servicios: "Servicios del evento",
  eventos: "Eventos",
  ipc_indices: "Índices IPC",
  pagos: "Pagos",
  salones: "Salones",
  servicio_precios_mensuales: "Precios mensuales de servicios",
  servicios_catalogo: "Catálogo de servicios",
  usuario_salon: "Asignaciones de salones",
  usuarios: "Usuarios",
};

const ENTITY_DESCRIPTIONS: Record<string, string> = {
  actualizaciones_ipc: "una actualización por IPC",
  catering_contratos: "un contrato de catering",
  catering_items: "un ítem de catering",
  egresos: "un egreso",
  evento_servicios: "un servicio del evento",
  eventos: "un evento",
  ipc_indices: "un índice IPC",
  pagos: "un pago",
  salones: "un salón",
  servicio_precios_mensuales: "un precio mensual de servicio",
  servicios_catalogo: "un servicio",
  usuario_salon: "una asignación de salón",
  usuarios: "un usuario",
};

const FIELD_LABELS: Record<string, string> = {
  activo: "Activo",
  adicionales_monto: "Adicionales",
  banco: "Banco",
  capacidad: "Capacidad",
  categoria: "Categoría",
  cliente_ciudad: "Ciudad del cliente",
  cliente_contacto: "Contacto del cliente",
  cliente_direccion: "Dirección del cliente",
  cliente_direccion_factura: "Dirección de facturación",
  cliente_nombre: "Cliente",
  cliente_razon_social: "Razón social",
  comision_organizador: "Comisión del organizador",
  comision_organizador_monto: "Comisión del organizador",
  comisiona_organizador: "Comisión del organizador",
  concepto: "Concepto",
  descripcion: "Descripción",
  direccion: "Dirección",
  email: "Email",
  emite_factura: "Emite factura",
  es_garantia: "Es garantía",
  espacio: "Espacio",
  estado: "Estado",
  factura_concepto: "Concepto de factura",
  factura_contacto_admin: "Contacto administrativo",
  factura_direccion: "Dirección de facturación",
  factura_razon_social: "Razón social de facturación",
  fecha_carga: "Fecha de carga",
  fecha_confirmacion_presupuesto: "Confirmación de presupuesto",
  fecha_contrato: "Fecha de contrato",
  fecha_egreso: "Fecha del egreso",
  fecha_evento: "Fecha del evento",
  fecha_pago: "Fecha de pago",
  forma_pago: "Forma de pago",
  full_name: "Nombre",
  importe_en_pesos: "Importe",
  importe_moneda_original: "Importe original",
  ipc_indice_id: "Índice IPC",
  iva_comision: "IVA de comisión",
  iva_porcentaje: "IVA",
  moneda: "Moneda",
  monto_adicionales: "Adicionales",
  monto_con_factura: "Monto con factura",
  monto_sin_factura: "Monto sin factura",
  nombre: "Nombre",
  nombre_evento: "Evento",
  notas: "Notas",
  numero_cheque: "Número de cheque",
  observaciones: "Observaciones",
  organizador_email: "Email del organizador",
  organizador_externo: "Organizador externo",
  organizador_nombre: "Organizador",
  organizador_telefono: "Teléfono del organizador",
  pax_adultos: "Adultos",
  pax_bebes: "Bebés",
  pax_comida: "Comensales",
  pax_final: "Pax final",
  pax_jovenes: "Jóvenes",
  pax_menores: "Menores",
  pax_post_postre: "Postre",
  periodo: "Período",
  precio_base: "Precio base",
  precio_cierre_alimentos_sin_iva: "Alimentos sin IVA",
  precio_cierre_bebidas_sin_iva: "Bebidas sin IVA",
  precio_unitario: "Precio unitario",
  proveedor: "Proveedor",
  registrado_por: "Registrado por",
  rol: "Rol",
  saldo_pendiente: "Saldo pendiente",
  subtipo_evento: "Subtipo de evento",
  tiene_organizador: "Tiene organizador",
  tipo_cambio: "Tipo de cambio",
  tipo_evento: "Tipo de evento",
  tipo_servicio: "Tipo de servicio",
  total_con_iva: "Total con IVA",
  total_pagado: "Total pagado",
  total_sin_iva: "Total sin IVA",
};

const HIDDEN_FIELDS = new Set([
  "id",
  "created_at",
  "updated_at",
  "deleted_at",
  "iva_base_imponible",
]);

const MONEY_FIELDS = new Set([
  "adicionales_monto",
  "comision_organizador",
  "comision_organizador_monto",
  "importe_en_pesos",
  "monto_adicionales",
  "monto_con_factura",
  "monto_sin_factura",
  "precio_base",
  "precio_cierre_alimentos_sin_iva",
  "precio_cierre_bebidas_sin_iva",
  "precio_unitario",
  "saldo_pendiente",
  "total_con_iva",
  "total_pagado",
  "total_sin_iva",
]);

const PERCENTAGE_FIELDS = new Set(["iva_comision", "iva_porcentaje"]);
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type AuditDisplayAction =
  | "INSERT"
  | "UPDATE"
  | "DELETE"
  | "SOFT_DELETE"
  | "RESTORE"
  | "ASSIGN"
  | "UNASSIGN";

export type AuditChange = {
  field: string;
  label: string;
  before: Json | undefined;
  after: Json | undefined;
};

export type AuditSnapshotField = {
  field: string;
  label: string;
  value: Json;
};

export function getTableLabel(table: string) {
  return TABLE_LABELS[table] ?? humanizeIdentifier(table);
}

export function getFieldLabel(field: string) {
  return FIELD_LABELS[field] ?? humanizeIdentifier(field);
}

export function getAuditObject(value: Json | null): AuditJsonObject {
  if (value && typeof value === "object" && !Array.isArray(value)) return value;
  return {};
}

export function getAuditChanges(
  beforeValue: Json | null,
  afterValue: Json | null,
): AuditChange[] {
  const before = getAuditObject(beforeValue);
  const after = getAuditObject(afterValue);

  return Array.from(new Set([...Object.keys(before), ...Object.keys(after)]))
    .filter(isAuditFieldVisible)
    .filter((field) => !jsonValuesEqual(before[field], after[field]))
    .sort()
    .map((field) => ({
      after: after[field],
      before: before[field],
      field,
      label: getFieldLabel(field),
    }));
}

export function getAuditSnapshot(value: Json | null): AuditSnapshotField[] {
  return Object.entries(getAuditObject(value))
    .flatMap(([field, fieldValue]) => {
      if (
        fieldValue === undefined ||
        !isAuditFieldVisible(field) ||
        formatAuditValue(fieldValue, field) === null
      ) {
        return [];
      }

      return [{
      field,
      label: getFieldLabel(field),
      value: fieldValue,
      }];
    })
    .sort((left, right) => left.field.localeCompare(right.field, "es"));
}

export function getAuditFieldsForAction(
  action: AuditDisplayAction,
  beforeValue: Json | null,
  afterValue: Json | null,
) {
  return getAuditSnapshot(
    action === "DELETE" || action === "SOFT_DELETE" || action === "UNASSIGN"
      ? beforeValue
      : afterValue,
  );
}

export function getDisplayAction({
  action,
  afterValue,
  beforeValue,
  table,
}: {
  action: string;
  afterValue: Json | null;
  beforeValue: Json | null;
  table: string;
}): AuditDisplayAction {
  if (
    action === "SOFT_DELETE" ||
    action === "RESTORE" ||
    action === "ASSIGN" ||
    action === "UNASSIGN"
  ) {
    return action;
  }

  if (table === "usuario_salon" && action === "INSERT") return "ASSIGN";
  if (table === "usuario_salon" && action === "DELETE") return "UNASSIGN";

  const before = getAuditObject(beforeValue);
  const after = getAuditObject(afterValue);
  const beforeDeletedAt = before.deleted_at;
  const afterDeletedAt = after.deleted_at;

  if (
    (action === "UPDATE" || action === "DELETE") &&
    !beforeDeletedAt &&
    typeof afterDeletedAt === "string" &&
    afterDeletedAt.length > 0
  ) {
    return "SOFT_DELETE";
  }

  if (
    action === "UPDATE" &&
    typeof beforeDeletedAt === "string" &&
    beforeDeletedAt.length > 0 &&
    !afterDeletedAt
  ) {
    return "RESTORE";
  }

  return action === "INSERT" || action === "DELETE" ? action : "UPDATE";
}

export function getActionLabel(action: AuditDisplayAction) {
  const labels: Record<AuditDisplayAction, string> = {
    ASSIGN: "Asignación",
    DELETE: "Eliminación",
    INSERT: "Creación",
    RESTORE: "Restauración",
    SOFT_DELETE: "Eliminación",
    UNASSIGN: "Desasignación",
    UPDATE: "Modificación",
  };

  return labels[action];
}

export function getAuditActivity(action: AuditDisplayAction, table: string) {
  const verbs: Record<AuditDisplayAction, string> = {
    ASSIGN: "Asignó",
    DELETE: "Eliminó",
    INSERT: "Creó",
    RESTORE: "Restauró",
    SOFT_DELETE: "Eliminó",
    UNASSIGN: "Quitó",
    UPDATE: "Modificó",
  };

  return `${verbs[action]} ${ENTITY_DESCRIPTIONS[table] ?? getTableLabel(table).toLocaleLowerCase("es-AR")}`;
}

export function getAuditDetailTitle(action: AuditDisplayAction) {
  if (action === "INSERT" || action === "ASSIGN") return "Datos creados";
  if (action === "DELETE" || action === "SOFT_DELETE" || action === "UNASSIGN") {
    return "Datos eliminados";
  }
  if (action === "RESTORE") return "Datos restaurados";
  return "Cambios realizados";
}

export function getAuditSummary(
  beforeValue: Json | null,
  afterValue: Json | null,
) {
  const changes = getAuditChanges(beforeValue, afterValue);
  if (changes.length === 0) return null;

  const labels = changes.slice(0, 3).map((change) => change.label);
  const remaining = changes.length - labels.length;
  return `${labels.join(", ")}${remaining > 0 ? ` y ${remaining} más` : ""}`;
}

export function formatAuditValue(
  value: Json | undefined,
  field?: string,
): string | null {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "boolean") return value ? "Sí" : "No";
  if (typeof value === "number") {
    if (field && MONEY_FIELDS.has(field)) return formatCurrency(value);
    if (field && PERCENTAGE_FIELDS.has(field)) return `${formatNumber(value)}%`;
    return formatNumber(value);
  }
  if (typeof value === "string") {
    if (UUID_PATTERN.test(value)) return null;
    if (isDateField(field) || isDate(value)) return formatDate(value);
    return value;
  }
  if (Array.isArray(value)) {
    const values = value
      .map((item) => formatAuditValue(item, field))
      .filter((item): item is string => Boolean(item));
    return values.length > 0 ? values.join(", ") : null;
  }
  return null;
}

export function formatAuditDateTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Fecha no disponible";

  return `${new Intl.DateTimeFormat("es-AR", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "America/Argentina/Buenos_Aires",
  }).format(date)} · ${new Intl.DateTimeFormat("es-AR", {
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
    timeZone: "America/Argentina/Buenos_Aires",
  }).format(date)}`;
}

export function isAuditFieldVisible(field: string) {
  return (
    !HIDDEN_FIELDS.has(field) &&
    field !== "id" &&
    !field.endsWith("_id") &&
    !field.endsWith("_ids") &&
    !/(password|secret|token|credential|session)/i.test(field)
  );
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat("es-AR", {
    currency: "ARS",
    maximumFractionDigits: 0,
    style: "currency",
  }).format(value);
}

function formatNumber(value: number) {
  return new Intl.NumberFormat("es-AR", { maximumFractionDigits: 2 }).format(value);
}

function formatDate(value: string) {
  const dateOnly = /^\d{4}-\d{2}-\d{2}$/.test(value);
  const date = new Date(dateOnly ? `${value}T00:00:00.000Z` : value);
  if (Number.isNaN(date.getTime())) return value;

  return new Intl.DateTimeFormat("es-AR", {
    dateStyle: "medium",
    ...(dateOnly ? { timeZone: "UTC" } : { timeZone: "America/Argentina/Buenos_Aires" }),
  }).format(date);
}

function humanizeIdentifier(value: string) {
  const normalized = value.replaceAll("_", " ").trim();
  return normalized
    ? normalized.charAt(0).toUpperCase() + normalized.slice(1)
    : "Sin identificar";
}

function isDate(value: string) {
  return /^\d{4}-\d{2}-\d{2}T/.test(value);
}

function isDateField(field?: string) {
  return Boolean(field?.startsWith("fecha_"));
}

function jsonValuesEqual(left: Json | undefined, right: Json | undefined) {
  if (left === right) return true;
  if (left === undefined || right === undefined) return false;
  return JSON.stringify(left) === JSON.stringify(right);
}
