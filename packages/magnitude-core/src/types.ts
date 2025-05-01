import { FailureDescriptor } from "./common";
//import { TestCaseError } from "./errors";
import { Ingredient } from "./recipe/types";

export interface TestDataEntry {
    key: string;
    value: string;
    sensitive: boolean;
}

export interface TestData {
    data?: TestDataEntry[];
    other?: string;
}

export interface TestStepDefinition {
    description: string;
	// TODO: remove checks
    checks: string[];
    testData: TestData;
}

// Definition of a test case
export interface TestCaseDefinition {
    url: string,
    steps: TestStepDefinition[],
    // Existing recipe to use if cached
    // TODO: this will change significantly - e.g. we need to keep track of what tc def formed this recipe,
    // so that if the tc def changes we know at what point the recipe becomes invalid and what is still usable.
    recipe?: Ingredient[]
}

export type TestCaseResult = SuccessfulTestCaseResult | FailedTestCaseResult;

// export interface TestCaseResult {
//     // if not passed and no failure, is pending
//     passed: boolean
//     // if passed the cached recipe will be returned
//     recipe?: Ingredient[],
//     // idk
//     //error?: TestCaseError
//     // if not passed, failure will be returned
//     failure?: FailureDescriptor
//     // ^ prob should have this be - if passed provide recipe, if failed provide failure reason (error)
// }

export interface SuccessfulTestCaseResult {
    passed: true
    recipe: Ingredient[]
}

export interface FailedTestCaseResult {
    passed: false
    failure: FailureDescriptor
}


export interface TestRunInfo {
	// version: string, // telemetry payload version will prob be nice in the future
	// userId: string, // anon cuid2 stored on local machines
	startedAt: number, // timestamp
	doneAt: number, // timestamp
	cached: boolean, // whether used a cached recipe
	testCase: {
		numSteps: number, // total num steps
		numChecks: number // total num checks
	},
	actionCount: number, // number of web actions taken
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
	result: string//'passed' | 'bug' | 'misalignment'
};
