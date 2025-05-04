import { ClickWebAction, NavigateWebAction, ScrollWebAction, TypeWebAction } from "@/web/types";
import { ClickIntent, TypeIntent } from "@/intents/types";
import { ScrollIngredient } from "@/ai/baml_client";

export type ActionVariant = 'load' | 'click' | 'hover' | 'type' | 'scroll' | 'wait' | 'back';

export type ActionDescriptor = NavigateActionDescriptor | ClickActionDescriptor | TypeActionDescriptor | ScrollActionDescriptor;

export type NavigateActionDescriptor = NavigateWebAction & { screenshot: string };
export type ClickActionDescriptor = ClickIntent & ClickWebAction & { screenshot: string };
export type TypeActionDescriptor = TypeIntent & TypeWebAction & { screenshot: string };
export type ScrollActionDescriptor = ScrollIngredient & ScrollWebAction & { screenshot: string };

//const a: ClickActionDescriptor = { variant: 'click', x: 1, y: 2, target: ''}
