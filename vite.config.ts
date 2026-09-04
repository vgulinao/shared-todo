import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// The React app lives in client/; the build lands in dist/client, served by the Node server.
// In development Vite serves the client and proxies API and WebSocket traffic to the server.
export default defineConfig({
  root: "client",
  plugins: [react()],
  build: {
    outDir: "../dist/client",
    emptyOutDir: true,
  },
  server: {
    port: 5173,
    proxy: {
      "/api": "http://localhost:3000",
      "/ws": { target: "ws://localhost:3000", ws: true },
    },
  },
});
