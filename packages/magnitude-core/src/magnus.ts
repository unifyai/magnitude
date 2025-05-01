import { Screenshot, WebAction } from "@/web/types";
import { MicroAgent } from "@/ai/micro";
import { MacroAgent } from "@/ai/macro";
import { Browser, BrowserContext, BrowserContextOptions } from "playwright";
import { WebHarness } from "@/web/harness";
import { TestCaseDefinition, TestCaseResult, TestRunInfo } from "@/types";
//import { NavigationError, ActionExecutionError, ActionConversionError, TestCaseError } from "@/errors";
import { CheckIngredient } from "./ai/baml_client";
import { AgentEvents, TestAgentListener } from "./common/events";
import logger from './logger';
import { ActionIngredient } from "./recipe/types";
import { traceAsync } from '@/ai/baml_client/tracing';
import { PlannerClient, ExecutorClient } from "@/ai/types";
import EventEmitter from "eventemitter3";
import { AgentState, StepDescriptor } from "./state";

interface TestCaseAgentConfig {
    planner: PlannerClient,
    executor: ExecutorClient
    browserContextOptions: BrowserContextOptions
}

const DEFAULT_CONFIG = {
    browserContextOptions: {}
}

export class Magnus {
    private config: TestCaseAgentConfig;
    private macro: MacroAgent;
    private micro: MicroAgent;
    private harness!: WebHarness;
    private context!: BrowserContext;
    //private info: Partial<TestRunInfo>;
    //private state!: AgentState;
    private events: EventEmitter<AgentEvents>;
    private lastScreenshot: Screenshot | null;
    private lastStepActions: ActionIngredient[] | null;

    // private lastStep: {
    //     screenshot: Screenshot;
        
    // }
    
    constructor (config: TestCaseAgentConfig)  {
        this.config = { ...DEFAULT_CONFIG, ...config };
        this.macro = new MacroAgent({ client: this.config.planner });
        this.micro = new MicroAgent({ client: this.config.executor });
        //this.info = { actionCount: 0 };
        this.events = new EventEmitter<AgentEvents>();
        this.lastScreenshot = null;
        this.lastStepActions = null;
    }

    getEvents() {
        return this.events;
    }

    getMacro() {
        return this.macro;
    }

    getMicro() {
        return this.micro;
    }
    
    async start(browser: Browser, startingUrl: string) {
        // this.state = {
        //     startedAt: Date.now(), // should this be later?
        //     cached: false,
        //     stepsAndChecks: [],
        //     macroUsage: this.macro.getInfo(),
        //     microUsage: this.micro.getInfo(),
        // }
        
        // this.info.startedAt = Date.now();
        // this.info.testCase = {
        //     numSteps: 0,//testCase.steps.length,
        //     numChecks: 0//testCase.steps.reduce((count, step) => count + step.checks.length, 0)
        // }
        // this.info.cached = false;

        logger.info("Creating browser context");
        const dpr = process.env.DEVICE_PIXEL_RATIO ?
            parseInt(process.env.DEVICE_PIXEL_RATIO) :
            process.platform === 'darwin' ? 2 : 1;
        this.context = await browser.newContext({
            viewport: { width: 1280, height: 720 },
            deviceScaleFactor: dpr,
            ...this.config.browserContextOptions
        });
        const page = await this.context.newPage();
        this.harness = new WebHarness(page);

        

        this.events.emit('start');
        logger.info("Agent started");

        await this.harness.goto(startingUrl);
        //const screenshot = await this.screenshot();
        // Synthetic load action
        // Removing for now since state tracker will err with no preceding step
        //this.events.emit('action', { 'variant': 'load', 'url': startingUrl, screenshot: screenshot.image })
        
        logger.info(`Successfully navigated to starting URL: ${startingUrl}`);
    }

    async screenshot(): Promise<Screenshot> {
        const screenshot = await this.harness.screenshot();
        this.lastScreenshot = screenshot;
        return screenshot;
    }

