#!/usr/bin/env node
import { Command } from 'commander';
import path from 'node:path';
import fs from 'node:fs';
import { glob } from 'glob';
//import { Magnitude, TestCase } from '..';
import TestRegistry from '@/discovery/testRegistry';
//import { LocalTestRunner } from '@/runner';
import { TestCompiler } from '@/compiler';
import { MagnitudeConfig } from '@/discovery/types';
//import chalk from 'chalk';
import { discoverTestFiles, findConfig, findProjectRoot, isProjectRoot, readConfig } from '@/discovery/util';
//import { BaseTestRunner, BaseTestRunnerConfig } from './runner/baseRunner';
import { logger as coreLogger } from 'magnitude-core';
import logger from '@/logger';
import { describeModel } from './util';
import * as dotenv from 'dotenv';
import { execSync } from 'node:child_process';
// Removed React import
// Removed App import
// Removed render import
import { TestSuiteRunner, TestSuiteRunnerConfig } from './runner/testSuiteRunner'; // Import the new executor and config
import { TermAppRenderer } from '@/term-app'; // Import TermAppRenderer
//import { initializeTestStates } from './term-app/util';
// Removed import { initializeUI, updateUI, cleanupUI } from '@/term-app';
import { startWebServers, stopWebServers } from './webServer';
import chalk from 'chalk';

interface CliOptions {
    workers?: number;
    plain: boolean;
    debug: boolean;
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

const configTemplate = `import { type MagnitudeConfig } from 'magnitude-test';

// Learn more about configuring Magnitude:
// https://docs.magnitude.run/customizing/configuration

export default {
    url: "http://localhost:5173"
} satisfies MagnitudeConfig;
`;

const exampleTestTemplate = `import { test } from 'magnitude-test';

// Learn more about building test case:
// https://docs.magnitude.run/core-concepts/building-test-cases

const sampleTodos = [
    "Take out the trash",
    "Pay AWS bill",
    "Build more test cases with Magnitude"
];

test('can add and complete todos', { url: 'https://magnitodo.com' }, async (agent) => {
    await agent.act('create 3 todos', { data: sampleTodos.join(', ') });
    await agent.check('should see all 3 todos');
    await agent.act('mark each todo complete');
    await agent.check('says 0 items left');
});
`;

async function initializeProject(force = false, destination = 'tests/magnitude'): Promise<void> {
    /**
     * Initialize magnitude test case files in a node project
     */
    const cwd = process.cwd();
    const isNodeProject = await isProjectRoot(cwd);

    if (!isNodeProject && !force) {
        console.error("Couldn't find package.json in current directory, please initialize Magnitude in a node.js project");
        console.error("To override this check, use --force option");
        process.exit(1);
    }

    console.log(chalk.blueBright(`Initializing Magnitude tests in ${cwd}`));

    // Create directory structure
    const testsDir = path.join(cwd, destination);

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

        console.log(`${chalk.blueBright('✓')} Created Magnitude test directory structure:
    - ${path.relative(cwd, configPath)}
    - ${path.relative(cwd, examplePath)}
  `);

    } catch (error) {
        console.error('Error initializing Magnitude project:', error);
        process.exit(1);
    }

    // Run Playwright installation for Chromium
    console.log(chalk.blueBright('Installing Playwright Chromium...'));
    try {
        execSync('npx playwright install chromium', { stdio: 'inherit' });
        console.log(`${chalk.blueBright('✓')} Playwright Chromium installed successfully`);
    } catch (error) {
        console.error('Error installing Playwright Chromium:', error);
        // Don't exit with error code since the initialization succeeded
        console.log(chalk.blueBright('You may need to manually run: npx playwright install chromium'));
    }

    console.log(`You can now run tests with: ${chalk.blueBright('npx magnitude')}`);
    console.log('Docs:', chalk.blueBright('https://docs.magnitude.run'));
}

const program = new Command();

