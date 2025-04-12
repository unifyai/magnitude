import { execSync, ExecSyncOptionsWithStringEncoding } from 'child_process';
import { logger } from './logger.js';

/**
 * Execute a CLI command and return its output
 * @param command Command to execute
 * @param options Options for command execution
 * @returns Promise resolving to the command output
 */
export function executeCliCommand(command: string, options: ExecSyncOptionsWithStringEncoding = { encoding: 'utf-8' }): string {
  logger.info(`[CLI] Executing: ${command}`);
  return execSync(command, options);
}

/**
 * Handle errors from tool execution
 * @param message Error message prefix
 * @param error Error object
 * @returns Formatted error response for MCP
 */
export function handleError(message: string, error: any): any {
  logger.error(`[Error] ${message}:`, error);
  return {
    content: [
      {
        type: 'text',
        text: `${message}: ${error}`,
      },
    ],
    isError: true,
  };
}
