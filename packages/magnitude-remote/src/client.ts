import logger from './logger';
import WebSocket from 'ws';
import { RequestStartRunMessage } from './messages';

export class RemoteRunnerClient {
    private controlSocket: WebSocket | null = null;

    public async run() {
        return new Promise((resolve, reject) => {
            this.controlSocket = new WebSocket("ws://localhost:4444");

            this.controlSocket.on('open', async () => {
                const message: RequestStartRunMessage = {
                    type: 'request_start_run',
                    payload: {}
                }
                this.controlSocket!.send(JSON.stringify(message));
            });

            this.controlSocket.on('message', async (rawData) => {
                try {
                    const msg = JSON.parse(rawData.toString());
                    console.log("Received message:", msg);
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