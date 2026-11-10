"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth/require-admin";
import { getEmptyIpcFormState, type IpcFormState, validateIpcForm } from "@/lib/ipc/validation";
import { createClient } from "@/lib/supabase/server";
import { logSupabaseError } from "@/lib/supabase/errors";

export async function ipcAction(_previousState: IpcFormState, formData: FormData): Promise<IpcFormState> {
  await requireAdmin();
  const { errors, fields, payload } = validateIpcForm(formData);
  const state = { ...getEmptyIpcFormState(), fields, errors };
  if (!payload) return { ...state, formError: "Revisá los campos marcados." };
  const schedule = formData.get("accion") === "programar";
  if (schedule && formData.get("confirmar") !== "true") {
    return { ...state, formError: "Confirmá la programación automática antes de continuar." };
  }
  const supabase = await createClient();
  const args = {
    p_periodo: payload.periodo,
    p_fecha_vigencia: payload.fechaVigencia,
    p_variacion_porcentual: payload.variacionPorcentual,
  };
  const result = schedule
    ? await supabase.rpc("programar_ipc", args)
    : await supabase.rpc("previsualizar_ipc_programado", args).range(0, 499);
  if (result.error) {
    logSupabaseError("IPC programado", { code: result.error.code });
    const messages: Record<string, string> = {
      "23505": "El período ya fue aplicado o el índice registrado es distinto. Revisá el historial.",
      "42501": "No tenés permisos para programar IPC.",
      "22023": "Revisá el período, la variación y la fecha de vigencia.",
      P0002: "Falta cargar el índice de ese período. Podés programarlo sin índice; quedará sin aplicar hasta cargarlo durante la vigencia.",
    };
    return { ...state, formError: messages[result.error.code] ?? "No se pudo procesar el IPC. Intentá nuevamente." };
  }
  if (schedule) {
    revalidatePath("/admin/actualizaciones-ipc");
    revalidatePath("/admin/auditoria");
    return { ...state, successMessage: "Programación guardada. La ejecución automática recalculará los saldos el día de vigencia en Argentina." };
  }
  const preview = result.data as NonNullable<IpcFormState["preview"]>;
  for (let offset = preview.length; offset > 0 && offset % 500 === 0;) {
    const page = await supabase.rpc("previsualizar_ipc_programado", args).range(offset, offset + 499);
    if (page.error || !page.data) return { ...state, formError: "No se pudo leer la previsualización completa. Intentá nuevamente." };
    preview.push(...page.data);
    if (page.data.length < 500) break;
    offset += page.data.length;
  }
  return { ...state, preview };
}
