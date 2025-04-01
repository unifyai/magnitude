
// Common interfaces that can be used anywhere
// Goal is not to expose internals but provide all necessary info in events

import { ActionDescriptor, ActionVariant } from "@/common/actions";
import { FailureDescriptor } from "./failure";
import { TestCaseResult } from "@/types";

// Both local and remote runners should accept listeners with these events
export interface TestAgentListener {
    // Events are lossy, only propogating up necessary high level data
    // Listener for test case events:

    // May include additional metadata about the run, for example if hosted test case IDs
    onStart?: (runMetadata: Record<string, any>) => void;

    // Emitted after any action is taken in the browser
    onActionTaken?: (action: ActionDescriptor) => void;
    // Which step/check can be derived from TC definition + tracked state
    // Emitted when the actions for a step (not its checks) are completed
    onStepCompleted?: () => void;
    // Emitted when a check associated with some step is completed
    onCheckCompleted?: () => void;

    //onFail: (failure: FailureDescriptor) => void;

    // Emitted when test run is done, whether that be successful completion or failure
    onDone?: (result: TestCaseResult) => void;
}
