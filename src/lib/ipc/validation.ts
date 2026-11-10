export type IpcFormFields = {
  periodo: string;
  fecha_vigencia: string;
  variacion_porcentual: string;
};
export type IpcFormErrors = Partial<Record<keyof IpcFormFields, string>>;
export type IpcPayload = { periodo: string; fechaVigencia: string; variacionPorcentual: number | null };
export type IpcPreviewRow = {
  evento_nombre: string;
  destino_nombre: string;
  evento_id: string;
  evento_servicio_id: string | null;
  catering_contrato_id: string | null;
  saldo_anterior: number;
  incremento: number;
  saldo_proyectado: number;
};
export type IpcFormState = {
  errors: IpcFormErrors;
  fields: IpcFormFields;
  formError: string | null;
  successMessage: string | null;
  preview: IpcPreviewRow[] | null;
};

export function getArgentinaDate(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    day: "2-digit", month: "2-digit", year: "numeric", timeZone: "America/Argentina/Buenos_Aires",
  }).formatToParts(now);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

export function getEmptyIpcFormState(): IpcFormState {
  const today = getArgentinaDate();
  return { errors: {}, fields: { periodo: today.slice(0, 7), fecha_vigencia: today, variacion_porcentual: "" },
    formError: null, successMessage: null, preview: null };
}

export function validateIpcForm(formData: FormData, today = getArgentinaDate()) {
  const fields = Object.fromEntries(["periodo", "fecha_vigencia", "variacion_porcentual"].map((key) => {
    const value = formData.get(key);
    return [key, typeof value === "string" ? value.trim() : ""];
  })) as IpcFormFields;
  const errors: IpcFormErrors = {};
  if (!/^[1-9]\d{3}-(0[1-9]|1[0-2])$/.test(fields.periodo)) errors.periodo = "Seleccioná un período mensual válido.";
  const date = new Date(`${fields.fecha_vigencia}T00:00:00.000Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fields.fecha_vigencia) || Number.isNaN(date.getTime()) ||
    date.toISOString().slice(0, 10) !== fields.fecha_vigencia || fields.fecha_vigencia < today) {
    errors.fecha_vigencia = "Elegí hoy o una fecha futura válida de Argentina.";
  }
  const raw = fields.variacion_porcentual.replace(",", ".");
  const value = Number(raw);
  const variation = Math.round((value + Number.EPSILON) * 10_000) / 10_000;
  if (raw && (!/^[+-]?(\d+(\.\d*)?|\.\d+)$/.test(raw) || !Number.isFinite(variation) || variation <= -100 || variation >= 100_000_000)) {
    errors.variacion_porcentual = "Ingresá una variación mayor a -100% y menor a 100.000.000%.";
  }
  const payload: IpcPayload | null = Object.keys(errors).length ? null : {
    periodo: `${fields.periodo}-01`, fechaVigencia: fields.fecha_vigencia, variacionPorcentual: raw ? variation : null,
  };
  return { errors, fields, payload };
}
