import { defineConfig } from "vite";

// base só na build (publicação no GitHub Pages em /<repo>/);
// dev e preview locais ficam em "/" pra não atrapalhar.
export default defineConfig(({ command }) => ({
  base: command === "build" ? "/gamedev-01-hello-world/" : "/",
  server: { port: 5173, open: true },
  build: { target: "es2020" },
}));
