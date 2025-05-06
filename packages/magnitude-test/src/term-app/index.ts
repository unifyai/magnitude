import termkit from 'terminal-kit';
import logUpdate from 'log-update';
import { CategorizedTestCases, TestRunnable } from '@/discovery/types';
import { AllTestStates, TestState } from './types';
import { VERSION } from '@/version';
import { formatDuration, getUniqueTestId, wrapText } from './util';
import { FailureDescriptor, ActionDescriptor } from 'magnitude-core';

const term = termkit.terminal; // Keep for width, input handling etc.
const str = termkit.stringWidth; // For calculating string width correctly (handles ANSI)

// --- ANSI Escape Codes ---
const ANSI_RESET = '\x1b[0m';
const ANSI_BRIGHT_RED = '\x1b[91m';
const ANSI_BRIGHT_GREEN = '\x1b[92m';
const ANSI_BRIGHT_BLUE = '\x1b[94m';
const ANSI_GRAY = '\x1b[90m';
const ANSI_RED = '\x1b[31m';
// const ANSI_GREEN = '\x1b[32m'; // Not used currently
// const ANSI_BLUE = '\x1b[34m'; // Not used currently
const ANSI_BOLD = '\x1b[1m';
const ANSI_DIM = '\x1b[2m';

// --- Box Drawing Characters ---
const BOX_CHARS_ROUNDED = {
    topLeft: '╭', topRight: '╮', bottomLeft: '╰', bottomRight: '╯',
    horizontal: '─', vertical: '│'
};

// --- Configuration ---
const MAX_APP_WIDTH = 100;
const PADDING = 2;

// --- State ---
let currentWidth = Math.min(term.width, MAX_APP_WIDTH);
let redrawScheduled = false;
let timerInterval: NodeJS.Timeout | null = null;
let currentTestStates: AllTestStates = {};
let currentTests: CategorizedTestCases = {};
let currentModel = '';
let elapsedTimes: { [testId: string]: number } = {};
let isFinished = false;
let spinnerFrame = 0;
const spinnerChars = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
let lastOutputLineCount = 0; // Track lines for stability

// --- Utility Functions ---

