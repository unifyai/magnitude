import termkit from 'terminal-kit';
import { CategorizedTestCases, TestRunnable } from '@/discovery/types';
import { AllTestStates, TestState } from './types'; // Updated import path
import { VERSION } from '@/version';
import { formatDuration, getUniqueTestId, drawBox, wrapText } from './util'; // Import drawBox and wrapText
import { FailureDescriptor, ActionDescriptor } from 'magnitude-core';

const term = termkit.terminal;

// --- Configuration ---
const MAX_APP_WIDTH = 100; // max rendered width
const PADDING = 2; // Horizontal padding inside boxes

// --- State ---
let currentWidth = Math.min(term.width, MAX_APP_WIDTH);
let redrawScheduled = false; // Restore flag
let timerInterval: NodeJS.Timeout | null = null;
let currentTestStates: AllTestStates = {}; // Store the latest states
let currentTests: CategorizedTestCases = {}; // Store the test structure
let currentModel = '';
let elapsedTimes: { [testId: string]: number } = {}; // Store elapsed times for running tests
let isFinished = false; // Flag to indicate if tests are done
let spinnerFrame = 0; // Current frame for the spinner animation
const spinnerChars = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];

// --- Utility Functions (from Ink components) ---

function describeAction(action: ActionDescriptor): string {
    switch (action.variant) {
        case 'load':
            return `navigated to URL: ${action.url}`;
        case 'click':
            return `clicked ${action.target}`;
        case 'type':
            return `typed "${action.content}" into ${action.target}`;
        case 'scroll':
            return `scrolled (${action.deltaX}, ${action.deltaY})`;
        default:
            // Handle potential unknown variants gracefully
            return `unknown action: ${(action as any).variant}`;
    }
}

function getActionSymbol(variant: "load" | "click" | "hover" | "type" | "scroll" | "wait" | "back"): string {
    switch (variant) {
        case "load": return "↻";
        case "click": return "⊙";
        case "hover": return "◉";
        case "type": return "⏎";
        case "scroll": return "↕";
        case "wait": return "◴";
        case "back": return "←";
        default: return "?";
    }
}

// Returns just the character, styling applied separately
// Spinner is handled directly in drawTest now
function getTestStatusIndicatorChar(status: TestState['status']): string {
    switch (status) {
        // case 'running': return ' '; // Spinner handled in drawTest
        case 'passed': return '✓';
        case 'failed': return '✕';
        case 'cancelled': return '⊘';
        case 'pending':
        default: return '◌';
    }
}

// Returns just the character
function getStepStatusIndicatorChar(status: TestState['status']): string {
    switch (status) {
        case 'running': return '>';
        case 'passed': return '⚑';
        case 'failed': return '✕';
        case 'cancelled': return '⊘';
        case 'pending':
        default: return '•';
    }
}

// Returns just the character
function getCheckStatusIndicatorChar(status: TestState['status']): string {
    switch (status) {
        case 'running': return '?';
        case 'passed': return '✓';
        case 'failed': return '✕';
        case 'cancelled': return '⊘';
        case 'pending':
        default: return '•';
    }
}

// --- Drawing Functions (using `term` directly) ---

function drawTitleBar() {
    // Use drawBox for the title bar frame (height 3)
    drawBox(term, 1, 1, currentWidth, 3, term.brightBlue);

    // Draw title text inside the box (at y=2)
    term.moveTo(1 + PADDING, 2).styleReset(); // Move inside left border (padding)
    term.bold.brightBlue(`Magnitude v${VERSION}`);

    // Draw model text inside the box (at y=2), aligned right
    const modelText = `Model: ${currentModel}`;
    const modelX = currentWidth - modelText.length - PADDING; // Position inside right border (padding)
    term.moveTo(modelX, 2).styleReset();
    term.dim.gray(modelText);
}

