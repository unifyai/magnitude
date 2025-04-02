import logger from './logger';
import { InitTunnelMessage, RequestStartRunMessage, ServerMessage, TunneledRequestMessage, TunneledResponseMessage } from './messages';
import { TestAgentListener, TestCaseDefinition, TestCaseResult } from 'magnitude-core';
//import { deserializeRequest, serializeResponse } from './serde';

interface RemoteTestCaseAgentConfig {
    serverUrl: string;
    listeners: TestAgentListener[];
    // a local or private URL that if specified, will become the target of web traffic tunneled from remote's browser
    tunnelUrl: string | null;
}

const DEFAULT_CONFIG = {
    serverUrl: "ws://localhost:4444",
    listeners: [],
    tunnelUrl: null
};

interface TunnelSocket {
    // inactive until handshake completed
    status: 'inactive' | 'active'
    sock: WebSocket
}

export class RemoteTestCaseAgent {
    private config: RemoteTestCaseAgentConfig;
    private controlSocket: WebSocket | null = null;
    // Run ID assigned on confirm_start_run
    private runId: string | null = null;
    private tunnelSockets: TunnelSocket[] = [];

    constructor(config: Partial<RemoteTestCaseAgentConfig> = {}) {
        this.config = { ...DEFAULT_CONFIG, ...config };
    }

    public async run(testCase: TestCaseDefinition): Promise<TestCaseResult> {
        return new Promise((resolve, reject) => {
            this.controlSocket = new WebSocket(this.config.serverUrl);

            this.controlSocket.addEventListener('open', () => {
                const message: RequestStartRunMessage = {
                    type: 'request_start_run',
                    payload: {
                        testCase: testCase,
                        // If tunnel URL provided, request to establish tunnel sockets with server
                        needTunnel: this.config.tunnelUrl !== null
                    }
                };
                this.controlSocket!.send(JSON.stringify(message));
            });

            this.controlSocket.addEventListener('message', async (event) => {
                try {
                    const msg = JSON.parse(event.data) as ServerMessage;
                    //console.log("Control socket Received message:", msg);

                    if (msg.type === 'confirm_start_run') {
                        // Successful handshake response
                        this.runId = msg.payload.runId;
                        const numTunnelSockets = msg.payload.approvedTunnelSockets;
                        this.establishTunnelSockets(numTunnelSockets);
                    }
                    else if (msg.type === 'error') {
                        // Some unexpected error occurred on the server's side
                        logger.error(`Error message from server: ${msg.payload.message}`);
                        // probably close sockets
                        this.controlSocket!.close(1011);
                        reject(new Error(`Error message from server: ${msg.payload.message}`));
                    }
                    // Translate socket message to listener callbacks
                    else if (msg.type === 'event:start') {
                        for (const listener of this.config.listeners)
                            if (listener.onStart) listener.onStart(msg.payload.runMetadata);
                    }
                    else if (msg.type === 'event:action_taken') {
                        for (const listener of this.config.listeners)
                            if (listener.onActionTaken) listener.onActionTaken(msg.payload.action);
                    }
                    else if (msg.type === 'event:step_completed') {
                        for (const listener of this.config.listeners)
                            if (listener.onStepCompleted) listener.onStepCompleted();
                    }
                    else if (msg.type === 'event:check_completed') {
                        for (const listener of this.config.listeners)
                            if (listener.onCheckCompleted) listener.onCheckCompleted();
                    }
                    else if (msg.type === 'event:done') {
                        for (const listener of this.config.listeners)
                            if (listener.onDone) listener.onDone(msg.payload.result);
                        this.controlSocket!.close(1000);
                        resolve(msg.payload.result);
                    }
                } catch (error) {
                    logger.error("Error handling server message", error);
                }
            });

            this.controlSocket.addEventListener('close', (event) => {
                logger.info(`WebSocket closed: ${event.code} ${event.reason}`);
            });

            this.controlSocket.addEventListener('error', (event) => {
                //console.log(`WebSocket error:`);
                logger.error(event);
                reject(new Error("WebSocket connection error"));
            });
        });
    }

    private async establishTunnelSockets(numTunnelSockets: number) {
        for (let i = 0; i < numTunnelSockets; i++) {
            const sock = new WebSocket(this.config.serverUrl);
            this.tunnelSockets.push({
                sock: sock,
                status: 'inactive'
            });
            // Initiate Handshake
            sock.addEventListener('open', async (event) => {
                sock.send(JSON.stringify({
                    type: 'init:tunnel',
                    payload: {
                        runId: this.runId!
                    }
                } satisfies InitTunnelMessage));
            });

            sock.addEventListener('close', async (event) => {
                logger.info(`Tunnel WebSocket closed: ${event.code} ${event.reason}`);
            });

            sock.addEventListener('error', async (event) => {
                logger.error(event);
                sock.send('');
            });

            sock.addEventListener('message', async (event) => {
                console.log(`Tunnel index: ${i}`);
                //console.log(this.tunnelSockets);
                if (this.tunnelSockets[i].status === 'inactive') {
                    // Expect handshake confirmation
                    try {
                        const msg = JSON.parse(event.data) as ServerMessage;

                        if (msg.type === 'error') {
                            logger.error(`Error message from server on tunnel socket: ${msg.payload.message}`);
                            sock.close(1011);
                        } else if (msg.type === 'accept:tunnel') {
                            console.log(`Accept message received, Setting tunnel ${i} to active`)
                            this.tunnelSockets[i].status = 'active';
                        } else {
                            logger.warn(`Unexpected message type received to inactive tunnel socket: ${msg.type}`)
                        }
                    } catch (error) {
                        logger.error(`Error parsing message from server on tunnel socket: ${error}`);
                        //sock.close(1003);
                    }
                } else {
                    try  {
                        // Tunnel is active - this is HTTP traffic to be forwarded
                        // if (!(event.data instanceof Buffer)) {
                        //     throw new Error("Expected serialized HTTP request data");
                        // }
                        const msg = JSON.parse(event.data) as TunneledRequestMessage;
                        const req = msg.payload;

                        console.log("Forwarding request traffic:", msg);

                        //const request = await deserializeRequest(event.data);
                        const localResponse = await fetch(`${this.config.tunnelUrl!}${req.path}`, {
                            method: req.method,
                            headers: req.headers,
                            body: req.body
                        });
                        //const responseData = await serializeResponse(localResponse);

                        //console.log
                        const responseMessage: TunneledResponseMessage = {
                            type: 'tunnel:http_response',
                            payload: {
                                status: localResponse.status,
                                headers: Object.fromEntries(localResponse.headers.entries()),
                                // TODO: need to handle buffer data (and streaming)
                                body: await localResponse.text()
                            }
                        };

                        console.log("Returning response traffic:", responseMessage);

                        sock.send(JSON.stringify(responseMessage));
                    } catch (error) {
                        logger.error(`Error handling data message from server on tunnel socket: ${error}`);
                    }
                }
                //sock.send('');
            });
        }
    }
}