// Helper to create a box as an array of strings using ANSI codes and specified characters
function createBoxAnsi(width: number, height: number, colorCode: string, boxChars = BOX_CHARS_ROUNDED): string[] {
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

// Simplified insertion: Overwrites a specific line within the box content area
// Assumes startY is the 0-based index *within* the box lines array (1 for first content line)
// Assumes startX is the 0-based index *within* the content area (between the vertical bars)
function insertLineIntoBoxAnsi(lines: string[], contentLine: string, lineIndex: number, startX: number, boxWidth: number) {
     if (lineIndex <= 0 || lineIndex >= lines.length - 1) return; // Only insert into content lines

     const targetLine = lines[lineIndex];
     const boxColorMatch = targetLine.match(/^\x1b\[[0-9;]*m/); // Get the box's color code
     const boxColor = boxColorMatch ? boxColorMatch[0] : '';

     const contentAreaWidth = boxWidth - 2;
     const availableSpace = contentAreaWidth - startX;

     if (availableSpace > 0) {
         // Basic ANSI-aware truncation (same as before, might need refinement)
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
         lines[lineIndex] = `${boxColor}${BOX_CHARS_ROUNDED.vertical}${paddingLeft}${truncatedContent}${paddingRight}${BOX_CHARS_ROUNDED.vertical}${ANSI_RESET}`;
     }
}


function describeAction(action: ActionDescriptor): string {
    // Returns plain string
    switch (action.variant) {
        case 'load': return `navigated to URL: ${action.url}`;
        case 'click': return `clicked ${action.target}`;
        case 'type': return `typed "${action.content}" into ${action.target}`;
        case 'scroll': return `scrolled (${action.deltaX}, ${action.deltaY})`;
        default: return `unknown action: ${(action as any).variant}`;
    }
}

function getActionSymbol(variant: "load" | "click" | "hover" | "type" | "scroll" | "wait" | "back"): string {
    // Returns plain char
    switch (variant) {
        case "load": return "↻"; case "click": return "⊙"; case "hover": return "◉";
        case "type": return "⏎"; case "scroll": return "↕"; case "wait": return "◴";
        case "back": return "←"; default: return "?";
    }
}

function getTestStatusIndicatorChar(status: TestState['status']): string {
    // Returns plain char
    switch (status) {
        case 'passed': return '✓'; case 'failed': return '✕';
        case 'cancelled': return '⊘'; case 'pending': default: return '◌';
    }
}

function getStepStatusIndicatorChar(status: TestState['status']): string {
    // Returns plain char
    switch (status) {
        case 'running': return '>'; case 'passed': return '⚑';
        case 'failed': return '✕'; case 'cancelled': return '⊘';
        case 'pending': default: return '•';
    }
}

function getCheckStatusIndicatorChar(status: TestState['status']): string {
    // Returns plain char
    switch (status) {
        case 'running': return '?'; case 'passed': return '✓';
        case 'failed': return '✕'; case 'cancelled': return '⊘';
        case 'pending': default: return '•';
    }
}

// --- String Generation Functions (Using ANSI Codes) ---

function styleAnsi(status: TestState['status'], text: string, type: 'test' | 'step' | 'check'): string {
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


function generateTitleBarString(): string[] {
    // Returns array of strings with ANSI codes
    const boxLines = createBoxAnsi(currentWidth, 3, ANSI_BRIGHT_BLUE);
    const titleText = `${ANSI_BRIGHT_BLUE}${ANSI_BOLD}Magnitude v${VERSION}${ANSI_RESET}`;
    const modelText = `${ANSI_GRAY}Model: ${currentModel}${ANSI_RESET}`;
    const contentWidth = currentWidth - 2; // Width inside vertical bars

    // Construct the middle line directly
    const titleWidth = str(titleText);
    const modelWidth = str(modelText);
    const spaceBetween = contentWidth - titleWidth - modelWidth - (PADDING * 2);
    const middleLineContent = ' '.repeat(PADDING) + titleText + ' '.repeat(Math.max(1, spaceBetween)) + modelText + ' '.repeat(PADDING);

    // Replace the default middle line (index 1)
    boxLines[1] = `${ANSI_BRIGHT_BLUE}${BOX_CHARS_ROUNDED.vertical}${middleLineContent.padEnd(contentWidth)}${BOX_CHARS_ROUNDED.vertical}${ANSI_RESET}`;

    return boxLines;
}

function generateFailureString(failure: FailureDescriptor, indent: number, availableWidth: number): string[] {
    // Returns array of strings with ANSI codes
    const output: string[] = [];
    const prefix = '↳ ';
    const prefixAnsi = `${ANSI_RED}${prefix}${ANSI_RESET}`;
    const contentWidth = Math.max(1, availableWidth - str(prefix));

    const addLine = (text: string, styleCode = ANSI_RED, bold = false) => {
        const fullStyleCode = `${styleCode}${bold ? ANSI_BOLD : ''}`;
        wrapText(text, contentWidth).forEach((line, index) => {
            const linePrefix = index === 0 ? prefixAnsi : ' '.repeat(str(prefix));
            // Ensure reset at the end of the styled line part
            output.push(' '.repeat(indent) + linePrefix + `${fullStyleCode}${line}${ANSI_RESET}`);
        });
    };

    const addSimpleLine = (text: string, styleCode = ANSI_RED) => {
         output.push(' '.repeat(indent) + prefixAnsi + `${styleCode}${text}${ANSI_RESET}`);
     };

    if (failure.variant === 'bug') {
        addLine(`Found bug: ${failure.title}`, ANSI_RED, true); // Bold Red
        addLine(`Expected: ${failure.expectedResult}`);
        addLine(`Actual:   ${failure.actualResult}`);
        addSimpleLine(`Severity: ${failure.severity.toUpperCase()}`);
    } else if (failure.variant === 'cancelled') {
        addSimpleLine('Cancelled', ANSI_GRAY);
    } else {
        const prefixMap: Partial<Record<FailureDescriptor['variant'], string>> = {
            'unknown': '', 'browser': 'BrowserError: ', 'network': 'NetworkError: ', 'misalignment': 'Misalignment: '
        };
        const typedFailure = failure as Extract<FailureDescriptor, { message?: string }>;
        if ('message' in typedFailure && typedFailure.message) {
            const failurePrefix = prefixMap[typedFailure.variant] || `${typedFailure.variant}: `;
            addLine(failurePrefix + typedFailure.message);
        } else {
             addSimpleLine(typedFailure.variant || 'unknown error');
        }
    }
    return output;
}


function generateTestString(test: TestRunnable, state: TestState, filepath: string, groupName: string | null, indent: number, availableWidth: number): string[] {
    // Returns array of strings with ANSI codes
    const output: string[] = [];
    const testId = getUniqueTestId(filepath, groupName, test.title);
    const contentWidth = Math.max(1, availableWidth - indent);
    const stepIndent = indent + 2;
    const actionIndent = stepIndent + 2;
    const stepContentWidth = Math.max(1, availableWidth - stepIndent - 2);
    const actionContentWidth = Math.max(1, availableWidth - actionIndent - 2);

    // --- Test Title Line ---
    const statusCharPlain = state.status === 'running' ? spinnerChars[spinnerFrame] : getTestStatusIndicatorChar(state.status);
    const statusStyled = styleAnsi(state.status, statusCharPlain, 'test');

    const timerText = state.status !== 'pending' ? `${ANSI_GRAY} [${formatDuration(elapsedTimes[testId] ?? 0)}]${ANSI_RESET}` : '';
    const titleAvailableWidth = contentWidth - 2 - str(timerText); // Use str for width
    const wrappedTitle = wrapText(test.title, titleAvailableWidth > 10 ? titleAvailableWidth : contentWidth - 2);

    wrappedTitle.forEach((line, index) => {
        const linePrefix = index === 0 ? `${statusStyled} ` : '  ';
        const lineSuffix = index === 0 ? timerText : '';
        output.push(' '.repeat(indent) + linePrefix + line + lineSuffix); // Title is plain
    });

    // --- Steps and Checks ---
    if (state.stepsAndChecks.length > 0) {
        state.stepsAndChecks.forEach((item) => {
            const itemIndent = stepIndent;
            const itemContentWidth = stepContentWidth;
            let itemCharPlain = '';
            let itemDesc = '';
            let itemStyleType: 'step' | 'check' = 'step';

            if (item.variant === 'step') {
                itemCharPlain = getStepStatusIndicatorChar(item.status);
                itemDesc = item.description;
                itemStyleType = 'step';
            } else { // Check
                itemCharPlain = getCheckStatusIndicatorChar(item.status);
                itemDesc = item.description;
                itemStyleType = 'check';
            }

            const styledChar = styleAnsi(item.status, itemCharPlain, itemStyleType);
            const wrappedDesc = wrapText(itemDesc, itemContentWidth);

            wrappedDesc.forEach((line, index) => {
                const linePrefix = index === 0 ? `${styledChar} ` : '  ';
                output.push(' '.repeat(itemIndent) + linePrefix + line); // Desc is plain
            });

            // Draw actions only for steps
            if (item.variant === 'step' && item.actions.length > 0) {
                item.actions.forEach(action => {
                    const actionSymbol = `${ANSI_GRAY}${getActionSymbol(action.variant)}${ANSI_RESET}`;
                    const actionDesc = describeAction(action); // Plain desc
                    const wrappedActionDesc = wrapText(actionDesc, actionContentWidth);
                    wrappedActionDesc.forEach((line, index) => {
                         const linePrefix = index === 0 ? `${actionSymbol} ` : '  ';
                         output.push(' '.repeat(actionIndent) + linePrefix + `${ANSI_GRAY}${line}${ANSI_RESET}`); // Gray action text
                    });
                });
            }
        });
    }

    // --- Failure ---
    if (state.failure && state.failure.variant !== 'cancelled') {
        const failureLines = generateFailureString(state.failure, stepIndent, availableWidth - stepIndent);
        output.push(...failureLines);
    }

    return output;
}

function generateTestListString(boxHeight: number): string[] {
    // Returns array of strings with ANSI codes
    const boxLines = createBoxAnsi(currentWidth, boxHeight, ANSI_GRAY); // Gray box
    const contentWidth = currentWidth - (PADDING * 2); // Content width inside padding
    const fileIndent = 0; // Relative to content area start (after padding)
    const groupIndent = fileIndent + 2;
    const testBaseIndent = groupIndent;

    let currentContentLine = 0; // Tracks lines *within* the box content area (0-based)
    const maxContentLines = boxHeight - 2;

    for (const [filepath, { ungrouped, groups }] of Object.entries(currentTests)) {
        if (currentContentLine >= maxContentLines) break;

        const fileHeader = `${ANSI_BRIGHT_BLUE}${ANSI_BOLD}☰ ${filepath}${ANSI_RESET}`;
        insertLineIntoBoxAnsi(boxLines, fileHeader, currentContentLine + 1, PADDING + fileIndent, currentWidth);
        currentContentLine++;

        // Draw ungrouped tests
        if (ungrouped.length > 0) {
            for (const test of ungrouped) {
                if (currentContentLine >= maxContentLines) break;
                const testId = getUniqueTestId(filepath, null, test.title);
                const state = currentTestStates[testId];
                if (state) {
                    const testLines = generateTestString(test, state, filepath, null, testBaseIndent, contentWidth - testBaseIndent);
                    testLines.forEach(line => {
                         if (currentContentLine < maxContentLines) {
                            insertLineIntoBoxAnsi(boxLines, line, currentContentLine + 1, PADDING, currentWidth);
                            currentContentLine++;
                         }
                    });
                }
            }
        }
         if (currentContentLine >= maxContentLines) break;


        // Draw grouped tests
        if (Object.entries(groups).length > 0) {
            for (const [groupName, groupTests] of Object.entries(groups)) {
                 if (currentContentLine >= maxContentLines) break;
                const groupHeader = `${ANSI_BRIGHT_BLUE}${ANSI_BOLD}↳ ${groupName}${ANSI_RESET}`;
                insertLineIntoBoxAnsi(boxLines, groupHeader, currentContentLine + 1, PADDING + groupIndent, currentWidth);
                currentContentLine++;

                for (const test of groupTests) {
                    if (currentContentLine >= maxContentLines) break;
                    const testId = getUniqueTestId(filepath, groupName, test.title);
                    const state = currentTestStates[testId];
                    if (state) {
                        const testLines = generateTestString(test, state, filepath, groupName, testBaseIndent + 2, contentWidth - (testBaseIndent + 2));
                        testLines.forEach(line => {
                            if (currentContentLine < maxContentLines) {
                                insertLineIntoBoxAnsi(boxLines, line, currentContentLine + 1, PADDING, currentWidth);
                                currentContentLine++;
                            }
                        });
                    }
                }
                 if (currentContentLine >= maxContentLines) break;
            }
        }

        // Add blank line between files if space allows
        if (currentContentLine < maxContentLines) {
            insertLineIntoBoxAnsi(boxLines, '', currentContentLine + 1, PADDING, currentWidth);
            currentContentLine++;
        }
    }

    return boxLines;
}

function generateSummaryString(boxHeight: number): string[] {
    // Returns array of strings with ANSI codes
    let totalInputTokens = 0;
    let totalOutputTokens = 0;
    const statusCounts = { pending: 0, running: 0, passed: 0, failed: 0, cancelled: 0, total: 0 };
    const failuresWithContext: { filepath: string; groupName: string | null; testTitle: string; failure: FailureDescriptor }[] = [];
    const testContextMap = new Map<string, { filepath: string; groupName: string | null; testTitle: string }>();

    Object.entries(currentTests).forEach(([filepath, { ungrouped, groups }]) => {
        ungrouped.forEach(test => testContextMap.set(getUniqueTestId(filepath, null, test.title), { filepath, groupName: null, testTitle: test.title }));
        Object.entries(groups).forEach(([groupName, groupTests]) => groupTests.forEach(test => testContextMap.set(getUniqueTestId(filepath, groupName, test.title), { filepath, groupName, testTitle: test.title })));
    });

    Object.entries(currentTestStates).forEach(([testId, state]) => {
        statusCounts.total++;
        statusCounts[state.status]++;
        totalInputTokens += state.macroUsage.inputTokens;
        totalOutputTokens += state.macroUsage.outputTokens;
        if (state.failure && state.failure.variant !== 'cancelled') {
            const context = testContextMap.get(testId);
            failuresWithContext.push({
                filepath: context?.filepath ?? 'Unknown File', groupName: context?.groupName ?? null,
                testTitle: context?.testTitle ?? 'Unknown Test', failure: state.failure
            });
        }
    });

    const hasFailures = failuresWithContext.length > 0;
    const boxColor = hasFailures ? ANSI_RED : ANSI_GRAY;
    const boxLines = createBoxAnsi(currentWidth, boxHeight, boxColor);
    const contentWidth = currentWidth - (PADDING * 2); // Width inside padding
    let currentContentLine = 0; // 0-based index for content lines
    const maxContentLines = boxHeight - 2;

    // --- Status Counts Line ---
    if (currentContentLine < maxContentLines) {
        let statusLine = '';
        if (statusCounts.passed > 0) statusLine += `${ANSI_BRIGHT_GREEN}✓ ${statusCounts.passed} passed${ANSI_RESET}  `;
        if (statusCounts.failed > 0) statusLine += `${ANSI_BRIGHT_RED}✗ ${statusCounts.failed} failed${ANSI_RESET}  `;
        if (statusCounts.running > 0) statusLine += `${ANSI_BRIGHT_BLUE}▷ ${statusCounts.running} running${ANSI_RESET}  `;
        if (statusCounts.pending > 0) statusLine += `${ANSI_GRAY}◌ ${statusCounts.pending} pending${ANSI_RESET}  `;
        if (statusCounts.cancelled > 0) statusLine += `${ANSI_GRAY}⊘ ${statusCounts.cancelled} cancelled${ANSI_RESET}  `;

        const tokenText = `${ANSI_GRAY}tokens: ${totalInputTokens} in, ${totalOutputTokens} out${ANSI_RESET}`;
        const spaceNeeded = str(statusLine) + str(tokenText);
        const spacer = ' '.repeat(Math.max(0, contentWidth - spaceNeeded));
        const combinedLine = statusLine + spacer + tokenText;

        insertLineIntoBoxAnsi(boxLines, combinedLine, currentContentLine + 1, 0, currentWidth); // Insert at start of content area
        currentContentLine++;
    }

    // --- Failures ---
    if (hasFailures && currentContentLine < maxContentLines) {
        const failureHeader = `${ANSI_DIM}Failures:${ANSI_RESET}`; // Dim
        insertLineIntoBoxAnsi(boxLines, failureHeader, currentContentLine + 1, 0, currentWidth);
        currentContentLine++;

        for (const { filepath, groupName, testTitle, failure } of failuresWithContext) {
            if (currentContentLine >= maxContentLines) break;
            const contextString = `${ANSI_DIM}${filepath}${groupName ? ` > ${groupName}` : ''} > ${testTitle}${ANSI_RESET}`; // Dim
            insertLineIntoBoxAnsi(boxLines, contextString, currentContentLine + 1, 1, currentWidth); // Indent context
            currentContentLine++;

            if (currentContentLine < maxContentLines) {
                const failureLines = generateFailureString(failure, 2, contentWidth - 2); // Indent failure details further
                failureLines.forEach(line => {
                     if (currentContentLine < maxContentLines) {
                        insertLineIntoBoxAnsi(boxLines, line, currentContentLine + 1, 0, currentWidth);
                        currentContentLine++;
                     }
                });
            }

            if (currentContentLine < maxContentLines) {
                insertLineIntoBoxAnsi(boxLines, '', currentContentLine + 1, 0, currentWidth); // Space line
                currentContentLine++;
            }
        }
    }

    return boxLines;
}


// --- Main Render Loop (Refactored for log-update) ---

function redraw() {
    redrawScheduled = false;

    // --- Calculate Layout ---
    const titleHeight = 3;
    const availableHeight = term.height;
    const totalContentHeight = availableHeight - titleHeight;
    const requiredSummaryHeight = calculateSummaryHeight(currentTestStates) + 2; // +2 for box borders
    // Ensure summary doesn't take excessive space, minimum 3 lines for box
    const maxAllowedSummaryHeight = Math.max(3, Math.min(requiredSummaryHeight, Math.floor(totalContentHeight * 0.7)));
    const testListMinHeight = 3; // Minimum 3 lines for test list box

    let testListHeight = 0;
    let summaryHeight = 0;
    let spacingHeight = 0;

    // Try to fit both with spacing
    const neededForBoth = testListMinHeight + maxAllowedSummaryHeight + 1; // +1 for spacing line
    if (totalContentHeight >= neededForBoth) {
        summaryHeight = maxAllowedSummaryHeight;
        testListHeight = totalContentHeight - summaryHeight - 1;
        spacingHeight = 1;
    } else {
        // Not enough for both + spacing, prioritize test list if possible
        if (totalContentHeight >= testListMinHeight + 3) { // Enough for min test list + min summary
            testListHeight = Math.max(testListMinHeight, totalContentHeight - 3); // Give test list priority
            summaryHeight = totalContentHeight - testListHeight; // Remaining for summary (at least 3)
        } else if (totalContentHeight >= testListMinHeight) { // Only enough for test list
            testListHeight = totalContentHeight;
            summaryHeight = 0;
        } else { // Not even enough for test list, give all to summary (if it fits)
            testListHeight = 0;
            summaryHeight = Math.max(0, totalContentHeight); // Can be 0 if totalContentHeight is < 0
        }
    }
     // Ensure heights are at least the minimum required to draw the box, or 0
     testListHeight = testListHeight >= testListMinHeight ? testListHeight : 0;
     summaryHeight = summaryHeight >= 3 ? summaryHeight : 0;
     // Recalculate spacing based on final heights
     spacingHeight = (testListHeight > 0 && summaryHeight > 0) ? 1 : 0;


    // --- Generate Output Strings ---
    const outputLines: string[] = [];
    outputLines.push(...generateTitleBarString());

    if (testListHeight > 0) {
        outputLines.push(...generateTestListString(testListHeight));
    }

    if (spacingHeight > 0) {
         outputLines.push(''); // Spacing only if both are present
    }

    if (summaryHeight > 0) {
        outputLines.push(...generateSummaryString(summaryHeight));
    }

    // --- Update Terminal using log-update ---
    const frameContent = outputLines.join('\n');

    // Prevent logUpdate from printing if the frame is identical to the last one
    // (Helps reduce flicker if state updates don't change visual output)
    // Note: This requires storing the last frame content, which might be memory intensive.
    // Optional: Implement simple line count check first.
    if (outputLines.length !== lastOutputLineCount) {
        // If line count changes, clear before updating to avoid artifacts
        logUpdate.clear();
    }

    logUpdate(frameContent);
    lastOutputLineCount = outputLines.length; // Store line count for next redraw
}

// Helper to calculate summary height (remains mostly the same, used for layout)
function calculateSummaryHeight(testStates: AllTestStates): number {
    let height = 0;
    height++; // Status counts line

    const failuresWithContext: { failure: FailureDescriptor }[] = [];
    Object.entries(testStates).forEach(([_, state]) => {
        if (state.failure && state.failure.variant !== 'cancelled') {
            failuresWithContext.push({ failure: state.failure });
        }
    });

    if (failuresWithContext.length > 0) {
        height++; // "Failures:" title
        failuresWithContext.forEach(({ failure }) => {
            height++; // Context line
            const contentWidth = Math.max(1, currentWidth - (PADDING * 2) - 4); // Approx width for failure text
            // Estimate height based on plain text wrapping
            if (failure.variant === 'bug') {
                height += wrapText(`Found bug: ${failure.title}`, contentWidth).length;
                height += wrapText(`Expected: ${failure.expectedResult}`, contentWidth).length;
                height += wrapText(`Actual:   ${failure.actualResult}`, contentWidth).length;
                height += 1; // Severity line
            } else if ('message' in failure) {
                const typedFailure = failure as Extract<FailureDescriptor, { message?: string }>;
                const prefixMap: Partial<Record<FailureDescriptor['variant'], string>> = { /*...*/ }; // Keep this for potential future use
                const failurePrefix = prefixMap[typedFailure.variant] || `${typedFailure.variant}: `;
                height += wrapText(failurePrefix + (typedFailure.message || ''), contentWidth).length;
            } else {
                height += 1; // Fallback line for other failure types
            }
            height++; // Space after failure
        });
    }
    // Add minimum height constraint? No, let layout handle minimum box size.
    return height;
}


function scheduleRedraw() {
    if (!redrawScheduled) {
        redrawScheduled = true;
        setImmediate(redraw);
    }
}

// --- Event Handlers ---

function onResize(width: number, height: number) {
    currentWidth = Math.min(width, MAX_APP_WIDTH);
    logUpdate.clear(); // Clear before redraw on resize to avoid artifacts
    scheduleRedraw();
}

function handleExitKeyPress() {
     if (isFinished) {
         cleanupUI(1);
     } else {
         cleanupUI(1); // Trigger cleanup immediately
     }
}

// --- Public Interface ---

export function initializeUI(model: string, initialTests: CategorizedTestCases, initialStates: AllTestStates) {
    currentModel = model;
    currentTests = initialTests;
    currentTestStates = initialStates;
    isFinished = false;
    lastOutputLineCount = 0;

    term.grabInput(true);
    term.on('key', (name: string) => { if (name === 'CTRL_C') handleExitKeyPress(); });
    term.on('resize', onResize);

    scheduleRedraw(); // Initial draw

    if (!timerInterval) {
        timerInterval = setInterval(() => {
            if (isFinished) { clearInterval(timerInterval!); timerInterval = null; return; }
            let runningTestsExist = false;
            spinnerFrame = (spinnerFrame + 1) % spinnerChars.length;
            Object.entries(currentTestStates).forEach(([testId, state]) => {
                if (state.status === 'running') {
                    runningTestsExist = true;
                    if (!state.startedAt) { state.startedAt = Date.now(); elapsedTimes[testId] = 0; }
                    else { elapsedTimes[testId] = Date.now() - state.startedAt; }
                }
            });
            // Only redraw if spinner needs update
            if (runningTestsExist) scheduleRedraw();
        }, 100);
    }
}

export function updateUI(tests: CategorizedTestCases, testStates: AllTestStates) {
    currentTests = tests;
    currentTestStates = testStates;
    const newElapsedTimes: { [testId: string]: number } = {};
    Object.entries(testStates).forEach(([testId, state]) => {
        if (state.status === 'running') {
            if (state.startedAt) { newElapsedTimes[testId] = Date.now() - state.startedAt; }
            else { state.startedAt = Date.now(); newElapsedTimes[testId] = 0; }
        } else if (elapsedTimes[testId] !== undefined) {
            newElapsedTimes[testId] = elapsedTimes[testId]; // Keep final time
        }
    });
    elapsedTimes = newElapsedTimes;
    scheduleRedraw(); // Always redraw when state updates
}

export function cleanupUI(exitCode = 0) {
    if (isFinished) return; // Prevent double cleanup
    isFinished = true;
    if (timerInterval) { clearInterval(timerInterval); timerInterval = null; }

    // Perform one final draw to show the completed state
    redraw();
    logUpdate.done(); // Persist final frame

    term.grabInput(false);
    // Add a newline *after* logUpdate is done to ensure prompt is clear
    process.stderr.write('\n');
    term.processExit(exitCode);
}

// Initial width calculation
currentWidth = Math.min(term.width, MAX_APP_WIDTH);