// Modified drawFailure to accept availableWidth and use wrapText
function drawFailure(x: number, y: number, failure: FailureDescriptor, bottomBoundary: number, availableWidth: number): number {
    let currentY = y;
    if (currentY >= bottomBoundary) return currentY;
    const prefix = '↳ ';
    const indentX = x + prefix.length;
    const contentWidth = Math.max(1, availableWidth - prefix.length); // Width for wrapped text, ensure positive

    term.moveTo(x, currentY).styleReset().red(prefix); // Draw prefix first

    if (failure.variant === 'bug') {
        const titleLines = wrapText(`Found bug: ${failure.title}`, contentWidth);
        titleLines.forEach((line, index) => {
            if (currentY >= bottomBoundary) return;
            term.moveTo(indentX, currentY).styleReset().red(index === 0 ? '' : '  ').bold(line); // Indent subsequent lines
            currentY++;
        });
        if (currentY >= bottomBoundary) return currentY;

        const expectedLines = wrapText(`Expected: ${failure.expectedResult}`, contentWidth);
        expectedLines.forEach((line, index) => {
            if (currentY >= bottomBoundary) return;
            term.moveTo(indentX, currentY).styleReset().red(line);
            currentY++;
        });
         if (currentY >= bottomBoundary) return currentY;

        const actualLines = wrapText(`Actual:   ${failure.actualResult}`, contentWidth);
         actualLines.forEach((line, index) => {
            if (currentY >= bottomBoundary) return;
            term.moveTo(indentX, currentY).styleReset().red(line);
            currentY++;
        });
         if (currentY >= bottomBoundary) return currentY;

        term.moveTo(indentX, currentY).styleReset().red('Severity: ')(failure.severity.toUpperCase());
        currentY++;

    } else if (failure.variant === 'cancelled') {
        // This case is handled separately now before the generic else
        term.moveTo(indentX, currentY).styleReset().gray('Cancelled');
        currentY++;
    } else {
        // Handle other failure types that have a 'message'
        const prefixMap: Partial<Record<FailureDescriptor['variant'], string>> = {
            'unknown': '',
            'browser': 'BrowserError: ',
            'network': 'NetworkError: ',
            'misalignment': 'Misalignment: '
            // Note: 'cancelled' and 'bug' are handled above
        };
        // Ensure failure has a message property before accessing it
        if ('message' in failure) {
            const failurePrefix = prefixMap[failure.variant] || `${failure.variant}: `;
            const messageLines = wrapText(failurePrefix + failure.message, contentWidth);
            messageLines.forEach((line, index) => {
                 if (currentY >= bottomBoundary) return;
                 term.moveTo(indentX, currentY).styleReset().red(line);
                 currentY++;
            });
        }
        // Removed the problematic 'else' block that caused the 'never' type error
    }
    return Math.min(currentY, bottomBoundary);
}

function applyStatusStyle(status: TestState['status'], char: string) {
     switch (status) {
        case 'running': term.blue(char); break; // Placeholder for spinner
        case 'passed': term.green(char); break;
        case 'failed': term.red(char); break;
        case 'cancelled': term.gray(char); break;
        case 'pending':
        default: term.gray(char); break;
    }
}

function applyStepStatusStyle(status: TestState['status'], char: string) {
     switch (status) {
        case 'running': term.grey(char); break;
        case 'passed': term.brightBlue(char); break;
        case 'failed': term.red(char); break;
        case 'cancelled': term.gray(char); break;
        case 'pending':
        default: term.gray(char); break;
    }
}

function applyCheckStatusStyle(status: TestState['status'], char: string) {
     switch (status) {
        case 'running': term.grey(char); break;
        case 'passed': term.brightBlue(char); break;
        case 'failed': term.red(char); break;
        case 'cancelled': term.gray(char); break;
        case 'pending':
        default: term.gray(char); break;
    }
}


