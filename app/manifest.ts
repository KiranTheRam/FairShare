import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "FairShare — Household expenses",
    short_name: "FairShare",
    description: "Shared household bills and balances, made clear.",
    start_url: "/",
    display: "standalone",
    background_color: "#f6f7f4",
    theme_color: "#176b5b",
    orientation: "portrait-primary",
    categories: ["finance", "utilities", "productivity"],
    icons: [{ src: "/favicon.svg", sizes: "any", type: "image/svg+xml", purpose: "any maskable" }],
    shortcuts: [
      { name: "Add a bill", short_name: "Add bill", url: "/?action=bill" },
      { name: "Record payment", short_name: "Payment", url: "/?action=payment" },
    ],
  };
}
