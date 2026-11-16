import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { loadReciboContext } from "@/lib/recibos/data";
import { emitirReciboAction } from "@/lib/recibos/actions";
import { reciboNumero, reciboPath, type ReciboScope } from "@/lib/recibos/types";
import { ExportError } from "@/lib/commercial-export/types";
import { EmitirReciboForm } from "./emitir-recibo-form";
import { PageHeader } from "@/components/ui/page-header";
import { buttonVariants } from "@/components/ui/button";

export async function ReciboPage({ scope }: { scope: ReciboScope }) {
  let context;
  try { context = await loadReciboContext(await createClient(), scope); }
  catch (error) { return <p role="alert">{error instanceof ExportError ? error.message : "No se pudo cargar el recibo."}</p>; }
  const base = reciboPath(scope);
  const latest = context.documents.at(-1);
  return <section className="space-y-5">
    <PageHeader eyebrow="Ingresos" title="Recibo individual" description="Un comprobante por cobro, con su medio e importes históricos."
      actions={<Link href={`/${scope.kind}/${scope.id}/ingresos`} className={buttonVariants({ variant: "secondary" })}>Volver a Ingresos</Link>} />
    {context.anulado && <p role="status" className="rounded border border-red-300 p-3 font-semibold">Cobro anulado. El original se conserva; consultá el comprobante de anulación vinculado.</p>}
    {latest && latest.revision > 1 && <p role="status">Este cobro tiene modificaciones. El original permanece disponible junto a toda su historia.</p>}
    {!context.documents.length && <EmitirReciboForm action={emitirReciboAction.bind(null, scope)} />}
    {context.documents.map(receipt => <div key={receipt.id} className="flex flex-wrap items-center gap-3 rounded border p-3">
      <span>{reciboNumero(receipt)} · {receipt.tipo} · Revisión {receipt.revision}</span>
      <a className="underline" target="_blank" rel="noreferrer" href={`${base}/pdf?comprobante=${receipt.id}`}>Ver PDF</a>
      <a className={buttonVariants({ variant: "secondary", size: "sm" })} href={`${base}/pdf?comprobante=${receipt.id}&descargar=1`}>Descargar PDF</a>
    </div>)}
    <iframe title="Vista previa del recibo PDF" src={`${base}/pdf${latest ? `?comprobante=${latest.id}` : ""}`} className="h-[75vh] w-full rounded border" />
    <p className="text-sm text-slate-600">El estado de acreditación del PDF corresponde al momento de emisión. Ingresos muestra el estado actual. Los ajustes no son dinero recibido. La descarga puede adjuntarse manualmente por mail.</p>
  </section>;
}
