import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

// React's test utilities require the development bundle even when the shell
// that launched Vitest exports NODE_ENV=production.
process.env.NODE_ENV = "test";

export default defineConfig({
  plugins: [react()],
  test: {
    include: ["src/**/*.test.{ts,tsx}"],
    environment: "jsdom",
    setupFiles: ["./src/test/setup.ts"],
    css: false,
    clearMocks: true,
  },
});
