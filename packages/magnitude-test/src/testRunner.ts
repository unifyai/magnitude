import React from 'react';
import logger from '@/logger';
import { AgentState, AgentStateTracker, ExecutorClient, Magnus, PlannerClient } from 'magnitude-core';
import { CategorizedTestCases, TestRunnable } from '@/discovery/types';
import { AllTestStates, TestState, App } from '@/app';
import { getUniqueTestId } from '@/app/util';
import { MagnitudeConfig } from '@/discovery/types';
import { Browser, BrowserContextOptions, chromium, LaunchOptions } from 'playwright';
import { describeModel } from './util';

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
    //private config: Required<MagnitudeConfig>;

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

    private async runTest(browser: Browser, test: TestRunnable, testId: string): Promise<{ success: boolean }> {
        const agent = new Magnus({
            planner: this.config.planner,
            executor: this.config.executor,
            browserContextOptions: this.config.browserContextOptions
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

        // try {
        //     await agent.start(browser, test.url);
        // } catch (error) {
        //     failed = true;
        //     this.updateStateAndRender(testId, {
        //         status: 'failed',
        //         failure: {
        //             variant: 'network',
        //             message: (error as Error).message
        //         }
        //     });
        // }
        
        // test
        //stateTracker.getEvents().on('update', (state) => console.log(`State updated for ${test.title}:`, state));

        //stateTracker.getEvents()
        //const testStatus: 'pending' | 'running' | 'passed' | 'failed' = 'running';

        

        

        try {
            await agent.start(browser, test.url);
            await test.fn({ ai: agent });
        } catch (e) {
            // Either an unhandled error in agent or error in test writer custom code
            // TODO: find a way to separate ideally - unknown for unknown agent code, custom for error in custom code
            // add catchalls to inner funcs of agent?
            failed = true;
            this.updateStateAndRender(testId, {
                status: 'failed',
                // override the agent failure with one with the thrown message for custom code error
                failure: {
                    variant: 'unknown',
                    message: (e as Error).message
                }
            });
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

        console.log("failed?", failed);

        // TODO: Use this state instead of existing stupid state stuff in tsx

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

        // Cleanup
        await agent.close();

        return { success: !failed };
    }


    async runTests(): Promise<void> {
        const browser = await chromium.launch({ headless: false, args: ['--disable-gpu'], ...this.config.browserLaunchOptions });
        
        let hasErrors = false;

        try {
            for (const filepath of Object.keys(this.tests)) {
                const { ungrouped, groups } = this.tests[filepath];

                for (const test of ungrouped) {
                    const testId = getUniqueTestId(filepath, null, test.title);
                    const result = await this.runTest(browser, test, testId);
                    if (!result.success) hasErrors = true;
                }

                for (const groupName of Object.keys(groups)) {
                    for (const test of groups[groupName]) {
                        const testId = getUniqueTestId(filepath, groupName, test.title);
                        const result = await this.runTest(browser, test, testId);
                        if (!result.success) hasErrors = true;
                    }
                }
            }
        } catch (executionError) {
            logger.error(executionError, 'Unhandled error during test execution loop:');
            hasErrors = true;
        } finally {
            await browser.close();
            process.stdout.write('\x1B[?25h');
            this.unmount();
            process.exit(hasErrors ? 1 : 0);
        }
    }
}
