import { getEventoById, type EventoDetalle } from "@/lib/eventos/queries";
import {
  calculateMoneyFlow,
  getActiveOrdinaryPayments,
} from "@/lib/pagos/calculos";
import { createClient } from "@/lib/supabase/server";
import { logSupabaseError } from "@/lib/supabase/errors";
import type { Enums, Tables } from "@/types/database.types";

type Moneda = Enums<"moneda">;

export type FlujoPago = Pick<
  Tables<"pagos">,
  | "catering_contrato_id"
  | "concepto"
  | "created_at"
  | "es_garantia"
  | "evento_servicio_id"
  | "fecha_pago"
  | "tipo_cambio"
  | "forma_pago"
  | "id"
  | "importe_en_pesos"
  | "importe_moneda_original"
  | "moneda"
  | "notas"
>;

export type FlujoEgreso = Pick<
  Tables<"egresos">,
  | "catering_contrato_id"
  | "categoria"
  | "concepto"
  | "created_at"
  | "evento_servicio_id"
  | "fecha_egreso"
  | "forma_pago"
  | "id"
  | "importe_en_pesos"
  | "importe_moneda_original"
  | "moneda"
  | "notas"
  | "proveedor"
>;

export type FlujoEventoServicio = Pick<
  Tables<"evento_servicios">,
  | "id"
  | "proveedor"
  | "saldo_pendiente"
  | "total_con_iva"
  | "total_pagado"
> & {
  servicios_catalogo: Pick<
    Tables<"servicios_catalogo">,
    "categoria" | "nombre"
  > | null;
};

export type FlujoCateringContrato = Pick<
  Tables<"catering_contratos">,
  | "comision_organizador_monto"
  | "id"
  | "saldo_pendiente"
  | "tipo_servicio"
  | "total_con_iva"
  | "total_pagado"
>;

export type FlujoAgrupacion = {
  cantidad: number;
  key: string;
  label: string;
  total: number;
};

export type FlujoMonedaAgrupacion = FlujoAgrupacion & {
  moneda: Moneda;
  totalOriginal: number;
};

export type FlujoServicioResumen = {
  egresado: number;
  id: string;
  nombre: string;
  pagado: number;
  proveedor: string | null;
  saldoPendiente: number;
  total: number;
};

export type FlujoCateringResumen = {
  comisionOrganizador: number;
  egresado: number;
  id: string;
  nombre: string;
  pagado: number;
  saldoPendiente: number;
  total: number;
};

export type EventoFlujoDinero = {
  cateringResumen: FlujoCateringResumen[];
  comisionOrganizador: number;
  egresos: FlujoEgreso[];
  egresosComisiones: number;
  egresosPorCategoria: FlujoAgrupacion[];
  egresosPorProveedor: FlujoAgrupacion[];
  evento: EventoDetalle;
  ingresosPorFormaPago: FlujoAgrupacion[];
  ingresosPorMoneda: FlujoMonedaAgrupacion[];
  margenSimple: number | null;
  pagos: FlujoPago[];
  saldoNeto: number;
  saldoPendienteCobro: number | null;
  serviciosResumen: FlujoServicioResumen[];
  totalEgresos: number;
  totalEvento: number | null;
  totalIngresos: number;
};

type ResumenEventoRow = Pick<
  Tables<"v_resumen_evento">,
  "total_catering" | "total_servicios"
>;

type MoneyRow = {
  importe_en_pesos: number | null;
  importe_moneda_original: number;
  moneda: Moneda;
};

