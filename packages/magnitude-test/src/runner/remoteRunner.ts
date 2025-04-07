import { TestAgentListener, TestCaseAgent, TestCaseDefinition, TestCaseResult } from 'magnitude-core';
import { Browser, chromium } from 'playwright';
import { BASE_TEST_RUNNER_DEFAULT_CONFIG, BaseTestRunner, BaseTestRunnerConfig } from './baseRunner';
import { RemoteTestCaseAgent } from 'magnitude-remote';
import { isLocalUrl } from '@/util';

export interface RemoteRunnerConfig extends BaseTestRunnerConfig {
    remoteRunnerUrl: string;
    apiKey?: string;
    forceUseTunnel: boolean;
}

const DEFAULT_CONFIG: Omit<RemoteRunnerConfig, 'apiKey'> = {
    ...BASE_TEST_RUNNER_DEFAULT_CONFIG,
    remoteRunnerUrl: 'https://remote.magnitude.run:4444',
    forceUseTunnel: false
    //apiKey: process.env.MAGNITUDE_API_KEY
} 

export class RemoteTestRunner extends BaseTestRunner {
    declare protected config: RemoteRunnerConfig;

    constructor(config: Partial<RemoteRunnerConfig>) {
        super({ ...DEFAULT_CONFIG, ...config }, false);
    }

    protected async setup() {
        
    }

    protected async teardown() {

    }

    protected async runTest(testCaseId: string, testCase: TestCaseDefinition, listener: TestAgentListener): Promise<TestCaseResult> {
        /**
         * testId: user defined test description/id, used to retrieve cache and associate with same test case on hosted dashboard
         */
        const url = testCase.url;
        
        const useTunnel = this.config.forceUseTunnel || isLocalUrl(url);

        const agent = new RemoteTestCaseAgent({
            listeners: [listener],
            serverUrl: this.config.remoteRunnerUrl,
            apiKey: this.config.apiKey || null,
            useTunnel: useTunnel
            //forceUseTunnel: this.config.forceUseTunnel
        });
        const result = await agent.run(testCaseId, testCase);
        return result;
    }
}