// Modified drawTest to accept bottomBoundary and availableWidth, use wrapText
function drawTest(x: number, y: number, test: TestRunnable, state: TestState, filepath: string, groupName: string | null, bottomBoundary: number, availableWidth: number): number {
    let currentY = y;
    if (currentY >= bottomBoundary) return currentY; // Check start position

    const testIndent = x;
    const stepIndent = testIndent + 2;
    const actionIndent = stepIndent + 2;
    const testId = getUniqueTestId(filepath, groupName, test.title);
    // Calculate content width based on the starting X position and the overall available width
    const contentWidth = Math.max(1, availableWidth - (x - (1 + PADDING))); // Ensure positive width

    // --- Draw Test Title Line ---
    term.moveTo(testIndent, currentY).styleReset();
    // Handle spinner directly
    if (state.status === 'running') {
        term.blue(spinnerChars[spinnerFrame]); // Draw current spinner frame
    } else {
        const statusChar = getTestStatusIndicatorChar(state.status);
        applyStatusStyle(state.status, statusChar); // Apply style for non-running states
    }

    // Calculate space for timer to potentially wrap title correctly
    const timerText = state.status !== 'pending' ? ` [${formatDuration(elapsedTimes[testId] ?? 0)}]` : '';
    const titleAvailableWidth = contentWidth - 2 - timerText.length; // -2 for status char and space
    const titleLines = wrapText(test.title, titleAvailableWidth > 10 ? titleAvailableWidth : contentWidth - 2); // Use full width if timer makes it too small

    titleLines.forEach((line, index) => {
        if (currentY >= bottomBoundary) return;
        term.moveTo(testIndent + 2, currentY).styleReset()(line); // Draw title part
        if (index === 0 && timerText) {
            term.gray(timerText); // Draw timer only on the first line
        }
        currentY++;
    });
    if (currentY >= bottomBoundary) return currentY; // Check after increment

    // --- Draw Steps and Checks ---
    const stepContentWidth = Math.max(1, availableWidth - (stepIndent - (1 + PADDING)));
    const actionContentWidth = Math.max(1, availableWidth - (actionIndent + 2 - (1 + PADDING))); // action text starts 2 chars after symbol

    if (state.stepsAndChecks.length > 0) {
        state.stepsAndChecks.forEach((item) => {
            if (currentY >= bottomBoundary) return; // Check against box boundary

            term.moveTo(stepIndent, currentY).styleReset();
            if (item.variant === 'step') {
                const stepChar = getStepStatusIndicatorChar(item.status);
                applyStepStatusStyle(item.status, stepChar);
                const descLines = wrapText(item.description, stepContentWidth - 2); // -2 for status char and space
                descLines.forEach((line, index) => {
                     if (currentY >= bottomBoundary) return;
                     term.moveTo(stepIndent + 2, currentY).styleReset()(line);
                     currentY++;
                });
                 if (currentY >= bottomBoundary) return; // Check after increment

                if (item.actions.length > 0) {
                    item.actions.forEach(action => {
                        if (currentY >= bottomBoundary) return; // Check against box boundary
                        // Draw action symbol at actionIndent
                        term.moveTo(actionIndent, currentY).styleReset();
                        term.gray(getActionSymbol(action.variant));
                        // Draw action description indented further
                        const actionDescLines = wrapText(describeAction(action), actionContentWidth);
                        actionDescLines.forEach((line, index) => {
                            if (currentY >= bottomBoundary) return;
                            term.moveTo(actionIndent + 2, currentY).styleReset().gray(line);
                            currentY++;
                        });
                         if (currentY >= bottomBoundary) return; // Check after increment
                    });
                }
            } else { // Check
                const checkChar = getCheckStatusIndicatorChar(item.status);
                applyCheckStatusStyle(item.status, checkChar);
                const descLines = wrapText(item.description, stepContentWidth - 2); // -2 for status char and space
                 descLines.forEach((line, index) => {
                     if (currentY >= bottomBoundary) return;
                     term.moveTo(stepIndent + 2, currentY).styleReset()(line);
                     currentY++;
                 });
                 if (currentY >= bottomBoundary) return; // Check after increment
            }
        });
    }

    // --- Draw Failure ---
    if (state.failure && state.failure.variant !== 'cancelled') {
         if (currentY < bottomBoundary) { // Check against box boundary
            currentY = drawFailure(stepIndent, currentY, state.failure, bottomBoundary, stepContentWidth);
         }
    }

    // Return the next Y position, capped at the boundary
    return Math.min(currentY, bottomBoundary);
}

