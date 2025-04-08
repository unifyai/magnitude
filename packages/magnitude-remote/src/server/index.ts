import { Server, ServerWebSocket } from 'bun';
import { AcceptTunnelMessage, ActionTakenEventMessage, CheckCompletedEventMessage, ClientMessage, AcceptStartRunMessage, DoneEventMessage, ErrorMessage, StartEventMessage, StepCompletedEventMessage, TunneledRequestMessage, TunneledResponseMessage, RequestStartRunMessage, InitTunnelMessage, RequestAuthorizationMessage, ObserverMessage, ApproveAuthorizationMessage } from '@/messages';
import * as cuid2 from '@paralleldrive/cuid2';
import logger from '@/logger';
import { Logger } from 'pino';
import { ActionDescriptor, FailureDescriptor, TestAgentListener, TestCaseAgent, TestCaseDefinition, TestCaseResult } from 'magnitude-core';
import { Browser, chromium } from 'playwright';
import { ObserverConnection } from '@/server/observer';
import { TunnelManager } from './tunnel';
import { SocketMetadata } from './types';
//import { deserializeResponse, serializeRequest } from './serde';
//import { pipeline } from 'stream';

const createId = cuid2.init({
    length: 12
});

interface RemoteTestRunnerConfig {
    port: number;
    observerUrl: string | null;
    socketsPerTunnel: number;
}

const DEFAULT_CONFIG = {
    port: 4444,
    observerUrl: null,
    socketsPerTunnel: 6,
};

// a connection for a test run, which may involve multiple websockets
interface Connection {
    controlSocket: ServerWebSocket<SocketMetadata>;
    logger: Logger;
    agent: TestCaseAgent;
    tunnel: TunnelManager | null;
    //tunnelSockets: Record<string, TunnelSocketState>;//TunnelSocketState[];
    // pendingRequests: Record<string, {
    //     resolve: (response: Response) => void,
    //     reject: (error: Error) => void,
    //     tunnel: TunnelSocketState
    // }>;
    //agentRunPromise: Promise<TestCaseResult>;
    // We aren't using these sockets - these are sockets being forwarded on this tunnel connection
    // TODO: implement subsocket tunneling
    //forwardedSockets: 
}



// interface TunnelSocketState {
//     sock: ServerWebSocket<SocketMetadata>;
//     // Whether this tunnel socket is free to send/recieve HTTP traffic
//     available: boolean;
//     // prob can git rid of available and just check for pending req
//     pendingRequest: null | {
//         resolve: (responseData: TunneledResponseMessage) => void,
//         reject: (error: Error) => void
//     };
// }

// interface ConnectionInfo {

// }

function extractSubdomainId(host: string): string | null {
    /**
     * Attempt to extract <id> from hosts of the form <id>.localhost:<port>
     * Returns null if host does is not localhost with subdomain
     */
    // Parse the host to check if it's a subdomain request
    const hostWithoutPort = host.includes(':') ? host.split(':')[0] : host;
    const hostParts = hostWithoutPort.split('.');
    
    // Check if this is a subdomain request (<id>.localhost)
    const isSubdomainRequest = hostParts.length === 2 && hostParts[1] === 'localhost';

    if (isSubdomainRequest) {
        return hostParts[0];
    } else {
        return null;
    }
    
    // // Only respond to health check if it's NOT a subdomain request
    // if (!isSubdomainRequest) {
    //     logger.debug('[REQUEST] Returning health check 200 response')
    //     return new Response('Tunnel server is running', { 
    //         status: 200,
    //         headers: { 'Content-Type': 'text/plain' }
    //     });
    // }
}

export class RemoteTestRunner {
    private config: RemoteTestRunnerConfig;
    private server: Server | null = null;
    private connections: Record<string, Connection>;
    private browser: Browser | null = null;
    //private runMetadata: Record<string, any> = {};

    constructor (config: Partial<RemoteTestRunnerConfig> = {})  {
        this.config = { ...DEFAULT_CONFIG, ...config };
        this.connections = {};
    }

