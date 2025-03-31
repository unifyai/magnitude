
// Common interfaces that can be used anywhere
// Goal is not to expose internals but provide all necessary info in events

import { ActionDescriptor, ActionVariant } from "@/common/actions";
import { FailureDescriptor } from "./failure";

// Both local and remote runners should accept listeners with these events
export interface TestAgentListener {
    // Events are lossy, only propogating up necessary high level data
    // Listener for test case events:
    onActionTaken: (action: ActionDescriptor) => void;
    // Which step/check can be derived from TC definition + tracked state
    onStepCompleted: () => void;
    onCheckCompleted: () => void;
    onFail: (failure: FailureDescriptor) => void;
    //onActionTaken: (ingredient: ActionIngredient, action: WebAction) => void;
    //onStepCompleted: (step: TestStep) => void;
    // testCaseCheck: check provided in test case
    // ingredient: contains transformed check
    //onCheckCompleted: (testCaseCheck: string, ingredient: CheckIngredient) => void;
}