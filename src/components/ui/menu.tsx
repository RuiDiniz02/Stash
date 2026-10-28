"use client";

import * as React from "react";
import * as Menu from "@radix-ui/react-dropdown-menu";
import * as PopoverPrimitive from "@radix-ui/react-popover";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

export const DropdownMenu = Menu.Root;
export const DropdownMenuTrigger = Menu.Trigger;
export const DropdownMenuSub = Menu.Sub;

const surface =
  "z-50 min-w-48 overflow-hidden rounded-xl border bg-popover p-1 text-foreground shadow-float data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95";

export function DropdownMenuContent({ className, sideOffset = 6, ...props }: React.ComponentProps<typeof Menu.Content>) {
  return (
    <Menu.Portal>
      <Menu.Content sideOffset={sideOffset} className={cn(surface, className)} {...props} />
    </Menu.Portal>
  );
}

const itemClass =
  "relative flex cursor-default select-none items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm outline-none transition-colors data-[highlighted]:bg-accent data-[disabled]:opacity-50 [&_svg]:size-4 [&_svg]:text-muted-foreground";

export function DropdownMenuItem({
  className,
  destructive,
  ...props
}: React.ComponentProps<typeof Menu.Item> & { destructive?: boolean }) {
  return (
    <Menu.Item
      className={cn(itemClass, destructive && "text-destructive [&_svg]:text-destructive", className)}
      {...props}
    />
  );
}

export function DropdownMenuCheckboxItem({ className, children, checked, ...props }: React.ComponentProps<typeof Menu.CheckboxItem>) {
  return (
    <Menu.CheckboxItem className={cn(itemClass, "pr-8", className)} checked={checked} {...props}>
      {children}
      <Menu.ItemIndicator className="absolute right-2.5">
        <Check className="text-primary!" />
      </Menu.ItemIndicator>
    </Menu.CheckboxItem>
  );
}

export function DropdownMenuSubTrigger({ className, ...props }: React.ComponentProps<typeof Menu.SubTrigger>) {
  return <Menu.SubTrigger className={cn(itemClass, "data-[state=open]:bg-accent", className)} {...props} />;
}

export function DropdownMenuSubContent({ className, ...props }: React.ComponentProps<typeof Menu.SubContent>) {
  return (
    <Menu.Portal>
      <Menu.SubContent className={cn(surface, "max-h-80 overflow-y-auto", className)} {...props} />
    </Menu.Portal>
  );
}

export function DropdownMenuSeparator({ className, ...props }: React.ComponentProps<typeof Menu.Separator>) {
  return <Menu.Separator className={cn("-mx-1 my-1 h-px bg-border", className)} {...props} />;
}

export function DropdownMenuLabel({ className, ...props }: React.ComponentProps<typeof Menu.Label>) {
  return <Menu.Label className={cn("px-2.5 py-1.5 text-xs font-medium text-muted-foreground", className)} {...props} />;
}

export const Popover = PopoverPrimitive.Root;
export const PopoverTrigger = PopoverPrimitive.Trigger;
export const PopoverAnchor = PopoverPrimitive.Anchor;

export function PopoverContent({ className, sideOffset = 6, align = "start", ...props }: React.ComponentProps<typeof PopoverPrimitive.Content>) {
  return (
    <PopoverPrimitive.Portal>
      <PopoverPrimitive.Content sideOffset={sideOffset} align={align} className={cn(surface, "p-2", className)} {...props} />
    </PopoverPrimitive.Portal>
  );
}
