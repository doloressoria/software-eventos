import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../../types/database.types";
import { ExportError, type CommercialExportData, type ExportCatering, type ExportEvent, type ExportPayment, type ExportService } from "./types";

type Client = SupabaseClient<Database>;
type Screen = "eventos" | "catering";
const paymentColumns = "id, evento_id, evento_servicio_id, catering_contrato_id, concepto, fecha_pago, forma_pago, moneda, banco, numero_cheque, importe_moneda_original, tipo_cambio, importe_en_pesos, es_garantia, deleted_at, notas";
const cateringColumns = "*, usuarios!catering_contratos_ejecutiva_id_fkey(full_name,email), salones(nombre)";

// Rebuild each page query: PostgREST's response limit must never truncate an export.
export async function allRows<T>(page: (start: number, end: number) => PromiseLike<{
  data: T[] | null; error: unknown;
}>, size = 500): Promise<T[]> {
  const rows: T[] = [];
  for (let start = 0; ;) {
    const result = await page(start, start + size - 1);
    if (result.error || !result.data) throw new ExportError(500, "No se pudieron leer todos los datos para la exportación. Intentá nuevamente.");
    rows.push(...result.data);
    if (result.data.length === 0) return rows;
    start += result.data.length;
  }
}

export async function loadCommercialExport(client: Client, kind: "evento" | "catering", id: string): Promise<CommercialExportData> {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
    throw new ExportError(400, "El identificador no es válido.");
  }
  const { data: { user }, error: authError } = await client.auth.getUser();
  if (authError || !user) throw new ExportError(401, "La sesión venció. Volvé a iniciar sesión para descargar el archivo.");
  const { data: profile, error: profileError } = await client.from("usuarios").select("id,rol,activo").eq("id", user.id).maybeSingle();
  if (profileError) throw new ExportError(500, "No se pudieron comprobar tus permisos.");
  if (!profile?.activo) throw new ExportError(403, "Tu usuario no está habilitado para exportar.");
  const permissions = profile.rol === "admin" ? null : await client.rpc("current_user_permissions");
  if (permissions?.error) throw new ExportError(500, "No se pudieron comprobar tus permisos.");
  const allowed = (screen: Screen) => profile.rol === "admin" || Boolean(permissions?.data?.some((p) => p.screen === screen));
  if (!allowed(kind === "evento" ? "eventos" : "catering")) {
    throw new ExportError(403, "No tenés permiso para exportar este detalle.");
  }

  async function eventById(eventId: string, required: boolean) {
    const { data, error } = await client.from("eventos").select("*,salones(nombre),usuarios(full_name,email)").eq("id", eventId).is("deleted_at", null).maybeSingle();
    if (error) throw new ExportError(500, "No se pudo leer el detalle del evento.");
    if (!data && required) throw new ExportError(404, "El registro no está disponible o no tenés acceso.");
    return data as ExportEvent | null;
  }
  const contacts = (eventId: string) => allRows((start, end) => client.from("evento_contactos")
    .select("nombre,telefono,correo,relacion,observaciones,es_principal")
    .eq("evento_id", eventId).is("deleted_at", null).order("id").range(start, end));
  const cateringPayments = (contract: ExportCatering) => allRows((start, end) => client.from("pagos").select(paymentColumns)
    .eq("catering_contrato_id", contract.id).is("deleted_at", null).order("fecha_pago").order("id").range(start, end))
    .then((rows) => rows.filter((p) => p.evento_id === contract.evento_id && p.evento_servicio_id === null) as ExportPayment[]);

  if (kind === "evento") {
    const event = (await eventById(id, true))!;
    const services = await allRows((start, end) => client.from("evento_servicios").select("*,servicios_catalogo(nombre,categoria)").eq("evento_id", id).order("created_at").order("id").range(start, end)) as ExportService[];
    const serviceIds = new Set(services.map((s) => s.id));
    const [payments, currentContacts] = await Promise.all([
      allRows((start, end) => client.from("pagos").select(paymentColumns).eq("evento_id", id)
        .not("evento_servicio_id", "is", null).is("catering_contrato_id", null).is("deleted_at", null)
        .order("fecha_pago").order("id").range(start, end)),
      contacts(id),
    ]);
    const updates = [];
    for (let offset = 0; offset < services.length; offset += 100) {
      const ids = services.slice(offset, offset + 100).map((service) => service.id);
      updates.push(...await allRows((start, end) => client.from("actualizaciones_ipc").select("*")
        .in("evento_servicio_id", ids).order("fecha_ajuste").order("id").range(start, end)));
    }
    const caterings = [];
    // RLS also grants some catering reads through events; require its own screen permission here.
    if (allowed("catering")) {
      const contracts = await allRows((start, end) => client.from("catering_contratos").select(cateringColumns)
        .eq("evento_id", id).is("deleted_at", null).order("created_at").order("id").range(start, end)) as ExportCatering[];
      for (const catering of contracts) caterings.push({ catering, payments: await cateringPayments(catering) });
    }
    return { kind, event, services, updates, contacts: currentContacts,
      payments: payments.filter((p) => p.evento_servicio_id && serviceIds.has(p.evento_servicio_id)) as ExportPayment[],
      caterings, cateringAllowed: allowed("catering") };
  }

  const { data: row, error } = await client.from("catering_contratos").select(cateringColumns).eq("id", id).is("deleted_at", null).maybeSingle();
  if (error) throw new ExportError(500, "No se pudo leer el detalle del catering.");
  if (!row) throw new ExportError(404, "El registro no está disponible o no tenés acceso.");
  const catering = row as ExportCatering;
  // No embedded event join or summary view: either could reveal independently restricted data.
  const event = catering.evento_id && allowed("eventos") ? await eventById(catering.evento_id, false) : null;
  const [items, history, payments, currentContacts] = await Promise.all([
    allRows((start, end) => client.from("catering_items").select("*").eq("catering_contrato_id", id).order("created_at").order("id").range(start, end)),
    allRows((start, end) => client.from("catering_precio_historial").select("*").eq("catering_contrato_id", id).order("fecha", { ascending: false }).order("created_at", { ascending: false }).range(start, end)),
    cateringPayments(catering),
    event ? contacts(event.id) : Promise.resolve([]),
  ]);
  return { kind, catering, event, eventAllowed: !catering.evento_id || Boolean(event), items, history, payments, contacts: currentContacts };
}
