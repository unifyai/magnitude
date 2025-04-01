import { Server, ServerWebSocket } from 'bun';
import { ActionTakenEventMessage, CheckCompletedEventMessage, ConfirmStartRunMessage, ControlMessage, FailureEventMessage, StepCompletedEventMessage } from './messages';
import * as cuid2 from '@paralleldrive/cuid2';
import logger from './logger';
import { Logger } from 'pino';
import { ActionDescriptor, FailureDescriptor, TestCaseAgent, TestCaseResult } from 'magnitude-core';
import { Browser, chromium } from 'playwright';

const createId = cuid2.init({
    length: 12
});

// 1 byte header codes for multiplexing websocket traffic
const HEADER_CODES = {
    TUNNEL: 0x00, // forward raw binary data over the tunnel
    EVENT: 0x01 // parse events as json and handle appropriately
};

interface RemoteTestRunnerConfig {
    port: number
}

const DEFAULT_CONFIG = {
    port: 4444
};

// a connection for a test run, which may involve multiple websockets
interface Connection {
    controlSocket: ServerWebSocket<SocketMetadata>;
    logger: Logger;
    agent: TestCaseAgent;
    agentRunPromise: Promise<TestCaseResult>;
    // We aren't using these sockets - these are sockets being forwarded on this tunnel connection
    // TODO: implement subsocket tunneling
    //forwardedSockets: 
}

// Just so that we can teardown corresponding conn if needed
interface SocketMetadata {
    runId: string
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
            const success = server.upgrade(req, { data: {} });
            logger.info(`Upgrade result: ${success ? 'Success' : 'Failed'}`);
            return success ? new Response() : new Response('WebSocket upgrade failed', { status: 500 });
        }

        // Try and extract tunnel ID if host is like `<id>.localhost:4444`
        const tunnelId = extractSubdomainId(host);

        // (4) Health check
        if (!tunnelId && req.method === 'GET' && url.pathname === '/') {
            return new Response('Tunnel server is running', { 
                status: 200,
                headers: { 'Content-Type': 'text/plain' }
            });
        }

        if (!tunnelId) {
            // Invalid request - not for health check, socket upgrade, or proxy
            return new Response('Invalid request', { 
                status: 404,
                headers: { 'Content-Type': 'text/plain' }
            });
        }

        // (2) HTTP traffic needs to be tunneled through the corresponding established socket
        // TODO
        return new Response();
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

    private async handleWebSocketMessage(ws: ServerWebSocket<SocketMetadata>, raw_message: string | Buffer): Promise<void> {
        // const msg = ws.data;
        // if (msg.type === 'request_start_run') {
        // }

        try {
            if (raw_message instanceof Buffer) {
                throw new Error("Expected JSON string message")
            }

            const msg = JSON.parse(raw_message as string) as ControlMessage;

            if (msg.type === 'request_start_run') {
                const testCaseDefinition = msg.payload.testCase;
                // TODO: start run
                const runId = createId();

                const agent = new TestCaseAgent({
                    // On each agent event, convert to websocket traffic over the control socket
                    listeners: [{
                        onActionTaken(action: ActionDescriptor) {
                            ws.send(JSON.stringify({ type: 'event:action_taken', payload: { action } } satisfies ActionTakenEventMessage));
                        },
                        onStepCompleted() {
                            ws.send(JSON.stringify({ type: 'event:step_completed', payload: {} } satisfies StepCompletedEventMessage));
                        },
                        onCheckCompleted() {
                            ws.send(JSON.stringify({ type: 'event:check_completed', payload: {} } satisfies CheckCompletedEventMessage));
                        },
                        onFail(failure: FailureDescriptor) {
                            ws.send(JSON.stringify({ type: 'event:fail', payload: { failure } } satisfies FailureEventMessage));
                        }
                    }]
                });

                const runPromise = agent.run(this.browser!, testCaseDefinition);

                const response: ConfirmStartRunMessage = {
                    type: 'confirm_start_run',
                    payload: {
                        runId: runId
                    }
                };
                ws.send(JSON.stringify(response));
                const conn: Connection = {
                    controlSocket: ws,
                    logger: logger.child({ runId }),
                    agent: agent,
                    agentRunPromise: runPromise
                }
                this.connections[runId] = conn;
                ws.data.runId = runId;
                conn.logger.info('Confirmed run');
                //logger.info({ runId }, `Confirmed run ${runId}`)
            }

        } catch (error) {
            logger.error(`WebSocket message error: ${error}`);
        
            // Send error back to client
            ws.send(JSON.stringify({
                type: "error",
                error: (error as Error).message
            }));
        }
    }
}