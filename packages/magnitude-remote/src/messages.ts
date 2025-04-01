// type MessageType = 'request_start_run' | 'confirm_start_run';

// interface ControlMessage {
//     type: MessageType
// }


export type ControlMessage = RequestStartRunMessage | ConfirmStartRunMessage | ErrorMessage;

// Handshake messages
export interface RequestStartRunMessage {
    type: 'request_start_run',
    payload: {
        // TODO
    }
}

export interface ConfirmStartRunMessage {
    // Returned by server
    type: 'confirm_start_run',
    payload: {
        // TODO
        runId: string;
    }
}

// interface RejectStartRunMessage {
//     // Returned by server
//     type: 'reject_start_run',
//     payload: {
//         // TODO
//         reason: string;
//     }
// }

export interface ErrorMessage {
    // Returned by server
    type: 'error',
    payload: {
        message: string;
    }
}