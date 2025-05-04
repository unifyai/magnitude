/**
 * "Intents" are natural language descriptors that align 1:1 with executable web actions.
 * Micro converts intents into web actions.
 */

export type ActionIntent = ClickIntent | TypeIntent | ScrollIntent;
export type Intent = ActionIntent | CheckIntent;
//export type Recipe = Ingredient[];

export interface ClickIntent {
    variant: 'click';
    target: string;
}

export interface TypeIntent {
    variant: 'type';
    target: string;
    content: string;
}

export interface ScrollIntent {
    variant: 'scroll';
    target: string;
    deltaX: number;
    deltaY: number;
}

export interface CheckIntent {
    variant: 'check';
    //description: string;
    checks: string[];
}
