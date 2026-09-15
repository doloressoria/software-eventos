import Link from "next/link";
import { redirect } from "next/navigation";
import { AuditDetail } from "@/components/audit/audit-detail";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DatePickerField } from "@/components/ui/date-picker-field";
import { EmptyState } from "@/components/ui/empty-state";
import { Label } from "@/components/ui/form";
import { PageHeader } from "@/components/ui/page-header";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AUDITED_TABLES,
  AUDIT_ACTIONS,
  hasAuditFilters,
  parseAuditFilters,
  type AuditFilters,
  type AuditSearchParams,
} from "@/lib/audit/filters";
import {
  formatAuditDateTime,
  formatAuditValue,
  getActionLabel,
  getAuditActivity,
  getAuditObject,
  getAuditSummary,
  getDisplayAction,
  getTableLabel,
} from "@/lib/audit/presentation";
import { listAuditLogs } from "@/lib/audit/queries";

type AuditoriaPageProps = {
  searchParams?: Promise<AuditSearchParams>;
};

export default async function AuditoriaPage({
  searchParams,
}: AuditoriaPageProps) {
  const params = searchParams ? await searchParams : {};
  const filters = parseAuditFilters(params);
  const { logs, pageSize, total, totalPages, users } =
    await listAuditLogs(filters);

  if (total > 0 && filters.page > totalPages) {
    redirect(getPageHref(filters, totalPages));
  }

  const hasFilters = hasAuditFilters(filters);
  const firstResult = total === 0 ? 0 : (filters.page - 1) * pageSize + 1;
  const lastResult = Math.min(filters.page * pageSize, total);

  return (
    <section className="space-y-6">
      <PageHeader
        eyebrow="Admin"
        title="Auditoría"
        description="Consultá las acciones importantes realizadas en el sistema."
        actions={
          <Link
            href="/admin"
            className={buttonVariants({ variant: "secondary" })}
          >
            Volver al panel
          </Link>
        }
      />

      <Card>
        <CardHeader>
          <CardTitle>Filtros</CardTitle>
          <p className="mt-1 text-sm text-slate-500">
            Encontrá acciones por fecha, responsable o tipo de elemento.
          </p>
        </CardHeader>
        <CardContent>
          <form className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <FilterDate defaultValue={filters.dateFrom} label="Desde" name="desde" />
            <FilterDate defaultValue={filters.dateTo} label="Hasta" name="hasta" />
            <FilterSelect
              defaultValue={filters.userId}
              label="Responsable"
              name="usuario"
              options={[
                { label: "Todos", value: "todos" },
                ...users.map((user) => ({
                  label: getUserOptionLabel(user),
                  value: user.id,
                })),
              ]}
            />
            <FilterSelect
              defaultValue={filters.action}
              label="Acción"
              name="accion"
              options={[
                { label: "Todas", value: "todas" },
                ...AUDIT_ACTIONS.map((action) => ({
                  label: getActionLabel(action),
                  value: action,
                })),
              ]}
            />
            <FilterSelect
              defaultValue={filters.table}
              label="Tipo de elemento"
              name="tabla"
              options={[
                { label: "Todos", value: "todos" },
                ...AUDITED_TABLES.map((table) => ({
                  label: getTableLabel(table),
                  value: table,
                })),
              ]}
            />
            <FilterSelect
              defaultValue={filters.order}
              label="Orden"
              name="orden"
              options={[
                { label: "Más recientes primero", value: "desc" },
                { label: "Más antiguos primero", value: "asc" },
              ]}
            />
            <div className="flex items-end gap-3 md:col-span-2">
              {hasFilters ? (
                <Link
                  href="/admin/auditoria"
                  className={buttonVariants({ variant: "secondary" })}
                >
                  Limpiar filtros
                </Link>
              ) : null}
              <button type="submit" className={buttonVariants({ variant: "primary" })}>
                Aplicar filtros
              </button>
            </div>
          </form>
        </CardContent>
      </Card>

      <Card className="overflow-hidden">
        <CardHeader className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <CardTitle>Historial de actividad</CardTitle>
            <p className="mt-1 text-sm text-slate-500">
              {total > 0
                ? `Mostrando ${firstResult}-${lastResult} de ${total} registros`
                : hasFilters
                  ? "No hay resultados para los filtros aplicados"
                  : "Todavía no hay registros de auditoría"}
            </p>
          </div>
          <Badge variant="primary">Solo administradores</Badge>
        </CardHeader>

        {logs.length > 0 ? (
          <>
            <div className="divide-y divide-slate-100">
              {logs.map((log) => {
                const action = getDisplayAction({
                  action: log.accion,
                  afterValue: log.datos_nuevos,
                  beforeValue: log.datos_anteriores,
                  table: log.tabla,
                });
                const context = getContextLabel(log);
                const eventId = getEventId(log);
                const summary = getAuditSummary(
                  log.datos_anteriores,
                  log.datos_nuevos,
                );

                return (
                  <article
                    key={log.id}
                    className="grid gap-4 px-5 py-5 transition-colors hover:bg-slate-50 sm:px-6 lg:grid-cols-[10rem_minmax(11rem,0.8fr)_minmax(15rem,1.35fr)_minmax(11rem,0.75fr)] lg:items-start"
                  >
                    <time
                      dateTime={log.created_at}
                      className="text-sm font-medium text-slate-600"
                    >
                      {formatAuditDateTime(log.created_at)}
                    </time>

                    <Responsible user={log.usuarios} />

                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge variant={getActionVariant(action)}>
                          {getActionLabel(action)}
                        </Badge>
                        <p className="font-semibold text-slate-950">
                          {getAuditActivity(action, log.tabla)}
                        </p>
                      </div>
                      {context ? (
                        <p className="mt-2 break-words text-sm text-slate-600">
                          <span className="font-medium text-slate-700">{context.label}:</span>{" "}
                          {context.value}
                        </p>
                      ) : null}
                      {summary ? (
                        <p className="mt-1.5 text-sm text-slate-500">
                          Cambios: {summary}
                        </p>
                      ) : null}
                      {eventId ? (
                        <Link
                          href={`/eventos/${eventId}`}
                          className="mt-2 inline-block text-sm font-medium text-teal-700 hover:text-teal-800 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/25"
                        >
                          Abrir evento
                        </Link>
                      ) : null}
                    </div>

                    <AuditDetail log={log} />
                  </article>
                );
              })}
            </div>

            <nav
              aria-label="Paginación del historial"
              className="flex flex-col gap-3 border-t border-slate-100 px-6 py-4 sm:flex-row sm:items-center sm:justify-between"
            >
              <p className="text-sm text-slate-500">
                Página {filters.page} de {totalPages}
              </p>
              <div className="flex gap-2">
                {filters.page > 1 ? (
                  <Link
                    href={getPageHref(filters, filters.page - 1)}
                    className={buttonVariants({ variant: "secondary", size: "sm" })}
                  >
                    Anterior
                  </Link>
                ) : null}
                {filters.page < totalPages ? (
                  <Link
                    href={getPageHref(filters, filters.page + 1)}
                    className={buttonVariants({ variant: "secondary", size: "sm" })}
                  >
                    Siguiente
                  </Link>
                ) : null}
              </div>
            </nav>
          </>
        ) : (
          <EmptyState
            title={
              hasFilters
                ? "No hay cambios con estos filtros"
                : "Todavía no hay cambios auditados"
            }
            description={
              hasFilters
                ? "Probá otra combinación o limpiá los filtros para ver todo el historial."
                : "Las altas, ediciones y eliminaciones aparecerán acá."
            }
            action={
              hasFilters ? (
                <Link
                  href="/admin/auditoria"
                  className={buttonVariants({ variant: "secondary" })}
                >
                  Limpiar filtros
                </Link>
              ) : undefined
            }
          />
        )}
      </Card>
    </section>
  );
}

