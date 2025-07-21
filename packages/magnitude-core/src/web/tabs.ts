// Keeps track of current tab, enables describing open tabs, and switching between open tabs
import logger from "@/logger";
import EventEmitter from "eventemitter3";
import { BrowserContext, Page } from "playwright";
import { retryOnErrorIsSuccess } from "@/common";

export interface TabEvents {
    'tabChanged': (page: Page) => void
}

export interface TabState {
    activeTab: number,
    tabs: {
        title: string,
        url: string,
    }[]
}

export interface TabManagerOptions {
    switchOnActivity?: boolean;  // Whether to automatically switch tabs when user activity is detected
}

export class TabManager {
    private context: BrowserContext;
    private activePage!: Page;
    private options: TabManagerOptions;
    public readonly events: EventEmitter<TabEvents>;

    constructor(context: BrowserContext, options: TabManagerOptions = {}) {
        this.context = context;
        this.options = {
            switchOnActivity: true,
            ...options
        };
        this.events = new EventEmitter();

        // Track new pages
        this.context.on('page', this.onPageCreated.bind(this));

        // Initialize existing pages and tracking
        this.initializeExistingPages();
    }

    private async initializeExistingPages() {
        const pages = this.context.pages();
        
        // Set up existing pages
        for (const page of pages) {
            await this.onPageCreated(page);
        }
    }

    private async onPageCreated(page: Page) {
        logger.debug(`onPageCreated called for: ${page.url()}`);
        
        // If this is the only page or no active page set, make it active
        if (!this.activePage || this.context.pages().length === 1) {
            this.setActivePage(page);
        }

        // Only set up tracking if switchOnActivity is enabled
        if (this.options.switchOnActivity) {
            // Expose the function first (it persists across navigations)
            try {
                await page.exposeFunction('__reportTabActivity', () => {
                    if (page !== this.activePage) {
                        logger.trace(`Tab activity detected on ${page.url()}, switching...`);
                        this.setActivePage(page);
                    }
                });
            } catch (e: any) {
                if (!e.message.includes('already exists')) {
                    logger.error('Failed to expose function for page:', e);
                }
            }

            // Try to set up tracking immediately
            await this.setupPageTracking(page);

            // Re-inject tracking after navigation
            page.on('load', async () => {
                logger.debug(`Page 'load' event: ${page.url()}, re-injecting tracking`);
                await this.setupPageTracking(page);
            });
            
            // Also inject on DOMContentLoaded for faster setup
            page.on('domcontentloaded', async () => {
                logger.debug(`Page 'domcontentloaded' event: ${page.url()}, re-injecting tracking`);
                await this.setupPageTracking(page);
            });
            
            // For initial page that starts as about:blank, wait for first navigation
            if (page.url() === 'about:blank') {
                page.once('framenavigated', async () => {
                    logger.debug(`Initial navigation from about:blank to: ${page.url()}`);
                    await this.setupPageTracking(page);
                });
            }
        }

        // Don't automatically switch to new tabs - let the user decide
        // This prevents unwanted switches when links open in new tabs

        // Clean up when page closes
        page.on('close', () => {
            if (this.activePage === page) {
                const pages = this.context.pages();
                if (pages.length > 0) {
                    this.setActivePage(pages[0]);
                }
            }
        });
    }


