"use client";

import { useEffect, useRef, type PointerEvent } from "react";

/** Release after a stationary hold to organize a card that has no drag sensor. */
export function useContextPress(onHold: () => void, enabled = true) {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const origin = useRef({ x: 0, y: 0 });
  const suppressedUntil = useRef(0);
  const held = useRef(false);
  const cancel = () => { if (timer.current) clearTimeout(timer.current); timer.current = null; held.current = false; };
  useEffect(() => cancel, []);
  return {
    suppressClick: () => Date.now() < suppressedUntil.current,
    handlers: {
      onPointerDown: (e: PointerEvent<HTMLElement>) => {
        if (!e.currentTarget.contains(e.target as Node)) return;
        const interactive = (e.target as HTMLElement).closest("button,a,input,textarea,audio,video,[role=button]");
        if (!enabled || e.pointerType === "mouse" || (interactive && interactive !== e.currentTarget)) return;
        origin.current = { x: e.clientX, y: e.clientY };
        cancel();
        timer.current = setTimeout(() => { held.current = true; }, 330);
      },
      onPointerMove: (e: PointerEvent<HTMLElement>) => {
        if (Math.hypot(e.clientX - origin.current.x, e.clientY - origin.current.y) > 8) cancel();
      },
      onPointerUp: () => {
        if (held.current) {
          suppressedUntil.current = Date.now() + 400;
          onHold();
        }
        cancel();
      },
      onPointerCancel: cancel,
    },
  };
}