export async function getEventoFlujoDinero(
  eventoId: string,
): Promise<EventoFlujoDinero> {
  const { evento } = await getEventoById(eventoId);
  const supabase = await createClient();

  const [
    pagosResult,
    egresosResult,
    serviciosResult,
    cateringResult,
    resumenResult,
  ] = await Promise.all([
    supabase
      .from("pagos")
      .select(
        "id, catering_contrato_id, concepto, created_at, es_garantia, evento_servicio_id, fecha_pago, forma_pago, tipo_cambio, importe_en_pesos, importe_moneda_original, moneda, notas",
      )
      .eq("evento_id", evento.id)
      .is("deleted_at", null)
      .order("fecha_pago", { ascending: false })
      .order("created_at", { ascending: false }),
    supabase
      .from("egresos")
      .select(
        "id, catering_contrato_id, categoria, concepto, created_at, evento_servicio_id, fecha_egreso, forma_pago, importe_en_pesos, importe_moneda_original, moneda, notas, proveedor",
      )
      .eq("evento_id", evento.id)
      .is("deleted_at", null)
      .order("fecha_egreso", { ascending: false })
      .order("created_at", { ascending: false }),
    supabase
      .from("evento_servicios")
      .select(
        "id, proveedor, total_con_iva, total_pagado, saldo_pendiente, servicios_catalogo(nombre, categoria)",
      )
      .eq("evento_id", evento.id)
      .order("created_at", { ascending: true }),
    supabase
      .from("catering_contratos")
      .select(
        "id, tipo_servicio, total_con_iva, total_pagado, saldo_pendiente, comision_organizador_monto",
      )
      .eq("evento_id", evento.id)
      .is("deleted_at", null)
      .order("created_at", { ascending: true }),
    supabase
      .from("v_resumen_evento")
      .select("total_catering, total_servicios")
      .eq("id", evento.id)
      .maybeSingle(),
  ]);

  if (pagosResult.error) {
    logSupabaseError("getEventoFlujoDinero pagos", pagosResult.error);
    throw new Error("No se pudieron obtener los pagos del evento.");
  }

  if (egresosResult.error) {
    logSupabaseError("getEventoFlujoDinero egresos", egresosResult.error);
    throw new Error("No se pudieron obtener los egresos del evento.");
  }

  if (serviciosResult.error) {
    logSupabaseError("getEventoFlujoDinero servicios", serviciosResult.error);
    throw new Error("No se pudieron obtener los servicios del evento.");
  }

  if (cateringResult.error) {
    logSupabaseError("getEventoFlujoDinero catering", cateringResult.error);
    throw new Error("No se pudieron obtener los contratos de catering.");
  }

  if (resumenResult.error) {
    logSupabaseError("getEventoFlujoDinero resumen", resumenResult.error);
    throw new Error("No se pudo obtener el resumen del evento.");
  }

  const pagos = pagosResult.data as FlujoPago[];
  const pagosOrdinarios = getActiveOrdinaryPayments(pagos);
  const egresos = egresosResult.data as FlujoEgreso[];
  const servicios = serviciosResult.data as FlujoEventoServicio[];
  const cateringContratos = cateringResult.data as FlujoCateringContrato[];
  const resumen = resumenResult.data as ResumenEventoRow | null;
  const totalEvento =
    resumen === null
      ? null
      : roundMoney(
          toMoneyNumber(resumen.total_catering) +
            toMoneyNumber(resumen.total_servicios),
        );
  const { saldoNeto, totalEgresos, totalIngresos } = calculateMoneyFlow({
    expenses: egresos,
    payments: pagos,
  });
  const saldoPendienteCobro =
    totalEvento === null ? null : Math.max(roundMoney(totalEvento - totalIngresos), 0);
  const serviciosResumen = getServiciosResumen(
    servicios,
    pagosOrdinarios,
    egresos,
  );
  const cateringResumen = getCateringResumen(
    cateringContratos,
    pagosOrdinarios,
    egresos,
  );

  return {
    cateringResumen,
    comisionOrganizador: toMoneyNumber(evento.comision_organizador),
    egresos,
    egresosComisiones: sumCommissionExpenses(egresos),
    egresosPorCategoria: groupByValue(egresos, (egreso) => egreso.categoria),
    egresosPorProveedor: groupByValue(
      egresos,
      (egreso) => egreso.proveedor?.trim() || "Sin proveedor",
    ),
    evento,
    ingresosPorFormaPago: groupByValue(
      pagosOrdinarios,
      (pago) => pago.forma_pago,
    ),
    ingresosPorMoneda: groupIngresosPorMoneda(pagosOrdinarios),
    margenSimple:
      totalEvento && totalEvento > 0
        ? roundMoney((saldoNeto / totalEvento) * 100)
        : null,
    pagos,
    saldoNeto,
    saldoPendienteCobro,
    serviciosResumen,
    totalEgresos,
    totalEvento,
    totalIngresos,
  };
}

