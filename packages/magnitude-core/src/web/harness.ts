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
    switchTabsOnActivity?: boolean  // Whether to automatically switch tabs when user activity is detected vs only if switchTab is used
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
        this.tabs = new TabManager(context, {
            switchOnActivity: options.switchTabsOnActivity ?? true
        });

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
        logger.trace(`WebHarness active page: ${page.url()}`);
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
        // Initialize tab manager first
        await this.tabs.initialize();
        
        if (this.context.pages().length > 0) {
            // If context already contains a page, set it as active
            this.tabs.setActivePage(this.context.pages()[0]);
        } else {
            const page = await this.context.newPage();
            // Force the initial page to be set as active and emit tabChanged
            this.tabs.setActivePage(page);
        }
        await this.visualizer.setup();
    }

    async stop() {
        // Clean up tab manager resources
        this.tabs.destroy();
    }

    get page() {
        return this.tabs.getActivePage();
    }

    async screenshot(options: PageScreenshotOptions = {}): Promise<Image> {
        let dpr!: number;
        let buffer!: Buffer<ArrayBufferLike>;

        const retries = 3;

        for (let attempt = 0; attempt <= retries; attempt++) {
            try {
                dpr = await this.page.evaluate(() => window.devicePixelRatio)
                buffer = await this.page.screenshot({ type: 'png', ...options }, );
            } catch (err) {
                const error = err as Error;
                if (error.message.includes('Target page, context or browser has been closed')) {
                    throw new Error("Attempted to take screenshot but page, context or browser is closed");
                }
                if (attempt >= retries) {
                    throw new Error(`Unable to capture screenshot after retries, error: ${error.message}`);
                }
            }
        }
        const base64data = buffer.toString('base64');

        const image = Image.fromBase64(base64data);

        const { width, height } = await image.getDimensions();
        const rescaledImage = await image.resize(width / dpr, height / dpr);
        const vp = this.page.viewportSize();
        logger.debug({
            dpr,
            rawWidth: width, rawHeight: height,
            rescaledWidth: Math.round(width / dpr), rescaledHeight: Math.round(height / dpr),
            viewportWidth: vp?.width, viewportHeight: vp?.height,
            virtualScreen: this.options.virtualScreenDimensions,
            pageUrl: this.page.url(),
        }, "Screenshot captured");
        return rescaledImage;
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

    async transformCoordinates({ x, y }: { x: number, y: number }): Promise<{ x: number, y: number }> {
        const virtual = this.options.virtualScreenDimensions;
        if (!virtual) {
            logger.debug({ rawX: x, rawY: y, transform: 'none' }, "No virtual screen — coordinates unchanged");
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
        const transformed = {
            x: x * (vp.width / virtual.width),
            y: y * (vp.height / virtual.height),
        };
        logger.debug({
            rawX: x, rawY: y,
            transformedX: Math.round(transformed.x), transformedY: Math.round(transformed.y),
            viewport: vp, virtualScreen: virtual,
        }, "Coordinate transform applied");
        return transformed;
    }

    async click({ x, y }: { x: number, y: number }, options?: { transform: boolean }) {
        const rawX = x, rawY = y;
        if (options?.transform ?? true) ({ x, y } = await this.transformCoordinates({ x, y }));
        logger.debug({ rawX, rawY, finalX: Math.round(x), finalY: Math.round(y) }, "click");
        await this._click(x, y);
        await this.waitForStability();
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

    async rightClick({ x, y }: { x: number, y: number }, options?: { transform: boolean }) {
        const rawX = x, rawY = y;
        if (options?.transform ?? true) ({ x, y } = await this.transformCoordinates({ x, y }));
        logger.debug({ rawX, rawY, finalX: Math.round(x), finalY: Math.round(y) }, "rightClick");
        await this._click(x, y, { button: "right" });
        await this.waitForStability();
    }

    async doubleClick({ x, y }: { x: number, y: number }, options?: { transform: boolean }) {
        const rawX = x, rawY = y;
        if (options?.transform ?? true) ({ x, y } = await this.transformCoordinates({ x, y }));
        logger.debug({ rawX, rawY, finalX: Math.round(x), finalY: Math.round(y) }, "doubleClick");
        await this.visualizer.moveVirtualCursor(x, y);
        await this.visualizer.hideAll();
        await this.page.mouse.dblclick(x, y);
        await this.visualizer.showAll();
        await this.waitForStability();
    }

    async drag({ x1, y1, x2, y2 }: { x1: number, y1: number, x2: number, y2: number }, options?: { transform: boolean }) {
        const rawFrom = { x: x1, y: y1 }, rawTo = { x: x2, y: y2 };
        if (options?.transform ?? true) ({ x: x1, y: y1 } = await this.transformCoordinates({ x: x1, y: y1 }));
        if (options?.transform ?? true) ({ x: x2, y: y2 } = await this.transformCoordinates({ x: x2, y: y2 }));

        logger.debug({
            rawFrom, rawTo,
            finalFrom: { x: Math.round(x1), y: Math.round(y1) },
            finalTo: { x: Math.round(x2), y: Math.round(y2) },
        }, "drag start");

        const t0 = Date.now();
        await this.page.mouse.move(x1, y1, { steps: 1 });
        await this.page.mouse.down();
        await this.visualizer.moveVirtualCursor(x1, y1);
        logger.debug({ x: Math.round(x1), y: Math.round(y1), phase: 'mousedown', ms: Date.now() - t0 }, "drag mousedown");

        await this.page.waitForTimeout(500);
        
        await Promise.all([
            this.page.mouse.move(x2, y2, { steps: 20 }),
            this.visualizer.moveVirtualCursor(x2, y2)
        ]);
        logger.debug({ x: Math.round(x2), y: Math.round(y2), phase: 'moved', ms: Date.now() - t0 }, "drag interpolation done");

        await this.page.mouse.up();
        logger.debug({ phase: 'mouseup', ms: Date.now() - t0 }, "drag mouseup");

        await this.waitForStability();
    }

    async type({ content }: { content: string }) {
        await this._type(content);
        await this.waitForStability();
    }

    async clickAndType({ x, y, content }: { x: number, y: number, content: string }, options?: { transform: boolean }) {
        // TODO: transforms incorrect for moondream grounding with virtual screen dims (claude) - unsure why
        //console.log(`Pre transform: ${x}, ${y}`);
        if (options?.transform ?? true) ({ x, y } = await this.transformCoordinates({ x, y }));
        //console.log(`Post transform: ${x}, ${y}`);
        await this.visualizer.moveVirtualCursor(x, y);
        this._click(x, y);
        await this._type(content);
        await this.waitForStability();
    }
    
    async scroll({ x, y, deltaX, deltaY }: { x: number, y: number, deltaX: number, deltaY: number }, options?: { transform: boolean }) {
        const rawX = x, rawY = y;
        if (options?.transform ?? true) ({ x, y } = await this.transformCoordinates({ x, y }));
        logger.debug({ rawX, rawY, finalX: Math.round(x), finalY: Math.round(y), deltaX, deltaY }, "scroll");
        await this.visualizer.moveVirtualCursor(x, y);
        await this.page.mouse.move(x, y);
        await this.page.mouse.wheel(deltaX, deltaY);
        await this.waitForStability();
    }

    async switchTab({ index }: { index: number }) {
        await this.tabs.switchTab(index);
        await this.waitForStability();
    }

    async newTab() {
        await this.context.newPage();
        // Reasonable default and less confusing than white about:blank page
        await this.navigate("https://google.com");
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
