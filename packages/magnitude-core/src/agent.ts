import { WebAction } from "@/web/types";
import { MicroAgent } from "@/ai/micro";
import { MacroAgent } from "@/ai/macro";
import { Browser } from "playwright";
import { WebHarness } from "@/web/harness";
import { TestCaseDefinition, TestCaseResult } from "@/types";
//import { NavigationError, ActionExecutionError, ActionConversionError, TestCaseError } from "@/errors";
import { CheckIngredient } from "./ai/baml_client";
import { TestAgentListener } from "./common/events";
import logger from './logger';
import { ActionIngredient } from "./recipe/types";

export interface TestCaseAgentConfig {
    listeners: TestAgentListener[]
    plannerModelProvider: 'SonnetBedrock' | 'SonnetAnthropic'
    // Browser options

    // Behavior/LLM options
}

const DEFAULT_CONFIG: TestCaseAgentConfig = {
    listeners: [],
    plannerModelProvider: 'SonnetBedrock'
}

export class TestCaseAgent {
    private config: TestCaseAgentConfig;
    private listeners: TestAgentListener[];
    private macro: MacroAgent;
    private micro: MicroAgent;
    
    constructor (config: Partial<TestCaseAgentConfig> = {})  {
        this.config = { ...DEFAULT_CONFIG, ...config };
        this.listeners = config.listeners || [];
        this.macro = new MacroAgent({ provider: this.config.plannerModelProvider });
        this.micro = new MicroAgent();
    }

    async run(browser: Browser, testCase: TestCaseDefinition): Promise<TestCaseResult> {
        /**
         * Wrapper for running to set up / cleanup browser context and handle unexpected errors.
         */
        // Should NOT throw unless truly unexpected error occurs
        //console.log("Agent is running test case:", testCase);

        // TODO: Set browser options and stuff
        logger.info("Creating browser context");
        const context = await browser.newContext({ viewport: { width: 1280, height: 720 }});
        const page = await context.newPage();
        const harness = new WebHarness(page);

        let result: TestCaseResult;

        try {
            result = await this._run(testCase, harness);
        } catch (error) {
            // Any unhandled errors are not expected, but wrap to prevent crashes
            logger.error(`Unexpected error: ${(error as Error).message}`);
            result = {
                passed: false,
                failure: {
                    variant: 'unknown',
                    message: `Unexpected error: ${(error as Error).message}`
                }
            }
        } finally {
            await context.close();
        }

        logger.info({ result }, "Test run complete");
        
        for (const listener of this.listeners) if(listener.onDone) listener.onDone(result);
        return result;
    }

