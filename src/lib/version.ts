/** App version from package.json (injected at build time in next.config.ts). Bump it there. */
export const APP_VERSION = process.env.NEXT_PUBLIC_APP_VERSION ?? "0.0.0";

/** Short label shown in the UI, e.g. "v1.0". */
export const VERSION_LABEL = `v${APP_VERSION.split(".").slice(0, 2).join(".")}`;
