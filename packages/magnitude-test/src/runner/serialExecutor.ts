import React from 'react';
import { Magnus, logger as coreLogger } from 'magnitude-core';
import { CategorizedTestCases, TestRunnable } from '@/discovery/types';
import { AllTestStates, TestState, App } from '@/app'; // Assuming App is needed for rerender type
import { getUniqueTestId } from '@/app/util';
import { MagnitudeConfig } from '@/discovery/types'; // Needed for rerender call

// Define the type for the rerender function more accurately
type RerenderFunction = (node: React.ReactElement<any, string | React.JSXElementConstructor<any>>) => void;

export class SerialTestExecutor {
    private tests: CategorizedTestCases;
    private magnus: Magnus;
    private testStates: AllTestStates; // Use original name, state is passed in
    private rerender: RerenderFunction;
    private unmount: () => void;
    private config: Required<MagnitudeConfig>;

    constructor(
        tests: CategorizedTestCases,
        magnus: Magnus,
        testStates: AllTestStates, // Accept state object
        rerender: RerenderFunction,
        unmount: () => void,
        config: Required<MagnitudeConfig>
    ) {
        this.tests = tests;
        this.magnus = magnus;
        this.testStates = testStates; // Store reference to shared state
        this.rerender = rerender;
        this.unmount = unmount;
        this.config = config;
        // No internal state initialization or getInitialStates needed
    }

    // Helper function to update state and rerender (uses shared state)
    private updateStateAndRender(testId: string, newState: Partial<TestState>) {
        if (this.testStates[testId]) { // Use this.testStates
            // Merge new state into the existing state for the test
            this.testStates[testId] = { ...this.testStates[testId], ...newState }; // Use this.testStates
            // Re-render the App with the *entire updated state object*
            this.rerender(
                React.createElement(App, {
                    config: this.config, // Use stored config
                    tests: this.tests,
                    initialTestStates: this.testStates // Use this.testStates
                })
            );
        } else {
            coreLogger.warn(`Attempted to update state for unknown testId: ${testId}`); // Keep using coreLogger
        }
    }

    // Private helper to execute a single test
    private async _executeTest(test: TestRunnable, testId: string): Promise<{ success: boolean }> {
        const startTime = Date.now();
        let intervalId: NodeJS.Timeout | null = null;
        let status: 'completed' | 'error' = 'completed';
        let error: Error | undefined;

        try {
            // Set state to running and start timer interval
            this.updateStateAndRender(testId, { status: 'running', startTime, elapsedTime: 0, duration: undefined, error: undefined });
            intervalId = setInterval(() => {
                this.updateStateAndRender(testId, { elapsedTime: Date.now() - startTime });
            }, 100);

            // Execute the actual test function
            await test.fn({ ai: this.magnus });

        } catch (e) {
            status = 'error';
            error = e instanceof Error ? e : new Error(String(e));
            coreLogger.error(`Error in test ${testId}:`, error);
        } finally {
            // Clear interval and update final state
            if (intervalId) clearInterval(intervalId);
            const duration = Date.now() - startTime;
            this.updateStateAndRender(testId, { status, duration, error, elapsedTime: undefined });
        }
        return { success: status === 'completed' };
    }


    async run(): Promise<void> {
        let hasErrors = false;

        try {
            for (const filepath of Object.keys(this.tests)) {
                const { ungrouped, groups } = this.tests[filepath];

                // --- Run Ungrouped Tests ---
                for (const test of ungrouped) {
                    const testId = getUniqueTestId(filepath, null, test.title);
                    const result = await this._executeTest(test, testId);
                    if (!result.success) hasErrors = true;
                }

                // --- Run Grouped Tests ---
                for (const groupName of Object.keys(groups)) {
                    for (const test of groups[groupName]) {
                        const testId = getUniqueTestId(filepath, groupName, test.title);
                        const result = await this._executeTest(test, testId);
                        if (!result.success) hasErrors = true;
                    }
                }
            }
        } catch (executionError) {
            // Catch errors in the main loop orchestration (less likely now)
            coreLogger.error('Unhandled error during test execution loop:', executionError);
            hasErrors = true;
        } finally {
            // Ensure cursor is visible before exiting
            process.stdout.write('\x1B[?25h');
            this.unmount();
            process.exit(hasErrors ? 1 : 0);
        }
    }
}
