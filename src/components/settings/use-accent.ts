"use client";

import { useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { useUser } from "@/lib/user-context";
import { ACCENTS, type Accent, type Profile } from "@/lib/types";

export function applyAccent(accent: Accent) {
  document.documentElement.dataset.accent = accent;
  try {
    localStorage.setItem("stash-accent", accent);
  } catch {
    // ignore
  }
}

export function useProfile() {
  const user = useUser();
  return useQuery({
    queryKey: ["profile", user.id],
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data, error } = await createClient().from("profiles").select("id,display_name,accent").eq("id", user.id).maybeSingle();
      if (error) throw error;
      return (data as Profile | null) ?? { id: user.id, display_name: null, accent: "indigo" as Accent };
    },
  });
}

export function useUpdateProfile() {
  const user = useUser();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (patch: Partial<Pick<Profile, "accent" | "display_name">>) => {
      const { error } = await createClient()
        .from("profiles")
        .upsert({ id: user.id, ...patch }, { onConflict: "id" });
      if (error) throw error;
    },
    onMutate: (patch) => {
      if (patch.accent) applyAccent(patch.accent);
      qc.setQueryData<Profile>(["profile", user.id], (p) => (p ? { ...p, ...patch } : p));
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ["profile", user.id] }),
  });
}

/** Syncs the accent colour chosen on another device. */
export function useProfileAccent() {
  const { data } = useProfile();
  useEffect(() => {
    if (data?.accent && (ACCENTS as readonly string[]).includes(data.accent)) applyAccent(data.accent);
  }, [data?.accent]);
}
