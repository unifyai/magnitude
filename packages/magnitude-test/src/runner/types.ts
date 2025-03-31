import { TestCaseBuilder } from "../discovery/testCaseBuilder";

export interface RenderIdTestCasePair {
    renderId: string;
    testCase: TestCaseBuilder;
}

export type CategorizedTestCasesWithRenderIds = Record<string, { 
    ungrouped: RenderIdTestCasePair[], 
    groups: Record<string, RenderIdTestCasePair[]>
}>;

