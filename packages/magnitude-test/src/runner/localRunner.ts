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