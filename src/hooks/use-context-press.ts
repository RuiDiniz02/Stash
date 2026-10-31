"use client";

import { useEffect, useRef, type PointerEvent } from "react";

/** Touch hold opens actions; moving cancels so ordinary scrolling stays native. */
export function useContextPress(onOpen: () => void, enabled = true) {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const origin = useRef({ x: 0, y: 0 });
  const suppressedUntil = useRef(0);
  const cancel = () => { if (timer.current) clearTimeout(timer.current); timer.current = null; };
  useEffect(() => cancel, []);
  return {
    suppressClick: () => Date.now() < suppressedUntil.current,
    handlers: {
      onPointerDown: (e: PointerEvent<HTMLElement>) => {
        const interactive = (e.target as HTMLElement).closest("button,a,input,textarea,audio,video");
        if (!enabled || e.pointerType === "mouse" || (interactive && interactive !== e.currentTarget)) return;
        origin.current = { x: e.clientX, y: e.clientY };
        cancel();
        timer.current = setTimeout(() => { suppressedUntil.current = Date.now() + 700; onOpen(); }, 450);
      },
      onPointerMove: (e: PointerEvent<HTMLElement>) => {
        if (Math.hypot(e.clientX - origin.current.x, e.clientY - origin.current.y) > 8) cancel();
      },
      onPointerUp: cancel,
      onPointerCancel: cancel,
    },
  };
}
