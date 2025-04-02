import { pathToFileURL } from 'url';
import { TestCompiler } from '../compiler';
import { TestRegistry } from '../discovery/testRegistry';
import { TestSuiteViewer } from '@/renderer';
import logUpdate from 'log-update';
import chalk from 'chalk';
import { createId } from '@paralleldrive/cuid2';
import { TestCaseBuilder } from '../discovery/testCaseBuilder';
import { CategorizedTestCasesWithRenderIds, RenderIdTestCasePair } from './types';
import { TestAgentListener, TestCaseAgent, TestCaseDefinition, TestCaseResult, TestCaseStateTracker } from 'magnitude-core';
import { Browser, chromium } from 'playwright';
import path from 'path';

export interface TestRunnerConfig {
    workerCount: number;
    prettyDisplay: boolean;
}

const DEFAULT_CONFIG = {
    workerCount: 1,
    prettyDisplay: true
};

export abstract class BaseTestRunner {
    protected config: TestRunnerConfig;
    protected registry: TestRegistry;
    protected compiler: TestCompiler;
    protected viewer: TestSuiteViewer;
    // Store test cases with their render IDs
    protected testCasesWithRenderIds: CategorizedTestCasesWithRenderIds = {};
    // Worker count for parallel execution
    //protected workerCount: number = 1;

    constructor(config: Partial<TestRunnerConfig>) {
        this.config = { ...DEFAULT_CONFIG, ...config };
        this.registry = TestRegistry.getInstance();
        this.compiler = new TestCompiler();
        this.viewer = new TestSuiteViewer();
        //this.workerCount = Math.max(1, workerCount); // Ensure at least 1 worker
    }

    // // Method to set worker count
    // public setWorkerCount(count: number): void {
    //     this.workerCount = Math.max(1, count); // Ensure at least 1 worker
    // }

    // // Get the current worker count
    // public getWorkerCount(): number {
    //     return this.workerCount;
    // }

    async loadTestFile(absoluteFilePath: string, relativeFilePath: string): Promise<void> {
        // adding this back in causes ES module err
        //logUpdate("foo")
        try {
            // Set current file path in registry
            this.registry.setCurrentFilePath(relativeFilePath);

            // Compile the file
            const compiledPath = await this.compiler.compileFile(absoluteFilePath);

            // Import the compiled file
            await import(pathToFileURL(compiledPath).href);

            //console.log(`Loaded test file: ${relativeFilePath}`);
            
            // Notify the viewer about the loaded file
            this.viewer.addLoadedFile(relativeFilePath);
        } catch (error) {
            console.error(`Failed to load test file ${relativeFilePath}:`, error);
            throw error;
        } finally {
            // Always unset the current file path when done
            this.registry.unsetCurrentFilePath();
        }
    }

    protected collectTestsForExecution(): Array<{ filePath: string, groupName: string | null, renderId: string, testCase: TestCaseBuilder }> {
        const tests: Array<{ filePath: string, groupName: string | null, renderId: string, testCase: TestCaseBuilder }> = [];
        
        // First, collect all tests into a flat array for easier parallelization
        for (const filePath in this.testCasesWithRenderIds) {
            // Add ungrouped tests
            for (const { renderId, testCase } of this.testCasesWithRenderIds[filePath].ungrouped) {
                tests.push({ filePath, groupName: null, renderId, testCase });
            }
            
            // Add grouped tests
            for (const groupName in this.testCasesWithRenderIds[filePath].groups) {
                for (const { renderId, testCase } of this.testCasesWithRenderIds[filePath].groups[groupName]) {
                    tests.push({ filePath, groupName, renderId, testCase });
                }
            }
        }
        
        return tests;
    }

    protected abstract setup(): Promise<void>;
    protected abstract teardown(): Promise<void>;

    protected abstract runTest(testCase: TestCaseDefinition, listener: TestAgentListener): Promise<TestCaseResult>;

    //abstract runTests(): Promise<boolean>;


    protected async runAndRenderTest(renderId: string, testCase: TestCaseBuilder): Promise<boolean> {
        try {
            // Update test status to running
            this.viewer.updateTestStatus(renderId, 'running');

            //console.log("test case:", testCase);
            
            // Run the test - this returns TestRuntime, not TestRunResult
            //const runtime = testCase.run();
            const testCaseDefinition = testCase.toDefinition();
            const stateTracker = new TestCaseStateTracker(testCaseDefinition);
            // const agent = new TestCaseAgent({
            //     listeners: [stateTracker.getListener()]
            // });

            //await agent.run();
             
            // Register the runtime with the viewer instead of showing it directly
            this.viewer.registerStateTracker(renderId, stateTracker);

            const result = await this.runTest(testCaseDefinition, stateTracker.getListener());

            // runtime.catch(error => {
            //     console.log("Caught in direct handler:", error);
            //     throw error; // Re-throw to be caught by the outer try/catch
            // });
            
            // Await the test to complete
            //const result = await agent.run(this.browser!, testCaseDefinition);
            // todo: change agent result iface to unify (failure descriptor)
            if (result.passed) {
            
                // Update test status to passed
                this.viewer.updateTestStatus(renderId, 'passed');
            } else {
                // jank AF
                this.viewer.updateTestStatus(renderId, 'failed', new Error(result.failure.description));
            }

            await new Promise(resolve => setTimeout(resolve, 2000));
            
            // Unregister the runtime when done
            this.viewer.unregisterTracker(renderId);

            
            
            return true;
        } catch (error) {
            // UNEXPECTED ERROR
            console.error("Unexpected error!")
            //console.log("Caught error in runSingleTest")
            // Update test status to failed
            this.viewer.updateTestStatus(renderId, 'failed', error as Error);
            //console.log("updated test status")

            await new Promise(resolve => setTimeout(resolve, 2000));
            
            // Ensure we unregister the runtime
            this.viewer.unregisterTracker(renderId);
            //console.log("unregistered runtime, returning false")

            return false;
        }
    }