    async step(description: string) {
        logger.info(`Begin Step: ${description}`);

        this.events.emit('stepStart', description);

        // const stepState: StepDescriptor = {
        //     variant: 'step',
        //     description: description,
        //     actions: [],
        //     status: 'running'
        // };
        // this.state.stepsAndChecks.push(stepState);

        //const recipe = []
        const stepActionIngredients: ActionIngredient[] = [];

        while (true) {
            const screenshot = await this.screenshot();
            const { actions, finished } = await this.macro.createPartialRecipe(
                screenshot,
                { description: description, checks: [], testData: {} },
                stepActionIngredients
            );

            // TODO: Should emit events for recipe creation
            logger.info({ actions, finished }, `Partial recipe created`);
            //console.log('Partial recipe:', actions);
            //console.log('Finish expected?', finished);

            // Execute partial recipe
            for (const ingredient of actions) {
                const screenshot = await this.harness.screenshot();
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
                            'message': `Could not align ${ingredient.variant} action: ${(error as Error).message}`
                        }
                    };
                    //throw new ActionConversionError(ingredient, error as Error);
                }

                //console.log('Action:', action);

                try {
                    await this.harness.executeAction(action);
                    //this.info.actionCount!++;
                    //this.config.onActionTaken(ingredient, action);
                    // Take new screenshot after action to provide in event
                } catch (error) {
                    logger.error(`Error executing action: ${error}`);
                    // TODO: retries
                    //throw new ActionExecutionError(action, error as Error);
                    // stepState.status = 'failed';
                    // return {
                    //     passed: false,
                    //     failure: {
                    //         variant: 'browser',
                    //         message: `Failed to execute ${action.variant} action`
                    //     }
                    // };
                    this.events.emit('fail', {
                        variant: 'browser',
                        message: `Failed to execute ${action.variant} action`
                    });
                    return;
                }
                stepActionIngredients.push(ingredient);

                const postActionScreenshot = await this.screenshot();
                
                const actionDescriptor = { ...ingredient, ...action, screenshot: postActionScreenshot.image };
                //stepState.actions.push(actionDescriptor);
                this.events.emit('action', actionDescriptor);
                //for (const listener of this.listeners) if(listener.onActionTaken) listener.onActionTaken({...ingredient, ...action, screenshot: postActionScreenshot.image});
                logger.info({ action }, `Action taken`);
            }

            // If macro expects these actions should complete the step, break
            if (finished) {
                logger.info(`Done with step`);

                this.events.emit('stepSuccess');
                //stepState.status = 'passed';
                //this.events.emit('step');
                //for (const listener of this.listeners) if (listener.onStepCompleted) listener.onStepCompleted();//(step);
                break;
            }
        }
    }

    async check(description: string) {
        logger.info(`check: ${description}`);

        this.events.emit('checkStart', description);


        if (!this.lastScreenshot) {
            this.lastScreenshot = await this.screenshot();
        }

        const result = await this.macro.evaluateCheck(
            this.lastScreenshot,
            description,
            this.lastStepActions ?? []
        );
        
        // const convertedChecks = await this.macro.removeImplicitCheckContext(checkScreenshot, check, stepActionIngredients);
        // this.analytics.macroCalls += 1;

        // logger.info(`Augmented checks: ${convertedChecks}`);

        // const checkIngredient: CheckIngredient = { "variant": "check", checks: convertedChecks };

        // stepCheckIngredients.push(checkIngredient);

        // const result = await this.micro.evaluateCheck(
        //     checkScreenshot,
        //     checkIngredient
        // );

        if (result) {
            // Passed
            this.events.emit('checkSuccess');
            //for (const listener of this.listeners) if (listener.onCheckCompleted) listener.onCheckCompleted();
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
            const failure = await this.macro.classifyCheckFailure(
                this.lastScreenshot,
                description,
                this.lastStepActions ?? []
            );
            //this.analytics.macroCalls += 1;

            // return {
            //     passed: false,
            //     failure: failure
            // }

            this.events.emit('fail', failure);
            return;
        }
    }

    async close() {
        await this.context.close();
    }
}