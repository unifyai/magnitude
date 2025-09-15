import { Page, Browser, BrowserContext, PageScreenshotOptions } from "playwright";
import { ClickWebAction, ScrollWebAction, SwitchTabWebAction, TypeWebAction, WebAction } from '@/web/types';
import { PageStabilityAnalyzer } from "./stability";
import { parseTypeContent } from "./util";
import { ActionVisualizer, ActionVisualizerOptions } from "./visualizer";
import logger from "@/logger";
import { TabManager, TabState } from "./tabs";
import { DOMTransformer } from "./transformer";
import { Image } from '@/memory/image';
import EventEmitter from "eventemitter3";
//import { StateComponent } from "@/facets";


export interface WebHarnessOptions {
    //fallbackViewportDimensions?: { width: number, height: number}
    // Some LLM operate best on certain screen dims
    virtualScreenDimensions?: { width: number, height: number }
    visuals?: ActionVisualizerOptions
}

export interface WebHarnessEvents {
    'activePageChanged': (page: Page) => Promise<void>;
}

export class WebHarness { // implements StateComponent
    /**
     * Executes web actions on a page
     * Not responsible for browser lifecycle
     */
    public readonly context: BrowserContext;
    private options: WebHarnessOptions;
    private stability: PageStabilityAnalyzer;
    public readonly visualizer: ActionVisualizer;
    private transformer: DOMTransformer;
    private tabs: TabManager;

    public readonly events: EventEmitter<WebHarnessEvents> = new EventEmitter();

    constructor(context: BrowserContext, options: WebHarnessOptions = {}) {
        //this.page = page;
        this.context = context;
        this.options = options;
        this.stability = new PageStabilityAnalyzer({ disableVisualStability: true });
        this.visualizer = new ActionVisualizer(this.context, this.options.visuals ?? {});
        this.transformer = new DOMTransformer();
        this.tabs = new TabManager(context);

        // this.context.on('page', (page: Page) => {
        //     this.setActivePage(page);
        //     //logger.info('ayo we got a new page');
        // });
        this.tabs.events.on('tabChanged', async (page: Page) => {
            await this.setActivePage(page);
            // need to wait for page to load before evaluating a script
            //page.on('load', () => { this.transformer.setActivePage(page); });
            
            //console.log('tabs:', await this.tabs.getState())

        }, this);
    }

    async setActivePage(page: Page) {
        this.stability.setActivePage(page);
        await this.visualizer.setActivePage(page);
        this.transformer.setActivePage(page);
        this.events.emit('activePageChanged', page);
    }

    async retrieveTabState(): Promise<TabState> {
        return this.tabs.retrieveState();
    }

    // setActivePage(page: Page) {
    //     this.page = page;
    //     this.stability.setActivePage(this.page);
    //     this.visualizer.setActivePage(this.page);
    // }

    async start() {
        if (this.context.pages().length > 0) {
            // If context already contains a page, set it as active
            this.tabs.setActivePage(this.context.pages()[0]);
        } else {
            await this.context.newPage();
            // Other logic for page tracking is automatically handled by TabManager
        }
        await this.visualizer.setup();
    }

    get page() {
        return this.tabs.getActivePage();
    }

    async screenshot(options: PageScreenshotOptions = {}): Promise<Image> {
        /**
         * Get b64 encoded string of screenshot (PNG) with screen dimensions
         */
        const dpr = await this.page.evaluate(() => window.devicePixelRatio);
        //console.log("DPR:", dpr);
        //const viewportSize = this.page.viewportSize();
        const buffer = await this.page.screenshot({ type: 'png', ...options }, );

        // if (!viewportSize) {
        //     throw Error("Invalid viewport for screenshot");
        // }

        const base64data = buffer.toString('base64');

        //console.log("Screenshot DATA:", base64data.substring(0, 100));
        const image = Image.fromBase64(base64data);

        // Now, need to rescale the image based on DPR. This is so that:
        // (1) Save on tokens, dont need huge high res images
        // (2) More importantly, clicks happen in the standard resolution space, so need to do this for coordinates to be correct
        //     for any agent not using a virtual screen space (e.g. those that aren't Claude)
        const { width, height } = await image.getDimensions();
        //console.log("Original screenshot dims:", { width, height });
        //console.log("DPR-scaled dims:", { width: width / dpr, height: height / dpr });
        const rescaledImage = await image.resize(width / dpr, height / dpr);
        //console.log("screenshot() final dims:", await rescaledImage.getDimensions());

        //console.log("_locateTarget dims:", await screenshot.getDimensions());
        return rescaledImage;

        // return {
        //     image: `data:image/png;base64,${base64data}`,//buffer.toString('base64'),
        //     dimensions: {
        //         width: viewportSize.width,
        //         height: viewportSize.height
        //     }
        // };
    }
 