    async start() {
        this.browser = await chromium.launch({ headless: false, args: ['--enable-logging', '--v=1', `--log-file=/tmp/chrome-debug.log`], });
        this.server = Bun.serve({
            hostname: "0.0.0.0",
            port: this.config.port,
            fetch: this.handleRequest.bind(this),
            websocket: {
                open: this.handleWebSocketOpen.bind(this),
                message: this.handleWebSocketMessage.bind(this),
                close: this.handleWebSocketClose.bind(this)
            }
        });
        logger.info('Remote test runner server started')
        if (this.config.observerUrl) logger.info(`Observer: ${this.config.observerUrl}`);
    }

    async stop() {
        if (this.browser) await this.browser.close();
        if (this.server) await this.server.stop();
    }

    private async handleRequest(req: Request, server: Server): Promise<Response> {
        /**
         * HTTP traffic is either:
         * (1) Websocket upgrade requests from client
         * (2) Traffic from hosted browser to proxy localhost e.g. <id>.localhost:4444
         * (3) Websocket upgrade requests from hosted browser
         * (4) Health check GET @ /
         */
        logger.info({
            url: req.url,
            method: req.method,
            headers: Object.fromEntries(req.headers.entries()),
            upgrade: req.headers.get('upgrade')
        });

        const url = new URL(req.url);
        // Try host in headers (original host destination) or fallback to URL host
        const host = req.headers.get('host') || url.hostname;

        // (1) & (3) handle websocket upgrade requests
        // TODO: handle forwarding/upgrade reconstruction
        if (req.headers.get('upgrade')?.toLowerCase() === 'websocket') {
            // Let Bun handle the upgrade
            logger.info("Upgrade request received")
            const success = server.upgrade(req, { data: {
                runId: null,
                isTunnelSocket: false,
                tunnelId: null
            }});
            logger.info(`Upgrade result: ${success ? 'Success' : 'Failed'}`);
            return success ? new Response() : new Response('WebSocket upgrade failed', { status: 500 });
        }

        // Try and extract tunnel ID if host is like `<id>.localhost:4444`
        const runId = extractSubdomainId(host);

        // (4) Health check
        if (!runId && req.method === 'GET' && url.pathname === '/') {
            return new Response('Tunnel server is running', { 
                status: 200,
                headers: { 'Content-Type': 'text/plain' }
            });
        }

        if (!runId) {
            // Invalid request - not for health check, socket upgrade, or proxy
            return new Response('Invalid request', { 
                status: 404,
                headers: { 'Content-Type': 'text/plain' }
            });
        }

        // (2) HTTP traffic needs to be tunneled through a corresponding established socket
        // TODO
        //console.log("Tunneling traffic")
        const conn = this.connections[runId];

        if (!conn) {
            logger.warn(`Run ID not found ${runId}`);
            return new Response(`Run ID not found ${runId}`, { 
                status: 404,
                headers: { 'Content-Type': 'text/plain' }
            });
        }

        // The incoming request will have host as a3089gcyxqqx.localhost:4444
        // This is fine - the client will fetch to the appropriate local URL which will override host/URL of this payload
        const response = await conn.tunnel!.handleRequest(req, server);
        return response;

        

        // Wait for return message from tunnel socket
        // HERE

        //return new Response();
    }

    private async handleWebSocketOpen(ws: ServerWebSocket<SocketMetadata>): Promise<void> {
        /**
         * The ONLY websockets that actually get opened on this server should be CONTROL connections.
         */
        //logger.info("Websocket open:", ws)
    }

    private async cleanupConnection(runId: string): Promise<void> {
        /**
         * If control socket for connection closes, do any necessary cleanup
         */
        // TODO: any other cleanup needed
        delete this.connections[runId];
    }

    private async handleWebSocketClose(ws: ServerWebSocket<SocketMetadata>): Promise<void> {
        if (ws.data.runId) {
            await this.cleanupConnection(ws.data.runId);
        }
    }

