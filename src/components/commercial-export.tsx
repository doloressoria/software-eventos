"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode, type RefObject } from "react";
import { buttonVariants } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";

type FormRef = RefObject<HTMLFormElement | null>;
type Entry = { baseline: string; pending: boolean };
const formValue = (form: HTMLFormElement) => JSON.stringify([...new FormData(form)].filter(([key]) => !key.startsWith("$ACTION_")));
type ExportScope = {
  pending: boolean;
  register: (ref: FormRef) => () => void;
  update: (ref: FormRef, pending: boolean, saved: boolean) => void;
  hasChanges: () => boolean;
  isSaving: () => boolean;
};
const Scope = createContext<ExportScope | null>(null);

export function ExportExcelScope({ children, className }: { children: ReactNode; className?: string }) {
  const forms = useRef(new Map<FormRef, Entry>());
  const root = useRef<HTMLElement>(null);
  const [pending, setPending] = useState(false);
  const updatePending = useCallback(() => setPending([...forms.current.values()].some((entry) => entry.pending)), []);
  const register = useCallback((ref: FormRef) => {
    if (ref.current) forms.current.set(ref, { baseline: formValue(ref.current), pending: false });
    return () => { forms.current.delete(ref); updatePending(); };
  }, [updatePending]);
  const update = useCallback((ref: FormRef, saving: boolean, saved: boolean) => {
    const entry = forms.current.get(ref);
    if (!entry || !ref.current) return;
    entry.pending = saving;
    if (saved && !saving) entry.baseline = formValue(ref.current);
    updatePending();
  }, [updatePending]);
  const hasChanges = useCallback(() => [...forms.current].some(([ref, entry]) => ref.current && formValue(ref.current) !== entry.baseline), []);
  const isSaving = useCallback(() => [...forms.current.values()].some((entry) => entry.pending)
    || Boolean(root.current?.querySelector('button[type="submit"]:disabled')), []);
  const value = useMemo(() => ({ pending, register, update, hasChanges, isSaving }), [pending, register, update, hasChanges, isSaving]);
  return <Scope.Provider value={value}><section ref={root} className={className}>{children}</section></Scope.Provider>;
}

// Forms remain usable outside an export page; capture saved baselines only after success.
export function useExportForm(ref: FormRef, pending: boolean, success: boolean, revision: unknown) {
  const scope = useContext(Scope);
  const register = scope?.register;
  const update = scope?.update;
  useEffect(() => register?.(ref), [register, ref]);
  useEffect(() => { update?.(ref, pending, success); }, [update, ref, pending, success, revision]);
}

export function ExportExcelButton({ kind, id }: { kind: "evento" | "catering"; id: string }) {
  const scope = useContext(Scope);
  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function download() {
    setError(null);
    if (scope?.isSaving()) { setError("Esperá a que termine el guardado antes de exportar."); return; }
    if (scope?.hasChanges() && !window.confirm("Tenés cambios sin guardar. El Excel incluirá únicamente los datos guardados. ¿Querés descargarlo igualmente?")) return;
    setDownloading(true);
    try {
      const response = await fetch(`/${kind === "evento" ? "eventos" : "catering"}/${encodeURIComponent(id)}/excel`, { cache: "no-store", credentials: "same-origin" });
      if (response.redirected) throw new Error("La sesión venció o no tenés permiso para esta descarga. Recargá el detalle.");
      if (!response.ok) {
        const result = await response.json().catch(() => null);
        throw new Error(result?.error ?? "No se pudo descargar el Excel. Intentá nuevamente.");
      }
      if (!response.headers.get("content-type")?.includes("spreadsheetml")) throw new Error("La sesión venció. Volvé a iniciar sesión para descargar el archivo.");
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = response.headers.get("content-disposition")?.match(/filename="([a-zA-Z0-9.-]+)"/)?.[1] ?? `${kind}-${id}.xlsx`;
      document.body.appendChild(link); link.click(); link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No se pudo descargar el Excel.");
    } finally { setDownloading(false); }
  }
  return <div className="space-y-2">
    <button type="button" onClick={download} disabled={downloading || scope?.pending} aria-busy={downloading}
      className={buttonVariants({ variant: "secondary" })}>
      {downloading ? "Generando Excel…" : scope?.pending ? "Guardando…" : "Exportar a Excel"}
    </button>
    {error ? <Alert role="alert" variant="destructive" className="max-w-md text-sm">{error}</Alert> : null}
  </div>;
}
