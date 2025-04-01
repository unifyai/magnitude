// type MessageType = 'request_start_run' | 'confirm_start_run';

import { ActionDescriptor, FailureDescriptor, TestCaseDefinition } from "magnitude-core";

// interface ControlMessage {
//     type: MessageType
// }


export type ControlMessage = RequestStartRunMessage | ConfirmStartRunMessage | ErrorMessage;

// Handshake messages
export interface RequestStartRunMessage {
    type: 'request_start_run',
    payload: {
        // TODO
        testCase: TestCaseDefinition
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

export interface ActionTakenEventMessage {
    type: 'event:action_taken',
    payload: {
        action: ActionDescriptor
    }
}

export interface StepCompletedEventMessage {
    type: 'event:step_completed',
    payload: {}
}

export interface CheckCompletedEventMessage {
    type: 'event:check_completed',
    payload: {}
}

export interface FailureEventMessage {
    type: 'event:fail',
    payload: {
        failure: FailureDescriptor
    }
}


// export function createEventForwardingListener(ws: )
