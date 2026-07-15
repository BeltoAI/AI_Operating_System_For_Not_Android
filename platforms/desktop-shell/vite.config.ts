import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

export default defineConfig(() => {
  const nativeBundle = process.env.SLYOS_NATIVE_BUNDLE === "1";
  const sqlWasmModuleId = "virtual:slyos-sql-wasm";
  const resolvedSqlWasmModuleId = `\0${sqlWasmModuleId}`;

  return {
    plugins: [
      {
        name: "slyos-sql-wasm",
        resolveId(id) {
          return id === sqlWasmModuleId ? resolvedSqlWasmModuleId : null;
        },
        load(id) {
          if (id !== resolvedSqlWasmModuleId) return null;
          if (!nativeBundle) return 'import url from "sql.js/dist/sql-wasm.wasm?url"; export default url;';
          const wasmPath = fileURLToPath(new URL("../../node_modules/sql.js/dist/sql-wasm.wasm", import.meta.url));
          const dataUrl = `data:application/wasm;base64,${readFileSync(wasmPath).toString("base64")}`;
          return `export default ${JSON.stringify(dataUrl)};`;
        }
      }
    ],
    resolve: {
      alias: {
        "@badscientist/agent-core": fileURLToPath(new URL("../../shared/agent-core/src/index.ts", import.meta.url))
      }
    },
    build: nativeBundle
      ? {
          rolldownOptions: {
            output: {
              codeSplitting: false
            }
          }
        }
      : undefined
  };
});
