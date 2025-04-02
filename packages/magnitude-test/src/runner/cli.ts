#!/usr/bin/env node
import { Command } from 'commander';
import path from 'path';
import fs from 'fs';
import { glob } from 'glob';
//import { Magnitude, TestCase } from '..';
import TestRegistry from '@/discovery/testRegistry';
import { LocalTestRunner } from '@/runner';
import { TestCompiler } from '@/compiler';
import { TestGlobalConfig } from '@/discovery/types';
//import chalk from 'chalk';
import { magnitudeBlue, brightMagnitudeBlue } from '@/renderer/colors';
import { discoverTestFiles, findConfig, findProjectRoot, readConfig } from '@/discovery/util';
import { BaseTestRunner } from './baseRunner';
import { RemoteTestRunner } from './remoteRunner';
import { RemoteTestCaseAgent } from 'magnitude-remote';

interface CliOptions {
    workers?: number;
    //local: boolean;
    remote: 'auto' | 'true' | 'false';
}


// async function discoverTestFiles(patterns: string[], cwd: string = process.cwd()): Promise<string[]> {
//     console.log(`Searching for test files matching patterns: ${patterns.join(', ')}`);

//     try {
//         // Use glob to find files matching all patterns
//         const allFiles: string[] = [];

//         for (const pattern of patterns) {
//             const files = await glob(pattern, { cwd });
//             allFiles.push(...files);
//         }

//         // Remove duplicates (in case files match multiple patterns)
//         const uniqueFiles = [...new Set(allFiles)];

//         if (uniqueFiles.length === 0) {
//             console.log(`No test files found matching patterns: ${patterns.join(', ')}`);
//         } else {
//             console.log(`Found ${uniqueFiles.length} unique test file(s)`);
//         }

//         return uniqueFiles.map(file => path.resolve(cwd, file));
//     } catch (error) {
//         console.error('Error discovering test files:', error);
//         return [];
//     }
// }

function getRelativePath(projectRoot: string, absolutePath: string): string {
    // Ensure both paths are absolute and normalized
    const normalizedAbsolutePath = path.normalize(absolutePath);
    const normalizedProjectRoot = path.normalize(projectRoot);

    // Check if the path is inside the project root
    if (!normalizedAbsolutePath.startsWith(normalizedProjectRoot)) {
        // If the path is not within the project root, return the original path
        return absolutePath;
    }

    return path.relative(normalizedProjectRoot, normalizedAbsolutePath);
}

// async function registerTestFile(registry: TestRegistry, projectRoot: string, absolutePath: string) {
//     const relativePath = getRelativePath(projectRoot, absolutePath);

//     registry.setCurrentFilePath(relativePath);

//     // Execute test file to register it
//     try {
//         // Convert file path to module path
//         const modulePath = `file://${absolutePath}`;

//         // Dynamically import the test file
//         await import(modulePath);
//         console.log(`Loaded test file: ${relativePath}`);
//     } catch (error) {
//         console.error(`Failed to load test file ${relativePath}:`, error);
//     }

//     registry.unsetCurrentFilePath();
// }

// function findConfig(searchRoot: string): string | null {
//     try {
//         // Use glob to find the first magnitude.config.ts file
//         // Excluding node_modules and dist directories
//         const configFiles = glob.sync('**/magnitude.config.ts', {
//             cwd: searchRoot,
//             ignore: ['**/node_modules/**', '**/dist/**'],
//             absolute: true
//         });

//         return configFiles.length > 0 ? configFiles[0] : null;
//     } catch (error) {
//         console.error('Error finding config file:', error);
//         return null;
//     }
// }

// async function readConfig(configPath: string): Promise<any> {
//     try {
//         const compiler = new TestCompiler();

//         // Use the compiler to transform the TypeScript config file
//         const compiledPath = await compiler.compileFile(configPath);

//         // Import the compiled module
//         const configModule = await import(`file://${compiledPath}`);

//         // Extract the default export
//         const config = configModule.default;

//         return config;
//     } catch (error) {
//         console.error(`Error reading config from ${configPath}:`, error);
//         return null;
//     }
// }

const configTemplate = `import { defineConfig } from 'magnitude-ts';

export default defineConfig({
    baseUrl: "localhost:5173"
});
`;

const exampleTestTemplate = `import { test } from 'magnitude-ts';

// Example URL override, defaults to configured baseUrl
test('can login with valid credentials', { url: "https://qa-bench.com" })
    .step('Log in to the app')
        .data({ username: "test-user@magnitude.run" }) // arbitrary key/values
        .secureData({ password: "test" }) // sensitive data
        .check('Can see dashboard') // natural language assertion
    .step('Create a new company')
        .data("Make up the first 2 values and use defaults for the rest")
        .check("Company added successfully");
`;

