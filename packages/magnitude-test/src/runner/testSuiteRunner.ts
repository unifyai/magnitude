import { MagnitudeConfig, RegisteredTest, TestOptions } from '@/discovery/types';
import { processUrl } from '../util';
import { WorkerPool, WorkerPoolResult } from './workerPool';
import { TestResult } from './state';
import { TestRenderer } from '@/renderer';
import { Worker } from 'node:worker_threads';
import { postToWorker, TestWorkerData, TestWorkerOutgoingMessage } from '@/worker/util';
import { isBun, isDeno } from 'std-env';

const TEST_FILE_LOADING_TIMEOUT = 30000;

export interface TestSuiteRunnerConfig {
    workerCount: number;
    createRenderer: (tests: RegisteredTest[]) => TestRenderer;
    config: MagnitudeConfig;
}

export class TestSuiteRunner {
    private runnerConfig: TestSuiteRunnerConfig;
    private renderer?: TestRenderer;
    private config: MagnitudeConfig;

    private tests: RegisteredTest[];
    private workers: Map<string, Worker> = new Map();

    constructor(
        config: TestSuiteRunnerConfig
    ) {
        this.tests = [];
        this.runnerConfig = config;
        this.config = config.config;
    }

    private runTest(test: RegisteredTest): Promise<TestResult> {
        const worker = this.workers.get(test.id);
        if (!worker) {
            throw new Error(`Test worker not found for test ID: ${test.id}`);
        }

        return new Promise((resolve, reject) => {
            const messageHandler = (message: TestWorkerOutgoingMessage) => {
                if (!("testId" in message) || message.testId !== test.id) return;
                if (message.type === "test_result") {
                    worker.off("message", messageHandler);
                    resolve(message.result);
                } else if (message.type === "test_error") {
                    worker.off("message", messageHandler);
                    reject(new Error(message.error));
                } else if (message.type === "test_state_change") {
                    this.renderer?.onTestStateUpdated(test, message.state);
                }
            }

            worker.on("message", messageHandler);
            postToWorker(worker, {
                type: "execute",
                test,
                browserOptions: this.config.browser,
                llm: this.config.llm,
                grounding: this.config.grounding,
                telemetry: this.config.telemetry
            })

        })
    }

    private getActiveOptions(): TestOptions {
        const envOptions = process.env.MAGNITUDE_TEST_URL ? {
            url: process.env.MAGNITUDE_TEST_URL
        } : {};

        return {
            ...this.config,
            ...envOptions, // env options take precedence over config options
            url: processUrl(envOptions.url, this.config.url),
        };
    }

    public async loadTestFile(absoluteFilePath: string, relativeFilePath: string): Promise<void> {
        try {
            const worker = new Worker(
                new URL('./worker/readTest.js', import.meta.url),
                {
                    workerData: {
                        filePath: absoluteFilePath,
                        options: this.getActiveOptions(),
                    } satisfies TestWorkerData,
                    env: { NODE_ENV: 'test', ...process.env },
                    execArgv: !(isBun || isDeno) ? ["--import=jiti/register"] : []
                }
            );

            return new Promise((resolve, reject) => {
                const timeout = setTimeout(() => {
                    worker.terminate();
                    reject(new Error(`Test file loading timeout: ${relativeFilePath}`));
                }, TEST_FILE_LOADING_TIMEOUT);

                worker.on('message', (message: TestWorkerOutgoingMessage) => {
                    if (message.type === 'registered') {
                        this.tests.push(message.test);
                        this.workers.set(message.test.id, worker);
                    } else if (message.type === 'load_error') {
                        clearTimeout(timeout);
                        worker.terminate();
                        reject(new Error(`Failed to load ${relativeFilePath}: ${message.error}`));
                    } else if (message.type === 'load_complete') {
                        clearTimeout(timeout);
                        resolve();
                    }
                });

                worker.on('error', (error) => {
                    clearTimeout(timeout);
                    worker.terminate();
                    reject(error);
                });
            });
        } catch (error) {
            console.error(`Failed to load test file ${relativeFilePath}:`, error);
            throw error;
        }
    }

    async runTests(): Promise<boolean> {
        if (!this.tests) throw new Error('No tests were registered');
        this.renderer = this.runnerConfig.createRenderer(this.tests);
        this.renderer.start?.();
        const workerPool = new WorkerPool(this.runnerConfig.workerCount);

        const taskFunctions = this.tests.map((test) => {
            return async (signal: AbortSignal): Promise<TestResult> => {
                try {
                    return await this.runTest(test);
                } catch (err: unknown) {
                    // user-facing, can happen e.g. when URL is not running
                    if (err instanceof Error) {
                        console.error(`Unexpected error during test '${test.title}':\n${err.message}`);
                    } else {
                        console.error(`Unexpected error during test '${test.title}':\n${err}`);
                    }

                    throw err;
                }
            };
        });

        let overallSuccess = true;
        try {
            const poolResult: WorkerPoolResult<TestResult> = await workerPool.runTasks<TestResult>(
                taskFunctions,
                (taskOutcome: TestResult) => !taskOutcome.passed
            );

            for (const result of poolResult.results) {
                if (result === undefined || !result.passed) {
                    overallSuccess = false;
                    break;
                }
            }
            if (!poolResult.completed) { // If pool aborted for any reason (incl. a task failure)
                overallSuccess = false;
            }

        } catch (error) {
            overallSuccess = false;
        }
        this.renderer.stop?.();
        return overallSuccess;

    }
}
