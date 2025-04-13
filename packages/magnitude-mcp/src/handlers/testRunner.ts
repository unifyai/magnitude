import { RunTestsInput } from '../types.js';
import { executeCliCommand, handleError } from '../utils/cliUtils.js';
import { logger } from '../utils/logger.js';

/**
 * Run Magnitude tests
 * @param args Arguments for running tests
 * @returns MCP response
 */
export async function runTests(args: RunTestsInput): Promise<any> {
  logger.info('[Test] Running Magnitude tests');
  
  try {
    const { pattern, workers } = args || {};
    const projectDir = '/home/anerli/Sync/lab/25.04.12/magnitude-demo-repo';
    
    // Build command arguments
    const cmdArgs = ['magnitude'];
    
    if (pattern) {
      cmdArgs.push(pattern);
    }
    
    if (workers && Number.isInteger(workers) && workers > 0) {
      cmdArgs.push('-w', workers.toString());
    }
    
    logger.info(`[Test] Executing command: npx ${cmdArgs.join(' ')} in ${projectDir}`);
    
    // Execute command
    try {
      const output = await executeCliCommand('npx', cmdArgs, {
        cwd: projectDir // This handles the directory change
      });
      
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
            text: `Tests executed with failures:\n\n${error.message || ''}`,
          },
        ],
        isError: true,
      };
    }
  } catch (error) {
    return handleError('Failed to run tests', error);
  }
}