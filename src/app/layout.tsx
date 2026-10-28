import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { Providers } from "@/components/providers";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin", "latin-ext"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: { default: "Stash", template: "%s · Stash" },
  description: "Capture anything. Organize later. Find it instantly on every device.",
  applicationName: "Stash",
  appleWebApp: { capable: true, title: "Stash", statusBarStyle: "default" },
  formatDetection: { telephone: false },
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#fcfcfd" },
    { media: "(prefers-color-scheme: dark)", color: "#16171b" },
  ],
};

// Applies the saved accent colour before first paint to avoid a flash.
const accentScript = `try{var a=localStorage.getItem('stash-accent');if(a)document.documentElement.dataset.accent=a}catch(e){}`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" data-accent="indigo" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: accentScript }} />
      </head>
      <body className={`${geistSans.variable} ${geistMono.variable} min-h-dvh antialiased`}>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