function getServiciosResumen(
  servicios: FlujoEventoServicio[],
  pagos: FlujoPago[],
  egresos: FlujoEgreso[],
): FlujoServicioResumen[] {
  return servicios.map((servicio) => {
    const pagado = sumMoneyRows(
      pagos.filter((pago) => pago.evento_servicio_id === servicio.id),
    );
    const egresado = sumMoneyRows(
      egresos.filter((egreso) => egreso.evento_servicio_id === servicio.id),
    );
    const total = toMoneyNumber(servicio.total_con_iva);

    return {
      egresado,
      id: servicio.id,
      nombre: servicio.servicios_catalogo?.nombre ?? "Servicio sin nombre",
      pagado,
      proveedor: servicio.proveedor,
      saldoPendiente: roundMoney(total - pagado),
      total,
    };
  });
}

function getCateringResumen(
  contratos: FlujoCateringContrato[],
  pagos: FlujoPago[],
  egresos: FlujoEgreso[],
): FlujoCateringResumen[] {
  return contratos.map((contrato, index) => {
    const pagado = sumMoneyRows(
      pagos.filter((pago) => pago.catering_contrato_id === contrato.id),
    );
    const egresado = sumMoneyRows(
      egresos.filter((egreso) => egreso.catering_contrato_id === contrato.id),
    );
    const total = toMoneyNumber(contrato.total_con_iva);

    return {
      comisionOrganizador: toMoneyNumber(contrato.comision_organizador_monto),
      egresado,
      id: contrato.id,
      nombre:
        contrato.tipo_servicio?.trim() ||
        `Contrato de catering ${index + 1}`,
      pagado,
      saldoPendiente: roundMoney(total - pagado),
      total,
    };
  });
}

function groupByValue<T extends MoneyRow>(
  rows: T[],
  getKey: (row: T) => string,
): FlujoAgrupacion[] {
  const groups = new Map<string, FlujoAgrupacion>();

  for (const row of rows) {
    const key = getKey(row);
    const current = groups.get(key) ?? {
      cantidad: 0,
      key,
      label: key,
      total: 0,
    };

    current.cantidad += 1;
    current.total = roundMoney(current.total + toPesos(row));
    groups.set(key, current);
  }

  return Array.from(groups.values()).sort((a, b) => b.total - a.total);
}

function groupIngresosPorMoneda(pagos: FlujoPago[]): FlujoMonedaAgrupacion[] {
  const groups = new Map<Moneda, FlujoMonedaAgrupacion>();

  for (const pago of pagos) {
    const current = groups.get(pago.moneda) ?? {
      cantidad: 0,
      key: pago.moneda,
      label: pago.moneda,
      moneda: pago.moneda,
      total: 0,
      totalOriginal: 0,
    };

    current.cantidad += 1;
    current.total = roundMoney(current.total + toPesos(pago));
    current.totalOriginal = roundMoney(
      current.totalOriginal + toMoneyNumber(pago.importe_moneda_original),
    );
    groups.set(pago.moneda, current);
  }

  return Array.from(groups.values()).sort((a, b) => b.total - a.total);
}

function sumMoneyRows(rows: MoneyRow[]) {
  return roundMoney(rows.reduce((total, row) => total + toPesos(row), 0));
}

function sumCommissionExpenses(egresos: FlujoEgreso[]) {
  return sumMoneyRows(
    egresos.filter((egreso) => {
      const text = `${egreso.categoria} ${egreso.concepto} ${
        egreso.proveedor ?? ""
      }`.toLowerCase();

      return text.includes("comision");
    }),
  );
}

function toPesos(row: MoneyRow) {
  if (typeof row.importe_en_pesos === "number" && Number.isFinite(row.importe_en_pesos)) {
    return row.importe_en_pesos;
  }

  if (row.moneda === "ARS") {
    return toMoneyNumber(row.importe_moneda_original);
  }

  return 0;
}

function toMoneyNumber(value: number | null | undefined) {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function roundMoney(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}
