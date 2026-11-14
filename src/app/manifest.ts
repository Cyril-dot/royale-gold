import type { MetadataRoute } from "next";

// PWA manifest — Royale Gold installs as a standalone app on the phone.
// Icons live in /public/icons so the manifest can point at stable URLs
// (the app/icon.png convention is served at /icon, which is not a stable
// manifest path). Maskable variants keep the crown inside Android's 80%
// safe zone.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Royale Gold",
    short_name: "Royale Gold",
    description: "Royale Gold — 46 games. Cash in GH₵, coins for play.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#070812",
    theme_color: "#070812",
    icons: [
      {
        src: "/icons/icon-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icons/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icons/icon-192-maskable.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "maskable",
      },
      {
        src: "/icons/icon-512-maskable.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
