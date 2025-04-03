import logger from "./logger";
import { ApproveAuthorizationMessage, ObserverMessage } from "./messages";

export class ObserverConnection {
    /**
     * Protocol+connection abstraction for server socket connection to observer/authorizer
     */
    private observerUrl: string;
    private socket: WebSocket | null = null;

    constructor(observerUrl: string) {
        this.observerUrl = observerUrl;
    }

    async connect(apiKey: string): Promise<ApproveAuthorizationMessage> {
        /**
         * Connect socket to observer and authorize
         */
        let authErrorHandler, authMessageHandler;

        try {
            return await new Promise<ApproveAuthorizationMessage>((resolve, reject) => {
                try {
                    this.socket = new WebSocket(this.observerUrl);

                    const closeHandler = (event: Event) => {
                        logger.info(`Observer socket closed`);
                    }
                    

                    authErrorHandler = (event: Event) => {
                        logger.error(`Error on observer socket: ${event}`);
                        reject(new Error(`Socket error during connection: ${event}`));
                    };
                    

                    authMessageHandler = (event: MessageEvent<any>) => {
                        const msg = JSON.parse(event.data) as ObserverMessage;
                        if (msg.kind === 'accept:authorize') {
                            resolve(msg);
                        } else if (msg.kind === 'error') {
                            reject(`Failed to authorize with observer: ${msg.payload.message}`);
                        } else {
                            logger.warn(`Unexpected message kind received on observer socket: ${(msg as any).kind}`);
                        }
                    }

                    const openHandler = (event: Event) => {
                        this.socket!.send(JSON.stringify({
                            kind: 'init:authorize',
                            payload: {
                                testCaseId: 'foo',
                                apiKey: apiKey
                            }
                        }));
                    };
                    
                    this.socket.addEventListener('close', closeHandler);
                    this.socket.addEventListener('error', authErrorHandler);
                    this.socket.addEventListener('message', authMessageHandler);
                    this.socket.addEventListener('open', openHandler, { once: true });
                } catch (error) {
                    reject(error);
                }
            });
        } finally {
            // Clean up authorization-specific listeners
            if (this.socket && authErrorHandler) {
                this.socket.removeEventListener('error', authErrorHandler);
            }
            if (this.socket && authMessageHandler) {
                this.socket.removeEventListener('message', authMessageHandler);
            }
        }
    }

    public getSocket(): WebSocket | null {
        return this.socket;
    }
}