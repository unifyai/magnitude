import { TestAgentListener, TestCaseAgent, TestCaseDefinition, TestCaseResult } from 'magnitude-core';
import { Browser, chromium } from 'playwright';
import { BaseTestRunner } from './baseRunner';

export class LocalTestRunner extends BaseTestRunner {
    private browser: Browser | null = null;

    protected async setup() {
        this.browser = await chromium.launch({ headless: false, args: ['--enable-logging', '--v=1', `--log-file=/tmp/chrome-debug.log`], });
    }

    protected async teardown() {
        if (this.browser) this.browser.close()
    }

    protected async runTest(testCase: TestCaseDefinition, listener: TestAgentListener): Promise<TestCaseResult> {
        const agent = new TestCaseAgent({
            listeners: [listener]
        });
        const result = await agent.run(this.browser!, testCase);
        return result;
    }
}