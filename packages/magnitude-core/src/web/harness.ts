import { Page, Browser } from "playwright";
import { ClickWebAction, ScrollWebAction, TypeWebAction, WebAction } from '@/web/types';
import { PageStabilityAnalyzer } from "./stability";
import { parseTypeContent } from "./util";

export class WebHarness {
    /**
     * Executes web actions on a page
     * Not responsible for browser lifecycle
     */
    private page: Page;
    private stability: PageStabilityAnalyzer;
    private visualElementId: string = 'action-visual-indicator';

    constructor(page: Page) {
        this.page = page;
        this.stability = new PageStabilityAnalyzer(this.page);
    }

    async screenshot(): Promise<{ image: string, dimensions: { width: number, height: number } }> {
        /**
         * Get b64 encoded string of screenshot (PNG) with screen dimensions
         */
        const viewportSize = this.page.viewportSize();
        const buffer = await this.page.screenshot({ type: 'png' });

        if (!viewportSize) {
            throw Error("Invalid viewport for screenshot");
        }

        return {
            image: buffer.toString('base64'),
            dimensions: {
                width: viewportSize.width,
                height: viewportSize.height
            }
        };
    }

    async goto(url: string) {
        await this.page.goto(url);
    }

    async click({ x, y }: ClickWebAction) {
        await this.visualizeAction(x, y);
        this.page.mouse.click(x, y);
        //await this.removeActionVisuals();
    }

    async type({ x, y, content }: TypeWebAction) {
        // TODO: Implement string placeholders and special chars e.g. <enter>
        //this.page.mouse.click(x, y);
        const chunks = parseTypeContent(content);

        await this.visualizeAction(x, y);
        await this.page.mouse.click(x, y);
        //await this.removeActionVisuals();

        // Total typing period to make typing more natural, in ms
        const totalTextDelay = 500;

        let totalTextLength = 0
        for (const chunk of chunks) {
            if (chunk != '<enter>' && chunk != '<tab>') {
                totalTextLength += chunk.length;
            }
        }

        for (const chunk of chunks) {
            if (chunk == '<enter>') {
                await this.page.keyboard.press('Enter');
            } else if (chunk == '<tab>') {
                await this.page.keyboard.press('Tab')
            } else {
                const chunkProportion = chunk.length / totalTextLength;
                const chunkDelay = totalTextDelay * chunkProportion;
                const chunkCharDelay = chunkDelay / chunk.length;
                await this.page.keyboard.type(chunk, {delay: chunkCharDelay});
                //await this.page.keyboard.type(chunk, {delay: 50});
            }
        }
        // TODO: Allow content to specify keypresses like TAB/ENTER
        //await this.page.keyboard.press('Enter');
    }
    
    async scroll({ x, y, deltaX, deltaY }: ScrollWebAction) {
        await this.visualizeAction(x, y);
        await this.page.mouse.move(x, y);
        await this.page.mouse.wheel(deltaX, deltaY);
    }

    async executeAction(action: WebAction) {
        if (action.variant === 'click') {
            await this.click(action);
        } else if (action.variant === 'type') {
            await this.type(action);
        } else if (action.variant === 'scroll') {
            await this.scroll(action);
        } else {
            throw Error(`Unhandled web action variant: ${(action as any).variant}`);
        }
        await this.stability.waitForStability();
    }

    // async waitForStability(timeout?: number): Promise<void> {
    //     await this.stability.waitForStability(timeout);
    // }

    // async visualizeAction() {

    // }

    // async removeActionVisuals() {

    // }

    async visualizeAction(x: number, y: number) {
        // Create a red dot at the specified position
        await this.page.evaluate(
            ({ x, y, id }) => {
                // Remove any existing indicator
                const existingElement = document.getElementById(id);
                if (existingElement) {
                    existingElement.remove();
                }

                // Create the visual indicator (red dot)
                const dot = document.createElement('div');
                dot.id = id;
                dot.style.position = 'absolute';
                dot.style.left = `${x - 5}px`;
                dot.style.top = `${y - 5}px`;
                dot.style.width = '10px';
                dot.style.height = '10px';
                dot.style.borderRadius = '50%';
                dot.style.backgroundColor = 'red';
                dot.style.zIndex = '9999';
                dot.style.pointerEvents = 'none'; // Don't interfere with actual clicks

                document.body.appendChild(dot);
            },
            { x, y, id: this.visualElementId }
        );

        // Wait briefly so the dot is visible before the action
        //await this.page.waitForTimeout(300);
    }

    async removeActionVisuals() {
        // Remove the visual indicator
        await this.page.evaluate((id) => {
            const element = document.getElementById(id);
            if (element) {
                element.remove();
            }
        }, this.visualElementId);
    }
}