import { TestAgentListener } from "@/common/events";
import { ActionDescriptor } from "@/common/actions";
import { TestCaseDefinition, TestCaseResult, TestStepDefinition } from "@/types";
import { FailureDescriptor } from "./failure";

// export interface TestCheckState {
//     description: string;
//     status: 'passed' | 'failed'
// }



export interface TestStepState {
    // Actions taken during this step
    // description: string;
    // checks: string[];
    // testData: TestData;
    definition: TestStepDefinition
    actions: ActionDescriptor[]
    // could also store status / check status idk
}

// Representation of a test case in-progress
// Coupled to a corresponding TestCaseDefinition
export interface TestCaseState {
    steps: TestStepState[]
    stepIndex: number
    checkIndex: number
    result: TestCaseResult | null
    //failure: FailureDescriptor | null
}

// Some utilities for state
export function isTestCaseCompletedSuccessfully(state: TestCaseState): boolean {
    return state.result !== null && state.result.passed;
    // return !isTestCaseFailed(state) && state.stepIndex === state.steps.length - 1 &&
    //     state.checkIndex + 1 === state.steps[state.stepIndex].definition.checks.length;
}

export function isTestCaseDone(state: TestCaseState): boolean {
    return state.result !== null;
    //return isTestCaseFailed(state) || isTestCaseCompletedSuccessfully(state);
}

export function isTestCaseFailed(state: TestCaseState): boolean {
    return state.result !== null && !state.result.passed;
    //return state.failure !== null;
}


// Wrapper over test case events that can build state representation of the test case in memory
export class TestCaseStateTracker {
    // Test case definition
    private definition: TestCaseDefinition;
    private state: TestCaseState;
    private stateSubscribers: ((state: TestCaseState) => void)[];

    constructor(testCase: TestCaseDefinition) {
        this.definition = testCase;
        this.state = {
            steps: testCase.steps.map(def => ({
                definition: def,
                actions: [] as ActionDescriptor[]
            })),
            stepIndex: 0,
            checkIndex: -1, // -1 means we are on the step itself
            result: null
            //failure: null
        }
        this.stateSubscribers = [];
    }

    // For tracker to work, pass the result of get listener to the test runner
    getListener(): TestAgentListener {
        return {
            onStart: this._onStart.bind(this),
            onActionTaken: this._onActionTaken.bind(this),
            onStepCompleted: this._onStepCompleted.bind(this),
            onCheckCompleted: this._onCheckCompleted.bind(this),
            onDone: this._onDone.bind(this)
            //onFail: this._onFail.bind(this)
        }
    }

    getState(): TestCaseState {
        return this.state;
    }

    onStateChange(callback: (state: TestCaseState) => void) {
        // Register a listener for any state changes
        this.stateSubscribers.push(callback);
    }

    private _notifyStateSubscribers() {
        for (const subscriber of this.stateSubscribers) subscriber(this.state);
    }

    private _onStart(runMetadata: Record<string, any>) {
        // maybe set a start time or something on state idk
    }

    private _onActionTaken(action: ActionDescriptor) {
        this.state.steps[this.state.stepIndex].actions.push(action);
        this._notifyStateSubscribers();
    }

    private _onStepCompleted() {
        if (this.definition.steps[this.state.stepIndex].checks.length > 0) {
            // If we just finished the step but there are still checks, move on to the checks
            this.state.checkIndex += 1;
        } else {
            // If no checks, move on to next step
            this.state.stepIndex += 1;
            this.state.checkIndex = -1;
        }
        this._notifyStateSubscribers();
    }

    private _onCheckCompleted() {
        //this.state.checkIndex += 1;
        if (this.state.checkIndex + 1 >= this.definition.steps[this.state.stepIndex].checks.length) {
            // Finished last check in the step, move onto next step
            this.state.stepIndex += 1;
            this.state.checkIndex = -1;
        } else {
            // Still more checks in the current step
            this.state.checkIndex += 1;
        }
        this._notifyStateSubscribers();
    }

    private _onDone(result: TestCaseResult) {
        // console.log("this:", this);
        // console.log("state:", this.state);
        // if (!result.passed) {
        //     this.state.failure = result.failure;
        //     this._notifyStateSubscribers();
        // }
        this.state.result = result;
        this._notifyStateSubscribers();
    }

    // private _onFail(failure: FailureDescriptor) {
    //     console.log("this:", this);
    //     console.log("state:", this.state);
    //     this.state.failure = failure;
    //     this._notifyStateSubscribers();
    // }
}