    private buildSocketForwardingListener(ws: ServerWebSocket<SocketMetadata> | WebSocket, additionalRunMetadata: Record<string, any>): TestAgentListener {
        // ServerWebSocket/WebSocket have same send API so this is chill
        return {
            onStart: (testCase: TestCaseDefinition, runMetadata: Record<string, any>) => {
                // TODO: Will want to inject own runMetadata (local agent provides none)
                ws.send(JSON.stringify({
                    kind: 'event:start',
                    payload: {
                        testCase: testCase,
                        runMetadata: { ...runMetadata, ...additionalRunMetadata }//ws.data.runMetadata } // remove available bool
                    }
                } satisfies StartEventMessage));
            },
            onActionTaken: (action: ActionDescriptor) => {
                ws.send(JSON.stringify({ kind: 'event:action_taken', payload: { action } } satisfies ActionTakenEventMessage));
            },
            onStepCompleted: () => {
                ws.send(JSON.stringify({ kind: 'event:step_completed', payload: {} } satisfies StepCompletedEventMessage));
            },
            onCheckCompleted: () => {
                ws.send(JSON.stringify({ kind: 'event:check_completed', payload: {} } satisfies CheckCompletedEventMessage));
            },
            onDone: (result: TestCaseResult) => {
                ws.send(JSON.stringify({ kind: 'event:done', payload: { result } } satisfies DoneEventMessage));
                // We expect client to gracefully close on its own after it receives this event.
                // TODO: Impl some timer in case client does not close these
            }
        }
    }

    private async initializeRun(ws: ServerWebSocket<SocketMetadata>, msg: RequestStartRunMessage) {
        const testCaseDefinition = msg.payload.testCase;
        const testCaseId = msg.payload.testCaseId;

        // If observer is configured, first need to acquire authorization

        //let orgName: string | null = null;

        // todo: return this or something to be rendered by test runner idk
        //let orgInfo: { orgName: string } | null = null;
        let observerConnection: ObserverConnection | null = null;
        let runMetadata: { orgName: string, dashboardUrl: string } | {} = {};
        
        if (this.config.observerUrl) {
            const apiKey = msg.payload.apiKey;
            if (!apiKey) {
                throw new Error("Missing API key");
            }

            observerConnection = new ObserverConnection(this.config.observerUrl);

            try {
                logger.info("Attempting authorization");
                
                // is hanging here - doesnt reject properly
                const msg = await observerConnection.connect(apiKey, testCaseId, testCaseDefinition);
                //orgName = msg.payload.orgName;
                runMetadata = { orgName: msg.payload.orgName, dashboardUrl: msg.payload.dashboardUrl };

                logger.info(runMetadata, "Authorization succeeded");
            } catch (error) {
                logger.warn(`Client failed authorization: ${error}`);

                throw new Error(`Failed to authorize with observer: ${error}`);
            }
        }
        
        const runId = createId();

        const agentListeners: TestAgentListener[] = [this.buildSocketForwardingListener(ws, runMetadata)];

        // If observer, subscribe it to event messages
        if (this.config.observerUrl) {
            agentListeners.push(this.buildSocketForwardingListener(observerConnection!.getSocket()!, runMetadata));
        }

        const agent = new TestCaseAgent({
            // On each agent event, convert to websocket traffic over the control socket
            listeners: agentListeners,
            plannerModelProvider: 'SonnetBedrock'
        });

        // Start agent
        // Can ignore the returned promise and just use onDone event
        
        const useTunnel = msg.payload.needTunnel;

        // WE SHOULD RUN *AFTER* TUNNELS ARE ESTABLISHED (if tunneling requested)

        // Inform client that run is accepted and that it may establish tunnel sockets
        logger.info(`Accepting run, approving ${this.config.socketsPerTunnel} tunnel sockets`);
        const response: AcceptStartRunMessage = {
            kind: 'accept:run',
            payload: {
                runId: runId,
                approvedTunnelSockets: this.config.socketsPerTunnel
            }
        };
        ws.send(JSON.stringify(response));
        //const tunnel = 
        // Wait for client to make tunnel connections
        // TODO: only do if need tunnel - otherwise dont expected connections
        // TODO: run agent AFTER
        const conn: Connection = {
            controlSocket: ws,
            logger: logger.child({ runId }),
            agent: agent,
            // Any connection that says it needs tunnel has a tunnel manager else null
            tunnel: useTunnel ? new TunnelManager(this.config.socketsPerTunnel) : null
            //tunnelSockets: {}
        }
        this.connections[runId] = conn;
        ws.data.runId = runId;
        conn.logger.info('Confirmed run');

        if (conn.tunnel) {
            conn.logger.info(`Waiting for tunnel connections to be made`);
            await conn.tunnel.waitForAllClientConnections();
            conn.logger.info(`Tunnel ready`);
        }

        agent.run(this.browser!, {
            ...testCaseDefinition,
            // If tunnel requested, use tunnel URL for run ID
            url: useTunnel ? `http://${runId}.localhost:4444` : testCaseDefinition.url
        });
    }

