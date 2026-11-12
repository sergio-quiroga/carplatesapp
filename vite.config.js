import { defineConfig } from "vite";

export default defineConfig({
  // Relative asset URLs, so the build also works when opened from the app bundle.
  base: "./",
  build: {
    outDir: "dist",
    // Same minimum as the Xcode project (iOS 15). The checked-option
    // highlight uses CSS :has(), which only shows from iOS 15.4 on.
    target: ["safari15", "es2020"],
  },
  test: {
    include: ["tests/unit/**/*.test.js"],
  },
});
