import React from 'react';
import logger from '@/logger';
// Import specific errors and types from magnitude-core
import { AgentError, Magnus, AgentStateTracker } from 'magnitude-core'; // Remove OperationCancelledError, Import AgentStateTracker correctly
import type { AgentState, ExecutorClient, PlannerClient, FailureDescriptor, MagnusOptions } from 'magnitude-core'; // Import MagnusOptions
import { CategorizedTestCases, TestRunnable } from '@/discovery/types';
import { AllTestStates, TestState, App } from '@/app';
import { getUniqueTestId } from '@/app/util';
import { Browser, BrowserContext, BrowserContextOptions, chromium, LaunchOptions } from 'playwright';
import { describeModel } from './util';
import { WorkerPool } from './runner/workerPool';

type RerenderFunction = (node: React.ReactElement<any, string | React.JSXElementConstructor<any>>) => void;

export interface TestRunnerConfig {
    workerCount: number;
    prettyDisplay: boolean;
    planner: PlannerClient;
    executor: ExecutorClient;
    browserContextOptions: BrowserContextOptions;
    browserLaunchOptions: LaunchOptions;
    telemetry: boolean;
}

export const DEFAULT_CONFIG = {
    workerCount: 1,
    prettyDisplay: true,
    browserContextOptions: {},
    browserLaunchOptions: {},
    telemetry: true,
};

export class TestRunner {
    private config: Required<TestRunnerConfig>;
    private tests: CategorizedTestCases;
    private testStates: AllTestStates;
    private rerender: RerenderFunction;
    private unmount: () => void;

    constructor(
        config: Required<TestRunnerConfig>,
        tests: CategorizedTestCases,
        testStates: AllTestStates,
        rerender: RerenderFunction,
        unmount: () => void,
        //config: Required<MagnitudeConfig>
    ) {
        this.config = config;
        this.tests = tests;
        this.testStates = testStates;
        this.rerender = rerender;
        this.unmount = unmount;
        //this.config = config;
    }

    private updateStateAndRender(testId: string, newState: Partial<TestState>) {
        if (this.testStates[testId]) {
            // Create a new state object for immutability
            const nextTestStates = {
                ...this.testStates,
                [testId]: {
                    ...this.testStates[testId],
                    ...newState
                }
            };
            // Update internal reference (important!)
            this.testStates = nextTestStates;
            // Rerender with the new state object reference
            this.rerender(
                React.createElement(App, {
                    //config: this.config,
                    model: describeModel(this.config.planner),
                    tests: this.tests,
                    testStates: nextTestStates // Pass the new object
                })
            );
        } else {
            logger.warn(`Attempted to update state for unknown testId: ${testId}`);
        }
    }

