import { TestCaseDefinition } from "magnitude-core";
import logger from "@/logger";
import { ApproveAuthorizationMessage, ObserverMessage, RequestAuthorizationMessage } from "@/messages";

export class ObserverConnection {
    /**
     * Protocol+connection abstraction for server socket connection to observer/authorizer
     */
    private observerUrl: string;
    private socket: WebSocket | null = null;

    constructor(observerUrl: string) {
        this.observerUrl = observerUrl;
    }

    async connect(apiKey: string, testCaseId: string, testCase: TestCaseDefinition): Promise<ApproveAuthorizationMessage> {
        /**
         * Connect socket to observer and authorize
         * testCaseId: SDK ID
         * testCase: TestCaseDefinition - provided so that observer can initialize and return dashboard URL
         */
        let authAbrubtCloseHandler, authErrorHandler, authMessageHandler;

        try {
            return await new Promise<ApproveAuthorizationMessage>((resolve, reject) => {
                try {
                    this.socket = new WebSocket(this.observerUrl);

                    authAbrubtCloseHandler = (event: Event) => {
                        // We do not expected socket to close here - indicates an error
                        // Unfortunately event provides no helpful info here
                        logger.error(`Observer socket closed unexpectedly`);
                        reject(new Error(`Observer socket closed unexpectedly`));
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
                                testCaseId: testCaseId,
                                testCase: testCase,
                                apiKey: apiKey
                            }
                        } satisfies RequestAuthorizationMessage));
                    };
                    
                    this.socket.addEventListener('close', authAbrubtCloseHandler);
                    this.socket.addEventListener('error', authErrorHandler);
                    this.socket.addEventListener('message', authMessageHandler);
                    this.socket.addEventListener('open', openHandler, { once: true });
                } catch (error) {
                    reject(error);
                }
            });
        } catch (error) {
            // If there was an error, propagate up is fine but close socket too
            if (this.socket) {
                this.socket.close();
                this.socket = null;
            }
            throw error;
        } finally {
            // Clean up authorization-specific listeners
            if (this.socket && authAbrubtCloseHandler) {
                this.socket.removeEventListener('close', authAbrubtCloseHandler);
            }
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