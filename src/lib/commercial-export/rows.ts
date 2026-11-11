import { ExportError } from "./types";

// Rebuild each page query: PostgREST's response limit must never truncate an export.
export async function allRows<T>(page: (start: number, end: number) => PromiseLike<{
  data: T[] | null; error: unknown;
}>, size = 500): Promise<T[]> {
  const rows: T[] = [];
  for (let start = 0; ;) {
    const result = await page(start, start + size - 1);
    if (result.error || !result.data) throw new ExportError(500, "No se pudieron leer todos los datos para la exportación. Intentá nuevamente.");
    rows.push(...result.data);
    if (result.data.length === 0) return rows;
    start += result.data.length;
  }
}
