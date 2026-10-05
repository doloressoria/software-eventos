"use client";

import { useState, useTransition } from "react";
import { searchEventosCateringAction } from "@/app/(protected)/catering/actions";
import { buttonVariants } from "@/components/ui/button";
import { FieldError, Input } from "@/components/ui/form";
import type { EventoBuscadorResult } from "@/lib/catering/queries";

type EventoPickerFieldProps = {
  error?: string;
  initialEvento?: EventoBuscadorResult | null;
  name: string;
  onSelect?: (evento: EventoBuscadorResult) => void;
};

export function EventoPickerField({
  error,
  initialEvento = null,
  name,
  onSelect,
}: EventoPickerFieldProps) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<EventoBuscadorResult[]>([]);
  const [searched, setSearched] = useState(false);
  const [selected, setSelected] = useState<EventoBuscadorResult | null>(initialEvento);
  const [isPending, startTransition] = useTransition();

  function handleSearch() {
    startTransition(async () => {
      const data = await searchEventosCateringAction(query);
      setResults(data);
      setSearched(true);
    });
  }

  return (
    <div>
      <input type="hidden" name={name} value={selected?.id ?? ""} />

      {selected ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-teal-100 bg-teal-50/60 px-4 py-3">
          <div>
            <p className="text-sm font-medium text-slate-950">
              {selected.cliente_nombre ?? "Cliente sin nombre"}
            </p>
            <p className="mt-1 text-xs text-slate-500">
              {formatDate(selected.fecha_evento)} · {selected.salon_nombre}
            </p>
            <p className="mt-1 text-xs text-slate-500">
              {selected.tipo_evento ?? "Tipo sin especificar"} · {[
                selected.pax_adultos,
                selected.pax_jovenes,
                selected.pax_menores,
                selected.pax_bebes,
              ].reduce<number>((sum, pax) => sum + (pax ?? 0), 0)} personas
            </p>
          </div>
          <button
            type="button"
            onClick={() => setSelected(null)}
            className={buttonVariants({ variant: "secondary", size: "xs" })}
          >
            Cambiar evento
          </button>
        </div>
      ) : (
        <>
          <div className="flex gap-2">
            <Input
              type="text"
              placeholder="Buscar por cliente, salon o nombre del evento"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  handleSearch();
                }
              }}
              className="mt-0"
              aria-invalid={Boolean(error)}
            />
            <button
              type="button"
              onClick={handleSearch}
              disabled={isPending}
              className={buttonVariants({ variant: "secondary" })}
            >
              {isPending ? "Buscando..." : "Buscar"}
            </button>
          </div>

          {searched ? (
            results.length > 0 ? (
              <ul className="mt-3 divide-y divide-slate-100 rounded-lg border border-slate-200">
                {results.map((result) => (
                  <li key={result.id}>
                    <button
                      type="button"
                      onClick={() => {
                        setSelected(result);
                        onSelect?.(result);
                      }}
                      className="flex w-full flex-col gap-1 px-4 py-3 text-left text-sm transition hover:bg-teal-50/60"
                    >
                      <span className="font-medium text-slate-950">
                        {result.cliente_nombre ?? "Cliente sin nombre"}
                      </span>
                      <span className="text-xs text-slate-500">
                        {formatDate(result.fecha_evento)} · {result.salon_nombre}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-3 text-sm text-slate-500">
                No se encontraron eventos con esa busqueda.
              </p>
            )
          ) : null}
        </>
      )}

      {error ? (
        <FieldError id="evento_id-error">{error}</FieldError>
      ) : null}
    </div>
  );
}

function formatDate(value: string | null) {
  if (!value) {
    return "-";
  }

  return new Intl.DateTimeFormat("es-AR", {
    day: "2-digit",
    month: "2-digit",
    timeZone: "UTC",
    year: "numeric",
  }).format(new Date(`${value}T00:00:00.000Z`));
}
