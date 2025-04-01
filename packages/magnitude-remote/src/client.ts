import logger from './logger';
import WebSocket from 'ws';
import { ControlMessage, RequestStartRunMessage } from './messages';
import { TestAgentListener, TestCaseDefinition, TestCaseResult } from 'magnitude-core';

interface RemoteTestCaseAgentConfig {
    serverUrl: string;
    listeners: TestAgentListener[];
}

const DEFAULT_CONFIG = {
    serverUrl: "http://localhost:4444",
    listeners: []
};

export class RemoteTestCaseAgent {
    private config: RemoteTestCaseAgentConfig;
    private controlSocket: WebSocket | null = null;

    constructor (config: Partial<RemoteTestCaseAgentConfig> = {})  {
        this.config = { ...DEFAULT_CONFIG, ...config };
    }

    public async run(testCase: TestCaseDefinition): Promise<TestCaseResult> {
        return new Promise((resolve, reject) => {
            this.controlSocket = new WebSocket("ws://localhost:4444");

            this.controlSocket.on('open', async () => {
                const message: RequestStartRunMessage = {
                    type: 'request_start_run',
                    payload: { testCase }
                }
                this.controlSocket!.send(JSON.stringify(message));
            });

            this.controlSocket.on('message', async (rawData) => {
                try {
                    const msg = JSON.parse(rawData.toString()) as ControlMessage;
                    console.log("Received message:", msg);

                    if (msg.type === 'event:done') {
                        this.controlSocket!.close(1000);
                        resolve(msg.payload.result);
                    }

                } catch (error) {
                    logger.error("Error handling server message", error)
                }
            });

            this.controlSocket.on('close', (code, reason) => {
                console.log(`WebSocket closed: ${code} ${reason}`);
            });
            
            this.controlSocket.on('error', (error) => {
                console.log(`WebSocket error: ${error}`);
            });
        });
    }
}