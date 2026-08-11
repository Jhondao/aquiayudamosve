import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    // Integration tests share one MySQL DB — no parallel workers to avoid
    // cross-test interference (rate-limit counters, unique-email races).
    fileParallelism: false,
    testTimeout: 15000,
    hookTimeout: 15000,
  },
});
