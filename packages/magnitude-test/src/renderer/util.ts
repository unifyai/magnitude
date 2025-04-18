import { BugSeverity, FailureDescriptor } from "magnitude-core";
import logger from '@/logger';
import { brightMagnitudeBlue, errorRed, infoYellow, magnitudeBlue, warningOrange } from "./colors";

export function indentBlock(content: string, numSpaces: number): string {
    // Split the content into lines
    const lines = content.split('\n');
    
    // Create the indentation string with the specified number of spaces
    const indentation = ' '.repeat(numSpaces);
    
    // Add the indentation to each line and join them back together
    return lines.map(line => indentation + line).join('\n');
}

function getSeverityColor(severity: BugSeverity) {
    if (severity === 'critical' || severity === 'high') {
        return errorRed;
    } else if (severity === 'medium') {
        return warningOrange;
    } else if (severity === 'low') {
        return infoYellow;
    } else {
        return errorRed;
    }
}

export function renderFailure(failure: FailureDescriptor): string {
    // Render a failure as a string appropriately according to its type
    if (failure.variant === 'network') {
        return `${errorRed('Network error:')} ${failure.message}`;
    }
    else if (failure.variant === 'browser') {
        return `${errorRed('Error in browser:')} ${failure.message}`;
    }
    else if (failure.variant === 'unknown') {
        return `${errorRed('Unexpected error:')} ${failure.message}`;
    }
    else if (failure.variant === 'misalignment') {
        return `${errorRed('Misalignment:')} ${failure.message}`
    }
    else if (failure.variant === 'bug') {
        return `${brightMagnitudeBlue('Found bug:')} ${failure.title}` +
            `\n  ${brightMagnitudeBlue('Expected:')} ${failure.expectedResult}` +
            `\n  ${brightMagnitudeBlue('Actual:')} ${failure.actualResult}` +
            `\n  ${brightMagnitudeBlue('Severity:')} ${getSeverityColor(failure.severity)(failure.severity.toUpperCase())}`;
    }
    else {
        logger.error({ failure }, `Trying to render unhandled failure`);
        return `Unhandled`;
    }
}