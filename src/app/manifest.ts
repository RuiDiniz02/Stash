import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "Stash",
    short_name: "Stash",
    description: "Capture anything. Organize later. Find it instantly on every device.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "any",
    background_color: "#fcfcfd",
    theme_color: "#fcfcfd",
    categories: ["productivity", "utilities"],
    icons: [
      { src: "/icons/192", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/512", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/maskable-512", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    shortcuts: [
      { name: "New capture", short_name: "Capture", url: "/?capture=1" },
      { name: "Search", url: "/search" },
      { name: "Calendar", url: "/calendar" },
    ],
    // Android/Chromium only: lets Stash appear in the system share sheet once installed.
    share_target: {
      action: "/share-target",
      method: "post",
      enctype: "multipart/form-data",
      params: {
        title: "title",
        text: "text",
        url: "url",
        files: [{ name: "files", accept: ["image/*", "video/*", "audio/*", "application/pdf", "text/*", "*/*"] }],
      },
    },
  };
}
