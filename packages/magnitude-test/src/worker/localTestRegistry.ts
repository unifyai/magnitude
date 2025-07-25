import { TestFunction, TestGroup, TestOptions } from "@/discovery/types";
import cuid2 from "@paralleldrive/cuid2";
import { getTestWorkerData, postToParent, testFunctions, messageEmitter, TestWorkerIncomingMessage } from "./util";
import { TestCaseAgent } from "@/agent";
import { TestResult, TestState, TestStateTracker } from "@/runner/state";
import { buildDefaultBrowserAgentOptions } from "magnitude-core";
import { sendTelemetry } from "@/runner/telemetry";
import { testPromptStack } from "@/worker/testDeclaration";

// This module has to be separate so it only gets imported once after possible compilation by jiti.

const workerData = getTestWorkerData();

const generateId = cuid2.init({ length: 12 });

export function registerTest(testFn: TestFunction, title: string, url: string) {
    const testId = generateId();
    testFunctions.set(testId, testFn);
    postToParent({
        type: 'registered',
        test: {
            id: testId,
            title,
            url,
            filepath: workerData.relativeFilePath,
            group: currentGroup?.name
        }
    });
}

export type HookFn = () => void | Promise<void>;

export interface TestHooks {
    beforeAll: HookFn[];
    afterAll: HookFn[];
    beforeEach: HookFn[];
    afterEach: HookFn[];
}

const hooks: TestHooks = {
    beforeAll: [],
    afterAll: [],
    beforeEach: [],
    afterEach: [],
};

export function addHook(kind: keyof TestHooks, fn: HookFn) {
    (hooks[kind] as HookFn[]).push(fn);
}

export function getHooks(): TestHooks {
    return hooks;
}

let beforeAllExecuted = false;
let beforeAllError: Error | null = null;
let afterAllExecuted = false;
// No state reset is needed because each test file is run in a separate worker

let currentGroup: TestGroup | undefined;
export function setCurrentGroup(group?: TestGroup) {
    currentGroup = group;
}
export function currentGroupOptions(): TestOptions {
    return structuredClone(currentGroup?.options) ?? {};
}

messageEmitter.removeAllListeners('message');
messageEmitter.on('message', async (message: TestWorkerIncomingMessage) => {
    if (message.type === 'execute_after_all') {
        if (afterAllExecuted) {
            postToParent({ type: 'after_all_complete' });
            return;
        }

        try {
            const hooks = getHooks();
            for (const afterAllHook of hooks.afterAll) {
                await afterAllHook();
            }
            afterAllExecuted = true;
            postToParent({ type: 'after_all_complete' });
        } catch (error) {
            afterAllExecuted = true;
            postToParent({
                type: 'after_all_error',
                error: error instanceof Error ? error.message : String(error)
            });
        }
        return;
    }

    if (message.type !== 'execute') return;
    const { test, browserOptions, llm, grounding, telemetry } = message;
    const testFn = testFunctions.get(test.id);

    if (!testFn) {
        postToParent({
            type: 'test_error',
            testId: test.id,
            error: `Test function not found: ${test.id}`
        });
        return;
    }

    try {
        const promptStack = testPromptStack[test.title] || [];
        const prompt = promptStack.length > 0 ? promptStack.join('\n') : undefined;
        const { agentOptions: defaultAgentOptions, browserOptions: defaultBrowserOptions } = buildDefaultBrowserAgentOptions({
            agentOptions: { llm, ...(prompt ? { prompt } : {}) },
            browserOptions: {
                url: test.url,
                browser: browserOptions,
                grounding
            }
        });

        const agent = new TestCaseAgent({
            // disable telemetry to keep test run telemetry seperate from general automation telemetry
            agentOptions: { ...defaultAgentOptions, telemetry: false },
            browserOptions: defaultBrowserOptions,
        });

        const tracker = new TestStateTracker(agent);

        tracker.events.on('stateChanged', (state) => {
            postToParent({
                type: 'test_state_change',
                testId: test.id,
                state
            });
        });

        await agent.start();

        let finalState: TestState;
        let finalResult: TestResult;

        try {
            const hooks = getHooks();

            if (!beforeAllExecuted && hooks.beforeAll.length > 0) {
                try {
                    for (const beforeAllHook of hooks.beforeAll) {
                        await beforeAllHook();
                    }
                    beforeAllExecuted = true;
                } catch (error) {
                    beforeAllError = error instanceof Error ? error : new Error(String(error));
                    beforeAllExecuted = true;
                }
            }

            if (beforeAllError) {
                // TODO improve error cause handling across the test runner
                throw new Error(`beforeAll hook failed: ${beforeAllError.message}`);
            }

            for (const beforeEachHook of hooks.beforeEach) {
                await beforeEachHook();
            }

            // Execute the test function
            await testFn(agent);

            for (const afterEachHook of hooks.afterEach) {
                await afterEachHook();
            }

            finalState = {
                ...tracker.getState(),
                status: 'passed' as const,
                doneAt: Date.now()
            };

            finalResult = { passed: true };
        } catch (error) {
            try {
                // TODO afterEach should coordinate with main thread to allow it to run when the pool aborts everyone
                const hooks = getHooks();
                for (const afterEachHook of hooks.afterEach) {
                    await afterEachHook();
                }
            } catch (afterEachError) {
                const originalMessage = error instanceof Error ? error.message : String(error);
                const afterEachMessage = afterEachError instanceof Error ? afterEachError.message : String(afterEachError);
                error = new Error(`Test failed: ${originalMessage}. Additionally, afterEach hook failed: ${afterEachMessage}`);
            }

            const failure = {
                message: error instanceof Error ? error.message : String(error)
            };

            finalState = {
                ...tracker.getState(),
                failure: failure,
                status: 'failed' as const,
                doneAt: Date.now()
            };

            finalResult = { passed: false, failure };
        }

        await agent.stop();

        postToParent({
            type: 'test_state_change',
            testId: test.id,
            state: finalState
        });

        if (finalState && (telemetry ?? true)) await sendTelemetry(finalState);

        postToParent({
            type: 'test_result',
            testId: test.id,
            result: finalResult ??
                { passed: false, failure: { message: "Test result doesn't exist" } },
        });
    } catch (error) {
        postToParent({
            type: 'test_error',
            error: error instanceof Error ? error.message : String(error),
            testId: test.id,
        });
    }
});
