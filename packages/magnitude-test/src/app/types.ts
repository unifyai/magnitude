import { AgentState } from "magnitude-core";

export type TestState = {
    status: 'pending' | 'running' | 'passed' | 'failed';
    //startTime?: number;
    //error?: Error;
} & AgentState;

export type AllTestStates = Record<string, TestState>; 
