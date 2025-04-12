import { executeCliCommand, handleError } from '../utils/cliUtils.js';
import { logger } from '../utils/logger.js';

/**
 * Run Magnitude tests
 * @param args Arguments for running tests
 * @returns MCP response
 */
export async function runTests(args: any): Promise<any> {
  logger.info('[Test] Running Magnitude tests');
  
  try {
    const { pattern, workers } = args || {};
    
    // Build command
    let command = 'cd /home/anerli/Sync/lab/25.04.12/magnitude-demo-repo && npx magnitude';
    
    if (pattern) {
      command += ` ${pattern}`;
    }
    
    if (workers && Number.isInteger(workers) && workers > 0) {
      command += ` -w ${workers}`;
    }
    
    logger.info(`[Test] Executing command: ${command}`);
    
    // Execute command
    try {
      const output = executeCliCommand(command);
      
      return {
        content: [
          {
            type: 'text',
            text: `Tests executed successfully:\n\n${output}`,
          },
        ],
      };
    } catch (error: any) {
      // If the tests fail, the process will exit with a non-zero code
      // But we still want to return the output
      return {
        content: [
          {
            type: 'text',
            text: `Tests executed with failures:\n\n${error.stdout || ''}`,
          },
        ],
        isError: true,
      };
    }
  } catch (error) {
    return handleError('Failed to run tests', error);
  }
}
