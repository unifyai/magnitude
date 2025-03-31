import { ActionIngredient } from "@/recipe/types";
import { WebAction } from "@/web/types";
import { ActionDescriptor } from "./actions";

// export function describeAction(planAction: ActionIngredient, webAction: WebAction) {
//     switch (planAction.variant) {
//         case 'click':
//             return `Clicked ${planAction.target} at (${webAction.x}, ${webAction.y})`
//     }
// }

export function describeAction(action: ActionDescriptor) {
    switch (action.variant) {
        case 'click':
            return `Clicked ${action.target} at (${action.x}, ${action.y})`;
        case 'type':
            return `Typed "${action.content}" into ${action.target} at (${action.x}, ${action.y})`;
        default:
            throw Error(`Unhandled action variant in describeAction: ${(action as any).variant}`);
    }
}