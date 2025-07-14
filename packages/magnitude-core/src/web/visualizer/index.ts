import { BrowserContext, Page } from "playwright";
import { CursorVisual } from "./cursor";
import { MouseEffectVisual } from "./mouseEffects";
import { TypeEffectVisual } from "./typeEffects";

interface ActionVisualizerOptions {
    showCursor: boolean,
    showClickEffects: boolean,
    showTypeEffects: boolean,
}

export class ActionVisualizer {
    private options: ActionVisualizerOptions;
    private context: BrowserContext;
    private page!: Page;

    private cursor: CursorVisual;
    private mouseEffects: MouseEffectVisual;
    private typeEffects: TypeEffectVisual;
    

    constructor(context: BrowserContext, options: ActionVisualizerOptions) {
        this.context = context;
        this.options = options;

        this.cursor = new CursorVisual();
        this.mouseEffects = new MouseEffectVisual();
        this.typeEffects = new TypeEffectVisual();
    }

    async setup() {
        await this.mouseEffects.setContext(this.context);
        if (this.options.showTypeEffects) {
            await this.typeEffects.setContext(this.context);
        }
        //this.showAll();
    }

    setActivePage(page: Page) {
        this.page = page;
        this.cursor.setActivePage(page);
    }

    async moveVirtualCursor(x: number, y: number) {
        // Takes like 300ms for smooth anim
        await this.cursor.move(x, y);
    }

    async hideAll() {
        await this.cursor.hide();
    }

    async showAll() {
        await this.cursor.show();
    }
}