    async runTests(): Promise<boolean> {
        await this.setup();
        // Get all registered tests
        const testCases = this.registry.getRegisteredTestCases();

        // TODO: Headers etc.
        //const browser = await chromium.launch({ headless: false, args: ['--enable-logging', '--v=1', `--log-file=/tmp/chrome-debug.log`], });
        
        // Clear any existing render ID mappings
        this.testCasesWithRenderIds = {};
        
        // Create a new structure to hold our test states
        const testStateData: Array<{
            renderId: string;
            testCase: TestCaseBuilder;
            displayName: string;
        }> = [];
        
        // Assign unique cuid2 render IDs to all tests and organize them
        let totalTests = 0;
        for (const filePath in testCases) {
            if (!this.testCasesWithRenderIds[filePath]) {
                this.testCasesWithRenderIds[filePath] = { ungrouped: [], groups: {} };
            }
            
            // Process ungrouped tests
            for (const test of testCases[filePath].ungrouped) {
                const renderId = createId();
                const originalId = test.getId();
                
                // Add to our new structure
                this.testCasesWithRenderIds[filePath].ungrouped.push({ renderId, testCase: test });
                
                testStateData.push({ renderId: renderId, testCase: test, displayName: originalId });
                totalTests++;
            }
            
            // Process grouped tests
            for (const groupName in testCases[filePath].groups) {
                if (!this.testCasesWithRenderIds[filePath].groups[groupName]) {
                    this.testCasesWithRenderIds[filePath].groups[groupName] = [];
                }
                
                for (const test of testCases[filePath].groups[groupName]) {
                    const renderId = createId();
                    const originalId = test.getId();
                    
                    // Add to our new structure
                    this.testCasesWithRenderIds[filePath].groups[groupName].push({ renderId, testCase: test });
                    
                    testStateData.push({ renderId, testCase: test, displayName: originalId });
                    totalTests++;
                }
            }
        }
        
        // Initialize test states in the viewer with our render IDs
        this.viewer.initializeTestStatesWithRenderIds(testStateData);
        
        // Start the render loop
        if (this.config.prettyDisplay) this.viewer.startRendering();
        
        let allTestsPassed = true;
        
        // Collect all tests into a flat array for parallelization
        const tests = this.collectTestsForExecution();
        
        // Create a queue of pending tests
        const pendingTests = [...tests];
        
        // Track active test promises
        const activeTestPromises = new Map<string, Promise<boolean>>();
        
        // Continue running tests until all tests are complete or one fails
        while (pendingTests.length > 0 || activeTestPromises.size > 0) {
            // Fill the worker pool up to the maximum worker count
            while (pendingTests.length > 0 && activeTestPromises.size < this.config.workerCount) {
                // Get the next test from the queue
                const nextTest = pendingTests.shift()!;
                const { renderId, testCase } = nextTest;
                
                // Start the test and get a promise for its completion
                const testPromise = this.runAndRenderTest(renderId, testCase);//this.runSingleTest(browser, renderId, testCase);
                
                // Store the promise mapped to the render ID
                activeTestPromises.set(renderId, testPromise);
                
                // When the test completes, remove it from active promises
                testPromise.then(success => {
                    activeTestPromises.delete(renderId);
                    
                    if (!success) {
                        // If a test fails, clear the pending queue to stop testing
                        pendingTests.length = 0;
                        allTestsPassed = false;
                    }
                    
                    return success;
                }).catch(error => {
                    //console.log("Caught error in test promise");
                    // Make sure we propagate errors up
                    // hmm but we actually don't want to throw, we need to teardown
                    throw error;
                });
            }
            
            // If there are active promises, wait for at least one test to complete
            if (activeTestPromises.size > 0) {
                // Convert the promises to an array for Promise.race
                const promiseEntries = Array.from(activeTestPromises.entries());
                const promisesArray = promiseEntries.map(([_, promise]) => promise);
                
                // Wait for at least one test to complete
                await Promise.race(promisesArray);
                
                // At this point, at least one promise has completed.
                // We need to check all promises to see which ones have completed
                // and remove them from the active list if they failed
                
                // We'll have to await each promise to check its result
                // but we'll only await promises that are ready to avoid blocking
                const promisesToCheck = [...activeTestPromises.entries()];
                
                for (const [renderId, promise] of promisesToCheck) {
                    // Use Promise.race with a 0ms timeout to check if the promise is settled
                    // without waiting for promises that aren't done yet
                    const settled = await Promise.race([
                        promise.then(() => true).catch(() => true),
                        new Promise(resolve => setTimeout(() => resolve(false), 0))
                    ]);
                    
                    if (settled && activeTestPromises.has(renderId)) {
                        try {
                            const result = await promise;
                            if (!result) {
                                allTestsPassed = false;
                                // Clear pending tests to stop testing
                                pendingTests.length = 0;
                                break;
                            }
                        } catch (error) {
                            // This should not happen as we handle errors in runSingleTest,
                            // but just in case
                            allTestsPassed = false;
                            pendingTests.length = 0;
                            break;
                        }
                    }
                }
            }
        }
        
        //console.log("stopping rendering")
        // Stop the render loop and show final results
        if (this.config.prettyDisplay) this.viewer.stopRendering();

        //await browser.close();

        //console.log("returning", allTestsPassed);
        await this.teardown();

        return allTestsPassed;
    }
}