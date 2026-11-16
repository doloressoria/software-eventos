import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { allRows } from "@/lib/commercial-export/rows";
import { reciboNumero, reciboPath } from "@/lib/recibos/types";

export async function RecibosEmitidos({ kind, id }: { kind: "eventos" | "catering"; id: string }) {
  const client = await createClient();
  let receipts;
  try {
    receipts = await allRows((start, end) => client.from("recibos").select("id,pago_id,serie,numero,revision,tipo")
      .eq(kind === "eventos" ? "evento_id" : "catering_contrato_id", id)
      .order("numero", { ascending: false }).range(start, end));
  } catch { return <p role="alert">No se pudo leer el historial de recibos emitidos.</p>; }
  if (!receipts.length) return null;
  return <details><summary className="cursor-pointer font-medium">Recibos emitidos, modificaciones y anulaciones</summary>
    <ul className="mt-3 space-y-2">{receipts.map(r => <li key={r.id}>
      <Link className="underline" href={reciboPath({ kind, id, pagoId: r.pago_id })}>{reciboNumero(r)} · {r.tipo} · Revisión {r.revision}</Link>
    </li>)}</ul>
  </details>;
}
