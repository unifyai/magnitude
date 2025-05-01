import { WebAction } from "@/web/types";
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
    private info: Partial<TestRunInfo>;
    private events: EventEmitter<AgentEvents>;
    
    constructor (config: TestCaseAgentConfig)  {
        this.config = { ...DEFAULT_CONFIG, ...config };
        this.macro = new MacroAgent({ client: this.config.planner });
        this.micro = new MicroAgent({ client: this.config.executor });
        this.info = { actionCount: 0 };
        this.events = new EventEmitter<AgentEvents>();

    }

    getEvents() {
        return this.events;
    }
    
    async start(browser: Browser) {
        this.info.startedAt = Date.now();
        this.info.testCase = {
            numSteps: 0,//testCase.steps.length,
            numChecks: 0//testCase.steps.reduce((count, step) => count + step.checks.length, 0)
        }
        this.info.cached = false;

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
    }

    async step(description: string) {
        console.log("step:", description)
        await new Promise((resolve, reject) => setTimeout(resolve, 1000));
    }

    async check(description: string) {
        console.log("check:", description)
        await new Promise((resolve, reject) => setTimeout(resolve, 500));
    }

    async close() {
        await this.context.close();
    }
}