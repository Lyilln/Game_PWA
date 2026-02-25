import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  base: "./",
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      devOptions: { enabled: false },
      manifest: {
        name: "Game_PWA",
        short_name: "Game_PWA",
        description: "末世戀愛生存互動式小說 PWA（橙光式運作）",
        start_url: "./",
        scope: "./",
        display: "standalone",
        background_color: "#0b0e12",
        theme_color: "#0b0e12",
        icons: [
          { src: "pwa-192.png", sizes: "192x192", type: "image/png" },
          { src: "pwa-512.png", sizes: "512x512", type: "image/png" }
        ]
      }
    })
  ]
});