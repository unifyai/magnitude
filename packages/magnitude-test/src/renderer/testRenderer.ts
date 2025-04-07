import { describeAction, isTestCaseCompletedSuccessfully, isTestCaseDone, isTestCaseFailed, TestCaseState, TestCaseStateTracker } from 'magnitude-core';
import logUpdate from 'log-update';
import chalk from 'chalk';
import { magnitudeBlue, brightMagnitudeBlue } from '@/renderer/colors';


export class TestCaseRenderer {
    private spinnerFrameIndex: number = 0;
    private spinnerFrames: string[] = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
    private testName: string;
    private state: TestCaseState | null = null;
    private startTime: number = 0;

    constructor(testName: string, stateTracker: TestCaseStateTracker) {
        // Just make a new renderer if you need to render a different test case
        this.testName = testName;
        stateTracker.onStateChange(this._onStateChange.bind(this));
        this.state = stateTracker.getState();
        // probably a more sensible place to set this
        this.startTime = Date.now();
    }

    private _onStateChange(state: TestCaseState) {
        this.state = state;
        // if (!this.isActive) {
        //     this.isActive = true;
        // }
    }

    /**
     * Update the test case without starting the render loop
     */
    // public updateTestCase(testCase: TestCase): void {
    //     this.testCase = testCase;
    //     this.startTime = Date.now();
    // }

    /**
     * Start continuous rendering with animation, even before test data is available
     */
    // public startRendering(): void {
    //     this.isActive = true;
    //     this.startTime = Date.now();

    //     // Start the render loop if not already running
    //     if (!this.renderInterval) {
    //         this.renderInterval = setInterval(() => {
    //             if (this.isActive && this.state) {
    //                 this.renderFrame();

    //                 // If test is done, stop the render loop
    //                 if (this.state.failure || isTestCaseCompletedSuccessfully(this.state)) {
    //                     this.stopRendering();
    //                 }
    //             }
    //         }, 100); // Update every 100ms for smooth animation
    //     }
    // }

    private formatElapsedTime(ms: number): string {
        const seconds = Math.floor(ms / 1000);
        const minutes = Math.floor(seconds / 60);
        const hours = Math.floor(minutes / 60);

        return `${hours > 0 ? hours.toString().padStart(2, '0') + ':' : ''}${(minutes % 60).toString().padStart(2, '0')}:${(seconds % 60).toString().padStart(2, '0')}`;
    }

