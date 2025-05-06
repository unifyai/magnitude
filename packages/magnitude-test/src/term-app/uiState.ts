import { CategorizedTestCases } from '@/discovery/types';
import { AllTestStates } from './types';
import { MAX_APP_WIDTH, spinnerChars } from './constants';

// --- UI State ---
export let currentWidth = Math.min(process.stdout.columns || MAX_APP_WIDTH, MAX_APP_WIDTH);
export let redrawScheduled = false;
export let timerInterval: NodeJS.Timeout | null = null;
export let currentTestStates: AllTestStates = {};
export let currentTests: CategorizedTestCases = {};
export let currentModel = '';
export let elapsedTimes: { [testId: string]: number } = {};
export let isFinished = false;
export let spinnerFrame = 0;
export let lastOutputLineCount = 0; // Track lines for stability
export let isFirstDraw = true; // Flag to handle the first redraw specially
export let resizeTimeout: NodeJS.Timeout | null = null; // For debouncing resize events
export let isResizing = false; // Flag to track resize state

/**
 * Resets all UI state to initial values
 */
export function resetState() {
    currentWidth = Math.min(process.stdout.columns || MAX_APP_WIDTH, MAX_APP_WIDTH);
    redrawScheduled = false;
    timerInterval = null;
    currentTestStates = {};
    currentTests = {};
    currentModel = '';
    elapsedTimes = {};
    isFinished = false;
    spinnerFrame = 0;
    lastOutputLineCount = 0;
    isFirstDraw = true;
    resizeTimeout = null;
    isResizing = false;
}

/**
 * Sets the redrawScheduled flag
 */
export function setRedrawScheduled(value: boolean) {
    redrawScheduled = value;
}

/**
 * Sets the lastOutputLineCount
 */
export function setLastOutputLineCount(count: number) {
    lastOutputLineCount = count;
}

/**
 * Sets the isFirstDraw flag
 */
export function setIsFirstDraw(value: boolean) {
    isFirstDraw = value;
}

/**
 * Sets the currentWidth
 */
export function setCurrentWidth(width: number) {
    currentWidth = width;
}

/**
 * Sets the isResizing flag
 */
export function setIsResizing(value: boolean) {
    isResizing = value;
}

/**
 * Sets the resizeTimeout
 */
export function setResizeTimeout(timeout: NodeJS.Timeout | null) {
    resizeTimeout = timeout;
}

/**
 * Sets the currentModel
 */
export function setCurrentModel(model: string) {
    currentModel = model;
}

/**
 * Sets the currentTests
 */
export function setCurrentTests(tests: CategorizedTestCases) {
    currentTests = tests;
}

/**
 * Sets the currentTestStates
 */
export function setCurrentTestStates(states: AllTestStates) {
    currentTestStates = states;
}

/**
 * Sets the timerInterval
 */
export function setTimerInterval(interval: NodeJS.Timeout | null) {
    timerInterval = interval;
}

/**
 * Sets the spinnerFrame
 */
export function setSpinnerFrame(frame: number) {
    spinnerFrame = frame;
}

/**
 * Sets the elapsedTimes
 */
export function setElapsedTimes(times: { [testId: string]: number }) {
    elapsedTimes = times;
}

/**
 * Updates a specific entry in the elapsedTimes map
 */
export function updateElapsedTime(testId: string, time: number) {
    elapsedTimes[testId] = time;
}

/**
 * Sets the isFinished flag
 */
export function setIsFinished(value: boolean) {
    isFinished = value;
}
