import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "FairShare — Household expenses",
    short_name: "FairShare",
    description: "Shared household bills and balances, made clear.",
    start_url: "/",
    display: "standalone",
    background_color: "#06110e",
    theme_color: "#08110e",
    orientation: "portrait-primary",
    categories: ["finance", "utilities", "productivity"],
    icons: [
      { src: "/app-icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/app-icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/app-icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    shortcuts: [
      { name: "Add a bill", short_name: "Add bill", url: "/?action=bill" },
      { name: "Record payment", short_name: "Payment", url: "/?action=payment" },
    ],
  };
}
