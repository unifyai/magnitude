import fs from 'fs/promises';
import path from 'path';
import { TestDataEntry, TestStepDefinition, TestCaseDefinition } from '../types.js';
import { fileExists, ensureDirectoryExists } from '../utils/fileUtils.js';
import { handleError } from '../utils/cliUtils.js';
import { logger } from '../utils/logger.js';

/**
 * Create a new test case file
 * @param args Arguments for creating a test case
 * @returns MCP response
 */
export async function createTestCase(args: any): Promise<any> {
  logger.info('[Test] Creating test case:', args.filename);
  
  try {
    const { filename, name, testCase } = args;
    
    // Generate test file content
    let content = `import { test } from 'magnitude-test';\n\n`;
    
    content += `test('${name}', { url: "${testCase.url}" })\n`;
    
    testCase.steps.forEach((step: TestStepDefinition) => {
      content += `    .step('${step.description}')\n`;
      
      // Handle structured data entries
      if (step.testData.data && step.testData.data.length > 0) {
        const regularData = step.testData.data.filter((entry: TestDataEntry) => !entry.sensitive);
        const sensitiveData = step.testData.data.filter((entry: TestDataEntry) => entry.sensitive);
        
        if (regularData.length > 0) {
          const dataObj = regularData.reduce((obj: Record<string, string>, entry: TestDataEntry) => {
            obj[entry.key] = entry.value;
            return obj;
          }, {});
          
          content += `        .data(${JSON.stringify(dataObj)})\n`;
        }
        
        if (sensitiveData.length > 0) {
          const secureDataObj = sensitiveData.reduce((obj: Record<string, string>, entry: TestDataEntry) => {
            obj[entry.key] = entry.value;
            return obj;
          }, {});
          
          content += `        .secureData(${JSON.stringify(secureDataObj)})\n`;
        }
      }
      
      // Handle other/freeform data
      if (step.testData.other) {
        content += `        .data("${step.testData.other}")\n`;
      }
      
      // Add checks
      step.checks.forEach((check: string) => {
        content += `        .check('${check}')\n`;
      });
    });
    
    // Ensure directory exists
    const dir = path.dirname(filename);
    await ensureDirectoryExists(dir);
    
    // Write file
    await fs.writeFile(filename, content);
    
    return {
      content: [
        {
          type: 'text',
          text: `Test case created successfully at ${filename}`,
        },
      ],
    };
  } catch (error) {
    return handleError('Failed to create test case', error);
  }
}

/**
 * Read an existing test case file
 * @param args Arguments for reading a test case
 * @returns MCP response
 */
export async function readTestCase(args: any): Promise<any> {
  logger.info('[Test] Reading test case:', args.filename);
  
  try {
    const { filename } = args;
    
    // Check if file exists
    if (!(await fileExists(filename))) {
      throw new Error(`File not found: ${filename}`);
    }
    
    // Read file
    const content = await fs.readFile(filename, 'utf-8');
    
    // Parse test case
    // This is a simplified implementation that would need to be enhanced
    // with a proper parser for production use
    const nameMatch = content.match(/test\('([^']+)'/);
    const urlMatch = content.match(/url:\s*"([^"]+)"/);
    
    const name = nameMatch ? nameMatch[1] : '';
    const url = urlMatch ? urlMatch[1] : '';
    
    // Extract steps
    const stepMatches = content.matchAll(/\.step\('([^']+)'\)((?:\s+\.[a-zA-Z]+\([^)]+\))*)/g);
    const steps: TestStepDefinition[] = [];
    
    for (const match of stepMatches) {
      const description = match[1];
      const stepContent = match[2];
      
      // Extract checks
      const checkMatches = stepContent.matchAll(/\.check\('([^']+)'\)/g);
      const checks: string[] = [];
      
      for (const checkMatch of checkMatches) {
        checks.push(checkMatch[1]);
      }
      
      // Extract data
      const dataMatch = stepContent.match(/\.data\(({[^}]+})\)/);
      const secureDataMatch = stepContent.match(/\.secureData\(({[^}]+})\)/);
      const freeformDataMatch = stepContent.match(/\.data\("([^"]+)"\)/);
      
      const testData: TestData = { data: [] };
      
      if (dataMatch) {
        try {
          const dataObj = JSON.parse(dataMatch[1]);
          for (const [key, value] of Object.entries(dataObj)) {
            testData.data!.push({
              key,
              value: value as string,
              sensitive: false,
            });
          }
        } catch (e) {
          logger.error('[Error] Failed to parse data:', e);
        }
      }
      
      if (secureDataMatch) {
        try {
          const secureDataObj = JSON.parse(secureDataMatch[1]);
          for (const [key, value] of Object.entries(secureDataObj)) {
            testData.data!.push({
              key,
              value: value as string,
              sensitive: true,
            });
          }
        } catch (e) {
          logger.error('[Error] Failed to parse secure data:', e);
        }
      }
      
      if (freeformDataMatch) {
        testData.other = freeformDataMatch[1];
      }
      
      steps.push({
        description,
        checks,
        testData,
      });
    }
    
    const testCase: TestCaseDefinition = {
      url,
      steps,
    };
    
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({ name, testCase }, null, 2),
        },
      ],
    };
  } catch (error) {
    return handleError('Failed to read test case', error);
  }
}

