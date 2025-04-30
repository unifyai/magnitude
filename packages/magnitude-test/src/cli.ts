#!/usr/bin/env node
import { Command } from 'commander';
import path from 'path';
import fs from 'fs';
import { glob } from 'glob';
//import { Magnitude, TestCase } from '..';
import TestRegistry from '@/discovery/testRegistry';
//import { LocalTestRunner } from '@/runner';
import { TestCompiler } from '@/compiler';
import { MagnitudeConfig } from '@/discovery/types';
//import chalk from 'chalk';
import { magnitudeBlue, brightMagnitudeBlue } from '@/renderer/colors';
import { discoverTestFiles, findConfig, findProjectRoot, isProjectRoot, readConfig } from '@/discovery/util';
//import { BaseTestRunner, BaseTestRunnerConfig } from './runner/baseRunner';
import { logger as coreLogger, Magnus } from 'magnitude-core';
import logger from '@/logger';
import { describeModel, tryDeriveEnvironmentPlannerClient } from './util';
import * as dotenv from 'dotenv';
import { execSync } from 'child_process';
import React from 'react';
import { App, AllTestStates, TestState } from './app'; // Import state types
import { getUniqueTestId } from './app/util'; // Import ID generator
import { render } from 'ink';

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

test('can add and complete todos', { url: 'https://magnitodo.com' })
    .step('create 3 todos')
        .data(sampleTodos.join(", "))
        .check('should see all 3 todos')
    .step('mark each todo complete')
        .check('says 0 items left')
