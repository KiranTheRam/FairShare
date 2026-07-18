import type { Metadata, Viewport } from "next";
import { connection } from "next/server";
import { ServiceWorkerRegistration } from "./service-worker-registration";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL(process.env.APP_ORIGIN ?? "http://localhost:3000"),
  title: { default: "FairShare — Household expenses", template: "%s · FairShare" },
  description: "Shared household bills and balances, made clear.",
  applicationName: "FairShare",
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, statusBarStyle: "default", title: "FairShare" },
  formatDetection: { telephone: false },
  robots: { index: false, follow: false, noarchive: true, noimageindex: true },
  icons: {
    icon: [
      { url: "/app-icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/app-icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    shortcut: "/app-icon-192.png",
    apple: [{ url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
  },
  openGraph: {
    title: "FairShare",
    description: "Shared household bills, made clear.",
    type: "website",
    url: "/",
    images: [{ url: "/og-dark.png", width: 1536, height: 1024, alt: "FairShare household expense dashboard in dark mode" }],
  },
  twitter: { card: "summary_large_image", title: "FairShare", description: "Shared household bills, made clear.", images: ["/og-dark.png"] },
};

export const viewport: Viewport = {
  themeColor: "#08110e",
  colorScheme: "dark light",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  await connection();
  return <html lang="en" data-theme="light" suppressHydrationWarning><body>{children}<ServiceWorkerRegistration /></body></html>;
}
