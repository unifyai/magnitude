import { TestAgentListener, TestCaseAgent, TestCaseDefinition, TestCaseResult } from 'magnitude-core';
import { Browser, chromium } from 'playwright';
import { BaseTestRunner } from './baseRunner';
import { RemoteTestCaseAgent } from 'magnitude-remote';

export class RemoteTestRunner extends BaseTestRunner {
    protected async setup() {
        
    }

    protected async teardown() {

    }

    protected async runTest(testCase: TestCaseDefinition, listener: TestAgentListener): Promise<TestCaseResult> {
        const agent = new RemoteTestCaseAgent({
            listeners: [listener]
        });
        const result = await agent.run(testCase);
        return result;
    }
}