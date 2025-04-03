import { Server, ServerWebSocket } from 'bun';
import { AcceptTunnelMessage, ActionTakenEventMessage, CheckCompletedEventMessage, ClientMessage, AcceptStartRunMessage, DoneEventMessage, ErrorMessage, StartEventMessage, StepCompletedEventMessage, TunneledRequestMessage, TunneledResponseMessage, RequestStartRunMessage, InitTunnelMessage, RequestAuthorizationMessage, ObserverMessage, ApproveAuthorizationMessage } from './messages';
import * as cuid2 from '@paralleldrive/cuid2';
import logger from './logger';
import { Logger } from 'pino';
import { ActionDescriptor, FailureDescriptor, TestAgentListener, TestCaseAgent, TestCaseResult } from 'magnitude-core';
import { Browser, chromium } from 'playwright';
import { ObserverConnection } from './observer';
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
    tunnelSockets: Record<string, TunnelSocketState>;//TunnelSocketState[];
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

// Just so that we can teardown corresponding conn if needed
interface SocketMetadata {
    runId: string | null,
    // If true, this is an active (handshake completed) tunnel socket
    isActiveTunnelSocket: boolean
    // Active tunnel sockets are assigned a tunnel ID
    tunnelId: string | null
}

interface TunnelSocketState {
    sock: ServerWebSocket<SocketMetadata>;
    // Whether this tunnel socket is free to send/recieve HTTP traffic
    available: boolean;
    // prob can git rid of available and just check for pending req
    pendingRequest: null | {
        resolve: (responseData: TunneledResponseMessage) => void,
        reject: (error: Error) => void
    };
}

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
        console.log("Tunneling traffic")
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
        console.log("Serializing request")
        //const modifiedRequest = req.clone();

        const tunneledRequest: TunneledRequestMessage = {
            //id: requestId,
            kind: 'tunnel:http_request',
            payload: {
                method: req.method,
                path: url.pathname + url.search,
                headers: Object.fromEntries(req.headers.entries()),//this.headersToObject(req.headers),
                body: req.body ? await req.text() : null
            }
        };

        // We need to change url and host properties
        //modifiedRequest.url = 

        //const serializedHttpRequest = await serializeRequest(req);
        //console.log("Done serializing request");

        //console.log(serializedHttpRequest);

        let availableTunnel: TunnelSocketState | null = null;
        let availableTunnelId: string | null = null;
        for (const [tunnelId, tunnel] of Object.entries(conn.tunnelSockets)) {
            // Use first available tunnel
            if (tunnel.available) {
                //tunnel.available = false;
                // Forward serialized HTTP request
                //tunnel.sock.send(data);
                availableTunnel = tunnel;
                availableTunnelId = tunnelId;
            }
        }
        // TODO: queue system
        if (!availableTunnel || !availableTunnelId) {
            return new Response('All tunnel sockets busy, try again later', { 
                status: 503,
                headers: { 'Content-Type': 'text/plain' }
            });
        }

        availableTunnel.available = false;

        //const requestId = createId();
        const responsePromise = new Promise<TunneledResponseMessage>((resolve, reject) => {
            conn.tunnelSockets[availableTunnelId].pendingRequest = { resolve, reject };
            //conn.pendingRequests[requestId] = { resolve, reject, tunnel: availableTunnel };

            // Reject on timeout
            // setTimeout(() => {
            //     //
            // }, 30000);
        });

        availableTunnel.sock.send(JSON.stringify(tunneledRequest));

        const tunneledResponse = await responsePromise;

        //const response = deserializeResponse(responseData);


        const resp = new Response(
            tunneledResponse.payload.body, {
                status: tunneledResponse.payload.status,
                headers: tunneledResponse.payload.headers
            }
        );

        console.log("Return resp to browser:", resp);

        return resp;

        

        // Wait for return message from tunnel socket
        // HERE

        //return new Response();
    }

    private async handleWebSocketOpen(ws: ServerWebSocket<SocketMetadata>): Promise<void> {
        /**
         * The ONLY websockets that actually get opened on this server should be CONTROL connections.
         */
        logger.info("Websocket open:", ws)
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

    private buildSocketForwardingListener(ws: ServerWebSocket<SocketMetadata> | WebSocket): TestAgentListener {
        // ServerWebSocket/WebSocket have same send API so this is chill
        return {
            onStart: (runMetadata: Record<string, any>) => {
                // TODO: Will want to inject own runMetadata (local agent provides none)
                ws.send(JSON.stringify({
                    kind: 'event:start',
                    payload: { runMetadata: runMetadata }
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

        // If observer is configured, first need to acquire authorization

        //let orgName: string | null = null;

        // todo: return this or something to be rendered by test runner idk
        //let orgInfo: { orgName: string } | null = null;
        let observerConnection: ObserverConnection | null = null;
        let runMetadata: { orgName: string } | {} = {};
        
        if (this.config.observerUrl) {
            const apiKey = msg.payload.apiKey;
            if (!apiKey) {
                throw new Error("Missing API key");
            }

            observerConnection = new ObserverConnection(this.config.observerUrl);

            try {
                logger.info("Attempting authorization");
                
                // is hanging here - doesnt reject properly
                const msg = await observerConnection.connect(apiKey);
                //orgName = msg.payload.orgName;
                runMetadata = { orgName: msg.payload.orgName };

                logger.info(runMetadata, "Authorization succeeded");
            } catch (error) {
                logger.warn(`Client failed authorization: ${error}`);

                throw new Error(`Failed to authorize with observer: ${error}`);
            }
        }
        
        const runId = createId();

        const agentListeners: TestAgentListener[] = [this.buildSocketForwardingListener(ws)];

        // If observer, subscribe it to event messages
        if (this.config.observerUrl) {
            agentListeners.push(this.buildSocketForwardingListener(observerConnection!.getSocket()!));
        }

        const agent = new TestCaseAgent({
            // On each agent event, convert to websocket traffic over the control socket
            listeners: agentListeners
        });

        // Start agent
        // Can ignore the returned promise and just use onDone event
        agent.run(this.browser!, {
            ...testCaseDefinition,
            // If tunnel requested, use tunnel URL for run ID
            url: msg.payload.needTunnel ? `http://${runId}.localhost:4444` : testCaseDefinition.url
        });

        // Inform client that run is accepted and that it may establish tunnel sockets
        const response: AcceptStartRunMessage = {
            kind: 'accept:run',
            payload: {
                runId: runId,
                approvedTunnelSockets: this.config.socketsPerTunnel
            }
        };
        ws.send(JSON.stringify(response));
        const conn: Connection = {
            controlSocket: ws,
            logger: logger.child({ runId }),
            agent: agent,
            tunnelSockets: {}
        }
        this.connections[runId] = conn;
        ws.data.runId = runId;
        conn.logger.info('Confirmed run');
    }

    private async initializeTunnel(ws: ServerWebSocket<SocketMetadata>, msg: InitTunnelMessage) {
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

        //const
        const numActiveTunnels = Object.keys(conn.tunnelSockets).length;
        if (numActiveTunnels >= this.config.socketsPerTunnel) {
            //
            this.sendErrorMessage(ws, `Too many sockets: ${numActiveTunnels + 1}/${this.config.socketsPerTunnel} allowed tunnel sockets for run ID ${msg.payload.runId}`);
        }

        conn.logger.info("Tunnel socket established")
        
        // Assign socket metadata
        const tunnelId = createId();
        ws.data.runId = runId;
        ws.data.isActiveTunnelSocket = true;
        ws.data.tunnelId = tunnelId;
        // Add socket to connection's list of tunnel sockets
        conn.tunnelSockets[tunnelId] = {
            sock: ws,
            available: true,
            pendingRequest: null
        };

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
                // This should be a serialized response to a tunneled HTTP request
                if (raw_message instanceof Buffer) {
                    throw new Error("Expected JSON string message")
                }
                // if (!(raw_message instanceof Buffer)) {
                //     throw new Error("Expected serialized HTTP message")
                // }
                const runId = ws.data.runId!;
                const tunnelId = ws.data.tunnelId!;

                // Make data available for request handler to return
                // HERE
                const conn = this.connections[runId].tunnelSockets[tunnelId];
                // todo: check missing

                const responseData = JSON.parse(raw_message as string) as TunneledResponseMessage;
                
                if (conn.pendingRequest) {
                    conn.pendingRequest.resolve(responseData);
                    conn.pendingRequest = null;
                    conn.available = true;
                }

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
                    await this.initializeTunnel(ws, msg);
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