// Modified drawTestList to accept box boundaries and pass width
function drawTestList(boxY: number, boxHeight: number, availableWidth: number): number {
    let currentY = boxY; // Start drawing at the top of the box content area
    const fileIndent = 1 + PADDING; // Indent inside the box border (left padding)
    const groupIndent = fileIndent + 2;
    const testIndent = groupIndent;
    const bottomBoundary = boxY + boxHeight; // Calculate bottom boundary based on passed height

    for (const [filepath, { ungrouped, groups }] of Object.entries(currentTests)) {
        if (currentY >= bottomBoundary) break; // Stop if we hit the bottom

        term.moveTo(fileIndent, currentY).styleReset(); // Use fileIndent for filepath
        term.bold.brightBlue(`☰ ${filepath}`);
        currentY++;
        if (currentY >= bottomBoundary) break; // Check after increment

        // Draw ungrouped tests
        if (ungrouped.length > 0) {
             if (currentY >= bottomBoundary) break;
            ungrouped.forEach(test => {
                if (currentY >= bottomBoundary) return;
                const testId = getUniqueTestId(filepath, null, test.title);
                const state = currentTestStates[testId];
                if (state) {
                    // Pass bottomBoundary and availableWidth to drawTest
                    currentY = drawTest(testIndent, currentY, test, state, filepath, null, bottomBoundary, availableWidth);
                }
                 if (currentY >= bottomBoundary) return; // Check within loop
            });
        }

        // Draw grouped tests
        if (Object.entries(groups).length > 0) {
             if (currentY >= bottomBoundary) break;
            Object.entries(groups).forEach(([groupName, groupTests]) => {
                if (currentY >= bottomBoundary) return;
                term.moveTo(groupIndent, currentY).styleReset(); // Use groupIndent
                term.bold.brightBlue(`↳ ${groupName}`); // Add indicator
                currentY++;
                 if (currentY >= bottomBoundary) return; // Check after increment
                groupTests.forEach(test => {
                    if (currentY >= bottomBoundary) return;
                    const testId = getUniqueTestId(filepath, groupName, test.title);
                    const state = currentTestStates[testId];
                    if (state) {
                         // Pass bottomBoundary and availableWidth to drawTest
                        currentY = drawTest(testIndent + 2, currentY, test, state, filepath, groupName, bottomBoundary, availableWidth);
                         if (currentY >= bottomBoundary) return; // Check within loop
                    }
                });
            });
        }
         if (currentY < bottomBoundary) {
            currentY++; // Add a blank line between files if space allows
         }
    }

    // Return the next Y position *after* the content drawn, capped at the boundary
    return Math.min(currentY, bottomBoundary);
}


