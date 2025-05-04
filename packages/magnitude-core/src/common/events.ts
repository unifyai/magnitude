
// Common interfaces that can be used anywhere
// Goal is not to expose internals but provide all necessary info in events

import { ActionDescriptor } from "@/common/actions";
import { FailureDescriptor } from "./failure";

export interface AgentEvents {
    'start': () => void;

    // Emitted after any action is taken in the browser
    'action': (action: ActionDescriptor) => void;
    // Which step/check can be derived from TC definition + tracked state
    // TODO: include step options (test data)
    // Emitted when the actions for a step (not its checks) are completed
    'stepStart': (description: string) => void;
    // Emitted when a check associated with some step is completed
    'checkStart': (description: string) => void;

    'stepSuccess': () => void;
    'checkSuccess': () => void;

    // Emitted when the run fails - emitted after startStep or startCheck instead of completeStep/completeCheck
    'fail': (failure: FailureDescriptor) => void;
    // Emitted when test run is done, whether that be successful completion or failure
    //'done': (result: TestCaseResult) => void;
}