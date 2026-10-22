import "server-only";

import { createClient } from "@/lib/supabase/server";
import { loadCommercialExport } from "./data";
import { ExportError } from "./types";
import { buildCommercialWorkbook, exportFilename } from "./workbook";

export async function commercialExportResponse(kind: "evento" | "catering", id: string) {
  const headers = { "Cache-Control": "private, no-store, max-age=0", "Vary": "Cookie", "X-Content-Type-Options": "nosniff" };
  try {
    const data = await loadCommercialExport(await createClient(), kind, id);
    const workbook = await buildCommercialWorkbook(data);
    const buffer = await workbook.xlsx.writeBuffer();
    return new Response(new Uint8Array(buffer), { headers: { ...headers,
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${exportFilename(kind, id)}"`,
    } });
  } catch (error) {
    // Never log customer data, workbook contents, or raw database errors.
    return Response.json({ error: error instanceof ExportError ? error.message : "No se pudo generar el Excel. Recargá el detalle e intentá nuevamente." },
      { status: error instanceof ExportError ? error.status : 500, headers });
  }
}