/**
 * Edit an existing test case file
 * @param args Arguments for editing a test case
 * @returns MCP response
 */
export async function editTestCase(args: any): Promise<any> {
  logger.info('[Test] Editing test case:', args.filename);
  
  try {
    const { filename, name, testCase, operations } = args;
    
    // Check if file exists
    if (!(await fileExists(filename))) {
      throw new Error(`File not found: ${filename}`);
    }
    
    // Read existing file
    const existingContent = await fs.readFile(filename, 'utf-8');
    
    // Parse existing test case
    const nameMatch = existingContent.match(/test\('([^']+)'/);
    const urlMatch = existingContent.match(/url:\s*"([^"]+)"/);
    
    const existingName = nameMatch ? nameMatch[1] : '';
    const existingUrl = urlMatch ? urlMatch[1] : '';
    
    // Generate new content
    let content = `import { test } from 'magnitude-test';\n\n`;
    
    // Use new name or existing name
    const newName = name || existingName;
    
    // Use new URL or existing URL
    const newUrl = testCase?.url || existingUrl;
    
    content += `test('${newName}', { url: "${newUrl}" })\n`;
    
    // If operations are provided, apply them to the existing test case
    if (operations) {
      // This would be a more complex implementation in production
      // For now, we'll just regenerate the file with the new test case
      return {
        content: [
          {
            type: 'text',
            text: `Operations-based editing is not fully implemented yet. Please provide a complete testCase object.`,
          },
        ],
        isError: true,
      };
    } else if (testCase) {
      // Generate content from the provided test case
      testCase.steps.forEach((step: TestStepDefinition) => {
        content += `    .step('${step.description}')\n`;
        
        // Handle structured data entries
        if (step.testData.data && step.testData.data.length > 0) {
          const regularData = step.testData.data.filter((entry: TestDataEntry) => !entry.sensitive);
          const sensitiveData = step.testData.data.filter((entry: TestDataEntry) => entry.sensitive);
          
          if (regularData.length > 0) {
            const dataObj = regularData.reduce((obj: Record<string, string>, entry: TestDataEntry) => {
              obj[entry.key] = entry.value;
              return obj;
            }, {});
            
            content += `        .data(${JSON.stringify(dataObj)})\n`;
          }
          
          if (sensitiveData.length > 0) {
            const secureDataObj = sensitiveData.reduce((obj: Record<string, string>, entry: TestDataEntry) => {
              obj[entry.key] = entry.value;
              return obj;
            }, {});
            
            content += `        .secureData(${JSON.stringify(secureDataObj)})\n`;
          }
        }
        
        // Handle other/freeform data
        if (step.testData.other) {
          content += `        .data("${step.testData.other}")\n`;
        }
        
        // Add checks
        step.checks.forEach((check: string) => {
          content += `        .check('${check}')\n`;
        });
      });
      
      // Write file
      await fs.writeFile(filename, content);
      
      return {
        content: [
          {
            type: 'text',
            text: `Test case updated successfully at ${filename}`,
          },
        ],
      };
    } else {
      // No changes provided
      return {
        content: [
          {
            type: 'text',
            text: `No changes provided for editing test case.`,
          },
        ],
        isError: true,
      };
    }
  } catch (error) {
    return handleError('Failed to edit test case', error);
  }
}

// Define TestData interface for local use
interface TestData {
  data?: TestDataEntry[];
  other?: string;
}
