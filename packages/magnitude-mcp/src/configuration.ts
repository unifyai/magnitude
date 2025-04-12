import fs from 'fs/promises';
import path from 'path';

export type MagnitudeConfig = {
  apiKey?: string;
  url?: string;
};

// Helper to check if a file exists
export async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

export async function getConfiguration(args: any): Promise<any> {
  console.error('[Config] Getting Magnitude configuration');
  
  try {
    const { configPath = './tests/magnitude/magnitude.config.ts' } = args || {};
    
    // Check if file exists
    if (!(await fileExists(configPath))) {
      throw new Error(`Configuration file not found: ${configPath}`);
    }
    
    // Read file
    const content = await fs.readFile(configPath, 'utf-8');
    
    // Extract configuration values
    // This is a simplified implementation that would need to be enhanced
    // with a proper parser for production use
    const apiKeyMatch = content.match(/apiKey:\s*(?:"([^"]+)"|process\.env\.([A-Z_]+))/);
    const urlMatch = content.match(/url:\s*"([^"]+)"/);
    
    const config: MagnitudeConfig = {};
    
    if (apiKeyMatch) {
      config.apiKey = apiKeyMatch[1] || `[Environment Variable: ${apiKeyMatch[2]}]`;
    }
    
    if (urlMatch) {
      config.url = urlMatch[1];
    }
    
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(config, null, 2),
        },
      ],
    };
  } catch (error) {
    console.error('[Error] Failed to get configuration:', error);
    return {
      content: [
        {
          type: 'text',
          text: `Failed to get configuration: ${error}`,
        },
      ],
      isError: true,
    };
  }
}

export async function updateConfiguration(args: any): Promise<any> {
  console.error('[Config] Updating Magnitude configuration');
  
  try {
    const { configPath = './tests/magnitude/magnitude.config.ts', config } = args;
    
    if (!config) {
      throw new Error('No configuration provided');
    }
    
    // Check if file exists
    const exists = await fileExists(configPath);
    
    if (!exists) {
      // Create a new configuration file
      const content = `import { type MagnitudeConfig } from "magnitude-test";

export default {
    url: "${config.url || 'http://localhost:5173'}",
    apiKey: ${config.apiKey ? `"${config.apiKey}"` : 'process.env.MAGNITUDE_API_KEY'}
} satisfies MagnitudeConfig;`;
      
      // Ensure directory exists
      const dir = path.dirname(configPath);
      await fs.mkdir(dir, { recursive: true });
      
      // Write file
      await fs.writeFile(configPath, content);
      
      return {
        content: [
          {
            type: 'text',
            text: `Configuration file created at ${configPath}`,
          },
        ],
      };
    } else {
      // Read existing file
      const existingContent = await fs.readFile(configPath, 'utf-8');
      
      // Update configuration values
      let newContent = existingContent;
      
      if (config.url !== undefined) {
        const urlRegex = /(url:\s*)"([^"]+)"/;
        if (urlRegex.test(newContent)) {
          newContent = newContent.replace(urlRegex, `$1"${config.url}"`);
        } else {
          // If url is not in the file, add it
          newContent = newContent.replace(/export default {/, `export default {\n    url: "${config.url}",`);
        }
      }
      
      if (config.apiKey !== undefined) {
        const apiKeyRegex = /(apiKey:\s*)(?:"[^"]+"|process\.env\.[A-Z_]+)/;
        if (apiKeyRegex.test(newContent)) {
          newContent = newContent.replace(apiKeyRegex, `$1"${config.apiKey}"`);
        } else {
          // If apiKey is not in the file, add it
          newContent = newContent.replace(/export default {/, `export default {\n    apiKey: "${config.apiKey}",`);
        }
      }
      
      // Write file
      await fs.writeFile(configPath, newContent);
      
      return {
        content: [
          {
            type: 'text',
            text: `Configuration file updated at ${configPath}`,
          },
        ],
      };
    }
  } catch (error) {
    console.error('[Error] Failed to update configuration:', error);
    return {
      content: [
        {
          type: 'text',
          text: `Failed to update configuration: ${error}`,
        },
      ],
      isError: true,
    };
  }
}
