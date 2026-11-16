import "server-only";
import { createClient } from "../supabase/server";
import { ExportError } from "../commercial-export/types";
import { loadReciboContext } from "./data";
import { buildReciboPdf } from "./pdf";
import { reciboNumero, type ReciboScope, type ReciboSnapshot } from "./types";

export async function reciboPdfResponse(request: Request, scope: ReciboScope) {
  const headers = { "Cache-Control": "private, no-store, max-age=0", "Vary": "Cookie", "X-Content-Type-Options": "nosniff" };
  try {
    const context = await loadReciboContext(await createClient(), scope);
    const params = new URL(request.url).searchParams;
    const id = params.get("comprobante");
    const receipt = id ? context.documents.find(r => r.id === id) : context.documents[0];
    if (id && !receipt) throw new ExportError(404, "Comprobante no disponible.");
    if (params.has("descargar") && !receipt) throw new ExportError(409, "Emití el recibo antes de descargar.");
    const snapshot = receipt ? receipt.snapshot as unknown as ReciboSnapshot : context.snapshot;
    const bytes = await buildReciboPdf(snapshot, receipt, context.documents.find(r => r.id === receipt?.anterior_id));
    return new Response(new Uint8Array(bytes), { headers: { ...headers, "Content-Type": "application/pdf",
      "Content-Disposition": `${params.has("descargar") ? "attachment" : "inline"}; filename="${receipt ? reciboNumero(receipt) : "vista-previa"}.pdf"` } });
  } catch (error) {
    return Response.json({ error: error instanceof ExportError ? error.message : "No se pudo generar el recibo." },
      { status: error instanceof ExportError ? error.status : 500, headers });
  }
}
