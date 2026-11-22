import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    include: ["tests/**/*.test.ts"],
    // DB and Cloudinary are mocked, no .env needed
    env: {
      JWT_SECRET: "test-secret",
      ALLOWED_ORIGINS: "http://localhost:5173",
      LOG_LEVEL: "silent",
    },
  },
});
