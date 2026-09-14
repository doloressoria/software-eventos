import { notFound, redirect } from "next/navigation";
import { canAccessSalon, getCurrentProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { logSupabaseError } from "@/lib/supabase/errors";
import type { Tables } from "@/types/database.types";

export type EventoSalon = Pick<
  Tables<"salones">,
  "id" | "nombre" | "direccion" | "capacidad"
>;
export type EventoVendedor = Pick<
  Tables<"usuarios">,
  "id" | "full_name" | "email"
>;
export type EventoSalonAssignment = Pick<
  Tables<"usuario_salon">,
  "usuario_id" | "salon_id"
>;
export type EventoDetalle = Tables<"eventos"> & {
  salones: Pick<Tables<"salones">, "nombre"> | null;
  usuarios: Pick<Tables<"usuarios">, "full_name" | "email"> | null;
};
export type EventoListado = Pick<
  Tables<"eventos">,
  | "estado"
  | "fecha_carga"
  | "fecha_contrato"
  | "fecha_evento"
  | "id"
  | "cliente_nombre"
  | "nombre_evento"
  | "salon_id"
  | "subtipo_evento"
  | "tipo_evento"
  | "vendedor_id"
> & {
  salones: Pick<Tables<"salones">, "nombre"> | null;
  usuarios: Pick<Tables<"usuarios">, "full_name" | "email"> | null;
};

export async function listEventos() {
  const profile = await getActiveProfile();
  const supabase = await createClient();
  const query = supabase
    .from("eventos")
    .select(
      "id, cliente_nombre, estado, fecha_carga, fecha_contrato, fecha_evento, nombre_evento, subtipo_evento, tipo_evento, salon_id, vendedor_id, salones(nombre), usuarios(full_name, email)",
    )
    .is("deleted_at", null)
    .order("fecha_evento", { ascending: true });

  if (profile.rol === "vendedor") {
    const salones = await getAssignedActiveSalones(profile.id);
    const salonIds = salones.map((salon) => salon.id);

    if (salonIds.length === 0) {
      return {
        eventos: [],
        profile,
      };
    }

    query.in("salon_id", salonIds);
  }

  const { data, error } = await query;

  if (error) {
    logSupabaseError("listEventos eventos", error);
    throw new Error("No se pudo obtener el listado de eventos.");
  }

  return {
    eventos: data as EventoListado[],
    profile,
  };
}

export type EventoCalendario = Pick<
  Tables<"eventos">,
  | "id"
  | "fecha_evento"
  | "cliente_nombre"
  | "estado"
  | "tipo_evento"
  | "salon_id"
  | "pax_adultos"
  | "pax_jovenes"
  | "pax_menores"
  | "pax_bebes"
> & {
  salones: Pick<Tables<"salones">, "id" | "nombre"> | null;
};

export type CalendarioSalonOption = Pick<Tables<"salones">, "id" | "nombre">;

export async function getNuevoEventoPageData() {
  const profile = await getActiveProfile();
  const supabase = await createClient();

  if (profile.rol === "admin") {
    const [salonesResult, vendedoresResult] = await Promise.all([
      supabase
        .from("salones")
        .select("id, nombre, direccion, capacidad")
        .eq("activo", true)
        .is("deleted_at", null)
        .order("nombre", { ascending: true }),
      supabase
        .from("usuarios")
        .select("id, full_name, email")
        .eq("rol", "vendedor")
        .eq("activo", true)
        .order("full_name", { ascending: true }),
    ]);

    if (salonesResult.error) {
      logSupabaseError("getNuevoEventoPageData admin salones", salonesResult.error);
      throw new Error("No se pudo obtener el listado de salones.");
    }

    if (vendedoresResult.error) {
      logSupabaseError(
        "getNuevoEventoPageData admin vendedores",
        vendedoresResult.error,
      );
      throw new Error("No se pudo obtener el listado de vendedores.");
    }

    return {
      profile,
      salones: salonesResult.data,
      vendedores: vendedoresResult.data,
      assignments: [],
    };
  }

  const salones = await getAssignedActiveSalones(profile.id);

  return {
    profile,
    salones,
    vendedores: [
      {
        id: profile.id,
        full_name: profile.full_name,
        email: profile.email,
      },
    ],
    assignments: [],
  };
}

export async function getEventoById(id: string) {
  const profile = await getActiveProfile();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("eventos")
    .select("*, salones(nombre), usuarios(full_name, email)")
    .eq("id", id)
    .is("deleted_at", null)
    .maybeSingle();

  if (error) {
    logSupabaseError("getEventoById evento", error);
    throw new Error("No se pudo obtener el evento.");
  }

  if (!data || !(await canAccessSalon(profile, data.salon_id))) {
    notFound();
  }

  return {
    profile,
    evento: data as EventoDetalle,
  };
}

export async function getDashboardCalendarData(monthParam?: string) {
  const profile = await getActiveProfile();
  const supabase = await createClient();
  const { year, monthIndex } = resolveMonth(monthParam);
  const rangeStart = toISODate(year, monthIndex, 1);
  const rangeEnd = toISODate(year, monthIndex + 1, 1);
  const salones =
    profile.rol === "admin"
      ? await listActiveSalones()
      : await getAssignedActiveSalones(profile.id);

  if (profile.rol === "vendedor" && salones.length === 0) {
    return {
      profile,
      year,
      monthIndex,
      eventos: [] as EventoCalendario[],
      salones: [] as CalendarioSalonOption[],
    };
  }

  const eventosQuery = supabase
    .from("eventos")
    .select(
      "id, fecha_evento, cliente_nombre, estado, tipo_evento, salon_id, pax_adultos, pax_jovenes, pax_menores, pax_bebes, salones(id, nombre)",
    )
    .gte("fecha_evento", rangeStart)
    .lt("fecha_evento", rangeEnd)
    .is("deleted_at", null)
    .order("fecha_evento", { ascending: true });

  if (profile.rol === "vendedor") {
    eventosQuery.in(
      "salon_id",
      salones.map((salon) => salon.id),
    );
  }

  const eventosResult = await eventosQuery;

  if (eventosResult.error) {
    logSupabaseError("getDashboardCalendarData eventos", eventosResult.error);
    throw new Error("No se pudieron obtener los eventos del mes.");
  }

  return {
    profile,
    year,
    monthIndex,
    eventos: eventosResult.data as EventoCalendario[],
    salones: salones as CalendarioSalonOption[],
  };
}

async function listActiveSalones() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("salones")
    .select("id, nombre")
    .eq("activo", true)
    .is("deleted_at", null)
    .order("nombre", { ascending: true });

  if (error) {
    logSupabaseError("listActiveSalones", error);
    throw new Error("No se pudo obtener el listado de salones.");
  }

  return data;
}

