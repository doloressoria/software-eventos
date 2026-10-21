"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { FormAlert, Input, Label, Textarea } from "@/components/ui/form";
import { nuevoContacto, type ContactoInput } from "@/lib/contactos/validation";

export function ContactoAnterior({ value }: { value: string | null }) {
  return value !== null && value !== "" ? (
    <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
      <p className="text-sm font-semibold">Contacto anterior · texto conservado</p>
      <p className="mt-2 whitespace-pre-wrap break-words text-sm">{value}</p>
    </div>
  ) : null;
}

export function ContactosFields({ initial, version, error }: {
  initial: ContactoInput[]; version: string; error?: string;
}) {
  const [contactos, setContactos] = useState(initial);
  function change(index: number, field: keyof ContactoInput, value: string | boolean) {
    setContactos((rows) => rows.map((row, i) => ({
      ...row,
      ...(field === "es_principal" && value === true ? { es_principal: i === index } : {}),
      ...(i === index ? { [field]: value } : {}),
    })));
  }
  return (
    <div className="space-y-4">
      <input type="hidden" name="contactos" value={JSON.stringify(contactos)} />
      <input type="hidden" name="contactos_version" value={version} />
      {contactos.map((c, i) => (
        <fieldset key={i} className="rounded-lg border border-slate-200 p-4">
          <legend className="px-1 text-sm font-semibold">Contacto {i + 1}</legend>
          <div className="grid gap-4 sm:grid-cols-2">
            {(["nombre", "telefono", "correo", "relacion"] as const).map((field) => (
              <div key={field}>
                <Label htmlFor={`contacto-${i}-${field}`}>
                  {{ nombre: "Nombre *", telefono: "Teléfono", correo: "Correo", relacion: "Función o relación con el cliente" }[field]}
                </Label>
                <Input id={`contacto-${i}-${field}`} value={c[field]} required={field === "nombre"}
                  type={field === "correo" ? "email" : field === "telefono" ? "tel" : "text"}
                  onChange={(e) => change(i, field, e.target.value)} />
              </div>
            ))}
            <div className="sm:col-span-2">
              <Label htmlFor={`contacto-${i}-observaciones`}>Observaciones</Label>
              <Textarea id={`contacto-${i}-observaciones`} value={c.observaciones}
                onChange={(e) => change(i, "observaciones", e.target.value)} />
            </div>
          </div>
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={c.es_principal} onChange={(e) => change(i, "es_principal", e.target.checked)} />
              Contacto principal
            </label>
            <Button type="button" variant="secondary" onClick={() => setContactos((rows) => rows.filter((_, n) => n !== i))}>
              Quitar contacto {i + 1}
            </Button>
          </div>
        </fieldset>
      ))}
      {error ? <FormAlert>{error}</FormAlert> : null}
      <Button type="button" variant="secondary" onClick={() => setContactos((rows) => [...rows, nuevoContacto()])}>
        Agregar contacto
      </Button>
      <p className="text-sm text-slate-600">Los cambios y las bajas se aplican al guardar.</p>
    </div>
  );
}