function Responsible({
  user,
}: {
  user: { email: string; full_name: string | null } | null;
}) {
  const name = user?.full_name?.trim();
  const email = user?.email;

  return (
    <div className="min-w-0">
      <p className="break-words font-medium text-slate-950">
        {name || email || "Operación del sistema"}
      </p>
      {name && email ? (
        <p className="mt-1 break-all text-xs text-slate-500">{email}</p>
      ) : null}
    </div>
  );
}

function FilterDate({
  defaultValue,
  label,
  name,
}: {
  defaultValue?: string;
  label: string;
  name: string;
}) {
  return (
    <div>
      <Label htmlFor={name}>{label}</Label>
      <DatePickerField
        id={name}
        name={name}
        defaultValue={defaultValue}
        placeholder="Seleccionar fecha"
      />
    </div>
  );
}

function FilterSelect({
  defaultValue,
  label,
  name,
  options,
}: {
  defaultValue?: string;
  label: string;
  name: string;
  options: Array<{ label: string; value: string }>;
}) {
  return (
    <div>
      <Label htmlFor={name}>{label}</Label>
      <Select name={name} defaultValue={defaultValue ?? options[0]?.value}>
        <SelectTrigger id={name}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {options.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

function getUserOptionLabel(user: { email: string; full_name: string | null }) {
  const name = user.full_name?.trim();
  return name ? `${name} (${user.email})` : user.email;
}

function getPageHref(filters: AuditFilters, page: number) {
  const params = new URLSearchParams();
  if (filters.dateFrom) params.set("desde", filters.dateFrom);
  if (filters.dateTo) params.set("hasta", filters.dateTo);
  if (filters.userId) params.set("usuario", filters.userId);
  if (filters.action) params.set("accion", filters.action);
  if (filters.table) params.set("tabla", filters.table);
  if (filters.recordId) params.set("registro", filters.recordId);
  if (filters.order === "asc") params.set("orden", "asc");
  params.set("pagina", String(page));
  return `/admin/auditoria?${params.toString()}`;
}

function getEventId(
  log: Awaited<ReturnType<typeof listAuditLogs>>["logs"][number],
) {
  if (log.tabla === "eventos") return log.registro_id;
  const after = getAuditObject(log.datos_nuevos);
  const before = getAuditObject(log.datos_anteriores);
  const eventId = after.evento_id ?? before.evento_id;
  return typeof eventId === "string" ? eventId : null;
}

function getContextLabel(
  log: Awaited<ReturnType<typeof listAuditLogs>>["logs"][number],
) {
  const snapshot = {
    ...getAuditObject(log.datos_anteriores),
    ...getAuditObject(log.datos_nuevos),
  };
  const context = [
    ["nombre_evento", "Evento"],
    ["nombre", "Nombre"],
    ["cliente_nombre", "Cliente"],
    ["proveedor", "Proveedor"],
    ["concepto", "Concepto"],
  ] as const;

  for (const [field, label] of context) {
    const value = snapshot[field];
    const formatted = formatAuditValue(value, field);
    if (formatted) return { label, value: formatted };
  }

  return null;
}

function getActionVariant(
  action: ReturnType<typeof getDisplayAction>,
): "danger" | "success" | "warning" {
  if (action === "DELETE" || action === "SOFT_DELETE" || action === "UNASSIGN") {
    return "danger";
  }
  if (action === "INSERT" || action === "RESTORE" || action === "ASSIGN") {
    return "success";
  }
  return "warning";
}