async function initializeProject(): Promise<void> {
    // Find project root (or use current directory as fallback)
    const projectRoot = await findProjectRoot();

    if (!projectRoot) {
        console.error("Couldn't find package.json, please initialize Magnitude in a node.js project");
        process.exit(1);
    }

    console.log(magnitudeBlue(`Initializing Magnitude tests in ${projectRoot}`));

    // Create directory structure
    const testsDir = path.join(projectRoot, 'tests', 'magnitude');

    const configPath = path.join(testsDir, 'magnitude.config.ts');

    if (fs.existsSync(configPath)) {
        console.error("Already initialized, magnitude.config.ts already exists!");
        process.exit(1);
    }

    try {
        // Create directories recursively
        await fs.promises.mkdir(testsDir, { recursive: true });

        // Create config file
        await fs.promises.writeFile(configPath, configTemplate);

        // Create example test file
        const examplePath = path.join(testsDir, 'example.mag.ts');
        await fs.promises.writeFile(examplePath, exampleTestTemplate);

        console.log(`${brightMagnitudeBlue('✓')} Created Magnitude test directory structure:
    - ${path.relative(projectRoot, configPath)}
    - ${path.relative(projectRoot, examplePath)}
  `);
        console.log(`You can now run tests with: ${brightMagnitudeBlue('magnitude')}`);
        console.log('Docs:', brightMagnitudeBlue('https://docs.magnitude.run'));

    } catch (error) {
        console.error('Error initializing Magnitude project:', error);
        process.exit(1);
    }
}

const program = new Command();

program
    .name('magnitude')
    .description('Run Magnitude test cases')
    .argument('[...filters]', 'glob patterns for test files')
    .option('-w, --workers <number>', 'number of parallel workers for test execution', '1')
    .option('-r, --remote <auto|true|false>', 'whether to run tests remotely or locally (remote requires Magnitude API key, local requires additional setup)', 'auto')
    //.option('-l', '--local', 'run agent locally (requires Playwright and LLM provider configuration)')
    .action(async (filters, options: CliOptions) => {
        // tmp
        // console.log("client starting")
        // const agent = new RemoteTestCaseAgent({ listeners: [{
        //     onActionTaken(action) { console.log("Did action:", action) }
        // }]});

        // const exampleTestCase = {
        //     url: "https://qa-bench.com",
        //     steps: [
        //         {
        //             description: "Log in",
        //             checks: ["Can see dashboard"],
        //             testData: {
        //                 data: [
        //                     { key: "username", value: "test-user@magnitude.run", sensitive: false },
        //                     { key: "password", value: "test", sensitive: true },
        //                 ] 
        //             }
        //         },
        //         // // BOTH parts of this one will fail: it doesnt yet know what company form looks like
        //         // { description: "Create an example company", checks: ["Example company exists"], testData: {} } // THIS will fail without check adaptation
        //     ]
        // };

        // const result = await agent.run(exampleTestCase);
        // console.log("client done");
        // console.log("Test result:", result);

        // process.exit(0);
        // ^^ tmp

        
        //const patterns = [];
        const patterns = [
            '!**/node_modules/**',
            '!**/dist/**'
        ];

        // Add direct arguments (filters)
        if (filters && filters.length > 0) {
            patterns.push(...filters);
        } else {
            patterns.push('**/*.{mag,magnitude}.{js,jsx,ts,tsx}',)
        }

        // Parse worker count
        const workerCount = options.workers ? parseInt(options.workers as unknown as string, 10) : 1;

        // Validate worker count
        if (isNaN(workerCount) || workerCount < 1) {
            console.error('Invalid worker count. Using default of 1.');
        }

        const absoluteFilePaths = await discoverTestFiles(patterns);
        // only matters to show file names nicely
        const projectRoot = await findProjectRoot() ?? process.cwd();

        const configPath = findConfig(projectRoot);

        //console.log(configPath)

        const config: TestGlobalConfig = configPath ? await readConfig(configPath) : {};

        //console.log(config)

        const registry = TestRegistry.getInstance();
        registry.setGlobalOptions(config);

        const useRemote = options.remote === 'true' || (options.remote === 'auto' && (process.env.MAGNITUDE_API_KEY || config.apiKey));

        // TODO: Use local or remote runner
        // if (options.local) {
        //     const { TestCaseAgent } = await import('magnitude-core');
        // }
        let runner: BaseTestRunner;

        if (useRemote) {
            console.log("using remote runner")
            runner = new RemoteTestRunner(workerCount);
        } else {
            console.log("using local runner")
            runner = new LocalTestRunner(workerCount);
        }

        // Create test runner with worker count
        //const runner = new LocalTestRunner(workerCount);

        // if (workerCount > 1) {
        //     console.log(`Running tests with ${workerCount} parallel workers`);
        // }

        for (const filePath of absoluteFilePaths) {
            await runner.loadTestFile(filePath, getRelativePath(projectRoot, filePath));
        }

        const success = await runner.runTests();

        if (!success) {
            console.error('Tests failed');
            process.exit(1);
        } else {
            //console.log('All tests passed');
            process.exit(0);
        }
    });

program
    .command('init')
    .description('Initialize Magnitude test directory structure')
    .action(async () => {
        await initializeProject();
    });

program.parse();
