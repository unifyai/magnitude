import { ClickWebAction, PixelCoordinate, Screenshot, ScrollWebAction, TypeWebAction, WebAction } from '@/web/types';
import { downscaleScreenshot } from './util';
import { ActionIntent, CheckIntent, ClickIntent, Intent, ScrollIntent, TypeIntent } from '@/intents/types';
import logger from "@/logger";
import { Logger } from 'pino';
import { vl as MoondreamClient } from 'moondream';
import { ExecutorClient } from './types';


interface MicroAgentConfig {
    // How much to downscale screenshots sent to LLM
    // A little bit of downscaling can improve accuracy in some cases.
    // More downscaling = less tokens and faster inference.
    downscaling: number;
    // only supported executor client rn is moondream
    client: ExecutorClient;
    // moondreamApiKey: string;
    // moondreamUrl: string;
    //parsingRetries: 
    // confidence thresholds, etc. should go here as well
}

const DEFAULT_CONFIG = {
    moondreamUrl: "https://api.moondream.ai/v1",
    downscaling: 0.75
}

export interface MicroAgentInfo {
    provider: string,
    numCalls: number
}

export class MicroAgent {
    /**
     * Small, fast, vision agent to translate high level web actions to precise, executable actions.
     * Uses Moondream for pixel precision pointing.
     */
    private config: MicroAgentConfig;
    private info: MicroAgentInfo;
    private logger: Logger;
    private moondream: MoondreamClient;

    constructor(config: { client: ExecutorClient } & Partial<MicroAgentConfig>) {
        this.config = {...DEFAULT_CONFIG, ...config};
        this.info = { provider: 'moondream', numCalls: 0 };
        this.logger = logger.child({ name: 'magnus.executor' });
        this.moondream = new MoondreamClient({ apiKey: config.client.options.apiKey, endpoint: config.client.options.baseUrl });
    }

    private async transformScreenshot (screenshot: Screenshot) {
        if (this.config.downscaling < 1.0) {
            return await downscaleScreenshot(screenshot, this.config.downscaling);
        }
        return screenshot;
    }

    getInfo(): MicroAgentInfo {
        return this.info;
    }

    async locateTarget(screenshot: Screenshot, target: string): Promise<PixelCoordinate> {
        const downscaledScreenshot = await this.transformScreenshot(screenshot);
        const start = Date.now();

        const response = await this.moondream.point({
            image: { imageUrl: downscaledScreenshot.image },
            object: target
        });
        this.info.numCalls++;
        // Point API can return multiple, which we don't really want. We want one clear target.
        // todo: actually handle these errors appropriately in caller
        if (response.points.length > 1) {
            logger.warn({ points: response.points }, "Moondream returned multiple points for locateTarget");
            throw new Error(`Moondream returned multiple points (${response.points.length}), target '${target}' unclear`);
        }
        if (response.points.length === 0) {
            logger.warn("Moondream returned no points");
            throw new Error(`Moondream returned no points, target unclear`);
        }
        const relCoords = response.points[0];
        this.logger.trace(`locateTarget took ${Date.now()-start}ms`);

        // Use ORIGINAL screenshot coordinate space (not downscaled)
        return {
            x: relCoords.x * screenshot.dimensions.width,
            y: relCoords.y * screenshot.dimensions.height
        }
    }

    private async evaluateSubcheck(screenshot: Screenshot, check: string): Promise<boolean> {
        const response = await this.moondream.query({
            image: { imageUrl: screenshot.image },
            question: `${check}\n\nTrue or False`
        });
        this.info.numCalls++;

        const answer = (response.answer as string).trim().toLowerCase();

        if (answer === 'true') {
            return true;
        } else if (answer === 'false') {
            return false;
        } else {
            console.warn(`Received invalid response for check: ${response}`);
            return false;
        }
    }

    async evaluateCheck(screenshot: Screenshot, check: CheckIntent): Promise<boolean> {
        // TODO: Make more robust, add logp analysis for confidence
        const downscaledScreenshot = await this.transformScreenshot(screenshot);

        const start = Date.now();

        const jobs = [];
        for (const subcheck of check.checks) {
            jobs.push(this.evaluateSubcheck(downscaledScreenshot, subcheck));
        }
        const results = await Promise.all(jobs);

        this.logger.trace(`evaluateCheck took ${Date.now()-start}ms`);

        return results.every(passed => passed);
    }

    async convertAction(screenshot: Screenshot, intent: ActionIntent): Promise<WebAction> {
        if ((intent as Intent).variant === 'check') {
            throw Error('Checks cannot be converted to web actions! Use validateCheck()');
        }
        else if (intent.variant === 'click') {
            return await this.convertClick(screenshot, intent as ClickIntent);
        }
        else if (intent.variant === 'type') {
            return await this.convertType(screenshot, intent as TypeIntent);
        }
        else if (intent.variant === 'scroll') {
            return await this.convertScroll(screenshot, intent as ScrollIntent);
        }

        throw Error(`Unhandled ingredient variant: ${(intent as any).variant}`);
    }

    async convertClick(screenshot: Screenshot, intent: ClickIntent): Promise<ClickWebAction> {
        // todo: nondet-detection

        // Convert semantic target to coordinates
        const coords = await this.locateTarget(screenshot, intent.target);
        
        return {
            variant: 'click',
            x: coords.x,
            y: coords.y
        }
    }

    async convertType(screenshot: Screenshot, intent: TypeIntent): Promise<TypeWebAction> {
        // todo: nondet-detection

        // Convert semantic target to coordinates
        const coords = await this.locateTarget(screenshot, intent.target);
        
        return {
            variant: 'type',
            x: coords.x,
            y: coords.y,
            content: intent.content
        };
    }

    async convertScroll(screenshot: Screenshot, intent: ScrollIntent): Promise<ScrollWebAction> {
        const coords = await this.locateTarget(screenshot, intent.target);
        
        return {
            variant: 'scroll',
            x: coords.x,
            y: coords.y,
            deltaX: intent.deltaX,
            deltaY: intent.deltaY
        };
    }
}