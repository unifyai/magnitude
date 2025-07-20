import { createAction } from ".";
import { z } from "zod";
import { DesktopConnector } from "@/connectors/desktopConnector";

// Mouse actions
export const desktopClickAction = createAction({
    name: 'desktop:click',
    description: "Click at screen coordinates",
    schema: z.object({
        x: z.number().int().describe("X coordinate"),
        y: z.number().int().describe("Y coordinate"),
    }),
    resolver: async ({ input: { x, y }, agent }) => {
        const desktop = agent.require(DesktopConnector);
        await desktop.getInterface().click(x, y);
    },
    render: ({ x, y }) => `⊙ click (${x}, ${y})`
});

export const desktopRightClickAction = createAction({
    name: 'desktop:right_click',
    description: "Right-click at screen coordinates",
    schema: z.object({
        x: z.number().int(),
        y: z.number().int(),
    }),
    resolver: async ({ input: { x, y }, agent }) => {
        const desktop = agent.require(DesktopConnector);
        await desktop.getInterface().rightClick(x, y);
    },
    render: ({ x, y }) => `⊙ right-click (${x}, ${y})`
});

export const desktopDoubleClickAction = createAction({
    name: 'desktop:double_click',
    description: "Double-click at screen coordinates",
    schema: z.object({
        x: z.number().int(),
        y: z.number().int(),
    }),
    resolver: async ({ input: { x, y }, agent }) => {
        const desktop = agent.require(DesktopConnector);
        await desktop.getInterface().doubleClick(x, y);
    },
    render: ({ x, y }) => `⊙ double-click (${x}, ${y})`
});

export const desktopDragAction = createAction({
    name: 'desktop:drag',
    description: "Drag from one position to another",
    schema: z.object({
        fromX: z.number().int(),
        fromY: z.number().int(),
        toX: z.number().int(),
        toY: z.number().int(),
    }),
    resolver: async ({ input: { fromX, fromY, toX, toY }, agent }) => {
        const desktop = agent.require(DesktopConnector);
        await desktop.getInterface().drag(fromX, fromY, toX, toY);
    },
    render: ({ fromX, fromY, toX, toY }) => `⊙ drag from (${fromX}, ${fromY}) to (${toX}, ${toY})`
});

export const desktopScrollAction = createAction({
    name: 'desktop:scroll',
    description: "Hover mouse over target and scroll",
    schema: z.object({
        x: z.number().int(),
        y: z.number().int(),
        deltaX: z.number().int().describe("Pixels to scroll horizontally"),
        deltaY: z.number().int().describe("Pixels to scroll vertically"),
    }),
    resolver: async ({ input: { x, y, deltaX, deltaY }, agent }) => {
        const desktop = agent.require(DesktopConnector);
        await desktop.getInterface().scroll(x, y, deltaX, deltaY);
    },
    render: ({ x, y, deltaX, deltaY }) => `↕ scroll (${deltaX}px, ${deltaY}px)`
});

// Keyboard actions
export const desktopTypeAction = createAction({
    name: 'desktop:type',
    description: "Type text at current cursor position",
    schema: z.object({
        text: z.string().describe("Text to type"),
    }),
    resolver: async ({ input: { text }, agent }) => {
        const desktop = agent.require(DesktopConnector);
        await desktop.getInterface().type(text);
    },
    render: ({ text }) => `⌨ type "${text}"`
});

export const desktopKeyAction = createAction({
    name: 'desktop:key',
    description: "Press a single key",
    schema: z.object({
        key: z.string().describe("Key to press (e.g., 'Return', 'Tab', 'Escape')"),
    }),
    resolver: async ({ input: { key }, agent }) => {
        const desktop = agent.require(DesktopConnector);
        await desktop.getInterface().key(key);
    },
    render: ({ key }) => `⌨ key '${key}'`
});

export const desktopHotkeyAction = createAction({
    name: 'desktop:hotkey',
    description: "Press a key combination",
    schema: z.object({
        keys: z.array(z.string()).describe("Keys to press together (e.g., ['cmd', 'c'])"),
    }),
    resolver: async ({ input: { keys }, agent }) => {
        const desktop = agent.require(DesktopConnector);
        await desktop.getInterface().hotkey(keys);
    },
    render: ({ keys }) => `⌨ hotkey ${keys.join('+')}`
});

// Navigation
export const desktopNavigateAction = createAction({
    name: 'desktop:navigate',
    description: "Open a new browser window/tab with the specified URL. For navigating within an existing browser window, interact with the address bar instead.",
    schema: z.object({
        url: z.string().describe("URL to open in a new browser window/tab"),
    }),
    resolver: async ({ input: { url }, agent }) => {
        const desktop = agent.require(DesktopConnector);
        const interface_ = desktop.getInterface();
        if (!interface_.navigate) {
            throw new Error("Desktop interface does not support navigation");
        }
        await interface_.navigate(url);
    },
    render: ({ url }) => `⛓ open browser with ${url}`
});

// Utility
export const desktopWaitAction = createAction({
    name: 'desktop:wait',
    description: "Actions include smart waiting automatically - so only use this when a significant additional wait is clearly required.",
    schema: z.object({
        seconds: z.number().describe("Seconds to wait"),
    }),
    resolver: async ({ input: { seconds }, agent }) => {
        await new Promise((resolve) => setTimeout(resolve, seconds * 1000));
    },
    render: ({ seconds }) => `◴ wait ${seconds}s`
});

// Export all desktop actions
export const desktopActions = [
    desktopClickAction,
    desktopRightClickAction,
    desktopDoubleClickAction,
    desktopDragAction,
    desktopScrollAction,
    desktopTypeAction,
    desktopKeyAction,
    desktopHotkeyAction,
    desktopNavigateAction,
    desktopWaitAction,
]; 