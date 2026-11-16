"use server";
import { redirect } from "next/navigation";
import { createClient } from "../supabase/server";
import { loadReciboContext } from "./data";
import { reciboPath, type ReciboScope } from "./types";

export async function emitirReciboAction(scope: ReciboScope): Promise<{ error?: string }> {
  const client = await createClient();
  try { await loadReciboContext(client, scope); }
  catch { return { error: "No se pudo comprobar el acceso al cobro completo." }; }
  const result = await client.rpc("emitir_recibo", { p_pago: scope.pagoId });
  if (result.error) return { error: "No se pudo emitir. Revisá el estado del cobro, el emisor y tus permisos; luego reintentá." };
  redirect(reciboPath(scope));
}
