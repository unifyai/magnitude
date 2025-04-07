import { Server, ServerWebSocket } from "bun";
import { SocketMetadata } from '@/server/types';
import logger from '@/logger';
import { TunneledRequestMessage, TunneledResponseMessage } from "@/messages";
import cuid2 from "@paralleldrive/cuid2";

const REQUEST_TIMEOUT_MS = 30000;

const createId = cuid2.init({
    length: 12
});

// For readability
type TunnelSocketID = string;
type RequestID = string;

export class TunnelManager {
    /**
     * Represents a single web traffic tunnel connection parallelized over several sockets.
     * Solely responsible for HTTP/socket forwarding, not protocol stuff.
     * Caller responsible for keeping track of which messages go to which tunnel sockets via tunnelSocketId.
     */
    private expectedSockets: number;
    private readyPromise: Promise<void>;
    private readyResolver!: () => void;

    private sockets: Record<TunnelSocketID, ServerWebSocket<SocketMetadata>> = {};
    //private 

    // All pending requests, possible in queue, waiting to get handled by an available socket tunnel
    private pendingRequests: Record<RequestID, {
        resolve: (responseData: TunneledResponseMessage) => void,
        reject: (error: Error) => void
    }> = {};

    // Requests currently being handled by a socket
    // Maps from tunnel socket ID to request ID
    private activeRequests: Record<TunnelSocketID, RequestID | 'reserving' | null> = {};

    // Queue of waiters for available sockets
    private socketWaitQueue: ((socketId: TunnelSocketID) => void)[] = [];

    constructor(expectedSockets: number) {
        this.expectedSockets = expectedSockets;
        this.readyPromise = new Promise<void>((resolve, reject) => {
            logger.info(`Setting ready resolver: ${resolve}`);
            this.readyResolver = resolve;
        });
    }

    async waitForAllClientConnections(): Promise<void> {
        // Wait for expected number of sockets to get registered
        logger.info(`Waiting on resolver: ${this.readyResolver}`);
        return this.readyPromise;
    }

    registerSocket(tunnelSocketId: TunnelSocketID, ws: ServerWebSocket<SocketMetadata>) {
        // Register a socket that's already undergone the tunnel handshake protocol
        if (Object.keys(this.sockets).length >= this.expectedSockets) {
            throw Error(`Too many sockets: ${this.expectedSockets} allowed tunnel sockets)`);
        }

        this.sockets[tunnelSocketId] = ws;
        this.activeRequests[tunnelSocketId] = null;

        const numConnectedSockets = Object.keys(this.sockets).length;

        logger.info(`Socket registered: ${tunnelSocketId}, ${numConnectedSockets}/${this.expectedSockets} connected`);

        logger.info(`Ready resolver: ${this.readyResolver}`);
        logger.info(`connected: ${numConnectedSockets}`)
        logger.info(`expected: ${this.expectedSockets}`)
        logger.info(`connected: ${typeof numConnectedSockets}`)
        logger.info(`expected: ${typeof this.expectedSockets}`)

        if (numConnectedSockets === this.expectedSockets) {
            logger.info(`All ${this.expectedSockets} sockets connected, tunnel manager ready`);
            this.readyResolver();
        }
    }

    private async waitForResponse(message: TunneledRequestMessage): Promise<TunneledResponseMessage> {
        logger.info(message, "Tunneling request");
        const requestId = createId();
        const responsePromise = new Promise<TunneledResponseMessage>((resolve, reject) => {
            this.pendingRequests[requestId] = {
                resolve, reject
            };
        });

        setTimeout(() => {
            if (this.pendingRequests[requestId]) {
                logger.warn(`Request ${requestId} timed out after ${REQUEST_TIMEOUT_MS}ms`);
                this.pendingRequests[requestId].reject(new Error(`Request timed out after ${REQUEST_TIMEOUT_MS}ms`));
                delete this.pendingRequests[requestId];
            }
        }, REQUEST_TIMEOUT_MS);

        // Acquire lock on a particular socket to use (potentially queues the request)
        logger.info({ requestId }, `Acquiring tunnel socket`)
        const tunnelSocketId = await this.acquireTunnelSocket();
        logger.info({ requestId }, `Tunnel socket acquired: ${tunnelSocketId}`);
        // Assign active request ID so that when receiving socket message whe know which request to resolve
        this.activeRequests[tunnelSocketId] = requestId;
        const sock = this.sockets[tunnelSocketId];
        // Send request over WS
        sock.send(JSON.stringify(message));
        // Wait for WS handler to resolve with response
        const response = await responsePromise;
        // Clear active request ID for the socket
        //this.activeRequests[tunnelSocketId] = null;
        // Release lock
        logger.info({ requestId }, `Releasing socket lock`);
        this.releaseTunnelSocket(tunnelSocketId);

        return response;
    }

    private async acquireTunnelSocket(): Promise<TunnelSocketID> {
        // If there are already waiters in the queue, get in line
        if (this.socketWaitQueue.length > 0) {
            logger.info(`Waiting in queue for available socket`);
            return new Promise<TunnelSocketID>(resolve => {
                this.socketWaitQueue.push(resolve);
            });
        }
        
        // Try to find an available socket
        // const availableSocketId = Object.keys(this.sockets).find(
        //     socketId => !this.activeRequests[socketId] // undefined or null
        // );
        // if (availableSocketId) {
        //     logger.info(`Found available socket`);
        //     return availableSocketId;
        // }

        for (const socketId of Object.keys(this.sockets)) {
            if (!this.activeRequests[socketId]) {
                // Prevent race conditions - Immediately mark as reserved with a temporary placeholder
                this.activeRequests[socketId] = 'reserving';
                return socketId;
            }
        }
        
        // If no socket is available, wait in the queue
        return new Promise<TunnelSocketID>(resolve => {
            logger.info(`First in queue for available socket`);
            this.socketWaitQueue.push(resolve);
        });
    }

    private async releaseTunnelSocket(tunnelSocketId: TunnelSocketID) {
        // If anyone is waiting for a socket, give them this one
        if (this.socketWaitQueue.length > 0) {
            const nextWaiter = this.socketWaitQueue.shift()!;
            nextWaiter(tunnelSocketId);
        } else {
            this.activeRequests[tunnelSocketId] = null;
        }
    }


    async handleRequest(req: Request, server: Server): Promise<Response> {
        // Handle an incoming REQUEST to get a tunneled response using an appropriate tunnel socket
        const url = new URL(req.url);

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

        const tunneledResponse = await this.waitForResponse(tunneledRequest);

        const resp = new Response(
            tunneledResponse.payload.body, {
                status: tunneledResponse.payload.status,
                headers: tunneledResponse.payload.headers
            }
        );
        return resp;
    }

    async handleWebSocketMessage(tunnelSocketId: string, raw_message: string | Buffer): Promise<void> {
        // Handle RESPONSES coming back from client as encoded data in socket
        const ws = this.sockets[tunnelSocketId];

        if (raw_message instanceof Buffer) {
            throw new Error("Expected JSON string message")
        }

        const responseData = JSON.parse(raw_message as string) as TunneledResponseMessage;

        // todo: handle err though shouldnt happen, also call reject if some error here
        const requestId = this.activeRequests[tunnelSocketId]!;

        this.pendingRequests[requestId].resolve(responseData);
        delete this.pendingRequests[requestId];
    }
}