function drawSummary(startY: number): number {
    let currentY = startY;
    if (currentY >= term.height) return currentY; // Check if space available (use term.height)

    // Calculate counts
    let totalInputTokens = 0;
    let totalOutputTokens = 0;
    const statusCounts = {
        pending: 0, running: 0, passed: 0, failed: 0, cancelled: 0, total: 0,
    };
    const failuresWithContext: { filepath: string; groupName: string | null; testTitle: string; failure: FailureDescriptor }[] = [];
    const testContextMap = new Map<string, { filepath: string; groupName: string | null; testTitle: string }>();

    // Build context map first
     Object.entries(currentTests).forEach(([filepath, { ungrouped, groups }]) => {
        ungrouped.forEach(test => {
            const testId = getUniqueTestId(filepath, null, test.title);
            testContextMap.set(testId, { filepath, groupName: null, testTitle: test.title });
        });
        Object.entries(groups).forEach(([groupName, groupTests]) => {
            groupTests.forEach(test => {
                const testId = getUniqueTestId(filepath, groupName, test.title);
                testContextMap.set(testId, { filepath, groupName, testTitle: test.title });
            });
        });
    });

    // Calculate counts and collect failures
    for (const [testId, state] of Object.entries(currentTestStates)) {
        statusCounts.total++;
        statusCounts[state.status]++;
        totalInputTokens += state.macroUsage.inputTokens;
        totalOutputTokens += state.macroUsage.outputTokens;

        if (state.failure && state.failure.variant !== 'cancelled') {
            const context = testContextMap.get(testId);
            failuresWithContext.push({
                filepath: context?.filepath ?? 'Unknown File',
                groupName: context?.groupName ?? null,
                testTitle: context?.testTitle ?? 'Unknown Test',
                failure: state.failure
            });
        }
    }

    const hasFailures = failuresWithContext.length > 0;
    // Pass currentTestStates to calculateSummaryHeight, not the locally calculated counts/failures
    const summaryHeight = calculateSummaryHeight(currentTestStates); // Calculate needed height

    // Draw Summary Box
    const boxY = startY; // Start box where summary starts
    const boxHeight = summaryHeight + 2; // Add 2 for top/bottom border
    // Ensure box doesn't exceed terminal height
    const effectiveBoxHeight = Math.min(boxHeight, term.height - boxY + 1);
    if (effectiveBoxHeight < 2) return startY; // Not enough space to draw box

    const boxStyle = hasFailures ? term.red : term.gray;
    drawBox(term, 1, boxY, currentWidth, effectiveBoxHeight, boxStyle);

    // Adjust currentY to draw *inside* the box
    currentY = boxY + 1; // Start drawing content one line below box top
    const bottomBoundary = boxY + effectiveBoxHeight - 1; // Bottom line inside the box
    const contentWidth = currentWidth - (PADDING * 2); // Available width inside box padding

    // Draw Status Counts Line (inside box) - Start at the top line inside the box now
    if (currentY < bottomBoundary) {
        term.moveTo(1 + PADDING, currentY).styleReset(); // Indent inside box
        if (statusCounts.passed > 0) { term.green(`✓ ${statusCounts.passed} passed  `); }
        if (statusCounts.failed > 0) { term.red(`✗ ${statusCounts.failed} failed  `); }
        if (statusCounts.running > 0) { term.blue(`▷ ${statusCounts.running} running  `); }
        if (statusCounts.pending > 0) { term.gray(`◌ ${statusCounts.pending} pending  `); }
        if (statusCounts.cancelled > 0) { term.gray(`⊘ ${statusCounts.cancelled} cancelled  `); }

        // Draw Token Counts (Right-aligned inside box on the same line as status)
        const tokenText = `tokens: ${totalInputTokens} in, ${totalOutputTokens} out`;
        const tokenX = currentWidth - tokenText.length - PADDING; // Calculate X for right alignment inside box border
        term.moveTo(tokenX, currentY).styleReset().gray(tokenText);
        // Don't increment currentY here, status and tokens are on the same line
        currentY++; // Now move to the next line for potential failures
    }


    // Draw Failures (if any, inside box)
    if (hasFailures) {
        if (currentY < bottomBoundary) { // Check against box bottom
            term.moveTo(1 + PADDING, currentY).styleReset().dim('Failures:'); // Indent inside box
            currentY++;
        }
        failuresWithContext.forEach(({ filepath, groupName, testTitle, failure }) => {
            if (currentY >= bottomBoundary) return; // Check against box bottom
            const contextString = `${filepath}${groupName ? ` > ${groupName}` : ''} > ${testTitle}`;
            // TODO: Wrap contextString if needed
            term.moveTo(1 + PADDING + 1, currentY).styleReset().dim(contextString); // Indent further
            currentY++;
            if (currentY < bottomBoundary) {
                // Pass available width for failure details
                currentY = drawFailure(1 + PADDING + 2, currentY, failure, bottomBoundary, contentWidth - 2); // Indent failure details further
            }
             if (currentY < bottomBoundary) {
                 currentY++; // Add space after failure
             }
        });
    }

    // No need to draw bottom separator line, drawBox handles it

    return boxY + effectiveBoxHeight; // Return Y position *after* the summary box
}

