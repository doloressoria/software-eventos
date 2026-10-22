import { commercialExportResponse } from "@/lib/commercial-export/response";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  return commercialExportResponse("evento", (await params).id);
}
