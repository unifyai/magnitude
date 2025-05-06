import { AgentState } from "magnitude-core";

export type TestState = {
    status: 'pending' | 'running' | 'passed' | 'failed' | 'cancelled';
    //startTime?: number;
    //error?: Error;
} & AgentState;

export type AllTestStates = Record<string, TestState>;
