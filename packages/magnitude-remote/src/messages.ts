// type MessageType = 'request_start_run' | 'confirm_start_run';

import { ActionDescriptor, FailureDescriptor, TestCaseDefinition, TestCaseResult } from "magnitude-core";

// interface ControlMessage {
//     kind: MessageType
// }


export type ClientMessage = RequestStartRunMessage | InitTunnelMessage | TunneledResponseMessage;
export type ServerMessage = AcceptStartRunMessage | AcceptTunnelMessage | AgentEventMessage | ErrorMessage | TunneledRequestMessage;

export type InformantMessage = RequestAuthorizationMessage;
export type ObserverMessage = ApproveAuthorizationMessage | ErrorMessage;

//export type ControlMessage = RequestStartRunMessage | ConfirmStartRunMessage | ErrorMessage | InitTunnelMessage | AcceptTunnelMessage | AgentEventMessage;
export type AgentEventMessage = StartEventMessage | ActionTakenEventMessage | StepCompletedEventMessage | CheckCompletedEventMessage | DoneEventMessage;

// Handshake messages
export interface RequestStartRunMessage {
    kind: 'init:run',
    payload: {
        // TODO
        testCase: TestCaseDefinition,
        // True if requesting to open tunnel sockets
        needTunnel: boolean;
        // Required if observer/authorizer is configured
        apiKey: string | null;
    }
}

export interface AcceptStartRunMessage {
    // Returned by server
    kind: 'accept:run',
    payload: {
        // TODO
        runId: string;
        // If tunneling requested, server will return # of tunnel socket connections it will accept for the run
        approvedTunnelSockets: number;
    }
}

export interface InitTunnelMessage {
    kind: 'init:tunnel',
    payload: {
        runId: string;
        // todo: require run secret
    }
}

export interface AcceptTunnelMessage {
    kind: 'accept:tunnel',
    payload: {}
}

// interface RejectStartRunMessage {
//     // Returned by server
//     kind: 'reject_start_run',
//     payload: {
//         // TODO
//         reason: string;
//     }
// }

export interface ErrorMessage {
    // Returned by server
    kind: 'error',
    payload: {
        message: string;
    }
}

export interface StartEventMessage {
    kind: 'event:start',
    payload: {
        testCase: TestCaseDefinition
        runMetadata: Record<string, any>
    }
}

export interface ActionTakenEventMessage {
    kind: 'event:action_taken',
    payload: {
        action: ActionDescriptor
    }
}

export interface StepCompletedEventMessage {
    kind: 'event:step_completed',
    payload: {}
}

export interface CheckCompletedEventMessage {
    kind: 'event:check_completed',
    payload: {}
}

// export interface FailureEventMessage {
//     kind: 'event:fail',
//     payload: {
//         failure: FailureDescriptor
//     }
// }

export interface DoneEventMessage {
    kind: 'event:done',
    payload: {
        result: TestCaseResult
    }
}


export interface TunneledRequestMessage {
    kind: 'tunnel:http_request',
    payload: {
        //id: string;
        method: string;
        path: string;
        headers: Record<string, string>;
        body: string | null;
    }
}

export interface TunneledResponseMessage {
    kind: 'tunnel:http_response',
    payload: {
        //id: string;
        status: number;
        headers: Record<string, string>;
        body: string;
    }
}

// export function createEventForwardingListener(ws: )

export interface RequestAuthorizationMessage {
    kind: 'init:authorize'
    payload: {
        testCaseId: string
        apiKey: string
    }
}

export interface ApproveAuthorizationMessage {
    kind: 'accept:authorize'
    payload: {
        orgName: string
        orgCredits: number
    }
}