export const categoriasPax = [
  ["adultos", "Adultos"],
  ["jovenes", "Jóvenes"],
  ["menores", "Menores"],
  ["bebes", "Bebés"],
] as const;

export type CategoriaPax = (typeof categoriasPax)[number][0];
type Pax = Record<`pax_${CategoriaPax}`, number | null>;

export function totalInvitados(pax: Pax) {
  return categoriasPax.reduce((total, [categoria]) => total + (pax[`pax_${categoria}`] ?? 0), 0);
}

export function paxCateringDistinto<T extends Pax>(evento: Pax, caterings: T[]) {
  return caterings.filter((catering) => categoriasPax.some(([categoria]) =>
    (catering[`pax_${categoria}`] ?? 0) !== (evento[`pax_${categoria}`] ?? 0),
  ));
}
