import { RegisteredTest, TestOptions } from "@/discovery/types";
import { TestResult, TestState } from "@/runner/state";
import { BrowserOptions, GroundingClient, LLMClient } from "magnitude-core";
import { parentPort, workerData } from "node:worker_threads";
import { Worker } from "node:worker_threads";

export type TestWorkerIncomingMessage = {
    type: "execute"
    test: RegisteredTest;
    browserOptions?: BrowserOptions;
    llm?: LLMClient;
    grounding?: GroundingClient;
    telemetry?: boolean;
}

export function postToWorker(worker: Worker, message: TestWorkerIncomingMessage) {
    worker.postMessage(message);
}

export type TestWorkerOutgoingMessage = {
    type: "load_complete";
    filePath: string;
} | {
    type: "load_error";
    filePath: string;
    error: string;
} | {
    type: "registered";
    test: RegisteredTest;
} | {
    type: "test_result";
    testId: string;
    result: TestResult;
} | {
    type: "test_error";
    testId: string;
    error: string;
} | {
    type: "test_state_change";
    testId: string;
    state: TestState;
}

export function postToParent(message: TestWorkerOutgoingMessage) {
    if (!parentPort) throw new Error("Not running in a worker thread");
    parentPort.postMessage(message);
}

export type TestWorkerData = {
    filePath: string;
    options: TestOptions;
}

export function getTestWorkerData() {
    if (!parentPort) {
        throw new Error('Do not use this module on the main thread');
    }
    return workerData as TestWorkerData;
}
