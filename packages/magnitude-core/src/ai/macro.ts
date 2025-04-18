import { Screenshot } from "@/web/types";
import { downscaleScreenshot } from "./util";
import { b } from "@/ai/baml_client";
import { Image, Collector, ClientRegistry } from "@boundaryml/baml";
import { ActionIngredient, Ingredient } from "@/recipe/types";
import { TestCaseDefinition, TestStepDefinition } from "@/types";
import { BamlAsyncClient } from "./baml_client/async_client";
import logger from "@/logger";
import { Logger } from 'pino';
import { BugDetectedFailure, MisalignmentFailure } from "@/common";


interface MacroAgentConfig {
    downscaling: number
    provider: 'SonnetBedrock' | 'SonnetAnthropic'
}

const DEFAULT_CONFIG: MacroAgentConfig = {
    downscaling: 0.75,
    provider: 'SonnetBedrock'
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

    constructor(config: Partial<MacroAgentConfig> = {}) {
        this.config = {...DEFAULT_CONFIG, ...config};
        this.collector = new Collector("macro");
        this.cr = new ClientRegistry();
        if (process.env.MAGNITUDE_PLANNER_CLIENT) {
            // Client override (useful for debugging/testing)
            logger.info(`Using planner client from env: ${process.env.MAGNITUDE_PLANNER_CLIENT}`);
            this.cr.setPrimary(process.env.MAGNITUDE_PLANNER_CLIENT);
        } else {
            logger.info(`Using planner client: ${this.config.provider}`);
            this.cr.setPrimary(this.config.provider);
        }
        this.baml = b.withOptions({ collector: this.collector, clientRegistry: this.cr });
        this.logger = logger.child({ name: 'magnus.planner' });
    }

    getCollector() {
        return this.collector;
    }

    private async transformScreenshot(screenshot: Screenshot) {
        if (this.config.downscaling < 1.0) {
            return await downscaleScreenshot(screenshot, this.config.downscaling);
        }
        return screenshot;
    }

    async createPartialRecipe(screenshot: Screenshot, testStep: TestStepDefinition, existingRecipe: ActionIngredient[]): Promise<{ actions: ActionIngredient[], finished: boolean }> {
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

    // Potentially smaller model could execute this op
    async removeImplicitCheckContext(screenshot: Screenshot, check: string, existingRecipe: ActionIngredient[]): Promise<string> {
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
        this.logger.trace(`removeImplicitCheckContext took ${Date.now()-start}ms`);
        return response.check;
    }

    async classifyCheckFailure(screenshot: Screenshot, check: string, existingRecipe: ActionIngredient[]): Promise<BugDetectedFailure | MisalignmentFailure> {
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