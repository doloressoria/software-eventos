import { ArrowRight, ChevronDown } from "lucide-react";
import type { Json, Tables } from "@/types/database.types";
import {
  formatAuditValue,
  getAuditChanges,
  getAuditDetailTitle,
  getAuditFieldsForAction,
  getDisplayAction,
} from "@/lib/audit/presentation";

type AuditLogDetail = Pick<
  Tables<"audit_log">,
  "accion" | "datos_anteriores" | "datos_nuevos" | "tabla"
>;

export function AuditDetail({ log }: { log: AuditLogDetail }) {
  const action = getDisplayAction({
    action: log.accion,
    afterValue: log.datos_nuevos,
    beforeValue: log.datos_anteriores,
    table: log.tabla,
  });
  const changes = getAuditChanges(log.datos_anteriores, log.datos_nuevos);
  const snapshot = getAuditFieldsForAction(
    action,
    log.datos_anteriores,
    log.datos_nuevos,
  );
  const showChanges = action === "UPDATE";

  return (
    <details className="group rounded-xl border border-slate-200 bg-slate-50/70 open:border-teal-100 lg:open:col-start-3 lg:open:col-span-2">
      <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-3 rounded-xl px-5 py-3 text-base font-medium text-teal-700 outline-none transition hover:bg-teal-50 hover:text-teal-800 focus-visible:ring-2 focus-visible:ring-ring/25 focus-visible:ring-offset-2">
        <span className="group-open:hidden">Ver cambios</span>
        <span className="hidden group-open:inline">Ocultar cambios</span>
        <ChevronDown className="size-4 shrink-0 transition-transform group-open:rotate-180" aria-hidden="true" />
      </summary>

      <div className="border-t border-slate-200 px-4 py-4 sm:px-5">
        <h3 className="text-sm font-semibold text-slate-900">
          {getAuditDetailTitle(action)}
        </h3>

        {showChanges ? (
          changes.length > 0 ? (
            <dl className="mt-3 divide-y divide-slate-200 rounded-lg border border-slate-200 bg-white">
              {changes.map((change) => (
                <div
                  key={change.field}
                  className="grid gap-1 px-3 py-3 sm:grid-cols-[minmax(10rem,0.45fr)_minmax(0,1fr)] sm:gap-4"
                >
                  <dt className="text-sm font-medium text-slate-700">
                    {change.label}
                  </dt>
                  <dd className="flex min-w-0 items-center gap-2 text-base">
                    <span className="min-w-0 break-words tabular-nums text-slate-500">
                      {displayValue(change.before, change.field)}
                    </span>
                    <ArrowRight className="size-4 shrink-0 text-slate-400" aria-hidden="true" />
                    <span className="min-w-0 break-words tabular-nums font-medium text-slate-900">
                      {displayValue(change.after, change.field)}
                    </span>
                  </dd>
                </div>
              ))}
            </dl>
          ) : (
            <EmptyDetail />
          )
        ) : snapshot.length > 0 ? (
          <dl className="mt-3 grid gap-x-6 gap-y-3 sm:grid-cols-2 lg:grid-cols-3">
            {snapshot.map((field) => (
              <div key={field.field} className="min-w-0">
                <dt className="text-xs font-medium text-slate-500">{field.label}</dt>
                <dd className="mt-1 break-words text-base font-medium tabular-nums text-slate-800">
                  {displayValue(field.value, field.field)}
                </dd>
              </div>
            ))}
          </dl>
        ) : (
          <EmptyDetail />
        )}
      </div>
    </details>
  );
}

function EmptyDetail() {
  return (
    <p className="mt-2 text-sm text-slate-500">
      No hay información adicional disponible para este registro.
    </p>
  );
}

function displayValue(value: Json | null | undefined, field: string) {
  return formatAuditValue(value, field) ?? "—";
}
