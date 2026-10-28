import { renderIcon } from "@/lib/icon-image";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

// iOS applies its own rounded mask, so the apple icon is a full square.
export default function AppleIcon() {
  return renderIcon(180, { rounded: false });
}
