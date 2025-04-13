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
    const installOutput = await executeCliCommand('npm', ['install', 'magnitude-test'], { cwd: projectDir });
    const initOutput = await executeCliCommand('npx', ['magnitude', 'init'], { cwd: projectDir });
    
    logger.info('[Setup] Magnitude project initialized successfully');
    
    return {
      content: [
        {
          type: 'text',
          text: `${installOutput}\n\n${initOutput}\nMagnitude project initialized successfully.`,
        },
      ],
    };
  } catch (error) {
    return handleError('Failed to initialize project', error);
  }
}
