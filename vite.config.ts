import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { resolve } from "node:path";

// Owlbear Rodeo loads the extension pages in iframes from https://www.owlbear.rodeo,
// so the dev server must allow that origin (CORS) for the manifest and assets.
export default defineConfig({
  plugins: [react()],
  server: {
    cors: { origin: "https://www.owlbear.rodeo" },
  },
  build: {
    rollupOptions: {
      input: {
        // Action popover (main UI)
        main: resolve(__dirname, "index.html"),
        // Background page: registers the context menu
        background: resolve(__dirname, "background.html"),
        // Modal opened from the token context menu to link a sheet
        link: resolve(__dirname, "link.html"),
        // Transparent popover with the 3D dice thrown by players
        dice: resolve(__dirname, "dice.html"),
      },
    },
  },
});