program
    .name('magnitude')
    .description('Run Magnitude test cases')
    .argument('[filter]', 'glob pattern for test files (quote if contains spaces or wildcards)')
    .option('-w, --workers <number>', 'number of parallel workers for test execution', '1')
    .option('-p, --plain', 'disable pretty output and print lines instead')
    .option('-d, --debug', 'enable debug logs')
    // Changed action signature from (filters, options) to (filter, options)
    .action(async (filter, options: CliOptions) => {
        dotenv.config();
        let logLevel: string;

        if (process.env.MAGNITUDE_LOG_LEVEL) {
            logLevel = process.env.MAGNITUDE_LOG_LEVEL;
        } else if (options.debug) {
            logLevel = 'trace';
        } else if (options.plain) {
            // TODO: have distinct / nicer clean logs for plain output instead of just changing log level
            logLevel = 'info';
        } else {
            logLevel = 'warn';
        }
        coreLogger.level = logLevel;
        logger.level =logLevel;

        const patterns = [
            '!**/node_modules/**',
            '!**/dist/**'
        ];

        if (filter) {
            patterns.push(filter);
        } else {
            // Default pattern if no filter is provided
            patterns.push('**/*.{mag,magnitude}.{js,jsx,ts,tsx}');
        }

        const workerCount = options.workers ? parseInt(options.workers as unknown as string, 10) : 1;
        if (isNaN(workerCount) || workerCount < 1) {
            console.error('Invalid worker count. Using default of 1.');
        }

        const absoluteFilePaths = await discoverTestFiles(patterns);

        if (absoluteFilePaths.length === 0) {
            console.error(`No test files found matching patterns: ${patterns.join(', ')}`);
            process.exit(1);
        }
        // only matters to show file names nicely
        const projectRoot = await findProjectRoot() ?? process.cwd();

        const configPath = findConfig(projectRoot);

        //console.log(configPath)

        const config: MagnitudeConfig = configPath ? await readConfig(configPath) : {};

        //console.log(config)

        const registry = TestRegistry.getInstance();
        registry.setGlobalOptions(config);

        // // If planner not provided, make a choice based on available environment variables
        // if (!config.planner) {
        //     const planner = tryDeriveEnvironmentPlannerClient();
        //     if (!planner) {
        //         // TODO: Should point to docs on configuration
        //         console.error("No planner client configured. Set an appropriate environment variable or configure planner in magnitude.config.ts");
        //         process.exit(1);
        //     }
        //     config.planner = planner;
        // }

        // logger.info({ ...config.planner }, "Planner:");
        // //console.log(magnitudeBlue(`Using planner: ${describeModel(config.planner)}`));

        // // If executor not provided, default to moondream cloud with MOONDREAM_API_KEY
        // if (!config.executor || !config.executor.options || (!config.executor.options.apiKey && !config.executor.options.baseUrl)) {
        //     const apiKey = process.env.MOONDREAM_API_KEY;
        //     if (!apiKey) {
        //         console.error("Missing MOONDREAM_API_KEY, get one at https://moondream.ai/c/cloud/api-keys");
        //         process.exit(1);
        //     }

        //     config.executor = {
        //         provider: 'moondream',
        //         options: {
        //             apiKey
        //             // don't pass base URL, use moondream client default (https://api.moondream.ai/v1)
        //         }
        //     }
        // }

        // logger.info({ ...config.executor }, "Executor:");
        //console.log(magnitudeBlue(`Using executor: ${config.executor.provider}`));

        let webServerProcesses: (import('node:child_process').ChildProcess | null)[] = [];
        if (config.webServer) {
            try {
                webServerProcesses = await startWebServers(config.webServer);
                const cleanup = () => stopWebServers(webServerProcesses);
                process.on('exit', cleanup);
                process.on('SIGINT', () => { cleanup(); process.exit(1); });
            } catch (err) {
                console.error('Error starting web server(s):', err);
                process.exit(1);
            }
        }




        // === Compile test files ===

        for (const filePath of absoluteFilePaths) {
            await registry.loadTestFile(filePath, getRelativePath(projectRoot, filePath));
        }


        // === Run Tests ===

        // console.log("Tests:", registry.getRegisteredTestCases());
        // console.log("Tests:", registry.getFlattenedTestCases());


        // for (const [filename, tests] of Object.entries(registry.getRegisteredTestCases())) {
        //     console.log("file:", filename);
        //     console.log("tests:", tests);
        const tests = registry.getRegisteredTests();

        // --- Initialize State using utility ---
        //const testStates = initializeTestStates(categorizedTests); // Old state init

        const showUI = !options.debug && !options.plain;
        let termAppRenderer: TermAppRenderer | null = null;
        
        if (showUI) {
            termAppRenderer = new TermAppRenderer(config, tests);
        }

        const runnerConfig: TestSuiteRunnerConfig = {
            workerCount: workerCount,
            renderer: termAppRenderer || { // Use TermAppRenderer or a dummy for plain/debug
                onTestStateUpdated: (test, state) => {
                    // Simple console output for plain/debug mode
                    logger.info(`Test: ${test.title} (${test.id})`);
                    logger.info(`  Status: ${state.failure ? 'failed' : (state.doneAt ? 'passed' : (state.startedAt ? 'running' : 'pending'))}`);
                    if (state.failure) {
                        logger.error(`  Failure: ${state.failure.message}`);
                    }
                }
            },
            llm: config.llm,
            grounding: config.grounding,
            browserOptions: config.browser,
            // browserContextOptions: config.browser?.contextOptions ?? {},
            // browserLaunchOptions: config.browser?.launchOptions ?? {},
            telemetry: config.telemetry ?? true
        };

        const testSuiteRunner = new TestSuiteRunner(runnerConfig, tests);

        // --- Start Execution ---
        if (termAppRenderer && termAppRenderer.start) {
            termAppRenderer.start();
        }

        try {
            await testSuiteRunner.runTests();
            // TODO: Determine exit code based on test results if not handled by TestSuiteRunner
        } catch (error) {
            logger.error("Test suite execution failed:", error);
            // process.exit(1); // Consider exiting based on error
        } finally {
            if (termAppRenderer && termAppRenderer.stop) {
                termAppRenderer.stop();
            }
            // stopWebServers is handled by process.on('exit') and SIGINT
            // The process will exit naturally after this, or TestSuiteRunner might exit.
            // If TestSuiteRunner doesn't exit, and we need to based on results:
            // const allPassed = ... (check results from TestSuiteRunner if it returns them)
            // process.exit(allPassed ? 0 : 1);
        }
    });

program
    .command('init')
    .description('Initialize Magnitude test directory structure')
    .option('-f, --force', 'force initialization even if no package.json is found')
    .option('--dir, --destination <path>', 'destination directory for Magnitude tests', 'tests/magnitude')
    .action(async (options) => {
        await initializeProject(options.force, options.destination);
    });

program.parse();
