import type { Enums } from "../../types/database.types";

export type CateringAdicionalCategoria = Extract<
  Enums<"categoria_catering_item">,
  "adicional_alimentos" | "adicional_bebidas" | "adicional_otros"
>;

export const CATERING_ADICIONAL_CATEGORIAS = [
  "adicional_alimentos",
  "adicional_bebidas",
  "adicional_otros",
] as const satisfies readonly CateringAdicionalCategoria[];

const ADICIONAL_LABELS: Record<CateringAdicionalCategoria, string> = {
  adicional_alimentos: "Adicional de alimentos",
  adicional_bebidas: "Adicional de bebidas alcoholicas",
  adicional_otros: "Adicional otros",
};

export function getCateringAdicionalLabel(value: CateringAdicionalCategoria) {
  return ADICIONAL_LABELS[value];
}

export function isCateringAdicionalCategoria(
  value: string,
): value is CateringAdicionalCategoria {
  return CATERING_ADICIONAL_CATEGORIAS.some((option) => option === value);
}
