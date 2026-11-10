import { nombreCategoria, type CoberturaPax, type TarifaPax } from "@/lib/catering/coberturas";
import { categoriasPax } from "@/lib/eventos/asistentes";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

const currency = new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS" });

export function CoberturaResumen({ tarifas, label }: { tarifas: TarifaPax[]; label?: string }) {
  return <div className="space-y-2">
    <h3 className="font-medium">{label ? `Cobertura por personas · ${label}` : "Cobertura por personas"}</h3>
    <Table>
      <TableHeader>
        <TableRow>
          {["Categoría", "Contratados", "Cubiertos", "Por acreditar", "Pendientes", "Excedente", "Saldo de PAX"].map((heading) =>
            <TableHead key={heading}>{heading}</TableHead>)}
        </TableRow>
      </TableHeader>
      <TableBody>
        {categoriasPax.map(([categoria, nombre]) => {
          const tarifa = tarifas.find((row) => row.categoria === categoria);
          if (!tarifa) return null;
          return <TableRow key={categoria}>
            <TableCell>{nombre}</TableCell>
            <TableCell>{tarifa.pax ?? 0}</TableCell>
            <TableCell>{tarifa.cubiertos ?? 0}</TableCell>
            <TableCell>{tarifa.por_acreditar ?? 0}</TableCell>
            <TableCell>{tarifa.pendientes ?? 0}</TableCell>
            <TableCell>
              {tarifa.excedente ?? 0}
              {Boolean(tarifa.excedente) && (tarifa.tarifas_historicas ?? 0) > 1 && (
                <p className="text-xs text-amber-800">Pendiente definir qué tarifa histórica liberar primero.</p>
              )}
            </TableCell>
            <TableCell>{currency.format(tarifa.saldo_categoria ?? 0)}</TableCell>
          </TableRow>;
        })}
      </TableBody>
    </Table>
    <p className="text-xs text-slate-600">Los PAX por acreditar siguen pendientes hasta que se acredite el cheque. El saldo del catering también contempla cargos fijos, comisión y cobros por importe.</p>
  </div>;
}

export function CoberturaDetalle({ cobertura }: { cobertura: CoberturaPax }) {
  return <>
    {nombreCategoria(cobertura.categoria)} · {cobertura.cantidad} × {currency.format(cobertura.precio_aplicado)}
    {" = "}{currency.format(cobertura.importe_historico ?? 0)}
    {cobertura.liberada > 0 && ` · ${cobertura.liberada} reasignados`}
  </>;
}
