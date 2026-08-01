import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
  },
  resolve: {
    alias: {
      // The real `obsidian` package is types only — the app injects the
      // implementation — so importing a value from it fails to resolve under
      // vitest. Point at a stub for the handful of values the plugin needs.
      obsidian: fileURLToPath(new URL("./tests/stubs/obsidian.ts", import.meta.url)),
    },
  },
});
