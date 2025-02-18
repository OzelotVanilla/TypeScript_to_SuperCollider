import type { Options } from "tsup";
import { fixImportsPlugin } from "esbuild-fix-imports-plugin";

const tsup_config: Options = {
    splitting: true,
    clean: true,
    dts: true,
    format: ["esm", "cjs"],
    bundle: false,
    treeshake: true,
    skipNodeModulesBundle: true,
    target: "esnext",
    outDir: "dist",
    entry: ["src/prelude.ts", "!src/global.d.ts", "src/**/*.ts"],
    esbuildPlugins: [fixImportsPlugin()]
};

export default tsup_config