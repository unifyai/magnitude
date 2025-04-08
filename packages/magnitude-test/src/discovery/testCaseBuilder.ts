import { TestCaseDefinition, TestStepDefinition } from 'magnitude-core';

class TestStepBuilder {
    // Test step builder class
    private testCase: TestCaseBuilder;
    private description: string;
    private checks: string[] = [];
    private testData: Record<string, string> = {};
    private freeformTestData: string[] = [];
    private secureTestData: Record<string, string> = {};

    constructor(testCase: TestCaseBuilder, description: string) {
        // Not mean to be initialized directly, use TestCase.step()
        this.testCase = testCase;
        this.description = description;
    }

    public check(description: string): TestStepBuilder {
        this.checks.push(description);
        return this;
    }

    public step(description: string): TestStepBuilder {
        // Enable step chaining
        return this.testCase.step(description);
    }

    public data(data: Record<string, string> | string): TestStepBuilder {
        /**
         * Pass in a string for a freeform description of data,
         * or arbitrary key/value pairs.
         */
        if (typeof data === "string") {
            this.freeformTestData.push(data);
        } else {
            this.testData = { ...this.testData, ...data };
        }
        return this;
    }

    public secureData(data: Record<string, string>): TestStepBuilder {
        this.secureTestData = { ...this.secureTestData, ...data };
        return this;
    }

    public toDefinition(): TestStepDefinition {
        const testData = [
            ...Object.entries(this.testData).map(([k, v]) => ({ key: k, value: v, sensitive: false })),
            ...Object.entries(this.secureTestData).map(([k, v]) => ({ key: k, value: v, sensitive: true }))
        ];

        return {
            description: this.description,
            checks: this.checks,
            testData: {
                data: testData,
                other: this.freeformTestData.join("\n")
            },
        };
    }
}

export interface TestCaseOptions {
    id: string;
    name?: string;
    url: string;
  }

export class TestCaseBuilder {
    // User-defined ID (sdk_id)
    private id: string;
    // currently ID used for name too
    private name: string;
    private url: string;
    //private tunnelUrl: string | null = null;
    private steps: TestStepBuilder[] = [];

    constructor(options: TestCaseOptions) {
        this.id = options.id;
        //this.sdk_id = options.id;
        this.name = options.name ?? options.id;
        this.url = options.url;
    }

    public step(description: string): TestStepBuilder {
        const step = new TestStepBuilder(this, description);
        this.steps.push(step);
        return step;
    }

    public toDefinition(): TestCaseDefinition {
        return {
            // id: this.id,
            // name: this.name,
            // // If tunneling, provide tunnel url instead
            url: this.url,//this.tunnelUrl ?? this.url,
            steps: this.steps.map(step => step.toDefinition())
        }
    }

    public getUrl(): string {
        return this.url;
    }

    public getId(): string {
        return this.id;
    }
}