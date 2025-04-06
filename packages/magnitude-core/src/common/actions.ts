import { ClickWebAction, NavigateWebAction, TypeWebAction } from "@/web/types";
import { ClickIngredient, TypeIngredient } from "@/recipe/types";

export type ActionVariant = 'load' | 'click' | 'hover' | 'type' | 'scroll' | 'wait' | 'back';

export type ActionDescriptor = NavigateActionDescriptor | ClickActionDescriptor | TypeActionDescriptor;

export type NavigateActionDescriptor = NavigateWebAction & { screenshot: string };
export type ClickActionDescriptor = ClickIngredient & ClickWebAction & { screenshot: string };
export type TypeActionDescriptor = TypeIngredient & TypeWebAction & { screenshot: string };

//const a: ClickActionDescriptor = { variant: 'click', x: 1, y: 2, target: ''}