    // async goto(url: string) {
    //     // No need to redraw here anymore, the 'load' event listener handles it
    //     await this.page.goto(url);
    // }

    async _type(content: string) {
        /** Util for typing + keypresses */
        const chunks = parseTypeContent(content);

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
            }
        }
    }

    // safer might be Coordinate interface/obj tied to certain screen space dims
    async transformCoordinates({ x, y }: { x: number, y: number }): Promise<{ x: number, y: number }> {
        const virtual = this.options.virtualScreenDimensions;
        if (!virtual) {
            return { x, y };
        }
        let vp = this.page.viewportSize();
        if (!vp) {
            vp = await this.page.evaluate(() => ({
                width: window.innerWidth,
                height: window.innerHeight
            }));
        }
        if (!vp) throw new Error("Could not get viewport dimensions to transform coordinates");
        return {
            x: x * (vp.width / virtual.width),
            y: y * (vp.height / virtual.height),
        };
    }

    async click({ x, y }: { x: number, y: number }) {
        ({ x, y } = await this.transformCoordinates({ x, y }));
        // console.log("x:", x);
        // console.log("y:", y);
        //await this.visualizer.visualizeAction(x, y);
        //await this.page.mouse.click(x, y);
        //await this.page.mouse.move(x, y, { steps: 20 });

        //console.log('clicking:', x, y);

        // const loc = this.page.getByText('Where are you going?');

        // console.log('found:', loc);
        
        // await loc.click();
        await this._click(x, y);
        

        
        // await this.page.waitForTimeout(1000);
        // await this.page.mouse.click(x, y);
        // await this.page.waitForTimeout(1000);
        // await this.page.mouse.click(x, y);
        // await this.page.waitForTimeout(1000);
        // await this.page.mouse.click(x, y);
        // await this.page.waitForTimeout(1000);
        // await this.page.mouse.click(x, y);
        // await this.page.waitForTimeout(1000);


        // await Promise.all([
        //     this.page.mouse.move(x, y, { steps: 20 }),
        //     this.visualizer.visualizeAction(x, y),
        // ]);
        // await this.page.mouse.down();
        // await this.page.waitForTimeout(200);
        // await this.page.mouse.up();

        // await this.page.evaluate(({ x, y }) => {
        //     // Find the topmost element at the given coordinates
        //     const targetElement = document.elementFromPoint(x, y);

        //     if (!targetElement) {
        //         console.error('No element found at coordinates:', x, y);
        //         return;
        //     }

        //     // Create and dispatch the events with properties that mimic a real click
        //     const options = {
        //         bubbles: true,
        //         cancelable: true,
        //         composed: true,
        //         // We can't set isTrusted, the browser forces it to false
        //     };

        //     targetElement.dispatchEvent(new MouseEvent('mouseover', options));
        //     targetElement.dispatchEvent(new MouseEvent('mousedown', options));
        //     targetElement.dispatchEvent(new MouseEvent('mouseup', options));
        //     targetElement.dispatchEvent(new MouseEvent('click', options));

        // }, { x, y });
        




        await this.waitForStability();
        //await this.visualizer.removeActionVisuals();
    }

    private async _click(x: number, y: number, options?: {
        button?: "left" | "right" | "middle";
        clickCount?: number;
        delay?: number;
    }) {
        await Promise.all([
            this.visualizer.moveVirtualCursor(x, y),
            this.page.mouse.move(x, y, { steps: 20 })
        ])
        // await this.visualizer.moveVirtualCursor(x, y);
        // await this.page.mouse.move(x, y, { steps: 20 });
        await this.visualizer.hideAll(); // hide / show pointer because no-pointer is not always consistent and visualizer can block click
        await this.page.mouse.click(x, y);
        await this.visualizer.showAll();
    }

    async rightClick({ x, y }: { x: number, y: number }) {
        ({ x, y } = await this.transformCoordinates({ x, y }));
        await this._click(x, y, { button: "right" });
        await this.waitForStability();
    }

    async doubleClick({ x, y }: { x: number, y: number }) {
        ({ x, y } = await this.transformCoordinates({ x, y }));
        await this.visualizer.moveVirtualCursor(x, y);
        await this.visualizer.hideAll();
        await this.page.mouse.dblclick(x, y);
        await this.visualizer.showAll();
        await this.waitForStability();
    }

    async drag({ x1, y1, x2, y2 }: { x1: number, y1: number, x2: number, y2: number }) {
        ({ x: x1, y: y1 } = await this.transformCoordinates({ x: x1, y: y1 }));
        ({ x: x2, y: y2 } = await this.transformCoordinates({ x: x2, y: y2 }));

        //console.log(`Dragging: (${x1}, ${y1}) -> (${x2}, ${y2})`);
        
        await this.page.mouse.move(x1, y1, { steps: 1 });
        await this.page.mouse.down();
        await this.visualizer.moveVirtualCursor(x1, y1);
        await this.page.waitForTimeout(500);
        
        await Promise.all([
            this.page.mouse.move(x2, y2, { steps: 20 }),
            this.visualizer.moveVirtualCursor(x2, y2)
        ]);
        // await this.page.mouse.move(x2, y2, { steps: 100 });
        // await this.visualizer.visualizeAction(x2, y2);
        await this.page.mouse.up();
        await this.waitForStability();
        //await this.visualizer.removeActionVisuals();
    }

    async type({ content }: { content: string }) {
        await this._type(content);
        await this.waitForStability();
    }

    async clickAndType({ x, y, content }: { x: number, y: number, content: string }) {
        // TODO: transforms incorrect for moondream grounding with virtual screen dims (claude) - unsure why
        //console.log(`Pre transform: ${x}, ${y}`);
        ({ x, y } = await this.transformCoordinates({ x, y }));
        //console.log(`Post transform: ${x}, ${y}`);
        await this.visualizer.moveVirtualCursor(x, y);
        this._click(x, y);
        await this._type(content);
        await this.waitForStability();
    }
    
    async scroll({ x, y, deltaX, deltaY }: { x: number, y: number, deltaX: number, deltaY: number }) {
        ({ x, y } = await this.transformCoordinates({ x, y }));
        await this.visualizer.moveVirtualCursor(x, y);
        await this.page.mouse.move(x, y);
        await this.page.mouse.wheel(deltaX, deltaY);
        await this.waitForStability();
    }

    async switchTab({ index }: { index: number }) {
        await this.tabs.switchTab(index);
        await this.waitForStability();
    }

    async closeTab({ index }: { index: number }) {
        await this.tabs.closeTab(index);
        await this.waitForStability();
    }

    async newTab() {
        console.log("switching to new tab...");
        await this.context.newPage();
        await this.waitForStability(); // Wait for the new blank page to be ready
    }

    async navigate(url: string) {
        // Only wait for DOM content on goto since we handle waiting for network idle etc ourselves
        await this.page.goto(url, { waitUntil: 'domcontentloaded' });
        await this.waitForStability();
    }

    async selectAll() {
        await this.page.keyboard.down('ControlOrMeta');
        await this.page.keyboard.press('KeyA');
        await this.page.keyboard.up('ControlOrMeta');
    }

    async enter() {
        await this.page.keyboard.press('Enter')
    }

    async backspace() {
        await this.page.keyboard.press('Backspace')
    }

    async tab() {
        await this.page.keyboard.press('Tab')
    }

    async goBack() {
        await this.page.goBack();
    }

    async executeAction(action: WebAction) {
        if (action.variant === 'click') {
            await this.click(action);
        } else if (action.variant === 'type') {
            await this.clickAndType(action);
        } else if (action.variant === 'scroll') {
            await this.scroll(action);
        } else if (action.variant === 'tab') {
            await this.switchTab(action);
        } else {
            throw Error(`Unhandled web action variant: ${(action as any).variant}`);
        }
        //await this.stability.waitForStability();
        //await this.visualizer.redrawLastPosition();
    }

    async waitForStability(timeout?: number): Promise<void> {
        await this.stability.waitForStability(timeout);
    }

    // async applyTransformations() {
    //     const start = Date.now();
    //     await this.transformer.applyTransformations();
    //     logger.trace(`DOM transformations took ${Date.now() - start}ms`);
    // }

    // async waitForStability(timeout?: number): Promise<void> {
    //     await this.stability.waitForStability(timeout);
    // }
}
