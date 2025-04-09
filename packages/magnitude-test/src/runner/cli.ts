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
import { BaseTestRunner, BaseTestRunnerConfig } from './baseRunner';
import { RemoteTestRunner } from './remoteRunner';
import { logger as remoteLogger } from 'magnitude-remote';
import { logger as coreLogger } from 'magnitude-core';

interface CliOptions {
    workers?: number;
    local: boolean;
    plain: boolean;
    tunnel: boolean;
    remote: string;
    key: string;
}

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

const configTemplate = `import { defineConfig } from 'magnitude-test';

export default defineConfig({
    baseUrl: "localhost:5173"
});
`;

const exampleTestTemplate = `import { test } from 'magnitude-test';

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
    //.option('-r, --remote <auto|true|false>', 'whether to run tests remotely or locally (remote requires Magnitude API key, local requires additional setup)', 'auto')
    .option('-p, --plain', 'disable pretty output and use logs')
    .option('-l, --local', 'run agent locally (requires Playwright and LLM provider configuration)')
    .option('-t, --tunnel', '(remote mode only) force enable HTTP tunneling regardless of whether target URL appears local/private')
    .option('-r, --remote <url>', 'specify a custom remote runner')
    .option('-k, --key <apiKey>', 'provide API key')
    .action(async (filters, options: CliOptions) => {
        if (!options.plain) {
            remoteLogger.level = 'silent';
            coreLogger.level = 'silent';
        }

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

        const useRemote = !options.local;
        const customRemoteUrl = options.remote;

        let runner: BaseTestRunner;

        const runnerConfig: BaseTestRunnerConfig = {
            workerCount: workerCount,
            prettyDisplay: !options.plain,
            //forceUseTunnel: options.tunnel
        };

        if (useRemote) {
            if (!customRemoteUrl) {
                // Get API key
                const apiKey = options.key || process.env.MAGNITUDE_API_KEY || config.apiKey || null;
                
                if (!apiKey) {
                    console.error("Missing API key! Either set env var MAGNITUDE_API_KEY or assign apiKey in magnitude.config.ts");
                    process.exit(1);
                }

                runner = new RemoteTestRunner(
                    { ...runnerConfig, apiKey, forceUseTunnel: options.tunnel }
                );
            } else {
                // If custom remote, try read API key if provided
                const apiKey = options.key || process.env.MAGNITUDE_API_KEY || config.apiKey || null;
                // Remote server may or may not actually require API key depending on configuration (if observer)
                runner = new RemoteTestRunner(
                    { ...runnerConfig, apiKey, remoteRunnerUrl: customRemoteUrl, forceUseTunnel: options.tunnel, }
                );
            }
        } else {
            runner = new LocalTestRunner(runnerConfig);
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
