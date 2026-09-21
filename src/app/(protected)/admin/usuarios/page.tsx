import Link from "next/link";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Input, Label } from "@/components/ui/form";
import { PageHeader } from "@/components/ui/page-header";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { listUsuarios, type UsuarioFilters } from "@/lib/usuarios/queries";

type UsuariosPageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export default async function UsuariosPage({
  searchParams,
}: UsuariosPageProps) {
  const params = searchParams ? await searchParams : {};
  const filters = getFilters(params);
  const { roles, salones, totalUsers, users } = await listUsuarios(filters);
  const statusMessage = params.created
    ? "Usuario creado correctamente."
    : params.updated
      ? "Usuario actualizado correctamente."
      : null;
  const hasFilters = Boolean(
    filters.search || filters.roleId || filters.estado || filters.salonId,
  );

  return (
    <section className="space-y-6">
      <PageHeader
        eyebrow="Admin"
        title="Gestion de usuarios"
        description="Administra accesos, roles, estado y salones asignados sin eliminar usuarios fisicamente."
        actions={
          <>
            <Link
              href="/admin"
              className={buttonVariants({ variant: "secondary" })}
            >
              Volver al panel
            </Link>
            <Link
              href="/admin/roles"
              className={buttonVariants({ variant: "secondary" })}
            >
              Configurar roles
            </Link>
            <Link
              href="/admin/usuarios/nuevo"
              className={buttonVariants({ variant: "primary" })}
            >
              Nuevo usuario
            </Link>
          </>
        }
      />

      {statusMessage ? (
        <Alert role="status" variant="success" className="font-medium">
          {statusMessage}
        </Alert>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Buscar y filtrar</CardTitle>
        </CardHeader>
        <CardContent>
          <form className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
            <div className="md:col-span-2 xl:col-span-2">
              <Label htmlFor="search">Nombre o email</Label>
              <Input
                id="search"
                name="search"
                type="search"
                defaultValue={filters.search}
                placeholder="Buscar usuario..."
              />
            </div>
            <FilterSelect
              defaultValue={filters.roleId}
              label="Rol"
              name="rol"
              options={[
                { label: "Todos", value: "todos" },
                ...roles.map((role) => ({ label: role.nombre, value: role.id })),
              ]}
            />
            <FilterSelect
              label="Estado"
              name="estado"
              defaultValue={filters.estado}
              options={[
                { label: "Todos", value: "todos" },
                { label: "Activo", value: "activo" },
                { label: "Inactivo", value: "inactivo" },
              ]}
            />
            <FilterSelect
              label="Salon"
              name="salon"
              defaultValue={filters.salonId}
              options={[
                { label: "Todos", value: "todos" },
                ...salones.map((salon) => ({
                  label: `${salon.nombre}${
                    !salon.activo || salon.deleted_at ? " (inactivo)" : ""
                  }`,
                  value: salon.id,
                })),
              ]}
            />
            <div className="flex flex-wrap gap-3 md:col-span-2 xl:col-span-5 xl:justify-end">
              {hasFilters ? (
                <Link
                  href="/admin/usuarios"
                  className={buttonVariants({ variant: "secondary" })}
                >
                  Limpiar filtros
                </Link>
              ) : null}
              <button
                type="submit"
                className={buttonVariants({ variant: "primary" })}
              >
                Aplicar filtros
              </button>
            </div>
          </form>
        </CardContent>
      </Card>

      <Card className="overflow-hidden">
        <CardHeader className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <CardTitle>Usuarios</CardTitle>
            <p className="mt-1 text-sm text-slate-500">
              {hasFilters
                ? `${users.length} de ${totalUsers} usuarios`
                : totalUsers === 1
                  ? "1 usuario registrado"
                  : `${totalUsers} usuarios registrados`}
            </p>
          </div>
          <Badge variant="primary">Solo administradores</Badge>
        </CardHeader>

        {users.length > 0 ? (
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead scope="col">Usuario</TableHead>
                <TableHead scope="col">Rol</TableHead>
                <TableHead scope="col">Estado</TableHead>
                <TableHead scope="col">Salones asignados</TableHead>
                <TableHead scope="col">Creado</TableHead>
                <TableHead scope="col" className="text-right">
                  Acciones
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {users.map((user) => (
                <TableRow key={user.id}>
                  <TableCell>
                    <p className="font-medium text-slate-950">
                      {user.full_name}
                    </p>
                    <p className="mt-1 text-sm text-slate-500">{user.email}</p>
                  </TableCell>
                  <TableCell>
                    <Badge variant={user.rol === "admin" ? "primary" : "neutral"}>
                      {user.role?.nombre ?? "Sin rol"}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Badge variant={user.activo ? "success" : "inactive"}>
                      {user.activo ? "Activo" : "Inactivo"}
                    </Badge>
                  </TableCell>
                  <TableCell className="min-w-56">
                    {user.role?.legacy_rol === "admin" ? (
                      <span className="text-sm text-slate-500">
                        Acceso global
                      </span>
                    ) : user.role?.legacy_rol === "ejecutiva_catering" ? (
                      <span className="text-sm text-slate-500">
                        Caterings a cargo
                      </span>
                    ) : user.salones.length > 0 ? (
                      <div className="flex max-w-md flex-wrap gap-1.5">
                        {user.salones.map((salon) => (
                          <Badge
                            key={salon.id}
                            variant={salon.activo && !salon.deleted_at ? "neutral" : "inactive"}
                          >
                            {salon.nombre}
                          </Badge>
                        ))}
                      </div>
                    ) : (
                      <span className="text-sm font-medium text-amber-700">
                        Sin salones
                      </span>
                    )}
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-slate-600">
                    {formatDate(user.created_at)}
                  </TableCell>
                  <TableCell>
                    <div className="flex justify-end">
                      <Link
                        href={`/admin/usuarios/${user.id}/editar`}
                        className={buttonVariants({
                          variant: "secondary",
                          size: "xs",
                        })}
                      >
                        Editar
                      </Link>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        ) : (
          <EmptyState
            title={
              hasFilters
                ? "No hay usuarios con estos filtros"
                : "Todavia no hay usuarios"
            }
            description={
              hasFilters
                ? "Proba otra busqueda o limpia los filtros para ver el listado completo."
                : "Crea el primer usuario para comenzar a administrar accesos."
            }
            action={
              hasFilters ? (
                <Link
                  href="/admin/usuarios"
                  className={buttonVariants({ variant: "secondary" })}
                >
                  Limpiar filtros
                </Link>
              ) : (
                <Link
                  href="/admin/usuarios/nuevo"
                  className={buttonVariants({ variant: "primary" })}
                >
                  Nuevo usuario
                </Link>
              )
            }
          />
        )}
      </Card>
    </section>
  );
}

function FilterSelect({
  defaultValue,
  label,
  name,
  options,
}: {
  defaultValue?: string;
  label: string;
  name: string;
  options: Array<{ label: string; value: string }>;
}) {
  return (
    <div>
      <Label htmlFor={name}>{label}</Label>
      <Select
        name={name}
        defaultValue={defaultValue ?? "todos"}
      >
        <SelectTrigger id={name}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {options.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

function getFilters(
  params: Record<string, string | string[] | undefined>,
): UsuarioFilters {
  const rol = firstValue(params.rol);
  const estado = firstValue(params.estado);
  const salon = firstValue(params.salon);

  return {
    estado:
      estado === "activo" || estado === "inactivo" ? estado : undefined,
    roleId: rol && rol !== "todos" ? rol : undefined,
    salonId: salon && salon !== "todos" ? salon : undefined,
    search: firstValue(params.search) || undefined,
  };
}

function firstValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("es-AR", {
    dateStyle: "short",
    timeZone: "America/Argentina/Buenos_Aires",
  }).format(new Date(value));
}
