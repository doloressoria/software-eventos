import { Badge } from "@/components/ui/badge";
import { TableCell } from "@/components/ui/table";
import { isChequePending } from "@/lib/pagos/calculos";

const registro = new Intl.DateTimeFormat("es-AR", {
  dateStyle: "short", timeZone: "America/Argentina/Buenos_Aires",
});
const pagoDate = new Intl.DateTimeFormat("es-AR", {
  dateStyle: "short", timeZone: "UTC",
});

export function PagoFechas({ pago }: {
  pago: { created_at: string; fecha_pago: string; forma_pago: string };
}) {
  const pendiente = isChequePending(pago);
  return <>
    <TableCell>{registro.format(new Date(pago.created_at))}</TableCell>
    <TableCell>
      <div className="flex flex-wrap items-center gap-2">
        {pagoDate.format(new Date(`${pago.fecha_pago}T00:00:00Z`))}
        {pago.forma_pago === "cheque" && (
          <Badge variant={pendiente ? "warning" : "success"}>{pendiente ? "Pendiente" : "Acreditado"}</Badge>
        )}
      </div>
    </TableCell>
  </>;
}
