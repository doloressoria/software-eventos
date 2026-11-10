import { Card, CardContent, CardDescription, CardHeader } from "@/components/ui/card";
import { SetPasswordForm } from "./set-password-form";

export default function SetPasswordPage() {
  return (
    <main className="grid min-h-screen place-items-center px-4 py-10">
      <Card className="w-full max-w-md">
        <CardHeader>
          <h1 className="text-xl font-semibold tracking-tight text-slate-950">Elegí tu contraseña</h1>
          <CardDescription>Usala para ingresar a Software Eventos.</CardDescription>
        </CardHeader>
        <CardContent>
          <SetPasswordForm />
        </CardContent>
      </Card>
    </main>
  );
}
