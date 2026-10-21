import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { ContactoInput } from "./validation";

export type ContactosState = {
  contactos: ContactoInput[];
  version: string;
  contactoAnterior: string | null;
  puedeEditar: boolean;
  error?: string;
  success?: string;
};

export async function getEventoContactos(eventoId: string): Promise<ContactosState> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("evento_contactos_contexto", { p_evento_id: eventoId }).single();
  if (error || !data) throw new Error("No se pudieron cargar los contactos del evento.");
  const rows = data.contactos as unknown as Array<{
    id: string; nombre: string; telefono: string | null; correo: string | null;
    relacion: string | null; observaciones: string | null; es_principal: boolean;
  }>;
  return {
    contactos: rows.map((c) => ({
      id: c.id, nombre: c.nombre, telefono: c.telefono ?? "", correo: c.correo ?? "",
      relacion: c.relacion ?? "", observaciones: c.observaciones ?? "", es_principal: c.es_principal,
    })),
    version: data.version,
    contactoAnterior: data.contacto_anterior,
    puedeEditar: data.puede_editar,
  };
}
