import { ClickWebAction, TypeWebAction } from "@/web/types";
import { ClickIngredient, TypeIngredient } from "@/recipe/types";

export type ActionVariant = 'load' | 'click' | 'hover' | 'type' | 'scroll' | 'wait' | 'back';

export type ActionDescriptor = ClickActionDescriptor | TypeActionDescriptor;

export type ClickActionDescriptor = ClickIngredient & ClickWebAction;
export type TypeActionDescriptor = TypeIngredient & TypeWebAction;

//const a: ClickActionDescriptor = { variant: 'click', x: 1, y: 2, target: ''}