// Helper to calculate summary height needed based ONLY on the current test states
function calculateSummaryHeight(testStates: AllTestStates): number { // Removed unused 'tests' parameter
    let height = 0;
    // height++; // No longer have "Summary:" title
    height++; // For status counts line

    // Recalculate failures locally for height calculation
    const failuresWithContext: { failure: FailureDescriptor }[] = [];
     Object.entries(testStates).forEach(([testId, state]) => {
         if (state.failure && state.failure.variant !== 'cancelled') {
             // We only need the failure descriptor itself for height calculation
             failuresWithContext.push({ failure: state.failure });
         }
     });

    if (failuresWithContext.length > 0) {
        height++; // For "Failures:" title
        // Use failuresWithContext here, and type the destructured element
        failuresWithContext.forEach(({ failure }: { failure: FailureDescriptor }) => {
            height++; // For context line
            // Estimate wrapped height (basic) - real wrapping might differ
            const contentWidth = Math.max(1, currentWidth - (PADDING * 2) - 4); // Approximate width for failure message, ensure positive
            if (failure.variant === 'bug') {
                 height += wrapText(`Found bug: ${failure.title}`, contentWidth).length -1;
                 height += wrapText(`Expected: ${failure.expectedResult}`, contentWidth).length -1;
                 height += wrapText(`Actual:   ${failure.actualResult}`, contentWidth).length -1;
                height += 4; // Bug details take 4 lines base + wrapped lines
            } else if ('message' in failure) { // Check if message exists before wrapping
                 const prefixMap: Partial<Record<FailureDescriptor['variant'], string>> = { /*...*/ };
                 const failurePrefix = prefixMap[failure.variant] || `${failure.variant}: `;
                 height += wrapText(failurePrefix + failure.message, contentWidth).length -1;
                height += 1; // Other failures take 1 line base + wrapped lines
            } else {
                 // Handle cases like 'cancelled' or others without message
                 height += 1; // Assume 1 line for these
            }
            height++; // Space after failure
        });
    }
    return height;
}


// --- Main Render Loop ---

