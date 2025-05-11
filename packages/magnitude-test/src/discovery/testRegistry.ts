import { TestOptions, TestGroup, MagnitudeConfig, CategorizedTestCases, TestFunction, TestRunnable, CategorizedTestRunnable } from "./types";
import { TestCompiler } from "@/compiler";
import { pathToFileURL } from "node:url";
import { processUrl } from "./util";

declare global {
    var __testRegistry: TestRegistry | undefined;
}

export class TestRegistry {
    //private static instance: TestRegistry;

    // map from filepath to ungrouped & grouped test cases
    private tests: CategorizedTestCases = {};

    private currentGroup?: TestGroup;
    private currentFilePath?: string;

    private globalOptions!: MagnitudeConfig;

    private compiler: TestCompiler;

    private constructor() {
        this.compiler = new TestCompiler();
    }

    public static getInstance(): TestRegistry {
        // Use globalThis to ensure same instance is used across module boundaries
        if (!(globalThis as any).__magnitude__) {
            (globalThis as any).__magnitude__ = {};
        }

        if (!(globalThis as any).__magnitude__.registry) {
            (globalThis as any).__magnitude__.registry = new TestRegistry();
        }

        return (globalThis as any).__magnitude__.registry;
    }

    public register(testCase: TestRunnable): void {
        // Register a test case to be tracked by test runner
        if (!this.currentFilePath) {
            throw Error("File path context not set before registering test");
        }

        if (!(this.currentFilePath in this.tests)) {
            this.tests[this.currentFilePath] = { ungrouped: [], groups: {} }
        }
        const testsForPath = this.tests[this.currentFilePath];

        if (this.currentGroup) {
            const groupName = this.currentGroup.name;
            if (!(groupName in testsForPath.groups)) {
                testsForPath.groups[groupName] = [];
            }
            testsForPath.groups[groupName].push(testCase);
        } else {
            testsForPath.ungrouped.push(testCase);
        }
    }

    public getRegisteredTestCases(): CategorizedTestCases {
        return this.tests;
    }

    public getFlattenedTestCases(): Array<CategorizedTestRunnable> {
        const tests = [];
        
        for (const filePath in this.tests) {
            // Add ungrouped tests
            for (const runnable of this.tests[filePath].ungrouped) {
                tests.push({ ...runnable, file: filePath, group: null });
            }
            
            // Add grouped tests
            for (const groupName in this.tests[filePath].groups) {
                for (const runnable of this.tests[filePath].groups[groupName]) {
                    tests.push({ ...runnable, file: filePath, group: groupName });
                }
            }
        }
        
        return tests;
    }

    public setCurrentGroup(group: TestGroup): void {
        //this.currentGroupName = groupName;
        this.currentGroup = group;
    }

    public unsetCurrentGroup(): void {
        this.currentGroup = undefined;
    }

    public setCurrentFilePath(filePath: string): void {
        //console.log("setCurrentFilePath:", filePath);
        this.currentFilePath = filePath;
        //console.log("currentFilePath:", this.currentFilePath);
    }

    public unsetCurrentFilePath(): void {
        //console.log("unsetCurrentFilePath:", this.currentFilePath);
        this.currentFilePath = undefined;
    }

    public setGlobalOptions(options: MagnitudeConfig): void {
        this.globalOptions = options;
    }

    // Get current option overrides for the active group scope
    public getActiveOptions(): TestOptions {
        const envOptions = process.env.MAGNITUDE_TEST_URL ? {
            url: process.env.MAGNITUDE_TEST_URL
        } : {};

        //console.log("global options:", this.globalOptions)

        //const configuredOptions = this.globalOptions;
        const globalOptions = this.globalOptions.url ? {
            url: processUrl(envOptions.url, this.globalOptions.url)
        } : {};

        const groupOptions = this.currentGroup?.options ? {
            ...this.currentGroup.options,
            url: processUrl(globalOptions.url, this.currentGroup.options.url)
        } : {};


        const combinedOptions = {
            ...envOptions,
            ...globalOptions,
            ...groupOptions
        }

        //console.log("combinedOptions:", combinedOptions)

        return combinedOptions;
    }

    async loadTestFile(absoluteFilePath: string, relativeFilePath: string): Promise<void> {
        // adding this back in causes ES module err
        //logUpdate("foo")
        try {
            // Set current file path in registry
            this.setCurrentFilePath(relativeFilePath);

            // Compile the file
            const compiledPath = await this.compiler.compileFile(absoluteFilePath);

            // Import the compiled file - triggering it to register its test cases
            await import(pathToFileURL(compiledPath).href);

            //console.log(`Loaded test file: ${relativeFilePath}`);
            
            // Notify the viewer about the loaded file
            //this.viewer.addLoadedFile(relativeFilePath);
        } catch (error) {
            console.error(`Failed to load test file ${relativeFilePath}:`, error);
            throw error;
        } finally {
            // Always unset the current file path when done
            this.unsetCurrentFilePath();
        }
    }
}

export default TestRegistry;