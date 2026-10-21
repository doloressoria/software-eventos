"use client";

import { useActionState } from "react";
import { guardarContactosAction } from "@/app/(protected)/eventos/contactos-actions";
import { ContactoAnterior, ContactosFields } from "./contactos-fields";
import { SubmitButton } from "@/components/salones/submit-button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert } from "@/components/ui/alert";
import type { ContactosState } from "@/lib/contactos/queries";

export function ContactosSection({ eventoId, initial }: { eventoId: string; initial: ContactosState }) {
  const [state, action] = useActionState(guardarContactosAction.bind(null, eventoId), initial);
  return (
    <Card>
      <CardHeader><CardTitle>Contactos del evento</CardTitle></CardHeader>
      <CardContent className="space-y-4">
        <ContactoAnterior value={state.contactoAnterior} />
        {state.puedeEditar ? (
          <form action={action} className="space-y-4" noValidate>
            <ContactosFields key={state.version} initial={state.contactos} version={state.version} error={state.error} />
            <SubmitButton pendingLabel="Guardando...">Guardar contactos</SubmitButton>
          </form>
        ) : state.contactos.length ? (
          <ul className="space-y-4">{state.contactos.map((c) => (
            <li key={c.id} className="rounded-lg border border-slate-200 p-4 text-sm">
              <p className="font-semibold">{c.nombre}{c.es_principal ? " · Principal" : ""}</p>
              {[c.telefono, c.correo, c.relacion, c.observaciones].filter(Boolean).map((text, i) => (
                <p key={i} className="whitespace-pre-wrap break-words">{text}</p>
              ))}
            </li>
          ))}</ul>
        ) : <p className="text-sm text-slate-600">Sin contactos cargados.</p>}
        {state.success ? <Alert role="status" variant="success">{state.success}</Alert> : null}
      </CardContent>
    </Card>
  );
}
