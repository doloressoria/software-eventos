import { SalonForm } from "@/components/salones/salon-form";
import { createSalonAction } from "@/app/(protected)/salones/actions";
import { PageHeader } from "@/components/ui/page-header";
import { requireScreenManagement } from "@/lib/roles/access";
import { emptySalonFormState } from "@/lib/salones/validation";

export default async function NuevoSalonPage() {
  await requireScreenManagement("salones");

  return (
    <section className="space-y-6">
      <PageHeader
        eyebrow="Salones"
        title="Nuevo salon"
        description="Carga los datos basicos del salon para habilitarlo en la operacion."
      />

      <SalonForm
        action={createSalonAction}
        initialState={emptySalonFormState}
        submitLabel="Crear salon"
        pendingLabel="Creando..."
      />
    </section>
  );
}
