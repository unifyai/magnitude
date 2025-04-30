// import { PlannerClient, ExecutorClient, TestAgentListener, TestCaseAgent, TestCaseDefinition, TestCaseResult } from 'magnitude-core';
// import { Browser, chromium } from 'playwright';
// import { BASE_TEST_RUNNER_DEFAULT_CONFIG, BaseTestRunner, BaseTestRunnerConfig } from './baseRunner';
// import logger from '@/logger';
// import { getMachineId } from '@/util';

// export interface LocalRunnerConfig extends BaseTestRunnerConfig {
// }

// const DEFAULT_CONFIG = {
//     ...BASE_TEST_RUNNER_DEFAULT_CONFIG,
// }

// export class LocalTestRunner extends BaseTestRunner {
//     private browser: Browser | null = null;

//     constructor(config: { planner: PlannerClient, executor: ExecutorClient } & Partial<LocalRunnerConfig>) {
//         super({ ...DEFAULT_CONFIG, ...config });
//     }

//     protected async setup() {
//         // TODO: add appropriate launch args
//         this.browser = await chromium.launch({ headless: false, args: ['--disable-gpu'], ...this.config.browserLaunchOptions });
//     }

//     protected async teardown() {
//         if (this.browser) this.browser.close()
//     }

//     protected async runTest(testCaseId: string, testCase: TestCaseDefinition, listener: TestAgentListener): Promise<TestCaseResult> {
//         const agent = new TestCaseAgent({
//             listeners: [listener],
//             planner: this.config.planner,
//             executor: this.config.executor,
//             browserContextOptions: this.config.browserContextOptions
//         });
//         const result = await agent.run(this.browser!, testCase);

//         if (this.config.telemetry) {
//             logger.trace(`Sending telemetry payload`);
//             const runInfo = agent.getInfo();
//             const payload = {
//                 version: "0.1",
//                 userId: getMachineId(),
//                 ...runInfo
//             };
//             const jsonString = JSON.stringify(payload);
//             const encodedData = btoa(jsonString);
//             const telemetryUrl = "https://telemetry.magnitude.run/functions/v1/telemetry?data=" + encodedData;
//             try {
//                 const resp = await fetch(telemetryUrl, { signal: AbortSignal.timeout(3000) });
//                 if (!resp.ok) {
//                     logger.warn(`Failed to send telemetry (status ${resp.status})`);
//                 }
//             } catch (error) {
//                 logger.warn(`Failed to send telemetry (may have timed out): ${(error as Error).message}`);
//             }
//         }

//         return result;
//     }
// }