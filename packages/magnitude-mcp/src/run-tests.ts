import { execSync } from 'child_process';

export async function runTests(args: any): Promise<any> {
  console.error('[Test] Running Magnitude tests');
  
  try {
    const { pattern, workers } = args || {};
    
    // Build command
    let command = 'npx magnitude';
    
    if (pattern) {
      command += ` ${pattern}`;
    }
    
    if (workers && Number.isInteger(workers) && workers > 0) {
      command += ` -w ${workers}`;
    }
    
    console.error(`[Test] Executing command: ${command}`);
    
    // Execute command
    try {
      const output = execSync(command, { encoding: 'utf-8' });
      
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
    console.error('[Error] Failed to run tests:', error);
    return {
      content: [
        {
          type: 'text',
          text: `Failed to run tests: ${error}`,
        },
      ],
      isError: true,
    };
  }
}
