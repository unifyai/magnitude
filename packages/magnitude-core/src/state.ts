// Just a bunch of information about a test case agent that is running / has run some test case.

import EventEmitter from "eventemitter3"
import { ActionDescriptor, FailureDescriptor } from "./common"
import { TestCaseAgent } from "./agent"
import { TestCaseResult } from "./types"


export interface StepDescriptor {
    variant: 'step',
    description: string,
    actions: ActionDescriptor[]
    status: 'pending' | 'running' | 'passed' | 'failed' | 'cancelled'
}

export interface CheckDescriptor {
    variant: 'check',
    description: string,
    status: 'pending' | 'running' | 'passed' | 'failed' | 'cancelled'
}

// Used to pass up to UI and render stuff, for logging, etc.
export interface AgentState {
    startedAt?: number,
	//doneAt?: number,
    cached?: boolean,
    stepsAndChecks: (StepDescriptor | CheckDescriptor)[],
    //actionCount: number,
	macroUsage: {
		provider: string,
		model: string,
		inputTokens: number,
		outputTokens: number,
		numCalls: number
	}
	microUsage: {
		provider: string,
		numCalls: number
	},
    failure?: FailureDescriptor
	//result?: TestCaseResult
}

export class AgentStateTracker {
    // Handles a lot of state tracking but not result/failure/done because the agent itself
    // doesn't know when done, that's known when the test fn finishes.
    private agent: TestCaseAgent;
    private state: AgentState;
    // ref to last step, handy for attaching actions to it
    // private lastStep: StepDescriptor | null = null;
    // private lastCheck: CheckDescriptor | null = null;

    private lastStepOrCheck: StepDescriptor | CheckDescriptor | null = null;
    private events: EventEmitter<{ 'update': (state: AgentState) => void }>;

    constructor(agent: TestCaseAgent) {
        this.agent = agent;
        this.state = {
            stepsAndChecks: [],
            macroUsage: agent.getMacro().getInfo(),
            microUsage: agent.getMicro().getInfo()
        }
        this.agent.getEvents().on('start', this.onStart, this);
        this.agent.getEvents().on('action', this.onAction, this);
        this.agent.getEvents().on('stepStart', this.onStepStart, this);
        this.agent.getEvents().on('checkStart', this.onCheckStart, this);
        this.agent.getEvents().on('stepSuccess', this.onStepSuccess, this);
        this.agent.getEvents().on('checkSuccess', this.onCheckSuccess, this);
        this.agent.getEvents().on('fail', this.onFail, this);
        
        // For forwarding state updates
        this.events = new EventEmitter();
    }

    getEvents() {
        return this.events;
    }

    getState() {
        return this.state;
    }

    // propagateState() {
    //     this.events.emit('update', this.state);
    // }

    onStart() {
        this.state.startedAt = Date.now();
        this.events.emit('update', this.state);
    }

    onAction(action: ActionDescriptor) {
        // TODO: maybe allow detatched actions (e.g. synthetic load at beginning, or manual low-level actions)
        if (!this.lastStepOrCheck || this.lastStepOrCheck.variant !== 'step') {
            throw new Error('Action reported without preceding step');
        }
        this.lastStepOrCheck.actions.push(action);
        this.events.emit('update', this.state);
    }

    onStepStart(description: string) {
        const stepDescriptor: StepDescriptor = {
            variant: 'step',
            description: description,
            actions: [],
            status: 'running'
        };
        this.state.stepsAndChecks.push(stepDescriptor);
        this.lastStepOrCheck = stepDescriptor;
        this.events.emit('update', this.state);
    }

    onCheckStart(description: string) {
        const checkDescriptor: CheckDescriptor = {
            variant: 'check',
            description: description,
            status: 'running'
        };
        this.state.stepsAndChecks.push(checkDescriptor);
        this.lastStepOrCheck = checkDescriptor;
        this.events.emit('update', this.state);
    }

    onStepSuccess() {
        if (!this.lastStepOrCheck || this.lastStepOrCheck.variant !== 'step') {
            throw new Error('Step success without preceding step');
        }
        this.lastStepOrCheck.status = 'passed';
        // Update any LLM metrics
        this.state.macroUsage = this.agent.getMacro().getInfo();
        this.state.microUsage = this.agent.getMicro().getInfo();
        this.events.emit('update', this.state);
    }

    onCheckSuccess() {
        if (!this.lastStepOrCheck || this.lastStepOrCheck.variant !== 'check') {
            throw new Error('Check success reported without preceding check');
        }
        this.lastStepOrCheck.status = 'passed';
        // Update any LLM metrics
        this.state.macroUsage = this.agent.getMacro().getInfo();
        this.state.microUsage = this.agent.getMicro().getInfo();
        this.events.emit('update', this.state);
    }

    onFail(failure: FailureDescriptor) {
        // if (!this.lastStepOrCheck) {
        //     throw new Error('Failure reported without preceding step or check');
        // }
        if (this.lastStepOrCheck) {
            if (failure.variant === 'cancelled') {
                this.lastStepOrCheck.status = 'cancelled';
            } else {
                this.lastStepOrCheck.status = 'failed';
            }
        }
        this.state.failure = failure;
        this.events.emit('update', this.state);
    }
}