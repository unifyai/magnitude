import React from 'react';
import logger from '@/logger';
import { Magnus } from 'magnitude-core';
import { CategorizedTestCases, TestRunnable } from '@/discovery/types';
import { AllTestStates, TestState, App } from '@/app';
import { getUniqueTestId } from '@/app/util';
import { MagnitudeConfig } from '@/discovery/types';

type RerenderFunction = (node: React.ReactElement<any, string | React.JSXElementConstructor<any>>) => void;

export class TestRunner {
    private tests: CategorizedTestCases;
    private testStates: AllTestStates;
    private rerender: RerenderFunction;
    private unmount: () => void;
    private config: Required<MagnitudeConfig>;

    constructor(
        tests: CategorizedTestCases,
        testStates: AllTestStates,
        rerender: RerenderFunction,
        unmount: () => void,
        config: Required<MagnitudeConfig>
    ) {
        this.tests = tests;
        this.testStates = testStates;
        this.rerender = rerender;
        this.unmount = unmount;
        this.config = config;
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
                    config: this.config,
                    tests: this.tests,
                    initialTestStates: nextTestStates // Pass the new object
                })
            );
        } else {
            logger.warn(`Attempted to update state for unknown testId: ${testId}`);
        }
    }

    private async runTest(test: TestRunnable, testId: string): Promise<{ success: boolean }> {
        const startTime = Date.now();
        let status: 'completed' | 'error' = 'completed';
        let error: Error | undefined;

        try {
            this.updateStateAndRender(testId, { status: 'running', startTime });
            await test.fn({ ai: new Magnus() });
        } catch (e) {
            status = 'error';
            error = e instanceof Error ? e : new Error(String(e));
            logger.error(`Error in test ${testId}:`, error);
        } finally {
            const duration = Date.now() - startTime;
            this.updateStateAndRender(testId, { status, duration, error });
        }
        return { success: status === 'completed' };
    }


    async runTests(): Promise<void> {
        let hasErrors = false;

        try {
            for (const filepath of Object.keys(this.tests)) {
                const { ungrouped, groups } = this.tests[filepath];

                for (const test of ungrouped) {
                    const testId = getUniqueTestId(filepath, null, test.title);
                    const result = await this.runTest(test, testId);
                    if (!result.success) hasErrors = true;
                }

                for (const groupName of Object.keys(groups)) {
                    for (const test of groups[groupName]) {
                        const testId = getUniqueTestId(filepath, groupName, test.title);
                        const result = await this.runTest(test, testId);
                        if (!result.success) hasErrors = true;
                    }
                }
            }
        } catch (executionError) {
            logger.error('Unhandled error during test execution loop:', executionError);
            hasErrors = true;
        } finally {
            process.stdout.write('\x1B[?25h');
            this.unmount();
            process.exit(hasErrors ? 1 : 0);
        }
    }
}
