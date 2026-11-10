import Link from "next/link";
import {
  ipcAction,
} from "@/app/(protected)/admin/actualizaciones-ipc/actions";
import { IpcApplicationForm } from "@/components/ipc/ipc-application-form";
import { buttonVariants } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { requireAdmin } from "@/lib/auth/require-admin";
import { getEmptyIpcFormState } from "@/lib/ipc/validation";
import { createClient } from "@/lib/supabase/server";

type IpcIndexRow = {
  actualizaciones_ipc: { count: number }[] | null;
  created_at: string;
  id: string;
  periodo: string;
  usuarios: { full_name: string | null } | null;
  variacion_porcentual: number;
};

export default async function ActualizacionesIpcPage() {
  await requireAdmin();
  const [indices, schedules] = await Promise.all([getRecentIpcIndices(), getSchedules()]);

  return (
    <section className="space-y-6">
      <PageHeader
        eyebrow="Admin"
        title="Actualización por IPC"
        description="Programá ajustes sobre saldos pendientes de servicios y catering de eventos confirmados."
        actions={
          <Link href="/admin" className={buttonVariants({ variant: "secondary" })}>
            Volver a admin
          </Link>
        }
      />

      <Card>
        <CardHeader>
          <CardTitle>Nuevo IPC mensual</CardTitle>
          <CardDescription>
            El período identifica el índice. La vigencia indica qué día se ejecuta,
            con fecha local argentina. Sin índice, el ajuste queda sin aplicar.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <IpcApplicationForm
            action={ipcAction}
            emptyState={getEmptyIpcFormState()}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Programaciones y resultados</CardTitle></CardHeader>
        <CardContent>
          <p className="mb-4 text-sm text-slate-600">Para cargar un índice faltante o reprogramar una fecha, completá el formulario con el mismo período. Los índices registrados y las ejecuciones aplicadas son inmutables.</p>
          <div className="overflow-x-auto"><Table>
            <TableHeader><TableRow>{["Período", "Vigencia", "Índice", "Estado / motivo", "Destinos", "Base ajustada", "Incremento", "Saldo resultante", "Ejecutado"].map((label) => <TableHead key={label}>{label}</TableHead>)}</TableRow></TableHeader>
            <TableBody>{schedules.map((item) => <TableRow key={item.id}>
              <TableCell>{formatPeriod(item.periodo)}</TableCell>
              <TableCell>{formatDay(item.fecha_vigencia)}</TableCell>
              <TableCell>{item.variacion_porcentual === null ? "Sin índice" : formatPercentage(item.variacion_porcentual)}</TableCell>
              <TableCell><p>{({ pendiente: "Pendiente", sin_indice: "Sin índice", aplicado: "Aplicado", revision: "Requiere revisión", error: "Error; pendiente de reintento" })[item.estado ?? ""] ?? item.estado}</p><p className="text-sm text-slate-600">{item.motivo}</p></TableCell>
              <TableCell>{item.cantidad_destinos}</TableCell>
              <TableCell>{item.estado === "aplicado" ? money(item.base_ajustada) : "—"}</TableCell>
              <TableCell>{item.estado === "aplicado" ? money(item.incremento) : "—"}</TableCell>
              <TableCell>{item.estado === "aplicado" ? money(item.saldo_resultante) : "—"}</TableCell>
              <TableCell>{item.ejecutado_at ? formatDate(item.ejecutado_at) : "—"}</TableCell>
            </TableRow>)}{!schedules.length && <TableRow><TableCell colSpan={9}>Sin programaciones.</TableCell></TableRow>}</TableBody>
          </Table></div>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Índices registrados y aplicaciones anteriores</CardTitle>
          <CardDescription>
            Cada período tiene un índice. La columna de servicios muestra sólo las aplicaciones del flujo anterior; los resultados programados se muestran arriba.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-hidden rounded-lg border border-slate-100">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Período</TableHead>
                  <TableHead className="text-right">Variación</TableHead>
                  <TableHead className="text-right">Servicios anteriores</TableHead>
                  <TableHead>Cargado por</TableHead>
                  <TableHead>Fecha</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {indices.length > 0 ? (
                  indices.map((index) => (
                    <TableRow key={index.id}>
                      <TableCell>{formatPeriod(index.periodo)}</TableCell>
                      <TableCell className="text-right">
                        {formatPercentage(index.variacion_porcentual)}
                      </TableCell>
                      <TableCell className="text-right">
                        {index.actualizaciones_ipc?.[0]?.count ?? 0}
                      </TableCell>
                      <TableCell>{index.usuarios?.full_name ?? "-"}</TableCell>
                      <TableCell>{formatDate(index.created_at)}</TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell colSpan={5} className="py-8 text-center text-slate-500">
                      Todavía no hay índices registrados.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </section>
  );
}

async function getRecentIpcIndices(): Promise<IpcIndexRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("ipc_indices")
    .select(
      "id, periodo, variacion_porcentual, created_at, usuarios(full_name), actualizaciones_ipc(count)",
    )
    .order("periodo", { ascending: false })
    .limit(30);

  if (error) throw new Error("No se pudo leer el historial de índices IPC.");

  return (data ?? []) as unknown as IpcIndexRow[];
}

function formatPeriod(value: string | null) {
  if (value === null) return "—";
  return new Intl.DateTimeFormat("es-AR", {
    month: "long",
    timeZone: "UTC",
    year: "numeric",
  }).format(new Date(`${value}T00:00:00.000Z`));
}

function formatPercentage(value: number) {
  return `${new Intl.NumberFormat("es-AR", {
    maximumFractionDigits: 4,
  }).format(value)}%`;
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("es-AR", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: "America/Argentina/Buenos_Aires",
  }).format(new Date(value));
}

async function getSchedules() {
  const supabase = await createClient();
  const { data, error } = await supabase.from("v_ipc_programaciones").select("*")
    .order("fecha_vigencia", { ascending: false }).order("periodo", { ascending: false }).limit(30);
  if (error) throw new Error("No se pudieron leer las programaciones de IPC.");
  return data ?? [];
}
function formatDay(value: string | null) {
  if (value === null) return "—";
  return new Intl.DateTimeFormat("es-AR", { timeZone: "UTC" }).format(new Date(`${value}T00:00:00Z`));
}
function money(value: number | null) {
  if (value === null) return "—";
  return new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS" }).format(value);
}
