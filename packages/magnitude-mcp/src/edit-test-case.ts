import fs from 'fs/promises';
import { TestDataEntry, TestStepDefinition, TestCaseDefinition } from './index.js';

// Helper to check if a file exists
export async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

export async function editTestCase(args: any): Promise<any> {
  console.error('[Test] Editing test case:', args.filename);
  
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
    console.error('[Error] Failed to edit test case:', error);
    return {
      content: [
        {
          type: 'text',
          text: `Failed to edit test case: ${error}`,
        },
      ],
      isError: true,
    };
  }
}
