import { Card, CardContent } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { ChangePasswordForm } from "./change-password-form";

export default function ChangePasswordPage() {
  return (
    <section className="max-w-xl space-y-6">
      <PageHeader eyebrow="Mi cuenta" title="Cambiar contraseña" />
      <Card>
        <CardContent className="pt-5">
          <ChangePasswordForm />
        </CardContent>
      </Card>
    </section>
  );
}
