import { Screenshot, WebAction } from "@/web/types";
import { MicroAgent } from "@/ai/micro";
import { MacroAgent } from "@/ai/macro";
import { Browser, BrowserContext, BrowserContextOptions, Page } from "playwright";
import { WebHarness } from "@/web/harness";
import { StepOptions } from "@/types";
import { AgentEvents } from "../common/events";
import logger from '../logger';
import { ActionIntent } from "../intents/types";
import { PlannerClient, ExecutorClient } from "@/ai/types";
import EventEmitter from "eventemitter3";
import { AgentError } from "./errors";
import { convertOptionsToTestData, FailureDescriptor } from "../common";

export interface TestCaseAgentOptions {
    planner: PlannerClient,
    executor: ExecutorClient
    browserContextOptions: BrowserContextOptions,
    signal?: AbortSignal // Add optional AbortSignal
}

const DEFAULT_CONFIG = {
    browserContextOptions: {}
}

export class TestCaseAgent {
    private config: TestCaseAgentOptions;
    private abortSignal?: AbortSignal;
    private macro: MacroAgent;
    private micro: MicroAgent;
    private harness!: WebHarness;
    private context!: BrowserContext;
    private events: EventEmitter<AgentEvents>;
    private lastScreenshot: Screenshot | null;
    private lastStepActions: ActionIntent[] | null;

    constructor (config: TestCaseAgentOptions)  {
        this.config = { ...DEFAULT_CONFIG, ...config };
        this.abortSignal = config.signal;
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

    getPage(): Page {
        return this.harness.getPage();
    }

    getContext(): BrowserContext {
        return this.context;
    }

    private checkAborted() {
        if (this.abortSignal?.aborted) {
            this.fail({
                variant: 'cancelled'
            });
        }
    }

    async start(browser: Browser, startingUrl: string) {
        this.checkAborted();

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

        this.checkAborted();
        this.events.emit('start');
        logger.info("Agent started");

        this.checkAborted();
        await this.harness.goto(startingUrl);
        //const screenshot = await this.screenshot();
        // Synthetic load action
        // Removing for now since state tracker will err with no preceding step
        //this.events.emit('action', { 'variant': 'load', 'url': startingUrl, screenshot: screenshot.image })
        
        logger.info(`Successfully navigated to starting URL: ${startingUrl}`);
    }

    async screenshot(): Promise<Screenshot> {
        this.checkAborted();
        const screenshot = await this.harness.screenshot();
        this.lastScreenshot = screenshot;
        return screenshot;
    }

    private fail(failure: FailureDescriptor): never {
        this.events.emit('fail', failure);
        throw new AgentError(failure);
    }

    async exec(intent: ActionIntent) {
        /**
         * Convert intermediate natural language action to a grounded web action and execute it.
         */
        const screenshot = await this.screenshot();
        let action: WebAction;
        // TODO: Handle conversion parsing/confidence failures
        try {
            // does catch make sense here? essentially indicates very low confidence
            // bad cases either 1. action with low confidence
            // 2. no action (target not identified at all)
            action = await this.micro.convertAction(screenshot, intent);
            logger.info({ intent: intent, action }, `Converted action`);
        } catch(error: unknown) {
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
            this.fail({
                'variant': 'misalignment',
                'message': `Could not align ${intent.variant} action: ${(error as Error).message}`
            });
            //throw new ActionConversionError(ingredient, error as Error);
        }
        try {
            await this.harness.executeAction(action);
        } catch (error) {
            logger.error(`Error executing action: ${error}`);

            this.fail({
                variant: 'browser',
                message: `Failed to execute ${action.variant} action: ${(error as Error).message}`
            });
        }
        return action;
    }

    async step(description: string, options: StepOptions = {}): Promise<void> {
        this.checkAborted();
        logger.info(`Begin Step: ${description}`);

        const testData = convertOptionsToTestData(options);

        this.events.emit('stepStart', description);
        //const recipe = []
        //const stepActionIngredients: ActionIngredient[] = [];
        this.lastStepActions = [];

        while (true) {
            this.checkAborted();
            const screenshot = await this.screenshot();
            this.checkAborted();
            const { actions, finished } = await this.macro.createPartialRecipe(
                screenshot,
                { description: description, checks: [], testData: testData },
                this.lastStepActions
            );

            // TODO: Should emit events for recipe creation
            logger.info({ actions, finished }, `Partial recipe created`);
            //console.log('Partial recipe:', actions);
            //console.log('Finish expected?', finished);

            // Execute partial recipe
            for (const intent of actions) {
                this.checkAborted();
                

                //console.log('Action:', action);

                const action = await this.exec(intent);
                this.lastStepActions.push(intent);

                const postActionScreenshot = await this.screenshot(); // Already checks signal

                const actionDescriptor = { ...intent, ...action, screenshot: postActionScreenshot.image };
                //stepState.actions.push(actionDescriptor);
                this.events.emit('action', actionDescriptor);
                //for (const listener of this.listeners) if(listener.onActionTaken) listener.onActionTaken({...ingredient, ...action, screenshot: postActionScreenshot.image});
                logger.info({ action }, `Action taken`);
            }

            // If macro expects these actions should complete the step, break
            if (finished) {
                break;
            }
        }

        logger.info(`Done with step`);
        this.events.emit('stepSuccess');
    }

    async check(description: string): Promise<void> {
        this.checkAborted();
        logger.info(`check: ${description}`);

        this.events.emit('checkStart', description);


        if (!this.lastScreenshot) {
            this.lastScreenshot = await this.screenshot(); // Already checks signal
        }

        this.checkAborted();
        const result = await this.macro.evaluateCheck(
            this.lastScreenshot,
            description,
            this.lastStepActions ?? []
        );
        
        // check conversion disabled until moondream can better handle composite/complex checks
        // const convertedChecks = await this.macro.removeImplicitCheckContext(checkScreenshot, check, stepActionIngredients);

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
            this.checkAborted();
            const failure = await this.macro.classifyCheckFailure(
                this.lastScreenshot,
                description,
                this.lastStepActions ?? []
            );

            this.fail(failure);
        }
    }

    async close() {
        if (this.context) {
            try {
                await this.context.close();
            } catch (error) {
                 logger.warn(`Error closing browser context (might be expected if cancelled): ${error}`);
            }
        }
    }
}
