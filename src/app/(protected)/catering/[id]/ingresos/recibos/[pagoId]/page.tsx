import { ReciboPage } from "@/components/recibos/recibo-page";
export const dynamic = "force-dynamic";
export default async function Page({ params }: { params: Promise<{ id: string; pagoId: string }> }) {
  return <ReciboPage scope={{ kind: "catering", ...await params }} />;
}
