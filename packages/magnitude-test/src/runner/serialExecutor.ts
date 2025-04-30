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

    async run(): Promise<void> {
        let currentTestInterval: NodeJS.Timeout | null = null;
        let hasErrors = false;

        try {
            for (const filepath of Object.keys(this.tests)) {
                const { ungrouped, groups } = this.tests[filepath];

                // --- Run Ungrouped Tests ---
                for (const test of ungrouped) {
                    const testId = getUniqueTestId(filepath, null, test.title);
                    const startTime = Date.now();

                    if (currentTestInterval) clearInterval(currentTestInterval);
                    this.updateStateAndRender(testId, { status: 'running', startTime, elapsedTime: 0, duration: undefined, error: undefined });

                    currentTestInterval = setInterval(() => {
                        this.updateStateAndRender(testId, { elapsedTime: Date.now() - startTime });
                    }, 100);

                    let status: 'completed' | 'error' = 'completed';
                    let error: Error | undefined;
                    try {
                        await test.fn({ ai: this.magnus });
                    } catch (e) {
                        status = 'error';
                        error = e instanceof Error ? e : new Error(String(e));
                        hasErrors = true;
                        coreLogger.error(`Error in test ${testId}:`, error);
                    } finally {
                        if (currentTestInterval) clearInterval(currentTestInterval);
                        currentTestInterval = null;
                        const duration = Date.now() - startTime;
                        this.updateStateAndRender(testId, { status, duration, error, elapsedTime: undefined });
                    }
                }

                // --- Run Grouped Tests ---
                for (const groupName of Object.keys(groups)) {
                    for (const test of groups[groupName]) {
                        const testId = getUniqueTestId(filepath, groupName, test.title);
                        const startTime = Date.now();

                        if (currentTestInterval) clearInterval(currentTestInterval);
                        this.updateStateAndRender(testId, { status: 'running', startTime, elapsedTime: 0, duration: undefined, error: undefined });

                        currentTestInterval = setInterval(() => {
                            this.updateStateAndRender(testId, { elapsedTime: Date.now() - startTime });
                        }, 100);

                        let status: 'completed' | 'error' = 'completed';
                        let error: Error | undefined;
                        try {
                            await test.fn({ ai: this.magnus });
                        } catch (e) {
                            status = 'error';
                            error = e instanceof Error ? e : new Error(String(e));
                            hasErrors = true;
                            coreLogger.error(`Error in test ${testId}:`, error);
                        } finally {
                            if (currentTestInterval) clearInterval(currentTestInterval);
                            currentTestInterval = null;
                            const duration = Date.now() - startTime;
                            this.updateStateAndRender(testId, { status, duration, error, elapsedTime: undefined });
                        }
                    }
                }
            }
        } catch (executionError) {
            coreLogger.error('Unhandled error during test execution loop:', executionError);
            hasErrors = true;
        } finally {
            if (currentTestInterval) clearInterval(currentTestInterval);
            // Ensure cursor is visible before exiting
            process.stdout.write('\x1B[?25h');
            this.unmount();
            process.exit(hasErrors ? 1 : 0);
        }
    }
}
