import { renderIcon } from "@/lib/icon-image";

export const dynamic = "force-static";

export function generateStaticParams() {
  return [{ size: "192" }, { size: "512" }, { size: "maskable-512" }];
}

export async function GET(_req: Request, { params }: { params: Promise<{ size: string }> }) {
  const { size } = await params;
  if (size === "maskable-512") return renderIcon(512, { padding: 96 });
  const px = Number(size) === 192 ? 192 : 512;
  return renderIcon(px);
}