`;

async function initializeProject(): Promise<void> {
    /**
     * Initialize magnitude test case files in a node project
     */
    const cwd = process.cwd();
    const isNodeProject = await isProjectRoot(cwd);

    if (!isNodeProject) {
        console.error("Couldn't find package.json in current directory, please initialize Magnitude in a node.js project");
        process.exit(1);
    }

    console.log(magnitudeBlue(`Initializing Magnitude tests in ${cwd}`));

    // Create directory structure
    const testsDir = path.join(cwd, 'tests', 'magnitude');

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
    - ${path.relative(cwd, configPath)}
    - ${path.relative(cwd, examplePath)}
  `);

    } catch (error) {
        console.error('Error initializing Magnitude project:', error);
        process.exit(1);
    }

    // Run Playwright installation for Chromium
    console.log(magnitudeBlue('Installing Playwright Chromium...'));
    try {
        execSync('npx playwright install chromium', { stdio: 'inherit' });
        console.log(`${brightMagnitudeBlue('✓')} Playwright Chromium installed successfully`);
    } catch (error) {
        console.error('Error installing Playwright Chromium:', error);
        // Don't exit with error code since the initialization succeeded
        console.log(magnitudeBlue('You may need to manually run: npx playwright install chromium'));
    }

    console.log(`You can now run tests with: ${brightMagnitudeBlue('npx magnitude')}`);
    console.log('Docs:', brightMagnitudeBlue('https://docs.magnitude.run'));
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
        if (options.debug) {
            logLevel = 'trace';
        } else if (options.plain) {
            // TODO: have distinct / nicer clean logs for plain output instead of just changing log level
            logLevel = 'info';
        } else {
            logLevel = 'silent';
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
        // only matters to show file names nicely
        const projectRoot = await findProjectRoot() ?? process.cwd();

        const configPath = findConfig(projectRoot);

        //console.log(configPath)

        const config: MagnitudeConfig = configPath ? await readConfig(configPath) : {};

        //console.log(config)

        const registry = TestRegistry.getInstance();
        registry.setGlobalOptions(config);

        // If planner not provided, make a choice based on available environment variables
        if (!config.planner) {
            const planner = tryDeriveEnvironmentPlannerClient();
            if (!planner) {
                // TODO: Should point to docs on configuration
                console.error("No planner client configured. Set an appropriate environment variable or configure planner in magnitude.config.ts");
                process.exit(1);
            }
            config.planner = planner;
        }

        logger.info({ ...config.planner }, "Planner:");
        //console.log(magnitudeBlue(`Using planner: ${describeModel(config.planner)}`));
        
        // If executor not provided, default to moondream cloud with MOONDREAM_API_KEY
        if (!config.executor || !config.executor.options || (!config.executor.options.apiKey && !config.executor.options.baseUrl)) {
            const apiKey = process.env.MOONDREAM_API_KEY;
            if (!apiKey) {
                console.error("Missing MOONDREAM_API_KEY, get one at https://moondream.ai/c/cloud/api-keys");
                process.exit(1);
            }
            
            config.executor = {
                provider: 'moondream',
                options: {
                    apiKey
                    // don't pass base URL, use moondream client default (https://api.moondream.ai/v1)
                }
            }
        }

        logger.info({ ...config.executor }, "Executor:");
        //console.log(magnitudeBlue(`Using executor: ${config.executor.provider}`));





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
        const categorizedTests = registry.getRegisteredTestCases();

        // --- Initialize State ---
        const uiTestStates: AllTestStates = {};
        for (const filepath of Object.keys(categorizedTests)) {
            const { ungrouped, groups } = categorizedTests[filepath];
            ungrouped.forEach(test => {
                const testId = getUniqueTestId(filepath, null, test.title);
                uiTestStates[testId] = { status: 'pending' };
            });
            Object.entries(groups).forEach(([groupName, groupTests]) => {
                groupTests.forEach(test => {
                    const testId = getUniqueTestId(filepath, groupName, test.title);
                    uiTestStates[testId] = { status: 'pending' };
                });
            });
        }

        // --- Instantiate Magnus ---
        // Adjusting based on TS error: Expected 0 arguments, but got 1.
        const magnus = new Magnus(); 

        // --- Render Initial UI ---
        const { rerender, waitUntilExit, unmount } = render(
            React.createElement(App, {
                config: config as Required<MagnitudeConfig>,
                tests: categorizedTests,
                initialTestStates: uiTestStates // Pass initial state
            })
        ); // <-- Add missing semicolon here
        // --- Run Tests Serially ---
        const runTests = async () => {
            let currentTestInterval: NodeJS.Timeout | null = null;
            let hasErrors = false;

            // Helper function to update state and rerender
            const updateStateAndRender = (testId: string, newState: Partial<TestState>) => {
                if (uiTestStates[testId]) {
                    uiTestStates[testId] = { ...uiTestStates[testId], ...newState };
                    // Re-render the App with the updated state object
                    rerender(
                        React.createElement(App, {
                            config: config as Required<MagnitudeConfig>,
                            tests: categorizedTests,
                            initialTestStates: uiTestStates
                        })
                    );
                } else {
                    logger.warn(`Attempted to update state for unknown testId: ${testId}`);
                }
            };

            try {
                for (const filepath of Object.keys(categorizedTests)) {
                    const { ungrouped, groups } = categorizedTests[filepath];

                    // --- Run Ungrouped Tests ---
                    for (const test of ungrouped) {
                        const testId = getUniqueTestId(filepath, null, test.title);
                        const startTime = Date.now();

                        // Clear previous interval if any
                        if (currentTestInterval) clearInterval(currentTestInterval);

                        // Set state to running, update UI
                        updateStateAndRender(testId, { status: 'running', startTime, elapsedTime: 0, duration: undefined, error: undefined });

                        // Start timer updates for this test
                        currentTestInterval = setInterval(() => {
                            updateStateAndRender(testId, { elapsedTime: Date.now() - startTime });
                        }, 100); // Update elapsed time every 100ms

                        let status: 'completed' | 'error' = 'completed';
                        let error: Error | undefined;
                        try {
                            await test.fn({ ai: magnus });
                        } catch (e) {
                            status = 'error';
                            error = e instanceof Error ? e : new Error(String(e));
                            hasErrors = true;
                            logger.error(`Error in test ${testId}:`, error);
                        } finally {
                            if (currentTestInterval) clearInterval(currentTestInterval);
                            currentTestInterval = null;
                            const duration = Date.now() - startTime;
                            updateStateAndRender(testId, { status, duration, error, elapsedTime: undefined });
                        }
                    }

                    // --- Run Grouped Tests ---
                    for (const groupName of Object.keys(groups)) {
                        for (const test of groups[groupName]) {
                            const testId = getUniqueTestId(filepath, groupName, test.title);
                            const startTime = Date.now();

                            if (currentTestInterval) clearInterval(currentTestInterval);
                            updateStateAndRender(testId, { status: 'running', startTime, elapsedTime: 0, duration: undefined, error: undefined });

                            currentTestInterval = setInterval(() => {
                                updateStateAndRender(testId, { elapsedTime: Date.now() - startTime });
                            }, 100);

                            let status: 'completed' | 'error' = 'completed';
                            let error: Error | undefined;
                            try {
                                await test.fn({ ai: magnus });
                            } catch (e) {
                                status = 'error';
                                error = e instanceof Error ? e : new Error(String(e));
                                hasErrors = true;
                                logger.error(`Error in test ${testId}:`, error);
                            } finally {
                                if (currentTestInterval) clearInterval(currentTestInterval);
                                currentTestInterval = null;
                                const duration = Date.now() - startTime;
                                updateStateAndRender(testId, { status, duration, error, elapsedTime: undefined });
                            }
                        }
                    }
                }
            } catch (executionError) {
                // Catch errors in the execution loop itself (less likely)
                logger.error('Unhandled error during test execution loop:', executionError);
                hasErrors = true; // Mark as error if loop fails
            } finally {
                 // Ensure the last interval is cleared
                if (currentTestInterval) clearInterval(currentTestInterval);
                // Unmount the Ink app cleanly
                unmount();
                // Exit with appropriate code
                process.exit(hasErrors ? 1 : 0);
            }
        };

        // Start the execution process
        runTests();

        // Note: We removed await waitUntilExit() because runTests now controls the exit.
        // The Ink app will stay rendered until unmount() is called in runTests' finally block.







        // let runner: BaseTestRunner;

        // const browserContextOptions = config.browser?.contextOptions ?? {};

        // const runnerConfig: BaseTestRunnerConfig = {
        //     workerCount: workerCount,
        //     //printLogs: options.plain,
        //     prettyDisplay: !(options.plain || options.debug),
        //     planner: config.planner,
        //     executor: config.executor,
        //     browserContextOptions: browserContextOptions,
        //     telemetry: config.telemetry ?? true
        // };

        // runner = new LocalTestRunner(runnerConfig);

        // for (const filePath of absoluteFilePaths) {
        //     await runner.loadTestFile(filePath, getRelativePath(projectRoot, filePath));
        // }

        // try {
        //     const success = await runner.runTests();

        //     if (!success) {
        //         console.error('Tests failed');
        //         process.exit(1);
        //     } else {
        //         //console.log('All tests passed');
        //         process.exit(0);
        //     }

        // } catch (error) {
        //     // e.g. URL check fails
        //     console.error((error as Error).message);
        //     process.exit(1)
        // }
    });

program
    .command('init')
    .description('Initialize Magnitude test directory structure')
    .action(async () => {
        await initializeProject();
    });

program.parse();
