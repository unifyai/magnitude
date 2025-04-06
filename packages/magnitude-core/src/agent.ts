import { WebAction } from "@/web/types";
import { MicroAgent } from "@/ai/micro";
import { MacroAgent } from "@/ai/macro";
import { Browser, chromium } from "playwright";
import { WebHarness } from "@/web/harness";
import { TestCaseDefinition, TestCaseResult, TestStepDefinition } from "@/types";
import { NavigationError, ActionExecutionError, ActionConversionError, TestCaseError } from "@/errors";
import { CheckIngredient } from "./ai/baml_client";
import { ActionIngredient } from "./recipe/types";
import { TestAgentListener } from "./common/events";

export interface TestCaseAgentConfig {
    // Event listeners
    //onActionTaken: (ingredient: ActionIngredient, action: WebAction) => void;
    //onStepCompleted: (step: TestStep) => void;
    // testCaseCheck: check provided in test case
    // ingredient: contains transformed check
    //onCheckCompleted: (testCaseCheck: string, ingredient: CheckIngredient) => void;
    //onRecipeUpdated()
    listeners: TestAgentListener[]
    // Browser options

    // Behavior/LLM options
}

const DEFAULT_CONFIG = {
    listeners: []
    // onActionTaken: () => {},
    // onStepCompleted: () => {},
    // onCheckCompleted: () => {}
}

export class TestCaseAgent {
    //private testCase: TestCase;
    private config: TestCaseAgentConfig;
    private listeners: TestAgentListener[];
    private macro: MacroAgent;
    private micro: MicroAgent;
    
    constructor (config: Partial<TestCaseAgentConfig> = {})  {
        //this.testCase = testCase;
        this.config = { ...DEFAULT_CONFIG, ...config };
        this.listeners = config.listeners || [];
        this.macro = new MacroAgent();
        this.micro = new MicroAgent();
    }

    async run(browser: Browser, testCase: TestCaseDefinition): Promise<TestCaseResult> {
        // Should NOT throw unless truly unexpected error occurs
        //console.log("Agent is running test case:", testCase);

        // Setup browser
        // TODO: Set browser options and stuff
        //const browser = await chromium.launch({ headless: false });
        const context = await browser.newContext({ viewport: { width: 1280, height: 720 }});
        const page = await context.newPage();
        const harness = new WebHarness(page);

        try {
            const result = await this._run(testCase, harness);
            for (const listener of this.listeners) if(listener.onDone) listener.onDone(result);
            return result;
        } catch (error) {
            if (error instanceof TestCaseError) {
                console.log("got error:", error)
                const failure = { description: error.message };
                const result: TestCaseResult = { passed: false, failure: failure };
                for (const listener of this.listeners) if(listener.onDone) listener.onDone(result);
                return { passed: false, failure: failure };
            } else {
                console.error("Unexpected error:", error);
                throw error;
            }
        } finally {
            //console.log("Agent done running test case");
            await context.close();//browser.close();
        }
    }

    private async _run(testCase: TestCaseDefinition, harness: WebHarness): Promise<TestCaseResult> {
        // May throw TestCaseErrors that get handled by run()

        // Emit Start
        for (const listener of this.listeners) if(listener.onStart) listener.onStart(testCase, {});

        try {
            await harness.goto(testCase.url);
            for (const listener of this.listeners) {
                // Emit synthetic load action
                // TODO: make this show local and not proxy URL
                if(listener.onActionTaken) {
                    listener.onActionTaken({'variant': 'load', 'url': testCase.url});
                }
            }
                
        } catch (error) {
            throw new NavigationError(testCase.url, error as Error);
        }

        const recipe = [];

        for (const step of testCase.steps) {
            //console.log(`Step: ${step.description}`);

            const stepRecipe = [];

            while (true) {
                const screenshot = await harness.screenshot();
                const { actions, finished } = await this.macro.createPartialRecipe(screenshot, step, stepRecipe);
                //console.log('Partial recipe:', actions);
                //console.log('Finish expected?', finished);

                // Execute partial recipe
                for (const ingredient of actions) {
                    const screenshot = await harness.screenshot();
                    let action: WebAction;
                    // TODO: Handle conversion parsing/confidence failures
                    try {
                        // does catch make sense here? essentially indicates very low confidence
                        // bad cases either 1. action with low confidence
                        // 2. no action (target not identified at all)
                        action = await this.micro.convertAction(screenshot, ingredient);
                    } catch(error) {
                        throw new ActionConversionError(ingredient, error as Error);
                    }

                    //console.log('Action:', action);

                    try {
                        await harness.executeAction(action);
                        //this.config.onActionTaken(ingredient, action);
                        for (const listener of this.listeners) if(listener.onActionTaken) listener.onActionTaken({...ingredient, ...action});
                    } catch (error) {
                        // TODO: retries
                        throw new ActionExecutionError(action, error as Error);
                    }
                    stepRecipe.push(ingredient);
                    // Fixed wait for now
                    await new Promise(resolve => setTimeout(resolve, 1000));
                }

                // If macro expects these actions should complete the step, break
                if (finished) {
                    for (const listener of this.listeners) if (listener.onStepCompleted) listener.onStepCompleted();//(step);
                    break;
                }
            }

            const stepChecks = [];

            const checkScreenshot = await harness.screenshot();
            for (const check of step.checks) {
                //console.log(`Checking: ${check}`)
                
                // Remove implicit context
                // This could be done in a batch for all checks in this step
                const checkNoContext = await this.macro.removeImplicitCheckContext(checkScreenshot, check, stepRecipe);

                //console.log('Check without context:', checkNoContext);

                const checkIngredient: CheckIngredient = { "variant": "check", description: checkNoContext };

                stepChecks.push(checkIngredient);

                // TODO: Utilize check confidence
                const result = await this.micro.evaluateCheck(
                    checkScreenshot,
                    checkIngredient
                );
                if (result) {
                    // Passed
                    for (const listener of this.listeners) if (listener.onCheckCompleted) listener.onCheckCompleted();
                    //this.config.onCheckCompleted(check, checkIngredient);
                } else {
                    // Failed check
                    return { passed: false, failure: { description: `Failed check: ${check}` } };//, recipe: recipe };
                }
            }

            // If checks pass, update cached recipe
            for (const ing of stepRecipe) recipe.push(ing);
            for (const check of stepChecks) recipe.push(check);
        }

        return { passed: true, recipe: recipe };
    }

    
}