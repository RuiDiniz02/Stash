"use client";

import * as React from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

export const Dialog = DialogPrimitive.Root;
export const DialogTrigger = DialogPrimitive.Trigger;
export const DialogClose = DialogPrimitive.Close;

function Overlay({ className, ...props }: React.ComponentProps<typeof DialogPrimitive.Overlay>) {
  return (
    <DialogPrimitive.Overlay
      className={cn(
        "fixed inset-0 z-50 bg-black/40 backdrop-blur-[2px] data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=closed]:animate-out data-[state=closed]:fade-out-0",
        className,
      )}
      {...props}
    />
  );
}

interface ContentProps extends React.ComponentProps<typeof DialogPrimitive.Content> {
  hideClose?: boolean;
  /** "center" dialog on desktop that becomes a bottom sheet on mobile; "right" side panel; "full" covers the screen. */
  variant?: "center" | "right" | "full";
  overlayClassName?: string;
}

export function DialogContent({ className, children, hideClose, variant = "center", overlayClassName, ...props }: ContentProps) {
  return (
    <DialogPrimitive.Portal>
      <Overlay className={overlayClassName} />
      <DialogPrimitive.Content
        className={cn(
          "fixed z-50 flex min-w-0 max-w-full flex-col bg-popover text-foreground shadow-float outline-none",
          variant === "center" &&
            "inset-x-0 bottom-0 max-h-[92dvh] rounded-t-2xl border-t pb-safe data-[state=open]:animate-in data-[state=open]:slide-in-from-bottom data-[state=closed]:animate-out data-[state=closed]:slide-out-to-bottom sm:inset-x-auto sm:bottom-auto sm:top-[12vh] sm:left-1/2 sm:w-full sm:max-w-lg sm:-translate-x-1/2 sm:rounded-2xl sm:border sm:pb-0 sm:data-[state=open]:slide-in-from-bottom-0 sm:data-[state=open]:zoom-in-95 sm:data-[state=closed]:zoom-out-95 sm:data-[state=closed]:slide-out-to-bottom-0",
          variant === "right" &&
            "inset-0 sm:inset-y-0 sm:left-auto sm:right-0 sm:w-[min(480px,100vw)] sm:border-l data-[state=open]:animate-in data-[state=open]:slide-in-from-right data-[state=closed]:animate-out data-[state=closed]:slide-out-to-right duration-200",
          variant === "full" && "inset-0 bg-black/95 data-[state=open]:animate-in data-[state=open]:fade-in-0",
          className,
        )}
        {...props}
      >
        {children}
        {!hideClose && (
          <DialogPrimitive.Close
            className="absolute top-3 right-3 rounded-md p-1.5 text-muted-foreground transition hover:bg-accent hover:text-foreground"
            aria-label="Close"
          >
            <X className="size-4" />
          </DialogPrimitive.Close>
        )}
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  );
}

export function DialogHeader({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("flex flex-col gap-1 px-5 pt-5 pb-3", className)} {...props} />;
}

export function DialogFooter({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("flex items-center justify-end gap-2 px-5 pt-3 pb-5", className)} {...props} />;
}

export function DialogTitle({ className, ...props }: React.ComponentProps<typeof DialogPrimitive.Title>) {
  return <DialogPrimitive.Title className={cn("text-[17px] font-semibold tracking-tight", className)} {...props} />;
}

export function DialogDescription({ className, ...props }: React.ComponentProps<typeof DialogPrimitive.Description>) {
  return <DialogPrimitive.Description className={cn("text-sm text-muted-foreground", className)} {...props} />;
}

/** Drag handle shown at the top of mobile bottom sheets. */
export function SheetHandle() {
  return <div aria-hidden className="mx-auto mt-2 h-1 w-9 rounded-full bg-border sm:hidden" />;
}
