import { TestAgentListener, TestCaseAgent, TestCaseDefinition, TestCaseResult } from 'magnitude-core';
import { Browser, chromium } from 'playwright';
import { BASE_TEST_RUNNER_DEFAULT_CONFIG, BaseTestRunner, BaseTestRunnerConfig } from './baseRunner';

export interface LocalRunnerConfig extends BaseTestRunnerConfig {
}

const DEFAULT_CONFIG: LocalRunnerConfig = {
    ...BASE_TEST_RUNNER_DEFAULT_CONFIG,
} 

export class LocalTestRunner extends BaseTestRunner {
    private browser: Browser | null = null;

    constructor(config: Partial<LocalRunnerConfig>) {
        super({ ...DEFAULT_CONFIG, ...config }, true);
    }

    protected async setup() {
        this.browser = await chromium.launch({ headless: false, args: ['--enable-logging', '--v=1', `--log-file=/tmp/chrome-debug.log`], });
    }

    protected async teardown() {
        if (this.browser) this.browser.close()
    }

    protected async runTest(testCaseId: string, testCase: TestCaseDefinition, listener: TestAgentListener): Promise<TestCaseResult> {
        const agent = new TestCaseAgent({
            listeners: [listener]
        });
        const result = await agent.run(this.browser!, testCase);
        return result;
    }
}