import { pathToFileURL } from 'url';
import { TestCompiler } from '../compiler';
import { TestRegistry } from '../discovery/testRegistry';
import { TestSuiteViewer } from '@/renderer';
import logUpdate from 'log-update';
import chalk from 'chalk';
import { createId } from '@paralleldrive/cuid2';
import { TestCaseBuilder } from '../discovery/testCaseBuilder';
import { CategorizedTestCasesWithRenderIds, RenderIdTestCasePair } from './types';
import { TestCaseAgent, TestCaseStateTracker } from 'magnitude-core';
import { Browser, chromium } from 'playwright';
import path from 'path';

export abstract class BaseTestRunner {
    protected registry: TestRegistry;
    protected compiler: TestCompiler;
    protected viewer: TestSuiteViewer;
    // Store test cases with their render IDs
    protected testCasesWithRenderIds: CategorizedTestCasesWithRenderIds = {};
    // Worker count for parallel execution
    protected workerCount: number = 1;

    constructor(workerCount: number = 1) {
        this.registry = TestRegistry.getInstance();
        this.compiler = new TestCompiler();
        this.viewer = new TestSuiteViewer();
        this.workerCount = Math.max(1, workerCount); // Ensure at least 1 worker
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

    abstract runTests(): Promise<boolean>;
}