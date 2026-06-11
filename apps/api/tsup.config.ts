import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm"],
  target: "node18",
  outDir: "dist",
  splitting: false,
  // Bundle workspace packages so Node never sees a .ts import at runtime
  noExternal: ["@pint-points/shared"],
});
