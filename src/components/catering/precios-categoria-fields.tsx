import { FieldError, Input, Label } from "@/components/ui/form";
import { categoriasPax, type CategoriaPax } from "@/lib/eventos/asistentes";

export function PreciosCategoriaFields({ fields, errors, prefix }: {
  fields: Record<`precio_${CategoriaPax}`, string>;
  errors: Partial<Record<`precio_${CategoriaPax}`, string>>;
  prefix: string;
}) {
  return (
    <fieldset className="grid gap-4 sm:col-span-2 sm:grid-cols-2">
      <legend className="mb-2 text-sm font-medium">Precios por categoría sin IVA</legend>
      <p className="text-sm text-slate-600 sm:col-span-2">Dejá una categoría vacía para usar el precio general. Ingresá 0 si esa categoría es sin cargo.</p>
      {categoriasPax.map(([categoria, label]) => {
        const key = `precio_${categoria}` as const;
        const id = `${prefix}-${key}`;
        return <div key={key}>
          <Label htmlFor={id}>{label}</Label>
          <Input id={id} name={key} type="number" min={0} max={9999999999.99} step="0.01"
            defaultValue={fields[key]} aria-invalid={Boolean(errors[key])}
            aria-describedby={errors[key] ? `${id}-error` : undefined} />
          {errors[key] && <FieldError id={`${id}-error`}>{errors[key]}</FieldError>}
        </div>;
      })}
    </fieldset>
  );
}
