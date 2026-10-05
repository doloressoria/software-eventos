import { notFound } from "next/navigation";
import { getCurrentProfile } from "@/lib/auth";
import { isCateringAdicionalCategoria } from "@/lib/catering/types";
import { createClient } from "@/lib/supabase/server";
import { logSupabaseError } from "@/lib/supabase/errors";
import type { Tables } from "@/types/database.types";

type EventoResumen = Pick<
  Tables<"eventos">,
  | "cliente_nombre"
  | "cliente_razon_social"
  | "cliente_cuit_dni"
  | "cliente_contacto"
  | "fecha_evento"
  | "tipo_evento"
> & {
  salones: Pick<Tables<"salones">, "nombre"> | null;
};

export type CateringRow = Tables<"catering_contratos">;

export type CateringListItem = Pick<
  CateringRow,
  | "id"
  | "evento_id"
  | "cliente_nombre"
  | "cliente_razon_social"
  | "cliente_cuit_dni"
  | "cliente_contacto"
  | "fecha_evento"
  | "tipo_evento"
  | "salon_id"
  | "lugar_evento"
  | "tipo_servicio"
  | "total_con_iva"
  | "saldo_pendiente"
> & {
  eventos: EventoResumen | null;
  salones: Pick<Tables<"salones">, "nombre"> | null;
};

export type CateringDisplayFields = {
  clienteNombre: string;
  clienteRazonSocial: string | null;
  clienteCuitDni: string | null;
  clienteContacto: string | null;
  fechaEvento: string | null;
  salonNombre: string | null;
  lugarEvento: string | null;
  tipoEvento: string | null;
};

export function getCateringDisplayFields(
  catering: Pick<
    CateringRow,
    | "cliente_nombre"
    | "cliente_razon_social"
    | "cliente_cuit_dni"
    | "cliente_contacto"
    | "fecha_evento"
    | "tipo_evento"
    | "evento_id"
    | "lugar_evento"
  > & {
    eventos?: EventoResumen | null;
    salones?: Pick<Tables<"salones">, "nombre"> | null;
  },
): CateringDisplayFields {
  if (catering.evento_id && catering.eventos) {
    return {
      clienteNombre: catering.eventos.cliente_nombre,
      clienteRazonSocial: catering.eventos.cliente_razon_social,
      clienteCuitDni: catering.eventos.cliente_cuit_dni,
      clienteContacto: catering.eventos.cliente_contacto,
      fechaEvento: catering.eventos.fecha_evento,
      salonNombre: catering.eventos.salones?.nombre ?? null,
      lugarEvento: null,
      tipoEvento: catering.eventos.tipo_evento,
    };
  }

  return {
    clienteNombre: catering.cliente_nombre ?? "Cliente sin nombre",
    clienteRazonSocial: catering.cliente_razon_social,
    clienteCuitDni: catering.cliente_cuit_dni,
    clienteContacto: catering.cliente_contacto,
    fechaEvento: catering.fecha_evento,
    salonNombre: "Kiria",
    lugarEvento: catering.lugar_evento,
    tipoEvento: catering.tipo_evento,
  };
}

export async function listCaterings() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("catering_contratos")
    .select(
      "id, evento_id, cliente_nombre, cliente_razon_social, cliente_cuit_dni, cliente_contacto, fecha_evento, tipo_evento, salon_id, lugar_evento, tipo_servicio, total_con_iva, saldo_pendiente, eventos(cliente_nombre, cliente_razon_social, cliente_cuit_dni, cliente_contacto, fecha_evento, tipo_evento, salones(nombre)), salones(nombre)",
    )
    .is("deleted_at", null)
    .order("created_at", { ascending: false });

  if (error) {
    logSupabaseError("listCaterings", error);
    throw new Error("No se pudo obtener el listado de caterings.");
  }

  return data as unknown as CateringListItem[];
}

export async function getNuevoCateringPageData() {
  const supabase = await createClient();
  const [ejecutivasResult, lugaresResult] = await Promise.all([
    supabase
      .from("usuarios")
      .select("id, full_name, email")
      .eq("rol", "ejecutiva_catering")
      .eq("activo", true)
      .order("full_name", { ascending: true }),
    supabase
      .from("catering_contratos")
      .select("lugar_evento")
      .is("evento_id", null)
      .is("deleted_at", null)
      .not("lugar_evento", "is", null),
  ]);

  if (ejecutivasResult.error) {
    logSupabaseError("getNuevoCateringPageData ejecutivas", ejecutivasResult.error);
    throw new Error("No se pudo obtener el listado de ejecutivas de catering.");
  }

  if (lugaresResult.error) {
    logSupabaseError("getNuevoCateringPageData lugares", lugaresResult.error);
    throw new Error("No se pudo obtener el listado de lugares.");
  }

  const lugares = Array.from(new Map(lugaresResult.data
    .filter((row) => row.lugar_evento?.trim())
    .map((row) => [row.lugar_evento!.trim().toLocaleLowerCase("es-AR"), row.lugar_evento!.trim()])).values())
    .sort((a, b) => a.localeCompare(b, "es"));
  return { ejecutivas: ejecutivasResult.data, lugares };
}

