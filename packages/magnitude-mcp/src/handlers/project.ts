import { executeCliCommand, handleError } from '../utils/cliUtils.js';
import { logger } from '../utils/logger.js';

import { InitializeProjectInput } from '../types.js';

/**
 * Initialize a new Magnitude project
 * @param args Arguments for initializing project
 * @returns MCP response
 */
export async function initializeProject(args: InitializeProjectInput): Promise<any> {
  const { projectDir } = args;
  logger.info('[Setup] Initializing Magnitude project...');

  try {
    // Use the Magnitude CLI with spawn approach
    const output = await executeCliCommand('npx', ['magnitude', 'init'], { cwd: projectDir });
    
    logger.info('[Setup] Magnitude project initialized successfully');
    
    return {
      content: [
        {
          type: 'text',
          text: `Magnitude project initialized successfully.\n\n${output}\n\nNext steps:\n1. Install magnitude-test: npm install magnitude-test\n2. Get an API key from https://app.magnitude.run/signup\n3. Set your API key in the config file or as an environment variable\n4. Run your tests with: npx magnitude`,
        },
      ],
    };
  } catch (error) {
    return handleError('Failed to initialize project', error);
  }
}
