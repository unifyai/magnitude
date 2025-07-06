import { pathToFileURL } from 'node:url';
import { getTestWorkerData, postToParent } from './util.js';

const workerData = getTestWorkerData();

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