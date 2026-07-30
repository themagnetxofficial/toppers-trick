import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    globals: true,
    // Run each test file in isolation so mocks don't leak
    isolate: true,
    // Increase timeout for routes that do async processing
    testTimeout: 15_000,
  },
});
