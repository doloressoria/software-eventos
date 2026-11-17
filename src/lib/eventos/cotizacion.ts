import { roundMoney } from "../pagos/calculos";

export function cotizacionPorPersona(totalServicios: number, pax: number) {
  return pax > 0 ? roundMoney(totalServicios / pax) : null;
}
