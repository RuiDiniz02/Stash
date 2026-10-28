import * as React from "react";
import { cn } from "@/lib/utils";

export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  ({ className, type = "text", ...props }, ref) => (
    <input
      ref={ref}
      type={type}
      className={cn(
        "flex h-10 w-full min-w-0 rounded-lg border border-input bg-card px-3 text-[15px] transition-[border-color,box-shadow] outline-none placeholder:text-muted-foreground/70 focus-visible:border-primary/60 focus-visible:ring-3 focus-visible:ring-primary/15 focus-visible:outline-none disabled:opacity-50 aria-invalid:border-destructive sm:text-sm",
        className,
      )}
      {...props}
    />
  ),
);
Input.displayName = "Input";

export const Textarea = React.forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement>>(
  ({ className, ...props }, ref) => (
    <textarea
      ref={ref}
      className={cn(
        "flex min-h-20 w-full rounded-lg border border-input bg-card px-3 py-2.5 text-[15px] outline-none transition-[border-color,box-shadow] placeholder:text-muted-foreground/70 focus-visible:border-primary/60 focus-visible:ring-3 focus-visible:ring-primary/15 focus-visible:outline-none disabled:opacity-50 sm:text-sm",
        className,
      )}
      {...props}
    />
  ),
);
Textarea.displayName = "Textarea";

export function Label({ className, ...props }: React.LabelHTMLAttributes<HTMLLabelElement>) {
  return <label className={cn("text-[13px] font-medium text-muted-foreground", className)} {...props} />;
}
