"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { buttonVariants } from "@/components/ui/button";
import { getSalonColorClasses } from "@/lib/calendar/salon-colors";
import type {
  CalendarioSalonOption,
  EventoCalendario,
} from "@/lib/eventos/queries";
import { cn } from "@/utils/cn";

const WEEKDAY_LABELS = ["Lun", "Mar", "Mie", "Jue", "Vie", "Sab", "Dom"];
const MONTH_LABEL_FORMATTER = new Intl.DateTimeFormat("es-AR", {
  month: "long",
  year: "numeric",
  timeZone: "UTC",
});

type EventCalendarProps = {
  year: number;
  monthIndex: number;
  todayISO: string;
  eventos: EventoCalendario[];
  salones: CalendarioSalonOption[];
};

export function EventCalendar({
  year,
  monthIndex,
  todayISO,
  eventos,
  salones,
}: EventCalendarProps) {
  const [salonFilter, setSalonFilter] = useState("all");

  const eventosPorDia = useMemo(() => {
    const map = new Map<string, EventoCalendario[]>();
    for (const evento of eventos) {
      if (salonFilter !== "all" && evento.salon_id !== salonFilter) {
        continue;
      }
      const list = map.get(evento.fecha_evento) ?? [];
      list.push(evento);
      map.set(evento.fecha_evento, list);
    }
    return map;
  }, [eventos, salonFilter]);

  const cells = useMemo(() => buildMonthCells(year, monthIndex), [year, monthIndex]);

  const monthLabel = capitalize(
    MONTH_LABEL_FORMATTER.format(new Date(Date.UTC(year, monthIndex, 1))),
  );

  const prevHref = `/dashboard?month=${formatMonthParam(...shiftMonth(year, monthIndex, -1))}`;
  const nextHref = `/dashboard?month=${formatMonthParam(...shiftMonth(year, monthIndex, 1))}`;

  return (
    <Card className="overflow-hidden">
      <div className="flex flex-col gap-4 border-b border-slate-200 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2">
          <Link href={prevHref} className={buttonVariants({ variant: "secondary", size: "xs" })}>
            Anterior
          </Link>
          <Link href="/dashboard" className={buttonVariants({ variant: "secondary", size: "xs" })}>
            Hoy
          </Link>
          <Link href={nextHref} className={buttonVariants({ variant: "secondary", size: "xs" })}>
            Siguiente
          </Link>
          <h2 className="ml-2 text-base font-semibold text-slate-950">{monthLabel}</h2>
        </div>

        <label className="flex items-center gap-2 text-sm text-slate-600">
          Salon
          <select
            value={salonFilter}
            onChange={(event) => setSalonFilter(event.target.value)}
            className="rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-sm text-slate-800 outline-none focus-visible:ring-2 focus-visible:ring-teal-900/20"
          >
            <option value="all">Todos los salones</option>
            {salones.map((salon) => (
              <option key={salon.id} value={salon.id}>
                {salon.nombre}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="grid grid-cols-7 border-b border-slate-200 bg-slate-50 text-xs font-semibold uppercase tracking-[0.1em] text-slate-500">
        {WEEKDAY_LABELS.map((label) => (
          <div key={label} className="px-2 py-2 text-center">
            {label}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-7">
        {cells.map((cell) => {
          const dayEventos = eventosPorDia.get(cell.iso) ?? [];
          const isToday = cell.iso === todayISO;

          return (
            <div
              key={cell.iso}
              className={cn(
                "flex min-h-28 flex-col gap-1 border-b border-r border-slate-200 p-2 last:border-r-0",
                !cell.inCurrentMonth && "bg-slate-50/60",
              )}
            >
              <span
                className={cn(
                  "inline-flex h-6 w-6 items-center justify-center rounded-full text-xs font-medium",
                  isToday
                    ? "bg-teal-900 text-white"
                    : cell.inCurrentMonth
                      ? "text-slate-700"
                      : "text-slate-400",
                )}
              >
                {cell.day}
              </span>

              {dayEventos.length > 0 ? (
                <div className="flex max-h-24 flex-col gap-1 overflow-y-auto pr-0.5">
                  {dayEventos.map((evento) => {
                    const colors = getSalonColorClasses(evento.salon_id);
                    const pax = getPaxTotal(evento);
                    return (
                      <Link
                        key={evento.id}
                        href={`/eventos/${evento.id}`}
                        className={cn(
                          "flex items-center gap-1.5 truncate rounded border px-1.5 py-1 text-xs font-medium transition hover:opacity-80",
                          colors.chip,
                        )}
                        title={`${evento.cliente_nombre} - ${evento.salones?.nombre ?? "Sin salon"} - ${pax} personas`}
                      >
                        <span className={cn("h-1.5 w-1.5 shrink-0 rounded-full", colors.dot)} />
                        <span className="truncate">{evento.cliente_nombre}</span>
                        <span className="ml-auto shrink-0 tabular-nums opacity-70">
                          {pax}p
                        </span>
                      </Link>
                    );
                  })}
                </div>
              ) : null}
            </div>
          );
        })}
      </div>

      {eventos.length === 0 ? (
        <div className="border-t border-dashed border-slate-300 bg-slate-50 px-5 py-8 text-center">
          <p className="text-sm font-medium text-slate-700">
            No hay eventos cargados para este mes.
          </p>
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-3 border-t border-slate-200 px-5 py-3 text-xs text-slate-500">
          <Badge variant="neutral">{eventos.length} eventos este mes</Badge>
        </div>
      )}

      {salones.length > 0 ? (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-slate-200 bg-slate-50 px-5 py-3 text-xs text-slate-600">
          <span className="font-semibold uppercase tracking-[0.08em] text-slate-400">
            Salones
          </span>
          {salones.map((salon) => {
            const colors = getSalonColorClasses(salon.id);
            return (
              <span key={salon.id} className="flex items-center gap-1.5">
                <span className={cn("h-2 w-2 shrink-0 rounded-full", colors.dot)} />
                {salon.nombre}
              </span>
            );
          })}
        </div>
      ) : null}
    </Card>
  );
}

function getPaxTotal(evento: EventoCalendario) {
  return (
    (evento.pax_adultos ?? 0) +
    (evento.pax_jovenes ?? 0) +
    (evento.pax_menores ?? 0) +
    (evento.pax_bebes ?? 0)
  );
}

type MonthCell = {
  iso: string;
  day: number;
  inCurrentMonth: boolean;
};

function buildMonthCells(year: number, monthIndex: number): MonthCell[] {
  const firstOfMonth = new Date(Date.UTC(year, monthIndex, 1));
  const firstWeekday = firstOfMonth.getUTCDay(); // 0 = domingo
  const leadingDays = (firstWeekday + 6) % 7; // semana arranca en lunes
  const daysInMonth = new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();
  const totalCells = Math.ceil((leadingDays + daysInMonth) / 7) * 7;

  const cells: MonthCell[] = [];
  for (let i = 0; i < totalCells; i += 1) {
    const date = new Date(Date.UTC(year, monthIndex, 1 - leadingDays + i));
    cells.push({
      iso: date.toISOString().slice(0, 10),
      day: date.getUTCDate(),
      inCurrentMonth: date.getUTCMonth() === ((monthIndex % 12) + 12) % 12,
    });
  }

  return cells;
}

function shiftMonth(year: number, monthIndex: number, delta: number): [number, number] {
  const date = new Date(Date.UTC(year, monthIndex + delta, 1));
  return [date.getUTCFullYear(), date.getUTCMonth()];
}

function formatMonthParam(year: number, monthIndex: number) {
  return `${year}-${String(monthIndex + 1).padStart(2, "0")}`;
}

function capitalize(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}
