export type ContactoInput = {
  id: string;
  nombre: string;
  telefono: string;
  correo: string;
  relacion: string;
  observaciones: string;
  es_principal: boolean;
};

export function nuevoContacto(): ContactoInput {
  return { id: "", nombre: "", telefono: "", correo: "", relacion: "", observaciones: "", es_principal: false };
}

export function validateContactos(value: FormDataEntryValue | null): {
  contactos: ContactoInput[];
  error: string | null;
} {
  let parsed: unknown;
  try {
    parsed = JSON.parse(typeof value === "string" ? value : "");
  } catch {
    return { contactos: [], error: "No se recibió la lista de contactos. Recargá antes de guardar." };
  }
  if (!Array.isArray(parsed) || parsed.some((c) =>
    !c || typeof c !== "object" ||
    ["id", "nombre", "telefono", "correo", "relacion", "observaciones"].some((key) => typeof c[key] !== "string") ||
    typeof c.es_principal !== "boolean"
  )) {
    return { contactos: [], error: "La lista de contactos no es válida." };
  }
  const contactos = parsed as ContactoInput[];
  if (contactos.some((c) => !c.nombre.trim())) {
    return { contactos, error: "Cada contacto debe tener un nombre." };
  }
  if (contactos.some((c) => c.correo.trim() && !/^[^\s@]+@[^\s@]+[.][^\s@]+$/.test(c.correo.trim()))) {
    return { contactos, error: "Revisá el correo de los contactos." };
  }
  const ids = contactos.map((c) => c.id).filter(Boolean);
  if (ids.some((id) => !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) ||
      new Set(ids).size !== ids.length || contactos.filter((c) => c.es_principal).length > 1) {
    return { contactos, error: "Revisá los contactos y elegí como máximo un principal." };
  }
  return { contactos, error: null };
}

export function contactosPayload(contactos: ContactoInput[]) {
  return contactos.map((c) => ({
    id: c.id || null, nombre: c.nombre.trim(), telefono: c.telefono.trim() || null,
    correo: c.correo.trim() || null, relacion: c.relacion.trim() || null,
    observaciones: c.observaciones.trim() || null, es_principal: c.es_principal,
  }));
}
