import { ClickWebAction, PixelCoordinate, Screenshot, TypeWebAction, WebAction } from '@/web/types';
import { b } from "@/ai/baml_client/async_client";
import { Collector, Image } from "@boundaryml/baml";
import sharp from 'sharp';
import { downscaleScreenshot, extractCoordinates, relToPixelCoords } from './util';
import { ActionIngredient, CheckIngredient, ClickIngredient, Ingredient, TypeIngredient } from '@/recipe/types';
import { CheckResult } from './types';
import { BamlAsyncClient } from "./baml_client/async_client";


interface MicroAgentConfig {
    // How much to downscale screenshots sent to LLM
    // A little bit of downscaling can improve accuracy in some cases.
    // More downscaling = less tokens and faster inference.
    downscaling: number
    //parsingRetries: 
    // confidence thresholds, etc. should go here as well
}

const DEFAULT_CONFIG = {
    downscaling: 0.75
}

export class MicroAgent {
    /**
     * Small, fast, vision agent to translate high level web actions to precise, executable actions.
     * Currently only compatible model is Molmo variants because of their ability to point to precise coordinates.
     */
    private config: MicroAgentConfig;
    private collector: Collector;
    private baml: BamlAsyncClient;

    constructor(config: Partial<MicroAgentConfig> = {}) {
        this.config = {...DEFAULT_CONFIG, ...config};
        this.collector = new Collector("micro");
        this.baml = b.withOptions({ collector: this.collector });
    }

    private async transformScreenshot (screenshot: Screenshot) {
        if (this.config.downscaling < 1.0) {
            return await downscaleScreenshot(screenshot, this.config.downscaling);
        }
        return screenshot;
    }

    async locateTarget(screenshot: Screenshot, target: string): Promise<PixelCoordinate> {
        const downscaledScreenshot = await this.transformScreenshot(screenshot);
        const response = await this.baml.LocateTarget(
            Image.fromBase64('image/png', downscaledScreenshot.image),
            target
        );

        //console.log(response);

        // todo: handle parsing failures, confidence measures, etc
        const relCoords = extractCoordinates(response);

        if (!relCoords) {
            throw new Error(`Failed to extract coords: ${response}`);
        }

        // Use ORIGINAL screenshot coordinate space (not downscaled)
        const { x: screenX, y: screenY } = relToPixelCoords(relCoords.x, relCoords.y, screenshot.dimensions.width, screenshot.dimensions.height);

        return {
            x: screenX,
            y: screenY,
        };
    }

    async evaluateCheck(screenshot: Screenshot, check: CheckIngredient): Promise<boolean> {
        // TODO: Make more robust, add logp analysis for confidence
        const downscaledScreenshot = await this.transformScreenshot(screenshot);

        const response = await this.baml.EvaluateCheck(
            Image.fromBase64('image/png', downscaledScreenshot.image),
            check.description
        );

        //console.log("Check response:", response);

        const answer = response.trim().toLowerCase();

        // console.log("Call:", this.collector.last?.calls[0]);
        // console.log("Response:", this.collector.last?.calls[0].httpResponse);
        // //const logprobs = this.collector.last?.calls[0].httpResponse?.body.choices[0].logprobs;
        // const logprobs = this.collector.last?.calls[0].httpResponse?.body.json().choices[0].logprobs;
        // console.log("Logprobs:", logprobs);
    
        //return { passed: true, confidence: 1.0 };

        if (answer === 'yes') {
            return true;
        } else if (answer === 'no') {
            return false;
        } else {
            console.warn(`Recieved invalid response for check: ${response}`);
            return false;
        }
    }

    async convertAction(screenshot: Screenshot, ingredient: ActionIngredient): Promise<WebAction> {
        if ((ingredient as Ingredient).variant === 'check') {
            throw Error('Checks cannot be converted to web actions! Use validateCheck()');
        }
        else if (ingredient.variant === 'click') {
            return await this.convertClick(screenshot, ingredient as ClickIngredient);
        }
        else if (ingredient.variant === 'type') {
            return await this.convertType(screenshot, ingredient as TypeIngredient);
        }

        throw Error(`Unhandled ingredient variant: ${(ingredient as any).variant}`);
    }

    async convertClick(screenshot: Screenshot, click: ClickIngredient): Promise<ClickWebAction> {
        // todo: nondet-detection

        // Convert semantic target to coordinates
        const coords = await this.locateTarget(screenshot, click.target);
        
        return {
            variant: 'click',
            x: coords.x,
            y: coords.y
        }
    }

    async convertType(screenshot: Screenshot, ing: TypeIngredient): Promise<TypeWebAction> {
        // todo: nondet-detection

        // Convert semantic target to coordinates
        const coords = await this.locateTarget(screenshot, ing.target);
        
        return {
            variant: 'type',
            x: coords.x,
            y: coords.y,
            content: ing.content
        };
    }

    getCollector() {
        return this.collector;
    }
}