function resolveMonth(monthParam?: string) {
  const now = new Date();
  let year = now.getUTCFullYear();
  let monthIndex = now.getUTCMonth();

  if (monthParam && /^\d{4}-\d{2}$/.test(monthParam)) {
    const [y, m] = monthParam.split("-").map(Number);
    if (m >= 1 && m <= 12) {
      year = y;
      monthIndex = m - 1;
    }
  }

  return { year, monthIndex };
}

function toISODate(year: number, monthIndex: number, day: number) {
  return new Date(Date.UTC(year, monthIndex, day)).toISOString().slice(0, 10);
}

export async function getEditarEventoPageData(id: string) {
  const { evento, profile } = await getEventoById(id);
  const supabase = await createClient();

  if (profile.rol === "admin") {
    const [salonesResult, vendedoresResult] = await Promise.all([
      supabase
        .from("salones")
        .select("id, nombre, direccion, capacidad")
        .eq("activo", true)
        .is("deleted_at", null)
        .order("nombre", { ascending: true }),
      supabase
        .from("usuarios")
        .select("id, full_name, email")
        .eq("rol", "vendedor")
        .eq("activo", true)
        .order("full_name", { ascending: true }),
    ]);

    if (salonesResult.error) {
      logSupabaseError(
        "getEditarEventoPageData admin salones",
        salonesResult.error,
      );
      throw new Error("No se pudo obtener el listado de salones.");
    }

    if (vendedoresResult.error) {
      logSupabaseError(
        "getEditarEventoPageData admin vendedores",
        vendedoresResult.error,
      );
      throw new Error("No se pudo obtener el listado de vendedores.");
    }

    return {
      assignments: [],
      evento,
      profile,
      salones: salonesResult.data,
      vendedores: vendedoresResult.data,
    };
  }

  const salones = await getAssignedActiveSalones(profile.id);

  return {
    assignments: [],
    evento,
    profile,
    salones,
    vendedores: [
      {
        id: profile.id,
        full_name: profile.full_name,
        email: profile.email,
      },
    ],
  };
}

export async function getAssignedActiveSalones(usuarioId: string) {
  const supabase = await createClient();
  const { data: assignments, error: assignmentsError } = await supabase
    .from("usuario_salon")
    .select("salon_id")
    .eq("usuario_id", usuarioId);

  if (assignmentsError) {
    logSupabaseError("getAssignedActiveSalones assignments", assignmentsError);
    throw new Error("No se pudieron obtener los salones asignados.");
  }

  const salonIds = assignments.map((assignment) => assignment.salon_id);

  if (salonIds.length === 0) {
    return [];
  }

  const { data, error } = await supabase
    .from("salones")
    .select("id, nombre, direccion, capacidad")
    .in("id", salonIds)
    .eq("activo", true)
    .is("deleted_at", null)
    .order("nombre", { ascending: true });

  if (error) {
    logSupabaseError("getAssignedActiveSalones salones", error);
    throw new Error("No se pudo obtener el listado de salones asignados.");
  }

  return data;
}

async function getActiveProfile() {
  const profile = await getCurrentProfile();

  if (!profile?.activo) {
    redirect("/dashboard");
  }

  return profile;
}
