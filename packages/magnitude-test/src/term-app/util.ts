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
