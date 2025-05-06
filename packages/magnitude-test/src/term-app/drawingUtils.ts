import { TestState } from './types';
import { ActionDescriptor, FailureDescriptor } from 'magnitude-core';
import { ANSI_RESET, ANSI_BRIGHT_RED, ANSI_BRIGHT_GREEN, ANSI_BRIGHT_BLUE, ANSI_GRAY, ANSI_RED, BOX_CHARS_ROUNDED } from './constants';

/**
 * Calculate the visible length of a string, accounting for ANSI escape codes.
 * @param s The string to calculate the length for
 * @returns The visible length of the string
 */
export const str = (s: string): number => {
    // Basic ANSI escape code removal for length calculation
    // This is a simplified version and might not cover all ANSI sequences.
    const ansiRegex = /\x1b\[[0-9;]*[mGKH]/g;
    return s.replace(ansiRegex, '').length;
};

/**
 * Create a box as an array of strings using ANSI codes and specified characters.
 * @param width Width of the box
 * @param height Height of the box
 * @param colorCode ANSI color code for the box
 * @param boxChars Box drawing characters to use
 * @returns Array of strings representing the box
 */
export function createBoxAnsi(width: number, height: number, colorCode: string, boxChars = BOX_CHARS_ROUNDED): string[] {
    if (height < 2 || width < 2) return [];
    const lines: string[] = [];
    const horizontal = boxChars.horizontal.repeat(width - 2);
    const topBorder = `${boxChars.topLeft}${horizontal}${boxChars.topRight}`;
    const bottomBorder = `${boxChars.bottomLeft}${horizontal}${boxChars.bottomRight}`;

    lines.push(`${colorCode}${topBorder}${ANSI_RESET}`);

    for (let i = 1; i < height - 1; i++) {
        lines.push(`${colorCode}${boxChars.vertical}${' '.repeat(width - 2)}${boxChars.vertical}${ANSI_RESET}`);
    }

    lines.push(`${colorCode}${bottomBorder}${ANSI_RESET}`);
    return lines;
}

/**
 * Insert a content line into a box at the specified position.
 * @param lines Array of strings representing the box
 * @param contentLine Content to insert
 * @param lineIndex Index of the line to modify
 * @param startX Starting X position for the content
 * @param boxWidth Total width of the box
 */
export function insertLineIntoBoxAnsi(lines: string[], contentLine: string, lineIndex: number, startX: number, boxWidth: number) {
    if (lineIndex <= 0 || lineIndex >= lines.length - 1) return; // Only insert into content lines

    const targetLine = lines[lineIndex];
    const boxColorMatch = targetLine.match(/^\x1b\[[0-9;]*m/); // Get the box's color code
    const boxColor = boxColorMatch ? boxColorMatch[0] : '';

    const contentAreaWidth = boxWidth - 2;
    const availableSpace = contentAreaWidth - startX;

    if (availableSpace > 0) {
        // Basic ANSI-aware truncation
        let truncatedContent = '';
        let currentVisibleLength = 0;
        const ansiRegex = /\x1b\[[0-9;]*m/g;
        let lastIndex = 0;
        let match;
        while ((match = ansiRegex.exec(contentLine)) !== null) {
            const textPart = contentLine.substring(lastIndex, match.index);
            const partLen = str(textPart);
            if (currentVisibleLength + partLen <= availableSpace) {
                truncatedContent += textPart + match[0];
                currentVisibleLength += partLen;
            } else {
                const remainingSpace = availableSpace - currentVisibleLength;
                truncatedContent += textPart.slice(0, remainingSpace) + match[0];
                currentVisibleLength = availableSpace;
                break;
            }
            lastIndex = ansiRegex.lastIndex;
        }
        if (currentVisibleLength < availableSpace) {
            const textPart = contentLine.substring(lastIndex);
            const partLen = str(textPart);
            if (currentVisibleLength + partLen <= availableSpace) {
                truncatedContent += textPart;
                currentVisibleLength += partLen;
            } else {
                const remainingSpace = availableSpace - currentVisibleLength;
                truncatedContent += textPart.slice(0, remainingSpace);
                currentVisibleLength = availableSpace;
            }
        }
        // Ensure content ends with reset if it had styles
        if (truncatedContent.includes('\x1b[') && !truncatedContent.endsWith(ANSI_RESET)) {
            truncatedContent += ANSI_RESET;
        }

        const paddingLeft = ' '.repeat(startX);
        const paddingRight = ' '.repeat(availableSpace - currentVisibleLength);

        // Reconstruct the line with box color preserved
        lines[lineIndex] = `${boxColor}${BOX_CHARS_ROUNDED.vertical}${ANSI_RESET}${paddingLeft}${truncatedContent}${paddingRight}${boxColor}${BOX_CHARS_ROUNDED.vertical}${ANSI_RESET}`;
    }
}

/**
 * Format a description of an action.
 * @param action The action descriptor
 * @returns Plain string description
 */
export function describeAction(action: ActionDescriptor): string {
    // Returns plain string
    switch (action.variant) {
        case 'load': return `navigated to URL: ${action.url}`;
        case 'click': return `clicked ${action.target}`;
        case 'type': return `typed "${action.content}" into ${action.target}`;
        case 'scroll': return `scrolled (${action.deltaX}, ${action.deltaY})`;
        default: return `unknown action: ${(action as any).variant}`;
    }
}

/**
 * Get a symbol representing an action type.
 * @param variant The action variant
 * @returns Plain character symbol
 */
export function getActionSymbol(variant: "load" | "click" | "hover" | "type" | "scroll" | "wait" | "back"): string {
    // Returns plain char
    switch (variant) {
        case "load": return "↻"; case "click": return "⊙"; case "hover": return "◉";
        case "type": return "⏎"; case "scroll": return "↕"; case "wait": return "◴";
        case "back": return "←"; default: return "?";
    }
}

/**
 * Get the status indicator character for a test.
 * @param status Test status
 * @returns Plain character symbol
 */
export function getTestStatusIndicatorChar(status: TestState['status']): string {
    // Returns plain char
    switch (status) {
        case 'passed': return '✓'; case 'failed': return '✕';
        case 'cancelled': return '⊘'; case 'pending': default: return '◌';
    }
}

/**
 * Get the status indicator character for a step.
 * @param status Step status
 * @returns Plain character symbol
 */
export function getStepStatusIndicatorChar(status: TestState['status']): string {
    // Returns plain char
    switch (status) {
        case 'running': return '>'; case 'passed': return '⚑';
        case 'failed': return '✕'; case 'cancelled': return '⊘';
        case 'pending': default: return '•';
    }
}

/**
 * Get the status indicator character for a check.
 * @param status Check status
 * @returns Plain character symbol
 */
export function getCheckStatusIndicatorChar(status: TestState['status']): string {
    // Returns plain char
    switch (status) {
        case 'running': return '?'; case 'passed': return '✓';
        case 'failed': return '✕'; case 'cancelled': return '⊘';
        case 'pending': default: return '•';
    }
}

/**
 * Apply styling to text based on status and type.
 * @param status The status to style for
 * @param text The text to style
 * @param type The type of element being styled
 * @returns String with ANSI codes
 */
export function styleAnsi(status: TestState['status'], text: string, type: 'test' | 'step' | 'check'): string {
    // Returns string with ANSI codes
    let colorCode = ANSI_GRAY; // Default gray
    switch (type) {
        case 'test':
            switch (status) {
                case 'running': colorCode = ANSI_BRIGHT_BLUE; break;
                case 'passed': colorCode = ANSI_BRIGHT_GREEN; break;
                case 'failed': colorCode = ANSI_BRIGHT_RED; break;
                case 'cancelled': colorCode = ANSI_GRAY; break;
            }
            break;
        case 'step':
            switch (status) {
                case 'running': colorCode = ANSI_GRAY; break;
                case 'passed': colorCode = ANSI_BRIGHT_BLUE; break;
                case 'failed': colorCode = ANSI_BRIGHT_RED; break;
                case 'cancelled': colorCode = ANSI_GRAY; break;
            }
            break;
        case 'check':
            switch (status) {
                case 'running': colorCode = ANSI_GRAY; break;
                case 'passed': colorCode = ANSI_BRIGHT_BLUE; break;
                case 'failed': colorCode = ANSI_BRIGHT_RED; break;
                case 'cancelled': colorCode = ANSI_GRAY; break;
            }
            break;
    }
    // Important: Ensure reset code is appended
    return `${colorCode}${text}${ANSI_RESET}`;
}
