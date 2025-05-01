import React from 'react';
import logger from '@/logger';
import { ExecutorClient, Magnus, PlannerClient } from 'magnitude-core';
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
        await agent.start(browser, test.url);

        const startTime = Date.now();
        let status: 'completed' | 'error' = 'completed';
        let error: Error | undefined;

        try {
            this.updateStateAndRender(testId, { status: 'running', startTime });
            await test.fn({ ai: agent });
        } catch (e) {
            status = 'error';
            error = e instanceof Error ? e : new Error(String(e));
            logger.error(`Error in test ${testId}:`, error);
        } finally {
            const duration = Date.now() - startTime;
            this.updateStateAndRender(testId, { status, duration, error });
        }

        // Cleanup
        await agent.close();


        return { success: status === 'completed' };
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
            logger.error('Unhandled error during test execution loop:', executionError);
            hasErrors = true;
        } finally {
            await browser.close();
            process.stdout.write('\x1B[?25h');
            this.unmount();
            process.exit(hasErrors ? 1 : 0);
        }
    }
}