    /**
     * Runs a single test case.
     * @param context The Playwright BrowserContext to use for this test.
     * @param test The test runnable definition.
     * @param testId The unique ID for this test run.
     * @param browser The Playwright Browser instance.
     * @param test The test runnable definition.
     * @param testId The unique ID for this test run.
     * @param signal The AbortSignal to monitor for cancellation requests.
     * @returns Promise<boolean> True if the test passed or was cancelled cleanly, false if it failed.
     */
    private async runTest(browser: Browser, test: TestRunnable, testId: string, signal: AbortSignal): Promise<boolean> {
        // --- Cancellation Check ---
        if (signal.aborted) {
            this.updateStateAndRender(testId, { status: 'cancelled', failure: { variant: 'cancelled' } });
            logger.debug(`Test ${testId} cancelled before starting.`);
            return true; // Cancelled cleanly is not a failure
        }

        const agent = new Magnus({
            planner: this.config.planner,
            executor: this.config.executor,
            browserContextOptions: this.config.browserContextOptions,
            signal
        });
        const stateTracker = new AgentStateTracker(agent);

        let failed = false;

        stateTracker.getEvents().on('update', (agentState: AgentState) => {
            // Form combined test state
            const testState = {
                status: 'running' as ('pending' | 'running' | 'passed' | 'failed'),
                ...agentState
            };
            this.updateStateAndRender(testId, testState);
        });


        try {
            // todo: maybe display errors for network start differently not as generic/unknown
            await agent.start(browser, test.url);
            await test.fn({ ai: agent });

        } catch (err: unknown) {
            if (err instanceof AgentError) {
                if (err.failure.variant === 'cancelled') {
                    // Operation was cancelled by the signal via AgentError
                    logger.debug(`Test ${testId} cancelled during agent operation`);
                    this.updateStateAndRender(testId, { status: 'cancelled', failure: { variant: 'cancelled' }});
                    return true;
                } else {
                    failed = true;
                    this.updateStateAndRender(testId, {
                        status: 'failed',
                        failure: err.failure
                    });
                }
            } else {
                failed = true;
                this.updateStateAndRender(testId, {
                    status: 'failed',
                    failure: {
                        variant: 'unknown',
                        // Safely access message after checking if err is an Error instance
                        message: err instanceof Error ? err.message : String(err)
                    }
                });
            }
        }

        if (stateTracker.getState().failure) {
            // If agent failure, update UI with it
            failed = true;
            this.updateStateAndRender(testId, {
                status: 'failed',
                failure: stateTracker.getState().failure
            });
        }

        if (!failed) {
            this.updateStateAndRender(testId, {
                status: 'passed'
            });
        }


        // const startTime = Date.now();
        // let status: 'completed' | 'error' = 'completed';
        // let error: Error | undefined;

        // try {
        //     this.updateStateAndRender(testId, { status: 'running', startTime });
        //     await test.fn({ ai: agent });
        // } catch (e) {
        //     status = 'error';
        //     error = e instanceof Error ? e : new Error(String(e));
        //     logger.error(`Error in test ${testId}:`, error);
        // } finally {
        //     this.updateStateAndRender(testId, { status, error });
        // }

        try {
            await agent.close();
        } catch (closeErr: unknown) {
            logger.warn(`Error during agent.close for ${testId}: ${closeErr}`);
        }

        return !failed;
    }


    async runTests(): Promise<void> {
        const browser = await chromium.launch({ headless: false, args: ['--disable-gpu'], ...this.config.browserLaunchOptions });
        const workerPool = new WorkerPool(this.config.workerCount);

        const allTestItems: { test: TestRunnable; testId: string; index: number }[] = [];
        let currentIndex = 0;
        for (const filepath of Object.keys(this.tests)) {
            const { ungrouped, groups } = this.tests[filepath];
            ungrouped.forEach(test => {
                allTestItems.push({ test, testId: getUniqueTestId(filepath, null, test.title), index: currentIndex++ });
            });
            Object.keys(groups).forEach(groupName => {
                groups[groupName].forEach(test => {
                    allTestItems.push({ test, testId: getUniqueTestId(filepath, groupName, test.title), index: currentIndex++ });
                });
            });
        }

        const taskFunctions = allTestItems.map(({ test, testId }) => {
            return async (signal: AbortSignal): Promise<boolean> => {
                try {
                    const success = await this.runTest(browser, test, testId, signal);
                    return success;
                } catch (err: unknown) {
                    logger.error(`Unhandled error during task execution wrapper for ${testId}:`, err);
                    this.updateStateAndRender(testId, { status: 'failed', failure: { variant: 'unknown', message: `${err instanceof Error ? err.message : String(err)}` } });
                    return false;
                }
            };
        });

        let poolResult: { completed: boolean; results: (boolean | undefined)[] } = {
             completed: false,
             results: [],
        };
        try {
            poolResult = await workerPool.runTasks<boolean>(taskFunctions, (result) => result === false);

            if (!poolResult.completed) {
                logger.info(`Test run aborted early due to failure.`);
                poolResult.results.forEach((result, index) => {
                    if (result === undefined) {
                        const { testId } = allTestItems[index];
                        if (this.testStates[testId]?.status !== 'failed') {
                             this.updateStateAndRender(testId, { status: 'cancelled' });
                             logger.debug(`Test ${testId} marked as cancelled post-run due to abort.`);
                        }
                    }
                });
            }

        } catch (poolError: unknown) {
            logger.error(poolError, 'Unhandled error during worker pool execution:');
            poolResult = { completed: false, results: [] };
        } finally {
            await browser.close();
            process.stdout.write('\x1B[?25h');
            this.unmount();
            process.exit(poolResult.completed ? 0 : 1);
        }
    }
}
