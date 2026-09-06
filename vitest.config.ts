import { defineConfig } from "vitest/config";

// Tests run in Node by default. Client tests that need a DOM opt in per file with
// a `// @vitest-environment jsdom` comment.
export default defineConfig({
  // Component tests use JSX without importing React.
  esbuild: { jsx: "automatic" },
  test: {
    include: ["**/*.test.ts", "**/*.test.tsx"],
    exclude: ["node_modules", "dist"],
    passWithNoTests: true,
  },
});
