import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../../types/database.types";
import { allRows } from "../commercial-export/rows";
import { ExportError } from "../commercial-export/types";
import type { ReciboScope, ReciboSnapshot } from "./types";

export async function loadReciboContext(client: SupabaseClient<Database>, scope: ReciboScope) {
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!uuid.test(scope.id) || !uuid.test(scope.pagoId)) throw new ExportError(400, "Identificador inválido.");
  const { data: { user }, error: authError } = await client.auth.getUser();
  if (authError || !user) throw new ExportError(401, "Iniciá sesión para acceder al recibo.");
  const { data: payment, error } = await client.from("pagos").select("id,evento_id,catering_contrato_id,deleted_at")
    .eq("id", scope.pagoId).maybeSingle();
  if (error) throw new ExportError(500, "No se pudo comprobar el acceso al cobro.");
  if (!payment || (scope.kind === "eventos" ? payment.evento_id !== scope.id
    : payment.catering_contrato_id !== scope.id || payment.evento_id !== null)) {
    throw new ExportError(404, "Cobro completo no disponible. El acceso parcial a un catering no habilita el recibo de la cabecera.");
  }
  const documents = await allRows((start, end) => client.from("recibos").select("*")
    .eq("pago_id", scope.pagoId).order("revision").range(start, end));
  // También al re-descargar: las políticas verifican usuario activo, módulo y alcance completo.
  let snapshot: ReciboSnapshot;
  if (documents.length) snapshot = documents[0].snapshot as unknown as ReciboSnapshot;
  else {
    const result = await client.rpc("previsualizar_recibo", { p_pago: scope.pagoId });
    if (result.error) throw new ExportError(result.error.code === "42501" ? 403 : 422,
      result.error.code === "23514" ? "Configurá un emisor de recibos antes de emitir para este negocio." : "No se puede previsualizar el cobro completo con estos permisos.");
    snapshot = result.data as unknown as ReciboSnapshot;
  }
  if (snapshot?.version !== 1 && snapshot?.version !== 2) throw new ExportError(500, "Versión de recibo no compatible.");
  return { documents, snapshot, anulado: payment.deleted_at !== null };
}
