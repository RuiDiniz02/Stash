import {
  Book,
  Bookmark,
  Briefcase,
  Camera,
  Code,
  Film,
  Folder,
  Globe,
  Heart,
  House,
  Lightbulb,
  Music,
  Palette,
  Plane,
  ShoppingBag,
  Sparkles,
  SquareCheck,
  Star,
  Utensils,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";

export const COLLECTION_ICONS: Record<string, LucideIcon> = {
  folder: Folder,
  camera: Camera,
  film: Film,
  palette: Palette,
  briefcase: Briefcase,
  plane: Plane,
  lightbulb: Lightbulb,
  "check-square": SquareCheck,
  globe: Globe,
  heart: Heart,
  book: Book,
  music: Music,
  star: Star,
  home: House,
  code: Code,
  "shopping-bag": ShoppingBag,
  utensils: Utensils,
  sparkles: Sparkles,
  bookmark: Bookmark,
};

export const COLLECTION_COLORS: Record<string, number> = {
  indigo: 268,
  blue: 245,
  teal: 190,
  green: 150,
  amber: 75,
  orange: 45,
  rose: 10,
  violet: 300,
  gray: -1,
};

export function collectionTint(color: string | null | undefined) {
  const hue = COLLECTION_COLORS[color ?? "gray"] ?? -1;
  if (hue < 0) return { color: "var(--muted-foreground)", background: "var(--muted)" };
  return { color: `oklch(0.6 0.16 ${hue})`, background: `oklch(0.6 0.16 ${hue} / 0.13)` };
}

export function CollectionIcon({
  icon,
  color,
  size = "md",
  className,
}: {
  icon: string | null | undefined;
  color: string | null | undefined;
  size?: "sm" | "md" | "lg";
  className?: string;
}) {
  const Icon = COLLECTION_ICONS[icon ?? "folder"] ?? Folder;
  return (
    <span
      style={collectionTint(color)}
      className={cn(
        "grid shrink-0 place-items-center",
        size === "sm" && "size-5 rounded-md [&_svg]:size-3",
        size === "md" && "size-8 rounded-lg [&_svg]:size-4",
        size === "lg" && "size-11 rounded-xl [&_svg]:size-5",
        className,
      )}
      aria-hidden
    >
      <Icon />
    </span>
  );
}