function redraw() {
    console.log(`[redraw] Called. isFinished=${isFinished}. Has currentTests? ${Object.keys(currentTests).length > 0}. Has currentTestStates? ${Object.keys(currentTestStates).length > 0}`);
    // console.log('[redraw] currentTestStates:', JSON.stringify(currentTestStates, null, 2)); // Optional: Log full state (can be verbose)
    redrawScheduled = false; // Reset flag at the start
    // Use term.clear() instead of ScreenBuffer fill
    term.clear();

    // Draw components directly using term
    drawTitleBar(); // Draws at y=1, height=3

    // Calculate heights and positions
    const titleHeight = 3;
    const totalContentHeight = term.height - titleHeight; // Total space below title
    const contentWidth = currentWidth - (PADDING * 2); // Available width inside boxes

    // Calculate actual summary height needed (capped to prevent excessive growth)
    // Add 2 for box border
    const requiredSummaryHeight = calculateSummaryHeight(currentTestStates) + 2;
    // Limit summary height to avoid pushing test list out entirely, e.g., max 50% of content area or minimum 3 lines if possible
    const maxAllowedSummaryHeight = Math.max(3, Math.min(requiredSummaryHeight, Math.floor(totalContentHeight * 0.7)));

    // Calculate test list height based on remaining space, ensuring minimum height
    const testListMinHeight = 3; // Minimum lines needed to draw test list box
    let testListHeight = Math.max(0, totalContentHeight - maxAllowedSummaryHeight - 1); // -1 for spacing between boxes
    let summaryHeight = maxAllowedSummaryHeight;

    // If test list doesn't have minimum height, shrink summary to give space
    if (testListHeight < testListMinHeight && totalContentHeight >= (testListMinHeight + 3 + 1)) { // Check if enough total space for min test + min summary (3) + spacing
        testListHeight = testListMinHeight;
        summaryHeight = Math.max(3, totalContentHeight - testListHeight - 1); // Give remaining to summary (min 3)
    } else if (testListHeight < testListMinHeight) {
        // Not enough space for both, prioritize test list if possible
        testListHeight = Math.max(0, totalContentHeight - 3 - 1); // Give summary minimum (3) + spacing
        summaryHeight = totalContentHeight - testListHeight -1; // Remaining for summary
        if (testListHeight < testListMinHeight) { // Still not enough? Give all to test list if it fits min
             if (totalContentHeight >= testListMinHeight) {
                 testListHeight = totalContentHeight;
                 summaryHeight = 0;
             } else { // Give all to summary if test list won't fit
                 testListHeight = 0;
                 summaryHeight = totalContentHeight;
             }
        }
    }


    const testListY = titleHeight + 1;
    const summaryY = testListY + testListHeight + 1; // Position summary below test list box + spacing

    // --- Draw Test List ---
    if (testListHeight >= testListMinHeight) {
        // Draw Test List Box
        drawBox(term, 1, testListY, currentWidth, testListHeight, term.gray);
        // Draw tests inside the box
        drawTestList(testListY + 1, testListHeight - 2, contentWidth); // Pass Y start (+1), height (-2), width
    } else {
         // Not enough space to draw the test list box meaningfully
         // Optionally draw a placeholder message?
         // term.moveTo(1 + PADDING, testListY).gray('Terminal too small to display tests.');
    }

    // --- Draw Summary ---
    // Check if summaryY is within bounds and summaryHeight is drawable
    if (summaryY <= term.height && summaryHeight >= 3) {
        // drawSummary handles its own height calculation and clipping internally now
        drawSummary(summaryY);
    } else if (summaryY <= term.height && summaryHeight > 0) {
         // Not enough space for a full summary box, maybe draw just the counts line?
         // Or indicate truncation? For now, do nothing if less than 3 lines.
    }


    // Move cursor to bottom left after drawing (or just below content if screen full)
    term.moveTo(1, term.height);
}

function scheduleRedraw() { // Restore function
    if (!redrawScheduled) {
        redrawScheduled = true;
        // Use setImmediate for efficient batching of redraws
        setImmediate(redraw);
    }
}

// --- Event Handlers ---

function onResize(width: number, height: number) {
    currentWidth = Math.min(width, MAX_APP_WIDTH);
    scheduleRedraw(); // Use scheduleRedraw
}

// Modified onExit to not clear screen
function onExit(exitCode = 0) {
    if (timerInterval) {
        clearInterval(timerInterval);
        timerInterval = null;
    }
    // Ensure one last draw call happens if needed
    if (redrawScheduled) { // Check flag
        redraw();
    }
    term.grabInput(false);
    term.fullscreen(false);
    // Don't clear screen
    term.moveTo(1, term.height).styleReset()('\n'); // Move cursor to bottom and ensure prompt is on new line
    term.processExit(exitCode);
}

// --- Public Interface ---

