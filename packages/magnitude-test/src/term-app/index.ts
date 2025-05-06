import logUpdate from 'log-update';
import { CategorizedTestCases } from '@/discovery/types';
import { AllTestStates } from './types';
import { VERSION } from '@/version';
import { formatDuration, getUniqueTestId } from './util';
import { FailureDescriptor } from 'magnitude-core';

// Import from our new modules
import { MAX_APP_WIDTH, spinnerChars } from './constants';
import {
  currentWidth, timerInterval, currentTestStates, currentTests,
  currentModel, elapsedTimes, isFinished, spinnerFrame, resizeTimeout,
  isResizing, redrawScheduled, resetState, setRedrawScheduled,
  setIsResizing, setResizeTimeout, setCurrentWidth, setCurrentModel,
  setCurrentTests, setCurrentTestStates, setTimerInterval, setSpinnerFrame,
  setElapsedTimes, setIsFinished, updateElapsedTime
} from './uiState';
import { redraw, scheduleRedraw } from './uiRenderer';

/**
 * Handle window resize events
 */
function onResize() {
  // Set resize flag to avoid unnecessary screen clearing
  setIsResizing(true);
  
  // Clear any existing timeout
  if (resizeTimeout) {
      clearTimeout(resizeTimeout);
  }
  
  // Debounce resize events - only update width and redraw after resize is "settled"
  setResizeTimeout(setTimeout(() => {
      const newWidth = Math.min(process.stdout.columns || MAX_APP_WIDTH, MAX_APP_WIDTH);
      if (newWidth !== currentWidth) {
          setCurrentWidth(newWidth);
          // Don't clear the screen directly, let the redraw handle it
          scheduleRedraw();
      }
      setIsResizing(false);
      setResizeTimeout(null);
  }, 100)); // Small debounce time to ensure smoothness
}

/**
 * Handle exit key presses (CTRL+C)
 */
function handleExitKeyPress() {
  // This will no longer be triggered by CTRL_C via terminal-kit
  // CTRL_C will now likely cause an immediate process exit unless handled differently.
   if (isFinished) {
       cleanupUI(1);
   } else {
       cleanupUI(1); // Trigger cleanup immediately
   }
}

/**
 * Initialize the terminal UI
 * @param model The model name to display
 * @param initialTests The initial test cases
 * @param initialStates The initial test states
 */
export function initializeUI(model: string, initialTests: CategorizedTestCases, initialStates: AllTestStates) {
    // Reset state to clear any previous UI state
    resetState();
    
    // Set initial values
    setCurrentModel(model);
    setCurrentTests(initialTests);
    setCurrentTestStates(initialStates);
    
    // Ensure the cursor is on a new line before starting the UI
    // This can help prevent the first line of the UI from being "eaten" or cut off
    process.stdout.write('\n');

    // Explicitly clear logUpdate before the first draw to ensure a clean slate
    logUpdate.clear();

    // Clear screen and move cursor to home using ANSI escape codes
    process.stdout.write('\x1b[2J\x1b[H');
    
    // Basic CTRL+C handling
    process.on('SIGINT', () => {
        handleExitKeyPress();
    });
    
    // Add resize event handler to process.stdout
    process.stdout.on('resize', onResize);

    scheduleRedraw(); // Initial draw

    if (!timerInterval) {
        const interval = setInterval(() => {
            if (isFinished) { 
                clearInterval(timerInterval!); 
                setTimerInterval(null); 
                return; 
            }
            let runningTestsExist = false;
            setSpinnerFrame((spinnerFrame + 1) % spinnerChars.length);
            Object.entries(currentTestStates).forEach(([testId, state]) => {
                if (state.status === 'running') {
                    runningTestsExist = true;
                    if (!state.startedAt) { 
                        state.startedAt = Date.now(); 
                        updateElapsedTime(testId, 0);
                    } else { 
                        updateElapsedTime(testId, Date.now() - state.startedAt);
                    }
                }
            });
            // Only redraw if spinner needs update
            if (runningTestsExist) scheduleRedraw();
        }, 100);
        setTimerInterval(interval);
    }
}

/**
 * Update the terminal UI with new tests and states
 * @param tests Updated test cases
 * @param testStates Updated test states
 */
export function updateUI(tests: CategorizedTestCases, testStates: AllTestStates) {
    setCurrentTests(tests);
    setCurrentTestStates(testStates);
    // Create a new map for elapsed times
    const newElapsedTimes: { [testId: string]: number } = {};
    
    // Process each test state
    Object.entries(testStates).forEach(([testId, state]) => {
        if (state.status === 'running') {
            // For running tests, update the elapsed time
            if (state.startedAt) {
                newElapsedTimes[testId] = Date.now() - state.startedAt;
            } else {
                // If no start time, set one and initialize to 0
                state.startedAt = Date.now();
                newElapsedTimes[testId] = 0;
            }
        } else if (elapsedTimes[testId] !== undefined) {
            // For non-running tests, keep the existing elapsed time
            newElapsedTimes[testId] = elapsedTimes[testId];
        }
    });
    
    // Update all elapsed times at once
    setElapsedTimes(newElapsedTimes);
    scheduleRedraw(); // Always redraw when state updates
}

/**
 * Clean up the terminal UI and optionally exit
 * @param exitCode Optional exit code
 */
export function cleanupUI(exitCode = 0) {
    if (isFinished) return; // Prevent double cleanup
    setIsFinished(true);
    if (timerInterval) { 
        clearInterval(timerInterval); 
        setTimerInterval(null); 
    }

    // Remove the resize listener
    process.stdout.removeListener('resize', onResize);

    // Perform one final draw to show the completed state
    redraw();
    logUpdate.done(); // Persist final frame

    // Add a newline *after* logUpdate is done to ensure prompt is clear
    process.stderr.write('\n');
    process.exit(exitCode);
}

// Initial width calculation
setCurrentWidth(Math.min(process.stdout.columns || MAX_APP_WIDTH, MAX_APP_WIDTH));
