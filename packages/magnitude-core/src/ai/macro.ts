import { Screenshot } from "@/web/types";
import { downscaleScreenshot } from "./util";
import { b } from "@/ai/baml_client";
import { Image, Collector } from "@boundaryml/baml";
import { ActionIngredient, Ingredient } from "@/recipe/types";
import { TestCaseDefinition, TestStepDefinition } from "@/types";


interface MacroAgentConfig {
    downscaling: number
}

const DEFAULT_CONFIG = {
    downscaling: 0.75
}

export class MacroAgent {
    /**
     * Strong reasoning agent for high level strategy and planning.
     */
    private config: MacroAgentConfig;
    private collector: Collector;

    constructor(config: Partial<MacroAgentConfig> = {}) {
        this.config = {...DEFAULT_CONFIG, ...config};
        this.collector = new Collector("macro");
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

        const response = await b.CreatePartialRecipe(
            Image.fromBase64('image/png', downscaledScreenshot.image),
            testStep,
            stringifiedExistingRecipe,
            { collector: this.collector }
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

        const response = await b.RemoveImplicitCheckContext(
            Image.fromBase64('image/png', downscaledScreenshot.image),
            check,
            stringifiedExistingRecipe,
            { collector: this.collector }
        );
        return response.check;
    }

}