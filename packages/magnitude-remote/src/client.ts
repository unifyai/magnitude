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
            this.controlSocket = new WebSocket("http://localhost:4444");

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

                    if (msg.type === 'confirm_start_run') {
                        // Successful handshake response
                    }
                    else if (msg.type === 'error') {
                        // Some unexpected error occured on the server's side
                        logger.error(`Error message from server: ${msg.payload.message}`);
                        // probably close sockets
                        this.controlSocket!.close(1011);
                        reject(new Error(`Error message from server: ${msg.payload.message}`));
                    }
                    // Translate socket message to listener callbacks
                    else if (msg.type === 'event:start') {
                        for (const listener of this.config.listeners) if (listener.onStart) listener.onStart(msg.payload.runMetadata);
                    }
                    else if (msg.type === 'event:action_taken') {
                        for (const listener of this.config.listeners) if (listener.onActionTaken) listener.onActionTaken(msg.payload.action);
                    }
                    else if (msg.type === 'event:step_completed') {
                        for (const listener of this.config.listeners) if (listener.onStepCompleted) listener.onStepCompleted();
                    }
                    else if (msg.type === 'event:check_completed') {
                        for (const listener of this.config.listeners) if (listener.onCheckCompleted) listener.onCheckCompleted();
                    }
                    else if (msg.type === 'event:done') {
                        for (const listener of this.config.listeners) if (listener.onDone) listener.onDone(msg.payload.result);

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