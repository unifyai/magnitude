import { Page, Browser } from "playwright";
import { ClickWebAction, TypeWebAction, WebAction } from '@/web/types';

export class WebHarness {
    /**
     * Executes web actions on a page
     * Not responsible for browser lifecycle
     */
    private page: Page;
    private visualElementId: string = 'action-visual-indicator';

    constructor(page: Page) {
        this.page = page;
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
        await this.visualizeAction(x, y);
        await this.page.mouse.click(x, y);
        //await this.removeActionVisuals();
        await this.page.keyboard.type(content);
        // TODO: Allow content to specify keypresses like TAB/ENTER
        //await this.page.keyboard.press('Enter');
    }

    async executeAction(action: WebAction) {
        if (action.variant === 'click') {
            await this.click(action);
        } else if (action.variant === 'type') {
            await this.type(action);
        } else {
            throw Error(`Unhandled web action variant: ${(action as any).variant}`);
        }
    }

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