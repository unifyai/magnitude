import { Screenshot } from "@/web/types";
import { convertToBamlClientOptions, downscaleScreenshot } from "./util";
import { b } from "@/ai/baml_client";
import { Image, Collector, ClientRegistry } from "@boundaryml/baml";
import { ActionIntent, Intent } from "@/recipe/types";
import { TestStepDefinition } from "@/types";
import { BamlAsyncClient } from "./baml_client/async_client";
import logger from "@/logger";
import { Logger } from 'pino';
import { BugDetectedFailure, MisalignmentFailure } from "@/common";
import { PlannerClient } from "@/ai/types";


interface MacroAgentConfig {
    client: PlannerClient;
    downscaling: number
}

const DEFAULT_CONFIG = {
    downscaling: 0.75
}

export interface MacroAgentInfo {
    provider: string,
    model: string,
    inputTokens: number,
    outputTokens: number,
    numCalls: number
}

export class MacroAgent {
    /**
     * Strong reasoning agent for high level strategy and planning.
     */
    private config: MacroAgentConfig;
    private collector: Collector;
    private cr: ClientRegistry;
    private baml: BamlAsyncClient;
    private logger: Logger;

    constructor(config: { client: PlannerClient } & Partial<MacroAgentConfig>) {
        this.config = {...DEFAULT_CONFIG, ...config};
        this.collector = new Collector("macro");
        this.cr = new ClientRegistry();
        const client = this.config.client;
        let options = convertToBamlClientOptions(this.config.client);
        this.cr.addLlmClient('Macro', client.provider, options);
        this.cr.setPrimary('Macro');

        this.baml = b.withOptions({ collector: this.collector, clientRegistry: this.cr });
        this.logger = logger.child({ name: 'magnus.planner' });
    }

    getInfo(): MacroAgentInfo {
        return {
            provider: this.config.client.provider,
            model: 'model' in this.config.client.options ?
                this.config.client.options.model : 'unknown',
            inputTokens: this.collector.usage.inputTokens ?? 0,
            outputTokens: this.collector.usage.outputTokens ?? 0,
            numCalls: this.collector.logs.length
        }
    }

    private async transformScreenshot(screenshot: Screenshot) {
        if (this.config.downscaling < 1.0) {
            return await downscaleScreenshot(screenshot, this.config.downscaling);
        }
        return screenshot;
    }

    async createPartialRecipe(screenshot: Screenshot, testStep: TestStepDefinition, existingRecipe: ActionIntent[]): Promise<{ actions: ActionIntent[], finished: boolean }> {
        const downscaledScreenshot = await this.transformScreenshot(screenshot);

        const stringifiedExistingRecipe = [];
        for (const action of existingRecipe) {
            stringifiedExistingRecipe.push(JSON.stringify(action, null, 4))
        }

        //console.log("existing:", stringifiedExistingRecipe);
        const start = Date.now();
        const response = await this.baml.CreatePartialRecipe(
            Image.fromBase64('image/png', downscaledScreenshot.image),
            testStep,
            stringifiedExistingRecipe
        );
        this.logger.trace(`createPartialRecipe took ${Date.now()-start}ms`);
        return response;
    }

    async removeImplicitCheckContext(screenshot: Screenshot, check: string, existingRecipe: ActionIntent[]): Promise<string[]> {
        const downscaledScreenshot = await this.transformScreenshot(screenshot);

        const stringifiedExistingRecipe = [];
        for (const action of existingRecipe) {
            stringifiedExistingRecipe.push(JSON.stringify(action, null, 4))
        }

        const start = Date.now();
        const response = await this.baml.RemoveImplicitCheckContext(
            Image.fromBase64('image/png', downscaledScreenshot.image),
            check,
            stringifiedExistingRecipe
        );
        if (response.checks.length < 1) {
            throw new Error(`Check conversion returned 0 checks`);
        }
        this.logger.trace(`removeImplicitCheckContext took ${Date.now()-start}ms`);
        return response.checks;
    }

    async evaluateCheck(screenshot: Screenshot, check: string, existingRecipe: ActionIntent[]): Promise<boolean> {
        const downscaledScreenshot = await this.transformScreenshot(screenshot);

        const stringifiedExistingRecipe = [];
        for (const action of existingRecipe) {
            stringifiedExistingRecipe.push(JSON.stringify(action, null, 4))
        }

        const start = Date.now();
        const response = await this.baml.EvaluateCheck(
            Image.fromBase64('image/png', downscaledScreenshot.image),
            check,
            stringifiedExistingRecipe
        );
        this.logger.trace(`evaluateCheck took ${Date.now()-start}ms`);
        return response.passes;
    }

    async classifyCheckFailure(screenshot: Screenshot, check: string, existingRecipe: ActionIntent[]): Promise<BugDetectedFailure | MisalignmentFailure> {
        const downscaledScreenshot = await this.transformScreenshot(screenshot);

        const stringifiedExistingRecipe = [];
        for (const action of existingRecipe) {
            stringifiedExistingRecipe.push(JSON.stringify(action, null, 4))
        }

        const start = Date.now();
        const response = await this.baml.ClassifyCheckFailure(
            Image.fromBase64('image/png', downscaledScreenshot.image),
            check,
            stringifiedExistingRecipe
        );
        this.logger.trace(`classifyCheckFailure took ${Date.now()-start}ms`);
        //return response.check;

        if (response.classification === 'bug') {
            return {
                variant: 'bug',
                title: response.title,
                expectedResult: response.expectedResult,
                actualResult: response.actualResult,
                severity: response.severity
            }
        }
        else {
            return {
                variant: 'misalignment',
                message: response.message
            }
        }
    }

    // async diagnoseTargetNotFound(
    //     screenshot: Screenshot,
    //     step: TestStepDefinition,
    //     target: string,
    //     existingRecipe: ActionIngredient[]
    // ): Promise<BugDetectedFailure | MisalignmentFailure> {
    //     const downscaledScreenshot = await this.transformScreenshot(screenshot);

    //     const stringifiedExistingRecipe = [];
    //     for (const action of existingRecipe) {
    //         stringifiedExistingRecipe.push(JSON.stringify(action, null, 4))
    //     }

    //     const start = Date.now();
    //     const response = await this.baml.DiagnoseTargetNotFound(
    //         Image.fromBase64('image/png', downscaledScreenshot.image),
    //         step,
    //         target,
    //         //action.target,
    //         //JSON.stringify(action, null, 4),//action,
    //         stringifiedExistingRecipe
    //     );
    //     this.logger.trace(`classifyStepActionFailure took ${Date.now()-start}ms`);

    //     if (response.classification === 'bug') {
    //         return {
    //             variant: 'bug',
    //             title: response.title,
    //             expectedResult: response.expectedResult,
    //             actualResult: response.actualResult,
    //             severity: response.severity
    //         }
    //     }
    //     else {
    //         return {
    //             variant: 'misalignment',
    //             message: response.message
    //         }
    //     }
    // }
}