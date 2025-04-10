/**
 * "Ingredients" are natural language descriptors that align 1:1 with executable web actions.
 * Micro converts ingredients into web actions.
 */

export type ActionIngredient = ClickIngredient | TypeIngredient | ScrollIngredient;
export type Ingredient = ActionIngredient | CheckIngredient;
//export type Recipe = Ingredient[];

export interface ClickIngredient {
    variant: 'click';
    target: string;
}

export interface TypeIngredient {
    variant: 'type';
    target: string;
    content: string;
}

export interface ScrollIngredient {
    variant: 'scroll';
    target: string;
    deltaX: number;
    deltaY: number;
}

export interface CheckIngredient {
    variant: 'check';
    description: string;
}


//export type IngredientVariant = 'click' | 'type' | 'check';

// const foo: Ingredient = {
//     variant: 'click',
//     target: 'asfas'
// };