export type EventoBuscadorResult = {
  id: string;
  cliente_nombre: string | null;
  fecha_evento: string | null;
  salon_id: string;
  salon_nombre: string;
  tipo_evento: string | null;
  pax_adultos: number | null;
  pax_jovenes: number | null;
  pax_menores: number | null;
  pax_bebes: number | null;
};

export async function searchEventosParaCatering(query: string) {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("catering_buscar_eventos_detalle", {
    p_query: query,
  });

  if (error) {
    logSupabaseError("searchEventosParaCatering", error);
    return [];
  }

  return data as EventoBuscadorResult[];
}

export async function getEventoBuscadorResultById(eventoId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("catering_buscar_eventos_detalle", {
    p_query: "",
    p_evento_id: eventoId,
  });

  if (error) {
    logSupabaseError("getEventoBuscadorResultById", error);
    return null;
  }

  const [result] = data as EventoBuscadorResult[];

  return result ?? null;
}

export type CateringPrecioHistorialItem = Pick<
  Tables<"catering_precio_historial">,
  | "id"
  | "fecha"
  | "motivo"
  | "precio_unitario"
  | "pax_adultos"
  | "pax_jovenes"
  | "pax_menores"
  | "pax_bebes"
  | "created_at"
> & {
  usuarios: Pick<Tables<"usuarios">, "full_name" | "email"> | null;
};

export type CateringItemRow = Pick<
  Tables<"catering_items">,
  "id" | "categoria" | "descripcion" | "precio_unitario"
>;

export type CateringDetalle = CateringRow & {
  eventos: EventoResumen | null;
  salones: Pick<Tables<"salones">, "nombre"> | null;
  usuarios: Pick<Tables<"usuarios">, "full_name" | "email"> | null;
};

export type EventoCateringItem = Pick<
  CateringRow,
  | "id"
  | "tipo_servicio"
  | "pax_adultos"
  | "pax_jovenes"
  | "pax_menores"
  | "pax_bebes"
  | "total_con_iva"
  | "total_pagado"
  | "saldo_pendiente"
>;

export async function getEventoCaterings(eventoId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("catering_contratos")
    .select(
      "id, tipo_servicio, pax_adultos, pax_jovenes, pax_menores, pax_bebes, total_con_iva, total_pagado, saldo_pendiente",
    )
    .eq("evento_id", eventoId)
    .is("deleted_at", null)
    .order("created_at", { ascending: true });

  if (error) {
    logSupabaseError("getEventoCaterings", error);
    throw new Error("No se pudo obtener el catering del evento.");
  }

  return data as EventoCateringItem[];
}

export async function getCateringById(id: string) {
  const profile = await getCurrentProfile();

  if (!profile?.activo) {
    notFound();
  }

  const supabase = await createClient();
  const [cateringResult, itemsResult, precioHistorialResult] = await Promise.all([
    supabase
      .from("catering_contratos")
      .select(
        "*, eventos(cliente_nombre, cliente_razon_social, cliente_cuit_dni, cliente_contacto, fecha_evento, tipo_evento, salones(nombre)), salones(nombre), usuarios!catering_contratos_ejecutiva_id_fkey(full_name, email)",
      )
      .eq("id", id)
      .is("deleted_at", null)
      .maybeSingle(),
    supabase
      .from("catering_items")
      .select("id, categoria, descripcion, precio_unitario")
      .eq("catering_contrato_id", id)
      .order("created_at", { ascending: true }),
    supabase
      .from("catering_precio_historial")
      .select(
        "id, fecha, motivo, precio_unitario, pax_adultos, pax_jovenes, pax_menores, pax_bebes, created_at, usuarios(full_name, email)",
      )
      .eq("catering_contrato_id", id)
      .order("fecha", { ascending: false })
      .order("created_at", { ascending: false }),
  ]);

  if (cateringResult.error) {
    logSupabaseError("getCateringById catering", cateringResult.error);
    throw new Error("No se pudo obtener el catering.");
  }

  if (!cateringResult.data) {
    notFound();
  }

  if (itemsResult.error) {
    logSupabaseError("getCateringById adicionales", itemsResult.error);
    throw new Error("No se pudieron obtener los adicionales del catering.");
  }

  if (precioHistorialResult.error) {
    logSupabaseError("getCateringById historial", precioHistorialResult.error);
    throw new Error("No se pudo obtener el historial de precios.");
  }

  const catering = cateringResult.data as unknown as CateringDetalle;
  const items = (itemsResult.data as CateringItemRow[]).filter((item) =>
    isCateringAdicionalCategoria(item.categoria),
  );
  const precioHistorial = precioHistorialResult
    .data as unknown as CateringPrecioHistorialItem[];

  return {
    catering,
    items,
    precioHistorial,
    precioVigente: precioHistorial[0]?.precio_unitario ?? null,
    profile,
  };
}
