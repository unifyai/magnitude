import { ActionIntent } from "@/intents/types";
import { WebAction } from "@/web/types";
import { ActionDescriptor } from "./actions";
import { StepOptions, TestData } from "@/types";

// export function describeAction(planAction: ActionIngredient, webAction: WebAction) {
//     switch (planAction.variant) {
//         case 'click':
//             return `Clicked ${planAction.target} at (${webAction.x}, ${webAction.y})`
//     }
// }

export function describeAction(action: ActionDescriptor) {
    switch (action.variant) {
        case 'load':
            return `Navigated to URL: ${action.url}`;
        case 'click':
            return `Clicked ${action.target} at (${action.x}, ${action.y})`;
        case 'type':
            return `Typed "${action.content}" into ${action.target} at (${action.x}, ${action.y})`;
        case 'scroll':
            return `Scrolled (${action.deltaX}, ${action.deltaY}) at (${action.x}, ${action.y})`;
        default:
            throw Error(`Unhandled action variant in describeAction: ${(action as any).variant}`);
    }
}

export function convertOptionsToTestData(options: StepOptions): TestData {
    if (!options.data) return {};
    if (typeof options.data === 'string') {
        return { other: options.data }
    } else {
        return { data: Object.entries(options.data).map(([k, v]) => ({
            key: k,
            value: v,
            sensitive: false
        }))}
    }
}