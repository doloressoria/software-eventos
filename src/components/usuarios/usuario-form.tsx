"use client";

import Link from "next/link";
import { useActionState, useMemo, useState } from "react";
import { SubmitButton } from "@/components/salones/submit-button";
import { Alert } from "@/components/ui/alert";
import { buttonVariants } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  checkboxClassName,
  FieldError,
  FormAlert,
  Input,
  Label,
} from "@/components/ui/form";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { UsuarioFormState } from "@/lib/usuarios/validation";

type AssignableSalon = {
  id: string;
  nombre: string;
};

type UsuarioFormProps = {
  action: (
    previousState: UsuarioFormState,
    formData: FormData,
  ) => Promise<UsuarioFormState>;
  initialState: UsuarioFormState;
  isSelf?: boolean;
  mode: "create" | "edit";
  roles: Array<{ id: string; nombre: string }>;
  salones: AssignableSalon[];
};

export function UsuarioForm({
  action,
  initialState,
  isSelf = false,
  mode,
  roles,
  salones,
}: UsuarioFormProps) {
  const [state, formAction] = useActionState(action, initialState);
  const [active, setActive] = useState(initialState.fields.activo);
  const [selectedSalonIds, setSelectedSalonIds] = useState(
    () => new Set(initialState.fields.salonIds),
  );
  const initialSalonIds = useMemo(
    () => new Set(initialState.fields.salonIds),
    [initialState.fields.salonIds],
  );

  if (state.temporaryPassword) {
    return (
      <CreatedUserResult
        email={initialState.fields.email || state.fields.email}
        temporaryPassword={state.temporaryPassword}
      />
    );
  }

  function toggleSalon(id: string) {
    setSelectedSalonIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function confirmCriticalChanges(event: React.FormEvent<HTMLFormElement>) {
    const warnings: string[] = [];
    const removedSalonNames = salones
      .filter(
        (salon) =>
          initialSalonIds.has(salon.id) && !selectedSalonIds.has(salon.id),
      )
      .map((salon) => salon.nombre);

    if (mode === "edit" && initialState.fields.activo && !active) {
      warnings.push(
        "El usuario quedara desactivado y no podra continuar usando la aplicacion.",
      );
    }
    if (removedSalonNames.length > 0) {
      warnings.push(
        `Se quitaran estos salones: ${removedSalonNames.join(", ")}.`,
      );
    }
    if (selectedSalonIds.size === 0) {
      warnings.push(
        "El usuario quedara sin salones y no podra acceder a eventos de una sede asignada.",
      );
    }

    if (
      warnings.length > 0 &&
      !window.confirm(`${warnings.join("\n\n")}\n\n¿Queres guardar los cambios?`)
    ) {
      event.preventDefault();
    }
  }

  return (
    <form
      action={formAction}
      className="max-w-4xl"
      noValidate
      onSubmit={confirmCriticalChanges}
    >
      <Card>
        <CardHeader>
          <CardTitle>Datos del usuario</CardTitle>
          <CardDescription>
            El email se sincroniza con Supabase Auth. El rol y el estado se
            validan nuevamente en el servidor antes de guardar.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid gap-5 sm:grid-cols-2">
            <div>
              <Label htmlFor="full_name">Nombre completo</Label>
              <Input
                id="full_name"
                name="full_name"
                type="text"
                autoComplete="name"
                required
                defaultValue={state.fields.fullName}
                aria-invalid={Boolean(state.errors.fullName)}
                aria-describedby={
                  state.errors.fullName ? "full-name-error" : undefined
                }
              />
              {state.errors.fullName ? (
                <FieldError id="full-name-error">
                  {state.errors.fullName}
                </FieldError>
              ) : null}
            </div>

            <div>
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                name="email"
                type="email"
                autoComplete="email"
                required
                defaultValue={state.fields.email}
                aria-invalid={Boolean(state.errors.email)}
                aria-describedby={state.errors.email ? "email-error" : undefined}
              />
              {state.errors.email ? (
                <FieldError id="email-error">{state.errors.email}</FieldError>
              ) : (
                <p className="mt-2 text-xs leading-5 text-slate-500">
                  Cambiarlo actualiza Auth y el perfil como una sola operacion
                  compensada ante errores.
                </p>
              )}
            </div>

            <div>
              <Label htmlFor="role_id">Rol</Label>
              {isSelf ? <input type="hidden" name="role_id" value={state.fields.roleId} /> : null}
              <Select
                name={isSelf ? undefined : "role_id"}
                defaultValue={state.fields.roleId}
                disabled={isSelf}
              >
                <SelectTrigger id="role_id" aria-invalid={Boolean(state.errors.roleId)}>
                  <SelectValue placeholder="Seleccionar rol" />
                </SelectTrigger>
                <SelectContent>
                  {roles.map((role) => (
                    <SelectItem key={role.id} value={role.id}>{role.nombre}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {state.errors.roleId ? (
                <FieldError id="role-id-error">{state.errors.roleId}</FieldError>
              ) : null}
            </div>

            <div className="flex items-end">
              {isSelf && active ? (
                <input type="hidden" name="activo" value="on" />
              ) : null}
              <label className="flex min-h-10 w-full items-center gap-3 rounded-xl border border-slate-200 bg-slate-50/70 px-3.5 py-3 text-sm font-medium text-slate-700">
                <input
                  name={isSelf ? undefined : "activo"}
                  type="checkbox"
                  checked={active}
                  onChange={(event) => setActive(event.target.checked)}
                  disabled={isSelf}
                  className={checkboxClassName}
                />
                Usuario activo
              </label>
            </div>
          </div>

          {isSelf ? (
            <Alert variant="warning">
              Por seguridad, no podes desactivar tu propia cuenta ni quitarte
              el rol de administrador desde esta pantalla.
            </Alert>
          ) : null}

          <div>
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <h3 className="text-sm font-semibold text-slate-950">
                  Salones asignados
                </h3>
                <p className="mt-1 text-sm leading-6 text-slate-500">
                  Solo se ofrecen salones activos. Se puede asignar más de uno.
                </p>
              </div>
              <span className="text-xs font-semibold text-teal-700">
                {selectedSalonIds.size === 1
                  ? "1 salon seleccionado"
                  : `${selectedSalonIds.size} salones seleccionados`}
              </span>
            </div>

            {salones.length > 0 ? (
              <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {salones.map((salon) => (
                  <label
                    key={salon.id}
                    className="flex min-h-14 items-center gap-3 rounded-xl border border-slate-200 bg-slate-50/70 px-3.5 py-3 text-sm transition hover:border-teal-100 hover:bg-teal-50/50"
                  >
                    <input
                      name="salon_ids"
                      type="checkbox"
                      value={salon.id}
                      checked={selectedSalonIds.has(salon.id)}
                      onChange={() => toggleSalon(salon.id)}
                      className={checkboxClassName}
                    />
                    <span className="font-medium text-slate-800">
                      {salon.nombre}
                    </span>
                  </label>
                ))}
              </div>
            ) : (
              <Alert variant="warning" className="mt-4">
                No hay salones activos disponibles. El usuario se guardara sin
                asignaciones.
              </Alert>
            )}

            {selectedSalonIds.size === 0 ? (
              <Alert variant="warning" className="mt-4">
                Un usuario sin salones no puede acceder a eventos de una sede.
              </Alert>
            ) : null}
            {state.errors.salonIds ? (
              <FieldError id="salones-error">
                {state.errors.salonIds}
              </FieldError>
            ) : null}
          </div>

          {mode === "create" ? (
            <Alert>
              Se generara una contraseña temporal segura. Se mostrara una sola
              vez al finalizar para que puedas copiarla y comunicarla por un
              canal seguro.
            </Alert>
          ) : null}

          {state.formError ? <FormAlert>{state.formError}</FormAlert> : null}
        </CardContent>
      </Card>

      <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
        <Link
          href="/admin/usuarios"
          className={buttonVariants({ variant: "secondary" })}
        >
          Cancelar
        </Link>
        <SubmitButton
          pendingLabel={mode === "create" ? "Creando..." : "Guardando..."}
        >
          {mode === "create" ? "Crear usuario" : "Guardar cambios"}
        </SubmitButton>
      </div>
    </form>
  );
}

function CreatedUserResult({
  email,
  temporaryPassword,
}: {
  email: string;
  temporaryPassword: string;
}) {
  const [copied, setCopied] = useState(false);

  async function copyPassword() {
    await navigator.clipboard.writeText(temporaryPassword);
    setCopied(true);
  }

  return (
    <Card className="max-w-2xl border-emerald-200">
      <CardHeader>
        <CardTitle>Usuario creado correctamente</CardTitle>
        <CardDescription>
          Copia la contraseña ahora. No se guarda en el perfil ni se volvera a
          mostrar al salir de esta pantalla.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="rounded-xl border border-slate-200 bg-slate-950 p-4 text-white">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">
            Credenciales temporales
          </p>
          <p className="mt-3 text-sm text-slate-300">{email}</p>
          <code className="mt-2 block break-all text-base font-semibold text-white">
            {temporaryPassword}
          </code>
        </div>
        <Alert variant="warning">
          Comunica estas credenciales por un canal seguro. La contraseña nunca
          se almacena en <code>public.usuarios</code> ni en la auditoria.
        </Alert>
        <div className="flex flex-wrap justify-end gap-3">
          <button
            type="button"
            onClick={copyPassword}
            className={buttonVariants({ variant: "secondary" })}
          >
            {copied ? "Copiada" : "Copiar contraseña"}
          </button>
          <Link
            href="/admin/usuarios?created=1"
            className={buttonVariants({ variant: "primary" })}
          >
            Volver al listado
          </Link>
        </div>
      </CardContent>
    </Card>
  );
}