export function initializeUI(model: string, initialTests: CategorizedTestCases, initialStates: AllTestStates) {
    currentModel = model;
    currentTests = initialTests; // Set initial tests
    currentTestStates = initialStates; // Set initial states
    isFinished = false; // Reset finished flag
    term.fullscreen(true);
    term.grabInput(true);
    term.on('key', (name: string) => {
        if (name === 'CTRL_C') {
            // If already finished, exit immediately. Otherwise, let cleanup handle it.
            if (isFinished) {
                 onExit(1); // Exit with error code if interrupted after finish
            } else {
                // Signal cancellation (TestRunner should handle this)
                // For now, just trigger exit directly for simplicity during dev
                 console.log("\nCtrl+C detected, exiting...");
                 onExit(1);
            }
        }
    });
    term.on('resize', onResize);

    // Initial draw
    scheduleRedraw(); // Use scheduleRedraw

    // Start timer for updating elapsed times
    if (!timerInterval) {
        timerInterval = setInterval(() => {
            // Stop interval immediately if finished
            if (isFinished) {
                 clearInterval(timerInterval!);
                 timerInterval = null;
                 return;
            }

            let runningTestsExist = false;
            // Update spinner frame
            spinnerFrame = (spinnerFrame + 1) % spinnerChars.length;

            Object.entries(currentTestStates).forEach(([testId, state]) => {
                if (state.status === 'running') {
                    runningTestsExist = true;
                    if (!state.startedAt) {
                        // Should not happen, but defensively set start time if missing
                        state.startedAt = Date.now();
                        elapsedTimes[testId] = 0;
                    } else {
                         elapsedTimes[testId] = Date.now() - state.startedAt;
                    }
                }
            });

            // Schedule redraw ONLY if tests are running (for spinner/timer updates)
            if (runningTestsExist) {
                 scheduleRedraw(); // Use scheduleRedraw
            }
            // Finished state is determined by cleanupUI calling isFinished = true
        }, 100); // Update interval
    } // <-- Fixed: Added closing brace
}

export function updateUI(tests: CategorizedTestCases, testStates: AllTestStates) {
    console.log(`[updateUI] Called. Received ${Object.keys(testStates).length} states.`);
    // console.log('[updateUI] testStates received:', JSON.stringify(testStates, null, 2)); // Optional: Log full state (can be verbose)
    currentTests = tests;
    currentTestStates = testStates;

    // Update elapsed times map based on new states
    const newElapsedTimes: { [testId: string]: number } = {};
    let runningTestsExist = false;
     Object.entries(testStates).forEach(([testId, state]) => {
        if (state.status === 'running') {
            runningTestsExist = true;
            if (state.startedAt) {
                 newElapsedTimes[testId] = Date.now() - state.startedAt;
            } else {
                // Assign start time if newly running and missing
                state.startedAt = Date.now();
                newElapsedTimes[testId] = 0;
            }
        } else if (elapsedTimes[testId] !== undefined) {
             // Keep final time if test just finished
             // This might be slightly off if duration isn't set yet, rely on state.duration preferably
             // Test finished, keep the last calculated elapsed time
             newElapsedTimes[testId] = elapsedTimes[testId];
        }
    });
    elapsedTimes = newElapsedTimes;


    // Ensure timer is running if needed and not finished
    // No longer need to re-call initializeUI here as state is passed initially
    // if (runningTestsExist && !timerInterval && !isFinished) {
    //     initializeUI(currentModel); // Re-call to potentially restart timer interval if stopped
    // }

    // Always schedule redraw when UI state is updated from the runner
    scheduleRedraw(); // Use scheduleRedraw
}

// Modified cleanupUI to not clear screen and handle exit code
export function cleanupUI(exitCode = 0) {
     isFinished = true; // Mark as finished FIRST
     if (timerInterval) { // Clear timer immediately
        clearInterval(timerInterval);
         timerInterval = null;
    }
    // Schedule one final redraw to show completed state using the standard mechanism
    scheduleRedraw(); // Use scheduleRedraw
    // Use setTimeout to allow final redraw to potentially complete *before* exiting
    setTimeout(() => {
        onExit(exitCode); // Pass exit code to onExit
    }, 150); // Delay slightly longer than redraw interval
}

// Initial width calculation
currentWidth = Math.min(term.width, MAX_APP_WIDTH);
