import { ActionDefinition, ActionPayload, createAction } from ".";
import { z } from "zod";
import { BrowserConnector } from "@/connectors/browserConnector";
import { AgentError } from "@/agent/errors";
import { Agent } from "@/agent";

export const clickTargetAction = createAction({
    name: 'mouse:click',
    description: "Click something based on a textual description",
    schema: z.object({
        target: z.string().describe("Where exactly to click"),
    }),
    resolver: async ({ input: { target }, agent }) => {
        const web = agent.require(BrowserConnector);
        const harness = web.getHarness();
        const screenshot = await web.getLastScreenshot();
        const coords = await web.requireGrounding().locateTarget(screenshot, target);
        await harness.click(coords);
        return { resolvedCoords: coords };
    },
    render: ({ target }) => `⊙ click target "${target}"`
});

export const scrollTargetAction = createAction({
    name: 'mouse:scroll',
    description: "Hover mouse over target based on description and scroll",
    schema: z.object({
        target: z.string().describe("Somewhere specific inside the container to scroll in"),
        deltaX: z.number().int().describe("Pixels to scroll horizontally"),
        deltaY: z.number().int().describe("Pixels to scroll vertically"),
    }),
    resolver: async ({ input: { target, deltaX, deltaY }, agent }) => {
        const web = agent.require(BrowserConnector);
        const harness = web.getHarness();
        const screenshot = await web.getLastScreenshot();
        const coords = await web.requireGrounding().locateTarget(screenshot, target);
        await harness.scroll({ ...coords, deltaX, deltaY });
        return { resolvedCoords: coords };
    },
    render: ({ target, deltaX, deltaY }) => `↕ scroll target "${target}" (${deltaX}px, ${deltaY}px)`
});

export const clickCoordAction = createAction({
    name: 'mouse:click',
    description: "Click something",
    schema: z.object({
        x: z.number().int(),
        y: z.number().int(),
    }),
    resolver: async ({ input: { x, y }, agent }) => {
        const web = agent.require(BrowserConnector);
        const harness = web.getHarness();
        await harness.click({ x, y });
    },
    render: ({ x, y }) => `⊙ click (${x}, ${y})`
});

export const mouseDoubleClickAction = createAction({
    name: 'mouse:double_click',
    schema: z.object({
        x: z.number().int(),
        y: z.number().int(),
    }),
    resolver: async ({ input: { x, y }, agent }) => {
        const web = agent.require(BrowserConnector);
        const harness = web.getHarness();
        await harness.doubleClick({ x, y });
    },
    render: ({ x, y }) => `⊙ double click (${x}, ${y})`
});

export const mouseRightClickAction = createAction({
    name: 'mouse:right_click',
    schema: z.object({
        x: z.number().int(),
        y: z.number().int(),
    }),
    resolver: async ({ input: { x, y }, agent }) => {
        await agent.require(BrowserConnector).getHarness().rightClick({ x, y });
    },
    render: ({ x, y }) => `⊙ right click (${x}, ${y})`
});

export const mouseDragAction = createAction({
    name: 'mouse:drag',
    description: "Click and hold mouse in one location and release in another",
    schema: z.object({
        from: z.object({ x: z.number().int(), y: z.number().int() }),
        to: z.object({ x: z.number().int(), y: z.number().int() })
    }),
    resolver: async ({ input: { from, to }, agent }) => {
        const web = agent.require(BrowserConnector);
        const harness = web.getHarness();
        await harness.drag({ x1: from.x, y1: from.y, x2: to.x, y2: to.y });
    },
    render: ({ from, to }) => `⤡ drag (${from.x}, ${from.y}) -> (${to.x}, ${to.y})`
});

export const typeAction = createAction({
    name: 'keyboard:type',
    description: "Make sure to click where you need to type first", // make sure you click into it first
    schema: z.object({
        content: z.string().describe("Content to type"),
    }),
    resolver: async ({ input: { content }, agent }) => {
        const webConnector = agent.require(BrowserConnector);
        const harness = webConnector.getHarness();
        await harness.type({ content });
    },
    render: ({ content }) => `⌨︎ type "${content}"`
});

export const keyboardEnterAction = createAction({
    name: 'keyboard:enter',
    resolver: async ({ agent }) => {
        await agent.require(BrowserConnector).getHarness().enter();
    },
    render: () => `⏎ press enter`
});

