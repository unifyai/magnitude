// Removed React import
import logger from '@/logger';
import { AgentError, TestCaseAgent, AgentStateTracker, Magnus } from 'magnitude-core';
import type { AgentState, ExecutorClient, PlannerClient, FailureDescriptor, TestCaseAgentOptions, StepDescriptor } from 'magnitude-core';
import { CategorizedTestCases, TestFunctionContext, TestRunnable } from '@/discovery/types';
// Removed App import from '@/app'
import { AllTestStates, TestState } from '@/term-app/types'; // Import types from term-app
import { getUniqueTestId } from '@/term-app/util'; // Import util from term-app
import { Browser, BrowserContext, BrowserContextOptions, chromium, LaunchOptions, Page } from 'playwright';
import { describeModel, sendTelemetry } from '../util';
import { WorkerPool } from './workerPool';

// Removed RerenderFunction type

// Define types for the term-app functions (can be refined if needed)
type UpdateUIFunction = (tests: CategorizedTestCases, testStates: AllTestStates) => void;
type CleanupUIFunction = () => void;


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
    private updateUI: UpdateUIFunction; // Changed from rerender
    private cleanupUI: CleanupUIFunction; // Changed from unmount

    constructor(
        config: Required<TestRunnerConfig>,
        tests: CategorizedTestCases,
        testStates: AllTestStates,
        updateUI: UpdateUIFunction,   // Changed parameter name and type
        cleanupUI: CleanupUIFunction, // Changed parameter name and type
    ) {
        this.config = config;
        this.tests = tests;
        this.testStates = testStates;
        this.updateUI = updateUI;     // Assign updateUI
        this.cleanupUI = cleanupUI;   // Assign cleanupUI
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
            // Update internal reference
            this.testStates = nextTestStates;
            // Call updateUI with the tests structure and the new states
            this.updateUI(this.tests, nextTestStates);
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

        const agent = new TestCaseAgent({
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

            const context: TestFunctionContext = {
                ai: new Magnus(agent),
                get page(): Page {
                    return agent.getPage();
                },
                get context(): BrowserContext {
                    return agent.getContext();
                }
            }
            await test.fn(context);

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
            // If agent failure, update UI with it, including final steps/checks
            failed = true;
            const finalStateWithFailure = stateTracker.getState();
            this.updateStateAndRender(testId, {
                status: 'failed',
                failure: finalStateWithFailure.failure,
                stepsAndChecks: finalStateWithFailure.stepsAndChecks // Include final steps/checks
            });
        }

        if (!failed) {
            // Test passed, update UI including final steps/checks
            const finalStatePassed = stateTracker.getState();
            this.updateStateAndRender(testId, {
                status: 'passed',
                stepsAndChecks: finalStatePassed.stepsAndChecks // Include final steps/checks
            });
        }

        try {
            await agent.close();
        } catch (closeErr: unknown) {
            logger.warn(`Error during agent.close for ${testId}: ${closeErr}`);
        }

        // Send basic telemetry
        const state = stateTracker.getState();
        const numSteps = state.stepsAndChecks.filter(item => item.variant === 'step').length;
        const numChecks = state.stepsAndChecks.filter(item => item.variant === 'check').length;
        const actionCount = state.stepsAndChecks
            .filter((item): item is StepDescriptor => item.variant === 'step')
            .reduce((sum, step) => sum + step.actions.length, 0);

        await sendTelemetry({
            startedAt: state.startedAt ?? Date.now(),
            doneAt: Date.now(),
            macroUsage: state.macroUsage,
            microUsage: state.microUsage,
            cached: state.cached ?? false,
            testCase: {
                numChecks: numChecks,
                numSteps: numSteps,
            },
            actionCount: actionCount,
            result: state.failure ? state.failure.variant : 'passed'
        })

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
                logger.info(poolResult.results, `Test run aborted early due to failure.`);
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
            // No need to restore cursor visibility here, term-app handles it
            // process.stdout.write('\x1B[?25h');
            this.cleanupUI(); // Call the cleanup function
            process.exit(poolResult.completed ? 0 : 1);
        }
    }
}
