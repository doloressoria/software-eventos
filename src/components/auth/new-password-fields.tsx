import { Input, Label } from "@/components/ui/form";
import { minimumPasswordLength } from "@/lib/auth/new-password";

export function NewPasswordFields() {
  return (
    <>
      <div>
        <Label htmlFor="password">Nueva contraseña</Label>
        <Input id="password" name="password" type="password" autoComplete="new-password" minLength={minimumPasswordLength} required />
      </div>
      <div>
        <Label htmlFor="confirmation">Confirmar nueva contraseña</Label>
        <Input id="confirmation" name="confirmation" type="password" autoComplete="new-password" minLength={minimumPasswordLength} required />
      </div>
    </>
  );
}
