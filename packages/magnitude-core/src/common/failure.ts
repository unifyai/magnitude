// TODO: flesh out
/**
 * Represents any reason why a test case could have failed, for example:
 * - Step could not be completed
 * - Check did not pass
 * - Could not navigate to starting URL
 * - Time or action based timeout
 * - ...
 */
export interface FailureDescriptor {
    description: string
}

export type BugSeverity = 'critical' | 'high' | 'medium' | 'low';

export interface BugClassification {
    title: string,
    expectedResult: string,
    actualResult: string,
    severity: BugSeverity
}

export interface StepFailure {
    /**
     * A step fails when agent cannot find a way to complete it.
     * When can this happen?
     * (A) There's a bug that prevents in the step from being completed
     * (B) The step doesn't align at all with how the interface currently works
     *     (i.e. the interface changed completely or a step was written incorrectly)
     */
    variant: 'step',
    bug: BugClassification
}

export interface CheckFailure {
    /**
     * A check fails when it is evaluated and does not hold true.
     * When can this happen?
     * (A) There's a bug that causes the check to fail
     * (B) The check was written in a way that will always fail / doesn't align with interface
     */
    variant: 'check'
    bug: BugClassification
}


export interface UnknownFailure {
    // Failure due to some unknown / unhandled error.
    // If these are being returned we should identify and handle them specifically
    variant: 'unknown',

}