import Link from "next/link";
import Image from "next/image";
import { createCateringAction } from "@/app/(protected)/catering/actions";
import { CateringForm } from "@/components/catering/catering-form";
import { Alert } from "@/components/ui/alert";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import {
  getEventoBuscadorResultById,
  getNuevoCateringPageData,
} from "@/lib/catering/queries";
import { getEmptyCateringFormState } from "@/lib/catering/validation";

type NuevoCateringPageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export default async function NuevoCateringPage({
  searchParams,
}: NuevoCateringPageProps) {
  const params = searchParams ? await searchParams : {};
  const eventoIdParam = getSearchParamValue(params.evento_id);
  const [{ ejecutivas, lugares }, lockedEvento] = await Promise.all([
    getNuevoCateringPageData(),
    eventoIdParam ? getEventoBuscadorResultById(eventoIdParam) : Promise.resolve(null),
  ]);
  const canCreate = ejecutivas.length > 0;
  const cancelHref = eventoIdParam ? `/eventos/${eventoIdParam}` : "/catering";

  return (
    <section className="space-y-6">
      <PageHeader
        eyebrow="Catering"
        title={
          <Image
            src="/kiria-catering.png"
            alt="Kiria Catering"
            width={722}
            height={425}
            priority
            className="h-auto w-64 max-w-full mix-blend-multiply sm:w-72"
          />
        }
        description="Vincula el catering a un evento existente o cargalo como catering externo."
      />

      {canCreate ? (
        <CateringForm
          action={createCateringAction}
          cancelHref={cancelHref}
          ejecutivas={ejecutivas}
          initialState={getEmptyCateringFormState()}
          lockedEvento={lockedEvento}
          mode="create"
          lugares={lugares}
        />
      ) : (
        <Card className="max-w-3xl">
          <CardHeader>
            <CardTitle>No hay ejecutivas de catering activas</CardTitle>
            <CardDescription>
              Da de alta al menos una usuaria con rol &quot;Ejecutiva de catering&quot; antes de
              cargar caterings.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Alert variant="warning">
              El catering necesita una ejecutiva responsable para poder guardarse.
            </Alert>
            <Link href="/catering" className={buttonVariants({ variant: "secondary" })}>
              Volver a catering
            </Link>
          </CardContent>
        </Card>
      )}
    </section>
  );
}

function getSearchParamValue(value: string | string[] | undefined) {
  if (Array.isArray(value)) {
    return value[0];
  }

  return value;
}
