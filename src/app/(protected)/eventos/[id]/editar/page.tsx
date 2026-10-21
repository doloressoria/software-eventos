import { updateEventoAction } from "@/app/(protected)/eventos/actions";
import { EventoForm } from "@/components/eventos/evento-form";
import { PageHeader } from "@/components/ui/page-header";
import { getEditarEventoPageData } from "@/lib/eventos/queries";
import { getEventoFormStateFromEvento } from "@/lib/eventos/validation";
import { getEventoContactos } from "@/lib/contactos/queries";

type EditarEventoPageProps = {
  params: Promise<{
    id: string;
  }>;
};

export default async function EditarEventoPage({
  params,
}: EditarEventoPageProps) {
  const { id } = await params;
  const { assignments, evento, profile, salones, vendedores } =
    await getEditarEventoPageData(id);
  const isAdmin = profile.rol === "admin";
  const contactos = await getEventoContactos(id);

  return (
    <section className="space-y-6">
      <PageHeader
        eyebrow="Eventos"
        title="Editar evento"
        description={`Actualiza el detalle comercial de ${evento.cliente_nombre}.`}
      />

      <EventoForm
        action={updateEventoAction.bind(null, evento.id)}
        assignments={assignments}
        cancelHref={`/eventos/${evento.id}`}
        initialState={getEventoFormStateFromEvento(evento, contactos.contactos, contactos.version)}
        isAdmin={isAdmin}
        mode="edit"
        pendingLabel="Guardando..."
        salones={salones}
        submitLabel="Guardar cambios"
        vendedores={vendedores}
      />
    </section>
  );
}