    private async _run(testCase: TestCaseDefinition, harness: WebHarness): Promise<TestCaseResult> {
        // Not expected to throw errors. If it does - gets caught by run and converted to UnknownFailure result
        
        logger.info("Agent started");

        // Emit Start
        for (const listener of this.listeners) if(listener.onStart) listener.onStart(testCase, {});

        try {
            await harness.goto(testCase.url);
            const screenshot = await harness.screenshot();
            for (const listener of this.listeners) {
                // Emit synthetic load action
                // TODO: make this show local and not proxy URL
                if(listener.onActionTaken) {
                    listener.onActionTaken({'variant': 'load', 'url': testCase.url, screenshot: screenshot.image});
                }
            }
            
            logger.info(`Successfully navigated to starting URL: ${testCase.url}`);   
        } catch (error) {
            //throw new NavigationError(testCase.url, error as Error);
            logger.warn(`Failed to navigate to starting URL: ${testCase.url}`);
            return {
                passed: false,
                failure: {
                    variant: 'network',
                    message: `Could not connect to starting URL ${testCase.url}. Is the site running and accessible?`
                }
            }
        }

        const recipe = [];

        for (const step of testCase.steps) {
            logger.info(`Begin Step: ${step.description}`);
            //console.log(`Step: ${step.description}`);

            const stepActionIngredients: ActionIngredient[] = [];

            while (true) {
                const screenshot = await harness.screenshot();
                const { actions, finished } = await this.macro.createPartialRecipe(screenshot, step, stepActionIngredients);

                logger.info({ actions, finished }, `Partial recipe created`);
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
                        logger.info({ ingredient, action }, `Converted action`);
                    } catch(error) {
                        logger.error(`Error converting action: ${error}`);
                        /**
                         * When an action cannot convert, currently always because a target could not be found by micro model.
                         * Two cases:
                         * (a) The target is actually there, but the description written by macro could not be identified with micro
                         * (b) The target is not there
                         *    (i) because macro overplanned (most likely)
                         *    (ii) because macro gave nonsense (unlikely)
                         *    [ assume (i) - if (ii) you have bigger problems ]
                         * 
                         * We should diagnose (a) vs (b) to decide next course of action:
                         * (a) should trigger target description rewrite
                         * (b) should trigger recipe adjustment
                         */
                        
                        // action conversion error = bug in app or misalignment
                        // TODO: adjust plan for minor misalignments
                        // - should only actually fail if it's (1) a bug or (2) a test case misalignment that cannot be treated by recipe adjustment
                        // const failure = await this.macro.diagnoseTargetNotFound(screenshot, step, ingredient.target, stepActionIngredients);
                        // return {
                        //     passed: false,
                        //     failure: failure
                        // }
                        // This requires more thought
                        // TODO: MAG-103/MAG-104
                        return {
                            passed: false,
                            failure: {
                                'variant': 'misalignment',
                                'message': `Could not align ${ingredient.variant} action`
                            }
                        };
                        //throw new ActionConversionError(ingredient, error as Error);
                    }

                    //console.log('Action:', action);

                    try {
                        await harness.executeAction(action);
                        //this.config.onActionTaken(ingredient, action);
                        // Take new screenshot after action to provide in event
                    } catch (error) {
                        logger.error(`Error executing action: ${error}`);
                        // TODO: retries
                        //throw new ActionExecutionError(action, error as Error);
                        return {
                            passed: false,
                            failure: {
                                variant: 'browser',
                                message: `Failed to execute ${action.variant} action`
                            }
                        };
                    }
                    stepActionIngredients.push(ingredient);

                    const postActionScreenshot = await harness.screenshot();

                    for (const listener of this.listeners) if(listener.onActionTaken) listener.onActionTaken({...ingredient, ...action, screenshot: postActionScreenshot.image});
                    logger.info({ action }, `Action taken`);
                }

                // If macro expects these actions should complete the step, break
                if (finished) {
                    logger.info(`Done with step`);
                    for (const listener of this.listeners) if (listener.onStepCompleted) listener.onStepCompleted();//(step);
                    break;
                }
            }

            const stepCheckIngredients = [];

            const checkScreenshot = await harness.screenshot();
            for (const check of step.checks) {
                logger.info(`Checking: ${check}`);
                
                // Remove implicit context
                // This could be done in a batch for all checks in this step
                const checkNoContext = await this.macro.removeImplicitCheckContext(checkScreenshot, check, stepActionIngredients);

                //console.log('Check without context:', checkNoContext);
                logger.info(`Augmented check: ${checkNoContext}`);

                const checkIngredient: CheckIngredient = { "variant": "check", description: checkNoContext };

                stepCheckIngredients.push(checkIngredient);

                // TODO: Utilize check confidence
                const result = await this.micro.evaluateCheck(
                    checkScreenshot,
                    checkIngredient
                );
                if (result) {
                    // Passed
                    for (const listener of this.listeners) if (listener.onCheckCompleted) listener.onCheckCompleted();
                    //this.config.onCheckCompleted(check, checkIngredient);
                    logger.info(`Passed check`);
                } else {
                    // Failed check
                    logger.info(`Failed check`);
                    /**
                     * If check failed, one of:
                     * (a) Check should have passed
                     *   (i) but failed because converted check description was poorly written by macro (misalignment - agent fault)
                     * (b) Check failed correctly
                     *   (i) because the web app has a bug (bug)
                     *   (ii) because the check is unrelated to the current screenshot
                     *     (1) because step actions were not executed as expected (misalignment - agent fault)
                     *     (2) because the test case is written poorly or nonsensically (misalignment - test fault)
                     */
                    // TODO: adjust plan for minor misalignments
                    // - should only actually fail if it's (1) a bug or (2) a test case misalignment that cannot be treated by recipe adjustment
                    const failure = await this.macro.classifyCheckFailure(checkScreenshot, check, stepActionIngredients);
                    return {
                        passed: false,
                        failure: failure
                    }
                    // return {
                    //     passed: false,
                    //     failure: {
                    //         'variant': 'misalignment',
                    //         'message': `Failed check: ${check}`
                    //     }
                    // };
                    //return { passed: false, failure: { description: `Failed check: ${check}` } };//, recipe: recipe };
                }
            }

            // If checks pass, update cached recipe
            for (const ing of stepActionIngredients) recipe.push(ing);
            for (const check of stepCheckIngredients) recipe.push(check);
        }

        logger.info({ recipe }, `Final recipe`);

        return { passed: true, recipe: recipe };
    }

    
}