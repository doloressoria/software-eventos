import { createClient } from "@/lib/supabase/server";
import { loadEventoIngresos } from "./ingresos-data";

export type { EstadoCobro } from "./calculos";
export type { PagoEvento, EventoIngresos } from "./ingresos-data";

export async function getEventoIngresos(eventoId: string) {
  return loadEventoIngresos(await createClient(), eventoId);
}