export const keyboardTabAction = createAction({
    name: 'keyboard:tab',
    resolver: async ({ agent }) => {
        await agent.require(BrowserConnector).getHarness().tab();
    },
    render: () => `⇥ press tab`
});

export const keyboardBackspaceAction = createAction({
    name: 'keyboard:backspace',
    resolver: async ({ agent }) => {
        await agent.require(BrowserConnector).getHarness().backspace();
    },
    render: () => `⌫ press backspace`
});

export const keyboardSelectAllAction = createAction({
    name: 'keyboard:select_all',
    description: "Select all content in the active text area (CTRL+A)",
    resolver: async ({ input: { content }, agent }) => {
        await agent.require(BrowserConnector).getHarness().selectAll();
    },
    render: () => `⬚ select all`
});

export const scrollCoordAction = createAction({
    name: 'mouse:scroll',
    description: "Hover mouse over target and scroll",
    schema: z.object({
        x: z.number().int(),
        y: z.number().int(),
        deltaX: z.number().int().describe("Pixels to scroll horizontally"),
        deltaY: z.number().int().describe("Pixels to scroll vertically"),
    }),
    resolver: async ({ input: { x, y, deltaX, deltaY }, agent }) => {
        const webConnector = agent.require(BrowserConnector);
        const harness = webConnector.getHarness();
        await harness.scroll({ x, y, deltaX, deltaY });
    },
    render: ({ x, y, deltaX, deltaY }) => `↕ scroll (${deltaX}px, ${deltaY}px)`
});

// Grounding agnostic
export const switchTabAction = createAction({
    name: 'browser:tab:switch',
    description: "Switch to a tab that is already open",
    schema: z.object({
        index: z.number().int().describe("Index of tab to switch to"),
    }),
    resolver: async ({ input: { index }, agent }) => {
        const webConnector = agent.require(BrowserConnector);
        const harness = webConnector.getHarness();
        await harness.switchTab({ index });
    },
    render: ({ index }) => `⧉ switch to tab ${index}`
});

export const closeTabAction = createAction({
    name: 'browser:tab:close',
    description: "Close a tab by index",
    schema: z.object({
        index: z.number().int().describe("Index of tab to close"),
    }),
    resolver: async ({ input: { index }, agent }) => {
        const webConnector = agent.require(BrowserConnector);
        const harness = webConnector.getHarness();
        await harness.closeTab({ index });
    },
    render: ({ index }) => `✖ close tab ${index}`
});

export const newTabAction = createAction({
    name: 'browser:tab:new',
    description: "Open and switch to a new tab",
    schema: z.object({}),
    resolver: async ({ agent }) => {
        const webConnector = agent.require(BrowserConnector);
        const harness = webConnector.getHarness();
        await harness.newTab();
    },
    render: () => `⊞ open new tab`
});

export const navigateAction = createAction({
    name: 'browser:nav',
    description: "Navigate to a URL directly",
    schema: z.object({
        url: z.string().describe('URL to navigate to'),
    }),
    resolver: async ({ input: { url }, agent }) => {
        const webConnector = agent.require(BrowserConnector);
        const harness = webConnector.getHarness();
        await harness.navigate(url);
    },
    render: ({ url }) => `⛓︎ navigate to ${url}`
});

export const goBackAction = createAction({
    name: 'browser:nav:back',
    description: "Go back",
    schema: z.object({}),
    resolver: async ({ agent }) => {
        const webConnector = agent.require(BrowserConnector);
        const harness = webConnector.getHarness();
        await harness.goBack();
    },
    render: () => `← navigate back`
});

// gets overused currently if we include this
export const waitAction = createAction({
    name: 'wait',
    description: "Actions include smart waiting automatically - so only use this when a significant additional wait is clearly required.",
    schema: z.object({
        seconds: z.number()
    }),
    resolver: async ({ input: { seconds }, agent }) => {
        await new Promise((resolve) => setTimeout(resolve, seconds * 1000));
    },
    render: ({ seconds }) => `◴ wait for ${seconds}s`
});



export const webActions = [
    clickTargetAction,
    scrollTargetAction,
    clickCoordAction,
    mouseDoubleClickAction,
    mouseRightClickAction,
    scrollCoordAction,
    mouseDragAction,
    newTabAction,
    switchTabAction,
    closeTabAction,
    navigateAction,
    goBackAction, 
    typeAction,
    keyboardEnterAction,
    keyboardTabAction,
    keyboardBackspaceAction,
    keyboardSelectAllAction,
    waitAction,
] as const;

