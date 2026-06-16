import { defineConfig } from "vitest/config";
export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: ["tests/**/*.test.ts"],
    // Per-worker DB setup to prevent cross-worker FK race conditions
    cache: false,
    setupFiles: ["./vitest.setup.ts"],
  },
});