    private async initializeTunnelSocket(ws: ServerWebSocket<SocketMetadata>, msg: InitTunnelMessage) {
        // Initialize one of the sockets for a tunnel for a particular connection
        // Get corresponding connection
        // if (!this.connections)
        // msg.payload.runId
        const runId = msg.payload.runId;
        const conn = this.connections[runId];

        if (!conn) {
            // Trying to create sockets associated with non-existent run
            // Something weird happened, e.g. load balancer issue (not-sticky with multiple instances)
            // Or some other issue
            this.sendErrorMessage(ws, `Run with ID ${msg.payload.runId} is not active on this remote runner`);
        }

        const tunnelSocketId = createId();
        ws.data.runId = runId;
        ws.data.isActiveTunnelSocket = true;
        ws.data.tunnelSocketId = tunnelSocketId;

        try {
            conn.tunnel!.registerSocket(tunnelSocketId, ws);
        } catch (error) {
            this.sendErrorMessage(ws, (error as Error).message);
        }
        // const numActiveTunnels = Object.keys(conn.tunnelSockets).length;
        // if (numActiveTunnels >= this.config.socketsPerTunnel) {
        //     //
        //     this.sendErrorMessage(ws, `Too many sockets: ${numActiveTunnels + 1}/${this.config.socketsPerTunnel} allowed tunnel sockets for run ID ${msg.payload.runId}`);
        // }

        // conn.logger.info("Tunnel socket established");
        
        // // Assign socket metadata
        // const tunnelId = createId();
        // ws.data.runId = runId;
        // ws.data.isActiveTunnelSocket = true;
        // ws.data.tunnelId = tunnelId;
        // // Add socket to connection's list of tunnel sockets
        // conn.tunnelSockets[tunnelId] = {
        //     sock: ws,
        //     available: true,
        //     pendingRequest: null
        // };

        // Send accept response
        ws.send(JSON.stringify({
            kind: 'accept:tunnel',
            payload: {}
        } satisfies AcceptTunnelMessage));
    }

    private async handleWebSocketMessage(ws: ServerWebSocket<SocketMetadata>, raw_message: string | Buffer): Promise<void> {
        // const msg = ws.data;
        // if (msg.kind === 'request_start_run') {
        // }

        try {
            if (ws.data.isActiveTunnelSocket) {
                // Active (handshaked) tunnel socket
                // if active tunnel, run ID and tunnel ID should exist
                const conn = this.connections[ws.data.runId!];
                const tunnelSocketId = ws.data.tunnelSocketId!;

                await conn.tunnel!.handleWebSocketMessage(tunnelSocketId, raw_message);
            } else {
                // On control socket or a new socket (e.g. tunnel socket pre-handshake)

                if (raw_message instanceof Buffer) {
                    throw new Error("Expected JSON string message");
                }

                const msg = JSON.parse(raw_message as string) as ClientMessage;

                if (msg.kind === 'init:run') {
                    await this.initializeRun(ws, msg);
                    //logger.info({ runId }, `Confirmed run ${runId}`)
                }
                else if (msg.kind === 'init:tunnel') {
                    await this.initializeTunnelSocket(ws, msg);
                }
                else {
                    logger.warn(`Unhandled message type ${(msg as any).type}, ignoring`);
                }
            }

        } catch (error) {
            logger.error(`Error while handling client websocket message: ${error}`);
        
            // Send error back to client
            this.sendErrorMessage(ws, `Unexpected error: ${(error as Error).message}`);
        }
    }

    private sendErrorMessage(ws: ServerWebSocket<SocketMetadata>, message: string) {
        if (ws.data.runId) {
            logger.error({ runId: ws.data.runId }, `${message}`);
        } else {
            logger.error(`${message}`);
        }
        
        ws.send(JSON.stringify({
            kind: "error",
            payload: {
                message: message
            }
        } satisfies ErrorMessage));
    }
}