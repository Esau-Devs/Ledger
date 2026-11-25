import type { SupabaseClient } from "@supabase/supabase-js";

/** Lee una tabla completa por bloques: PostgREST devuelve como máximo 1000 filas por petición. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function fetchAll<T>(sb: SupabaseClient<any, any, any>, table: string, select = "*", order = "id"): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await sb.from(table).select(select).order(order).order("id").range(from, from + 999);
    if (error) throw new Error(`${table}: ${error.message}`);
    out.push(...((data ?? []) as unknown as T[]));
    if (!data || data.length < 1000) break;
  }
  return out;
}
