import { Screenshot } from "@/web/types";
import { downscaleScreenshot } from "./util";
import { b } from "@/ai/baml_client";
import { Image, Collector, ClientRegistry } from "@boundaryml/baml";
import { ActionIngredient, Ingredient } from "@/recipe/types";
import { TestCaseDefinition, TestStepDefinition } from "@/types";
import { BamlAsyncClient } from "./baml_client/async_client";


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

    constructor(config: Partial<MacroAgentConfig> = {}) {
        this.config = {...DEFAULT_CONFIG, ...config};
        this.collector = new Collector("macro");
        this.cr = new ClientRegistry();
        this.cr.setPrimary(this.config.provider);
        this.baml = b.withOptions({ collector: this.collector, clientRegistry: this.cr });
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

        const response = await this.baml.CreatePartialRecipe(
            Image.fromBase64('image/png', downscaledScreenshot.image),
            testStep,
            stringifiedExistingRecipe
        );
        return response;
    }

    getCollector() {
        return this.collector;
    }

    // Potentially smaller model could execute this op
    async removeImplicitCheckContext(screenshot: Screenshot, check: string, existingRecipe: ActionIngredient[]): Promise<string> {
        const downscaledScreenshot = await this.transformScreenshot(screenshot);

        const stringifiedExistingRecipe = [];
        for (const action of existingRecipe) {
            stringifiedExistingRecipe.push(JSON.stringify(action, null, 4))
        }

        const response = await this.baml.RemoveImplicitCheckContext(
            Image.fromBase64('image/png', downscaledScreenshot.image),
            check,
            stringifiedExistingRecipe
        );
        return response.check;
    }

}