"use client";

import { useCallback, useEffect, useState } from "react";

/** useState persisted to localStorage (per-device UI preferences only). */
export function useLocalState<T>(key: string, initial: T) {
  const [value, setValue] = useState<T>(initial);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(key);
      if (raw !== null) setValue(JSON.parse(raw) as T);
    } catch {
      // ignore
    }
  }, [key]);

  const set = useCallback(
    (next: T) => {
      setValue(next);
      try {
        localStorage.setItem(key, JSON.stringify(next));
      } catch {
        // ignore
      }
    },
    [key],
  );

  return [value, set] as const;
}
