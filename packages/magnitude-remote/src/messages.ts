// type MessageType = 'request_start_run' | 'confirm_start_run';

import { ActionDescriptor, FailureDescriptor, TestCaseDefinition, TestCaseResult } from "magnitude-core";

// interface ControlMessage {
//     type: MessageType
// }


export type ClientMessage = RequestStartRunMessage | InitTunnelMessage | TunneledResponseMessage;
export type ServerMessage = ConfirmStartRunMessage | AcceptTunnelMessage | AgentEventMessage | ErrorMessage | TunneledRequestMessage;

//export type ControlMessage = RequestStartRunMessage | ConfirmStartRunMessage | ErrorMessage | InitTunnelMessage | AcceptTunnelMessage | AgentEventMessage;
export type AgentEventMessage = StartEventMessage | ActionTakenEventMessage | StepCompletedEventMessage | CheckCompletedEventMessage | DoneEventMessage;

// Handshake messages
export interface RequestStartRunMessage {
    type: 'request_start_run',
    payload: {
        // TODO
        testCase: TestCaseDefinition,
        // True if requesting to open tunnel sockets
        needTunnel: boolean;
    }
}

export interface ConfirmStartRunMessage {
    // Returned by server
    type: 'confirm_start_run',
    payload: {
        // TODO
        runId: string;
        // If tunneling requested, server will return # of tunnel socket connections it will accept for the run
        approvedTunnelSockets: number;
    }
}

export interface InitTunnelMessage {
    type: 'init:tunnel',
    payload: {
        runId: string;
        // todo: require run secret
    }
}

export interface AcceptTunnelMessage {
    type: 'accept:tunnel',
    payload: {}
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

export interface StartEventMessage {
    type: 'event:start',
    payload: {
        runMetadata: Record<string, any>
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

// export interface FailureEventMessage {
//     type: 'event:fail',
//     payload: {
//         failure: FailureDescriptor
//     }
// }

export interface DoneEventMessage {
    type: 'event:done',
    payload: {
        result: TestCaseResult
    }
}


export interface TunneledRequestMessage {
    type: 'tunnel:http_request',
    payload: {
        //id: string;
        method: string;
        path: string;
        headers: Record<string, string>;
        body: string | null;
    }
}

export interface TunneledResponseMessage {
    type: 'tunnel:http_response',
    payload: {
        //id: string;
        status: number;
        headers: Record<string, string>;
        body: string;
    }
}

// export function createEventForwardingListener(ws: )
