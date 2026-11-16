import { reciboPdfResponse } from "@/lib/recibos/response";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: Request, { params }: { params: Promise<{ id: string; pagoId: string }> }) {
  return reciboPdfResponse(request, { kind: "catering", ...await params });
}
