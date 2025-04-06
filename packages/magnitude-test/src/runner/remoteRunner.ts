import { TestAgentListener, TestCaseAgent, TestCaseDefinition, TestCaseResult } from 'magnitude-core';
import { Browser, chromium } from 'playwright';
import { BASE_TEST_RUNNER_DEFAULT_CONFIG, BaseTestRunner, BaseTestRunnerConfig } from './baseRunner';
import { RemoteTestCaseAgent } from 'magnitude-remote';

export interface RemoteRunnerConfig extends BaseTestRunnerConfig {
    remoteRunnerUrl: string,
    apiKey: string
}

const DEFAULT_CONFIG: Omit<RemoteRunnerConfig, 'apiKey'> = {
    ...BASE_TEST_RUNNER_DEFAULT_CONFIG,
    remoteRunnerUrl: 'https://remote.magnitude.run:4444',
    //apiKey: process.env.MAGNITUDE_API_KEY
} 

export class RemoteTestRunner extends BaseTestRunner {
    declare protected config: RemoteRunnerConfig;

    constructor(config: { apiKey: string } & Partial<RemoteRunnerConfig>) {
        super({ ...DEFAULT_CONFIG, ...config });
    }

    protected async setup() {
        
    }

    protected async teardown() {

    }

    protected async runTest(testCaseId: string, testCase: TestCaseDefinition, listener: TestAgentListener): Promise<TestCaseResult> {
        /**
         * testId: user defined test description/id, used to retrieve cache and associate with same test case on hosted dashboard
         */
        const agent = new RemoteTestCaseAgent({
            listeners: [listener],
            serverUrl: this.config.remoteRunnerUrl,
            apiKey: this.config.apiKey
        });
        const result = await agent.run(testCaseId, testCase);
        return result;
    }
}