import { pathToFileURL } from 'node:url';
import { getTestWorkerData, postToParent, messageEmitter, TestWorkerIncomingMessage } from './util.js';
import { isBun } from 'std-env';
import { parentPort } from 'node:worker_threads';

const workerData = getTestWorkerData();
if (isBun) {
    // Must be listened in the first tick to avoid early termination
    process.on('message', (message) => {
        messageEmitter.emit('message', message);
    });
} else {
    parentPort?.on('message', (message: TestWorkerIncomingMessage) => {
        messageEmitter.emit('message', message);
    });
}

async function readTest() {
    try {
        const url = pathToFileURL(workerData.filePath).href;
        await import(url);
        postToParent({
            type: 'load_complete',
            filePath: workerData.filePath
        });
    } catch (error) {
        postToParent({
            type: 'load_error',
            filePath: workerData.filePath,
            error: error instanceof Error ? error.message : String(error)
        });
    }
}

readTest();