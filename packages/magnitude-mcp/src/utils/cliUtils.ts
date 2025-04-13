import { spawn, SpawnOptions } from 'child_process';
import { logger } from './logger.js';

/**
 * Execute a CLI command using spawn
 * @param command The main command to execute
 * @param args Array of arguments for the command
 * @param options Additional spawn options (like cwd for directory)
 * @returns Promise resolving to the command output
 */
export function executeCliCommand(command: string, args: string[], options: SpawnOptions = {}): Promise<string> {
  const cwd = options.cwd ? ` (in ${options.cwd})` : '';
  logger.info(`[CLI] Executing: ${command} ${args.join(' ')}${cwd}`);
  
  // Merge default options with provided options
  const spawnOptions: SpawnOptions = {
    env: { ...process.env }, // Include all environment variables
    shell: true, // Use shell to help with PATH resolution
    stdio: 'pipe', // Capture output
    ...options // Override with any provided options
  };
  
  return new Promise((resolve, reject) => {
    const childProcess = spawn(command, args, spawnOptions);
    
    let stdout = '';
    let stderr = '';
    
    childProcess.stdout!.on('data', (data) => {
      stdout += data.toString();
    });
    
    childProcess.stderr!.on('data', (data) => {
      stderr += data.toString();
    });
    
    childProcess.on('close', (code) => {
      if (code === 0) {
        resolve(stdout);
      } else {
        reject(new Error(`Process exited with code ${code}: ${stderr}`));
      }
    });
    
    childProcess.on('error', (error) => {
      reject(error);
    });
  });
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