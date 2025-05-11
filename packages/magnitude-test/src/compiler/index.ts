import { mkdirSync, existsSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve, basename } from "node:path";
import { build, BuildOptions } from "esbuild";
//import { ConfigError } from "@/utils/errors";

export class TestCompiler {
    private cacheDir: string;
    private defaultOptions: BuildOptions = {
        format: "esm",
        platform: "node",
        target: "node18",
        sourcemap: true,
        bundle: true,
        external: [
            //"magnitude-ts",
            //"magnitude-test",
            "node:fs",
            "node:path",
            "node:os",
            "node:util",
            "node:events",
            "node:stream",
            "node:assert",
            "node:url",
            "node:crypto",
            "node:buffer",
            "node:querystring",
            "node:fsevents",
            //"@boundaryml/baml/*",
        ],
        alias: {
            "fs": "node:fs"
        },
        banner: {
            js: `
        import { fileURLToPath as __magCompileFileURLToPath } from 'node:url';
        import { dirname as __magCompileDirname } from 'node:path';
        import { createRequire as __magCompileCreateRequire } from 'node:module';

        const __filename = __magCompileFileURLToPath(import.meta.url);
        const __dirname = __magCompileDirname(__filename);
        const require = __magCompileCreateRequire(import.meta.url);
      `,
        },
    };

    constructor() {
        this.cacheDir = join(tmpdir(), "magnitude-cache");
        if (!existsSync(this.cacheDir)) {
            mkdirSync(this.cacheDir, { recursive: true });
        }
    }

    async compileFile(filePath: string): Promise<string> {
        const fileName = basename(filePath).replace(".ts", ".mjs");
        const outputPath = join(this.cacheDir, fileName);

        const packageJson = {
            type: "module",
            //   imports: {
            //     "magnitude-ts": "magnitude-ts"//resolve(process.cwd(), "src/index.ts"),//"packages/magnitude-ts/src/index.ts"),
            //   },
        };
        writeFileSync(
            join(this.cacheDir, "package.json"),
            JSON.stringify(packageJson),
        );
        //console.log("cache dir:", this.cacheDir);

        await build({
            ...this.defaultOptions,
            entryPoints: [filePath],
            outfile: outputPath,
            //   alias: {
            //     "magnitude-ts": "magnitude-ts"//resolve(process.cwd(), "src/index.ts")//"packages/magnitude-ts/src/index.ts"),
            //   },
            resolveExtensions: [".ts", ".js", ".mjs"],
            banner: {
                js: `
          import { fileURLToPath as __magCompileFileURLToPath } from 'node:url';
          import { dirname as __magCompileDirname } from 'node:path';
          import { createRequire as __magCompileCreateRequire } from 'node:module';

          const __filename = __magCompileFileURLToPath(import.meta.url);
          const __dirname = __magCompileDirname(__filename);
          const require = __magCompileCreateRequire(import.meta.url);
        `,
            },
        });

        return outputPath;
    }
}