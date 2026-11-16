import { nombreCategoria, type CoberturaPax, type TarifaPax, type FiscalCatering, type ComponenteCatering } from "@/lib/catering/coberturas";
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


export function CateringFiscalResumen({ fiscal }: { fiscal: FiscalCatering }) {
  const legacy = fiscal.version_calculo !== 2;
  const values = [
    ["Neto vigente de PAX y adicionales", fiscal.neto_vigente],
    ["Neto exigible con capital histórico", legacy ? null : fiscal.neto_exigible],
    ["Base imponible a precios vigentes", fiscal.base_imponible],
    ["IVA a precios vigentes", fiscal.iva_calculado],
    ["IVA exigible con capital histórico", legacy ? null : fiscal.iva_exigible],
    ["IVA cobrado real", legacy ? null : fiscal.iva_cobrado],
    ["IVA cancelado incluyendo ajuste", legacy ? null : fiscal.iva_cancelado],
    ["IVA reservado por cheques", legacy ? null : fiscal.iva_reservado],
    ["IVA pendiente / a favor (−)", legacy ? null : fiscal.iva_pendiente],
    ["Ajuste de redondeo acreditado (no es ingreso)", fiscal.ajuste_redondeo],
  ] as const;
  return <div className="space-y-3">
    <p className="text-sm">Facturado: {fiscal.porcentaje_facturado ?? 100}% del neto · Alícuota IVA: {(fiscal.iva_porcentaje ?? 0) * 100}%</p>
    {legacy && <p className="text-sm text-amber-800">Modelo histórico: los PAX incluyen IVA. El desglose de cobros anteriores requiere conciliación; no se presume IVA cobrado.</p>}
    <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {values.filter(([,value]) => value !== null).map(([label,value]) => <div key={label}>
        <dt className="text-xs text-slate-600">{label}</dt><dd className="font-medium">{currency.format(value ?? 0)}</dd>
      </div>)}
    </dl>
    <p className="text-xs text-slate-600">El neto incluye adicionales por persona y cargos fijos. Comisión, su IVA e IPC se liquidan aparte. El saldo conserva los precios históricos de PAX cubiertos y puede quedar a favor.</p>
  </div>;
}

export function CobroDesglose({ componente }: { componente: ComponenteCatering }) {
  const d = componente;
  return <div className="mt-1 text-xs">
    {d.version_calculo === 2
      ? <>Capital objetivo: {currency.format(d.capital_ars ?? 0)} · IVA objetivo: {currency.format(d.iva_ars ?? 0)}
        {d.ajuste_ars !== 0 && <> · Ajuste capital: {currency.format(d.ajuste_ars - d.ajuste_iva_ars)} · Ajuste IVA: {currency.format(d.ajuste_iva_ars)}</>}</>
      : <>PAX históricos con IVA incluido: {currency.format(d.objetivo_ars)} · Capital/IVA sin conciliar · Ajuste: {currency.format(d.ajuste_ars)}</>}
    {d.capital_reasignado_ars > 0 && <> · Capital real reasignado: {currency.format(d.capital_reasignado_ars)}</>}
    {d.ajuste_ars !== 0 && <p>Objetivo = dinero real + ajuste. El ajuste no es un ingreso.</p>}
  </div>;
}
