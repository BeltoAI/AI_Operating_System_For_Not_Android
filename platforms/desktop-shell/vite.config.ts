import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

export default defineConfig({
  resolve: {
    alias: {
      "@badscientist/agent-core": fileURLToPath(new URL("../../shared/agent-core/src/index.ts", import.meta.url))
    }
  }
});
