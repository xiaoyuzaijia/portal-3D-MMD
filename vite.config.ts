import { defineConfig } from "vite";

export default defineConfig({
  base: "/portal-3D-MMD/",
  server: {
    port: 5173,
    open: true,
  },
  build: {
    target: "ES2022",
  },
});