    private async setupPageTracking(page: Page) {
        // Inject the tracking script with retries
        await retryOnErrorIsSuccess(
            async () => {
                // Skip if page is still on about:blank
                const currentUrl = page.url();
                if (currentUrl === 'about:blank') {
                    logger.debug('Skipping tracking setup - page is about:blank');
                    return;
                }
                
                logger.debug(`Setting up tracking for: ${currentUrl}`);
                
                // Evaluate the tracking script on the page
                await page.evaluate(() => {
                
                // Track any user interaction
                const reportActivity = (eventType: string) => {
                    try {
                        (window as any).__reportTabActivity();
                    } catch (e) {
                        console.error('[TAB TRACKING] Failed to report tab activity:', e);
                    }
                };
                
                // Throttle function for mousemove
                let lastMouseMoveTime = 0;
                const throttledMouseMove = () => {
                    const now = Date.now();
                    if (now - lastMouseMoveTime > 500) { // Only report every 500ms
                        lastMouseMoveTime = now;
                        reportActivity('mousemove');
                    }
                };
                
                // Mouse events
                document.addEventListener('mousedown', () => reportActivity('mousedown'), true);
                document.addEventListener('click', () => reportActivity('click'), true);
                document.addEventListener('mousemove', throttledMouseMove, true);
                
                // Also detect mouseenter on the document
                document.addEventListener('mouseenter', () => reportActivity('mouseenter'), true);
                
                // Keyboard events
                document.addEventListener('keydown', () => reportActivity('keydown'), true);
                
                // Focus events
                window.addEventListener('focus', () => reportActivity('focus'), true);
                
                // Scroll events (user scrolling indicates activity)
                let lastScrollTime = 0;
                document.addEventListener('scroll', () => {
                    const now = Date.now();
                    if (now - lastScrollTime > 500) {
                        lastScrollTime = now;
                        reportActivity('scroll');
                    }
                }, true);
                
                // Visibility change
                document.addEventListener('visibilitychange', () => {
                    if (!document.hidden) {
                        reportActivity('visibilitychange');
                    }
                }, true);
            });
            },
            { mode: 'retry_all', delayMs: 200, retryLimit: 5 }
        );
    }

    public setActivePage(page: Page) {
        if (this.activePage === page) {
            return;
        }
        
        logger.debug(`Active tab changed to: ${page.url()}`);
        this.activePage = page;
        this.events.emit('tabChanged', page);

        page.removeAllListeners('framenavigated');
        page.on('framenavigated', async (frame) => {
            if (frame === page.mainFrame()) {
                // const url = frame.url();
                // await logNavigation(url);
            }
        });
    }

    async switchTab(index: number) {
        const pages = this.context.pages();
        if (index < 0 || index >= pages.length) {
            throw new Error(`Invalid tab index: ${index}`);
        }
        const page = pages[index];
        logger.debug(`Switching to tab ${index} (${page.url()})`);
        await page.bringToFront();
        this.setActivePage(page);
    }

    getActivePage() {
        return this.activePage;
    }

    getPages(): Page[] {
        return this.context.pages();
    }

    async retrieveState(): Promise<TabState> {
        let activeIndex = -1;
        let tabs = [];

        for (const [i, page] of this.context.pages().entries()) {
            if (page === this.activePage) {
                activeIndex = i;
            }

            let title: string;
            try {
                title = await page.title();
            } catch {
                logger.warn('Could not load page title while retrieving tab state');
                title = '(could not load title)';
            }

            const url = page.url();
            tabs.push({ title, url });
        }

        return {
            activeTab: activeIndex,
            tabs: tabs
        };
    }

    async debugVisibilityStates() {
        const states = await Promise.all(
            this.context.pages().map(async (page, i) => {
                try {
                    const hasFocus = await page.evaluate(() => ({
                        hasFocus: document.hasFocus(),
                        hidden: document.hidden,
                        visibilityState: document.visibilityState
                    }));
                    return { index: i, url: page.url(), ...hasFocus };
                } catch {
                    return { index: i, url: page.url(), error: true };
                }
            })
        );
        return states;
    }

    async debugFocusStates() {
        const states = await Promise.all(
            this.context.pages().map(async (page, i) => {
                try {
                    const state = await page.evaluate(() => ({
                        hasFocus: document.hasFocus(),
                        isVisible: document.visibilityState === 'visible',
                        isHidden: document.hidden,
                        url: window.location.href
                    }));
                    return { index: i, ...state };
                } catch {
                    return { index: i, url: page.url(), error: true };
                }
            })
        );
        console.log('Focus states:', states);
        return states;
    }

    // Clean up
    destroy() {
        // No intervals to clean up anymore
    }
}