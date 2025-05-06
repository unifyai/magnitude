import termkit from 'terminal-kit';
import { CategorizedTestCases, TestRunnable } from '@/discovery/types';
import { AllTestStates, TestState } from './types'; // Updated import path
import { VERSION } from '@/version';
import { formatDuration, getUniqueTestId } from './util';
import { FailureDescriptor, ActionDescriptor } from 'magnitude-core';

const term = termkit.terminal;

// --- Configuration ---
const MAX_APP_WIDTH = 100; // max rendered width

// --- State ---
let currentWidth = Math.min(term.width, MAX_APP_WIDTH);
let redrawScheduled = false;
let timerInterval: NodeJS.Timeout | null = null;
let currentTestStates: AllTestStates = {}; // Store the latest states
let currentTests: CategorizedTestCases = {}; // Store the test structure
let currentModel = '';
let elapsedTimes: { [testId: string]: number } = {}; // Store elapsed times for running tests

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
function getTestStatusIndicatorChar(status: TestState['status']): string {
    switch (status) {
        case 'running': return ' '; // Placeholder for spinner
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
    term.moveTo(1, 1).styleReset();
    term.bold.brightBlue(`Magnitude v${VERSION}`);

    const modelText = `Model: ${currentModel}`;
    term.moveTo(currentWidth - modelText.length - 2, 1).styleReset();
    term.dim.gray(modelText);

    // Draw simple border lines
    term.moveTo(1, 0).styleReset().brightBlue('-'.repeat(currentWidth));
    term.moveTo(1, 2).styleReset().brightBlue('-'.repeat(currentWidth));
}

function drawFailure(x: number, y: number, failure: FailureDescriptor): number {
    let currentY = y;
    const prefix = '↳ ';
    const indentX = x + prefix.length;

    if (failure.variant === 'bug') {
        term.moveTo(x, currentY).styleReset().red(prefix);
        term.moveTo(indentX, currentY).styleReset().red('Found bug: ').bold(failure.title);
        currentY++;

        term.moveTo(indentX, currentY).styleReset().red('Expected: ')(failure.expectedResult);
        currentY++;

        term.moveTo(indentX, currentY).styleReset().red('Actual:   ')(failure.actualResult);
        currentY++;

        term.moveTo(indentX, currentY).styleReset().red('Severity: ')(failure.severity.toUpperCase());
        currentY++;
    } else if (failure.variant === 'cancelled') {
        term.moveTo(x, currentY).styleReset().gray(prefix);
        term.moveTo(indentX, currentY).styleReset().gray('Cancelled');
        currentY++;
    } else {
        const prefixMap: Partial<Record<FailureDescriptor['variant'], string>> = {
            'unknown': '',
            'browser': 'BrowserError: ',
            'network': 'NetworkError: ',
            'misalignment': 'Misalignment: '
        };
        const failurePrefix = prefixMap[failure.variant] || `${failure.variant}: `;
        term.moveTo(x, currentY).styleReset().red(prefix);
        term.moveTo(indentX, currentY).styleReset().red(failurePrefix + failure.message);
        currentY++;
    }
    return currentY;
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


// Added filepath and groupName to parameters as they are needed for unique ID
function drawTest(x: number, y: number, test: TestRunnable, state: TestState, filepath: string, groupName: string | null): number {
    let currentY = y;
    const testIndent = x;
    const stepIndent = testIndent + 2;
    const actionIndent = stepIndent + 2;
    const testId = getUniqueTestId(filepath, groupName, test.title);

    // --- Draw Test Title Line ---
    term.moveTo(testIndent, currentY).styleReset();
    const statusChar = getTestStatusIndicatorChar(state.status);
    applyStatusStyle(state.status, statusChar);
    term(` ${test.title} `); // Write title after styled char

    // Timer - Draw AFTER title text
    if (state.status !== 'pending') {
        const elapsed = elapsedTimes[testId] ?? 0;
        const timerText = `[${formatDuration(elapsed)}]`;
        // Append timer directly without alignment due to type issues
        term.gray(timerText);
    }
    currentY++;

    // --- Draw Steps and Checks ---
    if (state.stepsAndChecks.length > 0) {
        state.stepsAndChecks.forEach((item) => {
            if (currentY >= term.height - 2) return; // Avoid drawing off-screen

            term.moveTo(stepIndent, currentY).styleReset();
            if (item.variant === 'step') {
                const stepChar = getStepStatusIndicatorChar(item.status);
                applyStepStatusStyle(item.status, stepChar);
                term(` ${item.description}`);
                currentY++;

                if (item.actions.length > 0) {
                    item.actions.forEach(action => {
                        if (currentY >= term.height - 2) return;
                        term.moveTo(actionIndent, currentY).styleReset();
                        term.gray(getActionSymbol(action.variant)); // Draw symbol
                        term.moveTo(actionIndent + 2, currentY); // Move cursor for description
                        term.gray(describeAction(action)); // Draw description
                        currentY++;
                    });
                }
            } else { // Check
                const checkChar = getCheckStatusIndicatorChar(item.status);
                applyCheckStatusStyle(item.status, checkChar);
                term(` ${item.description}`);
                currentY++;
            }
        });
    }

    // --- Draw Failure ---
    if (state.failure && state.failure.variant !== 'cancelled') {
         if (currentY < term.height - 2) {
            currentY = drawFailure(stepIndent, currentY, state.failure);
         }
    }

    return currentY;
}


function drawTestList(startY: number): number {
    let currentY = startY;
    const fileIndent = 1;
    const groupIndent = fileIndent + 2;
    const testIndent = groupIndent;

    for (const [filepath, { ungrouped, groups }] of Object.entries(currentTests)) {
        if (currentY >= term.height - 2) break;

        term.moveTo(fileIndent + 1, currentY).styleReset();
        term.bold.brightBlue(`☰ ${filepath}`);
        currentY++;

        // Draw ungrouped tests
        if (ungrouped.length > 0) {
             if (currentY >= term.height - 2) break;
            ungrouped.forEach(test => {
                if (currentY >= term.height - 2) return;
                const testId = getUniqueTestId(filepath, null, test.title);
                const state = currentTestStates[testId];
                if (state) {
                    currentY = drawTest(testIndent, currentY, test, state, filepath, null);
                }
            });
        }

        // Draw grouped tests
        if (Object.entries(groups).length > 0) {
             if (currentY >= term.height - 2) break;
            Object.entries(groups).forEach(([groupName, groupTests]) => {
                if (currentY >= term.height - 2) return;
                term.moveTo(groupIndent + 1, currentY).styleReset();
                term.bold.brightBlue(groupName);
                currentY++;
                groupTests.forEach(test => {
                    if (currentY >= term.height - 2) return;
                    const testId = getUniqueTestId(filepath, groupName, test.title);
                    const state = currentTestStates[testId];
                    if (state) {
                        currentY = drawTest(testIndent + 2, currentY, test, state, filepath, groupName);
                    }
                });
            });
        }
         if (currentY < term.height - 2) {
            currentY++; // Add a blank line between files
         }
    }

    return currentY;
}


function drawSummary(startY: number): number {
    let currentY = startY;
    if (currentY >= term.height - 1) return currentY; // Check if space available

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

    // Draw simple separator line
    term.moveTo(1, currentY).styleReset();
    const separatorStyle = hasFailures ? term.red : term.gray;
    separatorStyle('-'.repeat(currentWidth - 2));
    currentY++;

    // Draw Title
    term.moveTo(2, currentY).styleReset().bold("Summary:");
    currentY++;

    // Draw Status Counts Line (sequentially, no alignment)
    term.moveTo(2, currentY).styleReset(); // Start at left indent
    if (statusCounts.passed > 0) { term.green(`✓ ${statusCounts.passed} passed  `); }
    if (statusCounts.failed > 0) { term.red(`✗ ${statusCounts.failed} failed  `); }
    if (statusCounts.running > 0) { term.blue(`▷ ${statusCounts.running} running  `); }
    if (statusCounts.pending > 0) { term.gray(`◌ ${statusCounts.pending} pending  `); }
    if (statusCounts.cancelled > 0) { term.gray(`⊘ ${statusCounts.cancelled} cancelled  `); }

    // Draw Token Counts (append after status counts)
    const tokenText = `tokens: ${totalInputTokens} in, ${totalOutputTokens} out`;
    // Append after a couple of spaces
    term.gray(`  ${tokenText}`);
    currentY++;

    // Draw Failures (if any)
    if (hasFailures) {
        if (currentY < term.height - 2) {
            term.moveTo(2, currentY).styleReset().dim('Failures:');
            currentY++;
        }
        failuresWithContext.forEach(({ filepath, groupName, testTitle, failure }) => {
            if (currentY >= term.height - 2) return;
            const contextString = `${filepath}${groupName ? ` > ${groupName}` : ''} > ${testTitle}`;
            term.moveTo(3, currentY).styleReset().dim(contextString);
            currentY++;
            if (currentY < term.height - 2) {
                currentY = drawFailure(4, currentY, failure); // Indent failure details
            }
             if (currentY < term.height - 2) {
                 currentY++; // Add space after failure
             }
        });
    }

    // Draw bottom separator line
    if (currentY < term.height -1) {
        term.moveTo(1, currentY).styleReset();
        separatorStyle('-'.repeat(currentWidth - 2));
        currentY++;
    }

    return currentY; // Return Y position after the summary section
}

// --- Main Render Loop ---

function redraw() {
    redrawScheduled = false;
    // Use term.clear() instead of ScreenBuffer fill
    term.clear();

    // Draw components directly using term
    drawTitleBar();
    let nextY = 3; // Start below title bar
    nextY = drawTestList(nextY);
    nextY = drawSummary(nextY);

    // Move cursor to bottom left after drawing
    term.moveTo(1, term.height);
}

function scheduleRedraw() {
    if (!redrawScheduled) {
        redrawScheduled = true;
        // Use setImmediate for efficient batching of redraws
        setImmediate(redraw);
    }
}

// --- Event Handlers ---

function onResize(width: number, height: number) {
    currentWidth = Math.min(width, MAX_APP_WIDTH);
    scheduleRedraw();
}

function onExit() {
    if (timerInterval) {
        clearInterval(timerInterval);
        timerInterval = null;
    }
    term.grabInput(false);
    term.fullscreen(false);
    term.clear();
    term.processExit(0);
}

// --- Public Interface ---

export function initializeUI(model: string) {
    currentModel = model;
    term.fullscreen(true);
    term.grabInput(true);
    term.on('key', (name: string) => {
        if (name === 'CTRL_C') {
            onExit();
        }
    });
    term.on('resize', onResize);

    // Initial draw
    scheduleRedraw();

    // Start timer for updating elapsed times
    if (!timerInterval) {
        timerInterval = setInterval(() => {
            let runningTestsExist = false;
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

            if (runningTestsExist) {
                scheduleRedraw(); // Redraw if any test is running to update timer
            } else if (timerInterval) {
                // Stop interval if no tests are running
                clearInterval(timerInterval);
                timerInterval = null;
            }
        }, 100); // Update interval
    }
}

export function updateUI(tests: CategorizedTestCases, testStates: AllTestStates) {
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


    // Ensure timer is running if needed
    if (runningTestsExist && !timerInterval) {
        initializeUI(currentModel); // Re-call to potentially restart timer interval if stopped
    }

    scheduleRedraw();
}

export function cleanupUI() {
    onExit();
}

// Initial width calculation
currentWidth = Math.min(term.width, MAX_APP_WIDTH);
