import termkit from 'terminal-kit';

/**
 * Generates a unique identifier for a test case.
 * @param filepath - The path to the test file.
 * @param groupName - The name of the test group (or null if ungrouped).
 * @param title - The title of the test case.
 * @returns A unique string identifier.
 */
export function getUniqueTestId(filepath: string, groupName: string | null, title: string): string {
    const groupPart = groupName ? `[${groupName}]` : '__ungrouped__';
    return `${filepath}::${groupPart}::${title}`;
}

/**
 * Formats a duration in milliseconds into a human-readable string (e.g., "1.23s", "456ms").
 * @param ms - The duration in milliseconds.
 * @returns A formatted string representation of the duration.
 */
export function formatDuration(ms: number | undefined): string {
    if (ms === undefined || ms === null) {
        return '';
    }
    // if (ms < 1000) {
    //     return `${ms}ms`;
    // }
    //return `${(ms / 1000).toFixed(0)}s`;
    return `${(ms / 1000).toFixed(1)}s`;
}

// Note: initializeTestStates is likely not needed here as state is passed in.

/**
 * Draws a box with rounded corners using terminal-kit.
 * @param term - The terminal-kit instance.
 * @param x - The starting x coordinate (top-left corner).
 * @param y - The starting y coordinate (top-left corner).
 * @param width - The width of the box.
 * @param height - The height of the box.
 * @param styleFn - A function to apply styling (e.g., term.brightBlue).
 */
export function drawBox(
    term: termkit.Terminal,
    x: number,
    y: number,
    width: number,
    height: number,
    styleFn: (text: string) => void = (text) => term(text) // Default style: no extra styling
) {
    if (width < 2 || height < 2) return; // Box needs minimum dimensions

    // Ensure coordinates are within bounds (basic check)
    x = Math.max(1, x);
    y = Math.max(1, y);
    width = Math.min(width, term.width - x + 1);
    height = Math.min(height, term.height - y + 1);

    // Top border
    term.moveTo(x, y);
    styleFn('╭' + '─'.repeat(width - 2) + '╮');

    // Middle borders
    for (let i = 1; i < height - 1; i++) {
        term.moveTo(x, y + i);
        styleFn('│');
        term.moveTo(x + width - 1, y + i);
        styleFn('│');
    }

    // Bottom border
    term.moveTo(x, y + height - 1);
    styleFn('╰' + '─'.repeat(width - 2) + '╯');
}

/**
 * Wraps text to a specified width.
 * Basic implementation, doesn't handle complex cases like hyphenation.
 * @param text The text to wrap.
 * @param maxWidth The maximum width for each line.
 * @returns An array of strings, each representing a wrapped line.
 */
export function wrapText(text: string, maxWidth: number): string[] {
    if (maxWidth <= 0) return [text]; // Cannot wrap to zero or negative width

    const lines: string[] = [];
    let currentLine = '';

    // Split by space to handle words
    const words = text.split(' ');

    for (const word of words) {
        if (currentLine.length === 0) {
            // If line is empty, add the word (even if it exceeds maxWidth)
            currentLine = word;
        } else if (currentLine.length + word.length + 1 <= maxWidth) {
            // If word fits on the current line with a space
            currentLine += ' ' + word;
        } else {
            // If word doesn't fit, push the current line and start a new one
            lines.push(currentLine);
            currentLine = word; // Start new line with the current word
        }

        // Handle words longer than maxWidth - break them forcefully
        while (currentLine.length > maxWidth) {
            lines.push(currentLine.substring(0, maxWidth));
            currentLine = currentLine.substring(maxWidth);
        }
    }

    // Push the last remaining line
    if (currentLine.length > 0) {
        lines.push(currentLine);
    }

    return lines;
}
