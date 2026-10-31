"use client";

import { useEffect } from "react";

/** Keep fixed capture controls above the virtual keyboard, including iOS Safari. */
export function useVisualViewport() {
  useEffect(() => {
    const viewport = window.visualViewport;
    if (!viewport) return;
    let baseline = window.innerHeight;
    const update = () => {
      const inset = Math.max(0, window.innerHeight - viewport.height - viewport.offsetTop);
      const editing = document.activeElement?.matches("input,textarea,[contenteditable=true]");
      if (!editing) baseline = window.innerHeight;
      const keyboardOpen = !!editing && (inset > 120 || baseline - window.innerHeight > 120);
      document.documentElement.style.setProperty("--keyboard-inset", `${keyboardOpen ? inset : 0}px`);
      document.documentElement.toggleAttribute("data-keyboard-open", keyboardOpen);
    };
    update();
    viewport.addEventListener("resize", update);
    viewport.addEventListener("scroll", update);
    window.addEventListener("resize", update);
    document.addEventListener("focusin", update);
    document.addEventListener("focusout", update);
    return () => {
      viewport.removeEventListener("resize", update);
      viewport.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
      document.removeEventListener("focusin", update);
      document.removeEventListener("focusout", update);
      document.documentElement.style.removeProperty("--keyboard-inset");
      document.documentElement.removeAttribute("data-keyboard-open");
    };
  }, []);
}
