import { TestCaseBuilder } from "./testCaseBuilder";

export interface TestOptions {
    url?: string;
    name?: string;
}

export type MagnitudeConfig = {
    apiKey?: string;
    url?: string;
}//TestOptions & { apiKey?: string };

export interface TestGroup {
    name: string;
    options?: TestOptions;
}

export interface TestGroupDeclaration {
    (id: string, options: TestOptions, testFn: () => void): void;
    (id: string, testFn: () => void): void;
}

export interface TestDeclaration {
    (id: string, options?: TestOptions): TestCaseBuilder;
    // (id: string, options: TestOptions, testFn: () => Promise<void>): void;
    // (id: string, testFn: () => Promise<void>): void;

    // group(groupName: string, groupOptions: TestOptions, groupFn: () => void): void;

    group: TestGroupDeclaration;

    // Configure global test options
    //config: (options: TestGlobalConfig) => void;
}

export type CategorizedTestCases = Record<string, { ungrouped: TestCaseBuilder[], groups: Record<string, TestCaseBuilder[]>}>;
