"use client";

import { useEffect, useState } from "react";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

let deferred: BeforeInstallPromptEvent | null = null;
const listeners = new Set<() => void>();

if (typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    deferred = e as BeforeInstallPromptEvent;
    listeners.forEach((l) => l());
  });
  window.addEventListener("appinstalled", () => {
    deferred = null;
    listeners.forEach((l) => l());
  });
}

/** Chromium's install prompt (not available on iOS Safari, which uses Share → Add to Home Screen). */
export function useInstallPrompt() {
  const [available, setAvailable] = useState(() => !!deferred);

  useEffect(() => {
    const update = () => setAvailable(!!deferred);
    listeners.add(update);
    update();
    return () => {
      listeners.delete(update);
    };
  }, []);

  return {
    available,
    async install() {
      if (!deferred) return false;
      await deferred.prompt();
      const { outcome } = await deferred.userChoice;
      deferred = null;
      setAvailable(false);
      return outcome === "accepted";
    },
  };
}
