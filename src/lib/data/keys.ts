import type { QueryClient } from "@tanstack/react-query";

export const DATA_ROOTS = ["entries", "entry", "search", "media", "collections", "tags", "reminders", "storage"] as const;

/** Personal datasets are small; invalidating everything after a write keeps every view consistent. */
export function invalidateData(qc: QueryClient, roots: readonly string[] = DATA_ROOTS) {
  return qc.invalidateQueries({ predicate: (q) => roots.includes(q.queryKey[0] as string) });
}