    public getRenderedOutput(): string {
        //if (!this.testCase) return '';

        // Increment spinner frame
        this.spinnerFrameIndex = (this.spinnerFrameIndex + 1) % this.spinnerFrames.length;

        // Get current spinner frame
        const spinner = this.spinnerFrames[this.spinnerFrameIndex];

        // Build output lines
        const lines: string[] = [];

        if (!this.state) {
            // Simple starting message
            lines.push(`${spinner} Test: ${this.testName}`);
            lines.push(`Test run starting...`);
        } else {
            const allActions = [];
            for (const step of this.state.steps) {
                for (const action of step.actions) {
                    allActions.push(action);
                }
            }

            // Get current spinner frame (only show if test is still running)
            const displaySpinner = !(isTestCaseDone(this.state)) ? spinner + ' ' : '';

            // 1. Display test name and status with spinner
            const status = isTestCaseCompletedSuccessfully(this.state) ? chalk.greenBright("[PASSED]") :
                isTestCaseFailed(this.state) ? chalk.redBright("[FAILED]") :
                brightMagnitudeBlue("[RUNNING]");

            const elapsedTime = this.formatElapsedTime(Date.now() - this.startTime);
            //const currentStep = activeCheckIndex !== -1 ? activeStepWithCheck : activeStepIndex;

            lines.push(`${displaySpinner}${status} ${this.testName} ` + chalk.blackBright(`⏱ ${elapsedTime} | Step ${this.state.stepIndex + 1}/${this.state.steps.length} | Actions: ${allActions.length}`));

            // TODO: Host-specific rendering - tunnel, org name, credits
            // if (this.testCase.getTunnelUrl()) {
            //     const localUrl = this.testCase.getUrl();
            //     const tunnelUrl = this.testCase.getTunnelUrl();
            //     lines.push(chalk.blackBright(`⛏ Tunnel: ${tunnelUrl} -> ${localUrl}`));
            // }

            // {
            //     orgName: string
            //     dashboardUrl: string
            // }

            if (this.state.metadata.dashboardUrl) {
                lines.push(magnitudeBlue(`⚭ Link: ${this.state.metadata.dashboardUrl}`));
            }

            //lines.push(magnitudeBlue(`⚭ Link: ${this.lastRun.getUrl()}`));

            // 3. Steps and checks progress
            lines.push(brightMagnitudeBlue(`\nProgress:`));
            for (let i = 0; i < this.state.steps.length; i++) {
                //const isCurrentStep = this.state.stepIndex === i;
                const step = this.state.steps[i];
                const isCurrentStep = this.state.stepIndex === i;
                const isAfterStep = (isCurrentStep && this.state.checkIndex > -1) || this.state.stepIndex > i;
                const stepStatus = this.getStatusSymbol(
                    isCurrentStep && isTestCaseFailed(this.state) ? 'failed' :
                    isAfterStep ? 'passed' :
                    'pending'
                );
                
                lines.push(`${isCurrentStep && this.state.checkIndex === -1 ? magnitudeBlue(">") : " "} ${stepStatus} Step ${i + 1}: ${step.definition.description}`);

                // Show checks for this step
                for (let j = 0; j < step.definition.checks.length; j++) {
                    const check = step.definition.checks[j];
                    const isCurrentCheck = isCurrentStep && j === this.state.checkIndex;
                    const isAfterCheck = this.state.stepIndex > i || (isCurrentStep && this.state.checkIndex > j);

                    const checkStatus = this.getStatusSymbol(
                        isCurrentCheck && isTestCaseFailed(this.state) ? 'failed' :
                        isAfterCheck ? 'passed' :
                        'pending'
                    );
                    
                    lines.push(`    ${isCurrentCheck ? magnitudeBlue(">") : " "} ${checkStatus} Check: ${check}`);
                }
            }

            // Actions
            
            lines.push(brightMagnitudeBlue(`\nActions:`));
            if (allActions.length === 0) {
                lines.push(`  No actions yet`);
            } else {
                for (const action of allActions) {
                    // prob use custom util within pkg - repeating variant redundantly
                    lines.push("  " + magnitudeBlue(`${this.getActionSymbol(action.variant)} ${action.variant.toUpperCase()}`) + `: ${describeAction(action)}`);
                }
            }

            // Handle problems
            //const problem = this.lastRun.getProblem();
            //const warnings = this.lastRun.getWarnings();

            // Handle critical problem if it exists
            // TODO: flesh out failure descriptor (via failure breakdown prompt) and show better here
            if (this.state.result && !this.state.result.passed) {
                lines.push(chalk.redBright(`\nProblem:`));
                lines.push(` ${this.state.result.failure.description}`);
                // const severity = problem.getSeverity();
                // lines.push(` ${this.getSeverityDescriptor(severity)}: ${problem.getTitle()} `);
                // lines.push(` ${magnitudeBlue('Expected')}: ${problem.getExpectedResult()}`);
                // lines.push(` ${magnitudeBlue('Actual')}: ${problem.getActualResult()}`);
            }

            // Handle warnings
            // if (warnings.length > 0) {
            //     lines.push(chalk.yellowBright(`\nWarnings:`));

            //     for (const warning of warnings) {
            //         const severity = warning.getSeverity();
            //         lines.push(` ${this.getSeverityDescriptor(severity)}: ${warning.getTitle()} `);
            //         lines.push(` ${magnitudeBlue('Expected')}: ${warning.getExpectedResult()}`);
            //         lines.push(` ${magnitudeBlue('Actual')}: ${warning.getActualResult()}`);
            //     }
            // }
        }

        // Return the joined string instead of updating the display
        return lines.join('\n');
    }

    private getActionSymbol(variant: "load" | "click" | "hover" | "type" | "scroll" | "wait" | "back") {
        switch (variant) {
            case "load":
                return "↻"; // Recycling symbol for loading
            case "click":
                return "⊙"; // Circled dot for clicking
            case "hover":
                return "◉"; // Circled bullet for hovering
            case "type":
                return "⌨"; // Keyboard symbol
            case "scroll":
                return "↕"; // Up/down arrows for scrolling
            case "wait":
                return "◴"; // Clock face for waiting
            case "back":
                return "←"; // Left arrow for going back
            default:
                return "?"; // Question mark for unknown action
        }
    }

    private getStatusSymbol(status: "pending" | "passed" | "failed"): string {
        switch (status) {
            case "passed": return chalk.greenBright("✓");
            case "failed": return chalk.redBright("✗");
            case "pending": return chalk.blackBright("⋯");
            default: return "?";
        }
    }

    // private getSeverityDescriptor(severity: "critical" | "high" | "medium" | "low" | "cosmetic"): string {
    //     switch (severity) {
    //         case "critical": return chalk.hex('#FF0000')("[!!!] Critical");
    //         case "high": return chalk.hex('#FF4500')("[!!] High");
    //         case "medium": return chalk.hex('#FFA500')("[!] Medium");
    //         case "low": return chalk.hex('#FFFF00')("[*] Low");
    //         case "cosmetic": return chalk.hex('#FFFF00')("Cosmetic");
    //         default: return chalk.hex('#FFFFFF')("Unknown");
    //     }
    // }
}