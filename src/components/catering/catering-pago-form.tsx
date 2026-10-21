"use client";

import { PagoForm } from "@/components/pagos/pago-form";
import type { PagoFormState } from "@/lib/pagos/validation";

export function CateringPagoForm(props: {
  action: (previousState: PagoFormState, formData: FormData) => Promise<PagoFormState>;
  initialState: PagoFormState;
  editing?: boolean;
}) {
  return <PagoForm {...props} />;
}
