import { FailureDescriptor } from "magnitude-core";
import logger from '@/logger';
import { errorRed } from "./colors";

export function indentBlock(content: string, numSpaces: number): string {
    // Split the content into lines
    const lines = content.split('\n');
    
    // Create the indentation string with the specified number of spaces
    const indentation = ' '.repeat(numSpaces);
    
    // Add the indentation to each line and join them back together
    return lines.map(line => indentation + line).join('\n');
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
        return `Found Bug: ${failure.title}` +
            `\n  Expected: ${failure.expectedResult}` +
            `\n  Actual: ${failure.actualResult}` +
            `\n  Severity: ${failure.severity}`;
    }
    else {
        logger.error({ failure }, `Trying to render unhandled failure`);
        return `Unhandled`;
    }
}