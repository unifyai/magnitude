import { mkdirSync, existsSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join, resolve, basename } from "path";
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
            "fs",
            "path",
            "os",
            "util",
            "events",
            "stream",
            "assert",
            "url",
            "crypto",
            "buffer",
            "querystring",
            "fsevents",
            //"@boundaryml/baml/*",
        ],
        banner: {
            js: `
        import { fileURLToPath } from 'url';
        import { dirname } from 'path';
        import { createRequire } from 'module';

        const __filename = fileURLToPath(import.meta.url);
        const __dirname = dirname(__filename);
        const require = createRequire(import.meta.url);
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
          import { fileURLToPath } from 'url';
          import { dirname } from 'path';
          import { createRequire } from 'module';

          const __filename = fileURLToPath(import.meta.url);
          const __dirname = dirname(__filename);
          const require = createRequire(import.meta.url);
        `,
            },
        });

        return outputPath;
    }
}