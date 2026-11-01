// The web build: react and tailwind plugins, the two import aliases and the dev server.
import { fileURLToPath } from "node:url";

import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// A path below this file, resolved for the alias map.
const r = (p: string) => fileURLToPath(new URL(p, import.meta.url));

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@web": r("./web"),
      "@shared": r("./shared"),
    },
  },
  server: {
    // `true` = 0.0.0.0. Vite binds localhost by default, so a phone on the same
    // network reaches the dev server over the address of the machine.
    host: true,
    port: 5173,
    proxy: {
      // Forward API calls to the Bun server during development.
      "/api": "http://0.0.0.0:5174",
    },
  },
});
