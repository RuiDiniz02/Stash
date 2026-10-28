"use client";

import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "./dialog";
import { Button } from "./button";

interface ConfirmOptions {
  title: string;
  description?: string;
  confirmLabel?: string;
  destructive?: boolean;
}

type Pending = ConfirmOptions & { resolve: (ok: boolean) => void };
let setPendingGlobal: ((p: Pending | null) => void) | null = null;

/** Imperative confirmation dialog: `if (await confirm({...})) …` */
export function confirm(options: ConfirmOptions): Promise<boolean> {
  return new Promise((resolve) => {
    if (!setPendingGlobal) return resolve(window.confirm(options.title));
    setPendingGlobal({ ...options, resolve });
  });
}

export function ConfirmHost() {
  const [pending, setPending] = useState<Pending | null>(null);

  useEffect(() => {
    setPendingGlobal = setPending;
    return () => {
      setPendingGlobal = null;
    };
  }, []);

  const close = (ok: boolean) => {
    pending?.resolve(ok);
    setPending(null);
  };

  return (
    <Dialog open={!!pending} onOpenChange={(o) => !o && close(false)}>
      <DialogContent hideClose className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>{pending?.title}</DialogTitle>
          {pending?.description && <DialogDescription>{pending.description}</DialogDescription>}
        </DialogHeader>
        <DialogFooter>
          <Button variant="ghost" onClick={() => close(false)}>
            Cancel
          </Button>
          <Button variant={pending?.destructive ? "destructive" : "default"} onClick={() => close(true)} autoFocus>
            {pending?.confirmLabel ?? "Confirm"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
