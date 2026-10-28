import type { AttachmentKind } from "@/lib/types";

export function attachmentKind(mime: string | null | undefined, name = ""): AttachmentKind {
  const m = (mime ?? "").toLowerCase();
  if (m.startsWith("image/")) return "image";
  if (m.startsWith("video/")) return "video";
  if (m.startsWith("audio/")) return "audio";
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  if (["jpg", "jpeg", "png", "gif", "webp", "avif", "heic", "heif"].includes(ext)) return "image";
  if (["mp4", "mov", "webm", "m4v", "mkv"].includes(ext)) return "video";
  if (["mp3", "m4a", "wav", "ogg", "oga", "aac", "flac", "opus"].includes(ext)) return "audio";
  return "file";
}

export function safeFileName(name: string) {
  const dot = name.lastIndexOf(".");
  const base = (dot > 0 ? name.slice(0, dot) : name).normalize("NFKD").replace(/[^\w.-]+/g, "-").replace(/-+/g, "-");
  const ext = dot > 0 ? name.slice(dot + 1).replace(/[^\w]/g, "").slice(0, 10) : "";
  const trimmed = base.replace(/^-|-$/g, "").slice(0, 80) || "file";
  return ext ? `${trimmed}.${ext.toLowerCase()}` : trimmed;
}

export interface PreparedFile {
  file: File;
  kind: AttachmentKind;
  width?: number;
  height?: number;
  duration?: number;
}

const MAX_IMAGE_EDGE = 3200;
const COMPRESSIBLE = ["image/jpeg", "image/png", "image/webp"];

/** Reads dimensions/duration and downsizes very large photos before upload. */
export async function prepareFile(file: File): Promise<PreparedFile> {
  const kind = attachmentKind(file.type, file.name);
  try {
    if (kind === "image") return await prepareImage(file);
    if (kind === "video" || kind === "audio") return await prepareMedia(file, kind);
  } catch {
    // Metadata is best-effort; never block the upload on it.
  }
  return { file, kind };
}

async function prepareImage(file: File): Promise<PreparedFile> {
  if (typeof createImageBitmap !== "function") return { file, kind: "image" };
  const bitmap = await createImageBitmap(file);
  const { width, height } = bitmap;
  const longest = Math.max(width, height);

  if (COMPRESSIBLE.includes(file.type) && (longest > MAX_IMAGE_EDGE || file.size > 8 * 1024 * 1024)) {
    const scale = Math.min(1, MAX_IMAGE_EDGE / longest);
    const w = Math.round(width * scale);
    const h = Math.round(height * scale);
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    canvas.getContext("2d")?.drawImage(bitmap, 0, 0, w, h);
    bitmap.close();
    const type = file.type === "image/png" ? "image/webp" : "image/jpeg";
    const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, type, 0.86));
    if (blob && blob.size < file.size) {
      const ext = type === "image/webp" ? "webp" : "jpg";
      const name = file.name.replace(/\.[^.]+$/, "") + "." + ext;
      return { file: new File([blob], name, { type }), kind: "image", width: w, height: h };
    }
    return { file, kind: "image", width, height };
  }

  bitmap.close();
  return { file, kind: "image", width, height };
}

function prepareMedia(file: File, kind: "video" | "audio"): Promise<PreparedFile> {
  return new Promise((resolve) => {
    const el = document.createElement(kind);
    const src = URL.createObjectURL(file);
    const done = (meta: Partial<PreparedFile>) => {
      URL.revokeObjectURL(src);
      resolve({ file, kind, ...meta });
    };
    const timeout = setTimeout(() => done({}), 4000);
    el.preload = "metadata";
    el.onloadedmetadata = () => {
      clearTimeout(timeout);
      const v = el as HTMLVideoElement;
      done({
        duration: Number.isFinite(el.duration) ? el.duration : undefined,
        width: kind === "video" ? v.videoWidth || undefined : undefined,
        height: kind === "video" ? v.videoHeight || undefined : undefined,
      });
    };
    el.onerror = () => {
      clearTimeout(timeout);
      done({});
    };
    el.src = src;
  });
}
