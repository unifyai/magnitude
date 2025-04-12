#!/usr/bin/env node
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ErrorCode,
  ListResourcesRequestSchema,
  ListResourceTemplatesRequestSchema,
  ListToolsRequestSchema,
  McpError,
  ReadResourceRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';

// Import the implementations from separate files
import { runTests } from './run-tests.js';
import { getConfiguration, updateConfiguration } from './configuration.js';
import { editTestCase } from './edit-test-case.js';

// Type definitions
export interface TestDataEntry {
  key: string;
  value: string;
  sensitive: boolean;
}

export interface TestData {
  data?: TestDataEntry[];
  other?: string;
}

export interface TestStepDefinition {
  description: string;
  checks: string[];
  testData: TestData;
}

export interface TestCaseDefinition {
  url: string;
  steps: TestStepDefinition[];
}

type MagnitudeConfig = {
  apiKey?: string;
  url?: string;
};

// Helper to check if a file exists
async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

// Helper to ensure a directory exists
async function ensureDirectoryExists(dirPath: string): Promise<void> {
  try {
    await fs.mkdir(dirPath, { recursive: true });
  } catch (error: any) {
    console.error('[Error] Failed to create directory:', error);
    throw error;
  }
}

class MagnitudeMcpServer {
  private server: Server;

  constructor() {
    this.server = new Server(
      {
        name: 'magnitude-mcp-server',
        version: '0.1.0',
      },
      {
        capabilities: {
          resources: {},
          tools: {},
        },
      }
    );

    // Error handling
    this.server.onerror = (error: any) => console.error('[MCP Error]', error);
    process.on('SIGINT', async () => {
      await this.server.close();
      process.exit(0);
    });

    this.setupResourceHandlers();
    this.setupToolHandlers();
  }

  private setupResourceHandlers() {
    // Documentation resources
    this.server.setRequestHandler(ListResourceTemplatesRequestSchema, async () => ({
      resourceTemplates: [
        {
          uriTemplate: 'magnitude://docs/{topic}',
          name: 'Magnitude Documentation',
          mimeType: 'text/markdown',
          description: 'Documentation for Magnitude testing framework',
        },
        {
          uriTemplate: 'magnitude://examples/{example-type}',
          name: 'Magnitude Examples',
          mimeType: 'text/markdown',
          description: 'Example test cases for Magnitude',
        },
      ],
    }));

    this.server.setRequestHandler(ReadResourceRequestSchema, async (request: any) => {
      const docsMatch = request.params.uri.match(/^magnitude:\/\/docs\/(.+)$/);
      const examplesMatch = request.params.uri.match(/^magnitude:\/\/examples\/(.+)$/);

      if (docsMatch) {
        const topic = docsMatch[1];
        return {
          contents: [
            {
              uri: request.params.uri,
              mimeType: 'text/markdown',
              text: await this.getDocumentation(topic),
            },
          ],
        };
      } else if (examplesMatch) {
        const exampleType = examplesMatch[1];
        return {
          contents: [
            {
              uri: request.params.uri,
              mimeType: 'text/markdown',
              text: await this.getExample(exampleType),
            },
          ],
        };
      }

      throw new McpError(
        ErrorCode.InvalidRequest,
        `Invalid URI format: ${request.params.uri}`
      );
    });

    this.server.setRequestHandler(ListResourcesRequestSchema, async () => ({
      resources: [
        {
          uri: 'magnitude://docs/quickstart',
          name: 'Magnitude Quickstart Guide',
          mimeType: 'text/markdown',
          description: 'Get started with Magnitude testing',
        },
        {
          uri: 'magnitude://examples/basic',
          name: 'Basic Magnitude Test Example',
          mimeType: 'text/markdown',
          description: 'Simple example of a Magnitude test case',
        },
      ],
    }));
  }

  private setupToolHandlers() {
    this.server.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: [
        {
          name: 'initialize_project',
          description: 'Initialize a new Magnitude project in the current working directory',
          inputSchema: {
            type: 'object',
            properties: {},
            additionalProperties: false,
          },
        },
        {
          name: 'create_test_case',
          description: 'Create a new Magnitude test case file',
          inputSchema: {
            type: 'object',
            properties: {
              filename: {
                type: 'string',
                description: 'Path to the test file to create',
              },
              name: {
                type: 'string',
                description: 'Name of the test case',
              },
              testCase: {
                type: 'object',
                properties: {
                  url: {
                    type: 'string',
                    description: 'URL to test',
                  },
                  steps: {
                    type: 'array',
                    items: {
                      type: 'object',
                      properties: {
                        description: {
                          type: 'string',
                          description: 'Step description',
                        },
                        checks: {
                          type: 'array',
                          items: {
                            type: 'string',
                          },
                          description: 'Checks to perform after the step',
                        },
                        testData: {
                          type: 'object',
                          properties: {
                            data: {
                              type: 'array',
                              items: {
                                type: 'object',
                                properties: {
                                  key: {
                                    type: 'string',
                                  },
                                  value: {
                                    type: 'string',
                                  },
                                  sensitive: {
                                    type: 'boolean',
                                  },
                                },
                                required: ['key', 'value', 'sensitive'],
                              },
                            },
                            other: {
                              type: 'string',
                            },
                          },
                        },
                      },
                      required: ['description', 'checks', 'testData'],
                    },
                  },
                },
                required: ['url', 'steps'],
              },
            },
            required: ['filename', 'name', 'testCase'],
          },
        },
        {
          name: 'read_test_case',
          description: 'Read an existing Magnitude test case file',
          inputSchema: {
            type: 'object',
            properties: {
              filename: {
                type: 'string',
                description: 'Path to the test file to read',
              },
            },
            required: ['filename'],
          },
        },
        {
          name: 'edit_test_case',
          description: 'Edit an existing Magnitude test case file',
          inputSchema: {
            type: 'object',
            properties: {
              filename: {
                type: 'string',
                description: 'Path to the test file to edit',
              },
              name: {
                type: 'string',
                description: 'New name for the test case',
              },
              testCase: {
                type: 'object',
                properties: {
                  url: {
                    type: 'string',
                  },
                  steps: {
                    type: 'array',
                    items: {
                      type: 'object',
                      properties: {
                        description: {
                          type: 'string',
                        },
                        checks: {
                          type: 'array',
                          items: {
                            type: 'string',
                          },
                        },
                        testData: {
                          type: 'object',
                          properties: {
                            data: {
                              type: 'array',
                              items: {
                                type: 'object',
                                properties: {
                                  key: {
                                    type: 'string',
                                  },
                                  value: {
                                    type: 'string',
                                  },
                                  sensitive: {
                                    type: 'boolean',
                                  },
                                },
                              },
                            },
                            other: {
                              type: 'string',
                            },
                          },
                        },
                      },
                    },
                  },
                },
              },
              operations: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    type: {
                      type: 'string',
                      enum: ['addStep', 'removeStep', 'editStep', 'changeUrl'],
                    },
                    index: {
                      type: 'number',
                    },
                    value: {
                      type: 'object',
                    },
                  },
                  required: ['type'],
                },
              },
            },
            required: ['filename'],
          },
        },
        {
          name: 'run_tests',
          description: 'Run Magnitude tests',
          inputSchema: {
            type: 'object',
            properties: {
              pattern: {
                type: 'string',
                description: 'Glob pattern for test files',
              },
              workers: {
                type: 'number',
                description: 'Number of parallel workers',
              },
            },
          },
        },
        {
          name: 'get_configuration',
          description: 'Get Magnitude configuration',
          inputSchema: {
            type: 'object',
            properties: {
              configPath: {
                type: 'string',
                description: 'Path to the configuration file',
              },
            },
          },
        },
        {
          name: 'update_configuration',
          description: 'Update Magnitude configuration',
          inputSchema: {
            type: 'object',
            properties: {
              configPath: {
                type: 'string',
                description: 'Path to the configuration file',
              },
              config: {
                type: 'object',
                properties: {
                  apiKey: {
                    type: 'string',
                  },
                  url: {
                    type: 'string',
                  },
                },
              },
            },
            required: ['config'],
          },
        },
      ],
    }));

    this.server.setRequestHandler(CallToolRequestSchema, async (request: any) => {
      console.error(`[Tool] Calling tool: ${request.params.name}`);
      
      try {
        switch (request.params.name) {
          case 'initialize_project':
            return await this.initializeProject();
          case 'create_test_case':
            return await this.createTestCase(request.params.arguments);
          case 'read_test_case':
            return await this.readTestCase(request.params.arguments);
          case 'edit_test_case':
            return await editTestCase(request.params.arguments);
          case 'run_tests':
            return await runTests(request.params.arguments);
          case 'get_configuration':
            return await getConfiguration(request.params.arguments);
          case 'update_configuration':
            return await updateConfiguration(request.params.arguments);
          default:
            throw new McpError(
              ErrorCode.MethodNotFound,
              `Unknown tool: ${request.params.name}`
            );
        }
      } catch (error) {
        console.error(`[Error] Tool execution failed: ${error}`);
        if (error instanceof McpError) {
          throw error;
        }
        throw new McpError(
          ErrorCode.InternalError,
          `Tool execution failed: ${error}`
        );
      }
    });
  }

  private async getDocumentation(topic: string): Promise<string> {
    // In a real implementation, this would fetch documentation from a database or file system
    const docs: Record<string, string> = {
      'quickstart': `# Magnitude Quickstart Guide

## Setup

First, in your codebase, install our typescript SDK for creating and running Magnitude test cases.

\`\`\`
npm install magnitude-test
\`\`\`

Then to setup a Magnitude tests directory, run:

\`\`\`
npx magnitude init
\`\`\`

This will create a basic tests directory \`tests/magnitude\` with:

* \`magnitude.config.ts\`: Magnitude test configuration file
* \`example.mag.ts\`: An example test file

## Run Tests

Before you can start running Magnitude tests, you'll need to generate your API key.
To do so, head to the [Magnitude Dashboard](https://app.magnitude.run/signup) and sign up, then go to Settings and create a key.

Once you do that, you can add it to an environment variable \`MAGNITUDE_API_KEY\`, or initialize in your \`magnitude.config.ts\` like this:

\`\`\`typescript
import { type MagnitudeConfig } from "magnitude-test";

export default {
    url: "http://localhost:5173",
    apiKey: "your-api-key-here"
} satisfies MagnitudeConfig;
\`\`\`

To start your Magnitude tests, simply run:

\`\`\`
npx magnitude
\`\`\`

This will run all Magnitude test files discovered with the \`*.mag.ts\` pattern.`,
      'test-cases': `# Magnitude Test Cases

Each Magnitude test case navigates to a URL in a browser, executes **Test Steps** on the web application at that URL, and verifies any **Checks** along the way.

For example:

\`\`\`typescript
test('can add and remove todos')
    .step('Add a todo')
    .step('Remove the todo')
\`\`\`

A test case is designed to represent a single user flow in your web app.

## Configure Test Cases

Each test can additionally be configured with a different starting URL (defaults to configured \`baseUrl\`):

\`\`\`typescript
test('can add and remove todos', { url: "https://mytodoapp.com" })
    .step('Add a todo')
    .step('Remove the todo')
\`\`\`

## Test Steps

When you define a step, you provide a description for what Magnitude should do during that step, for example:

\`\`\`typescript
test('example')
    .step('Log in') // step description
\`\`\`

Each step should make sense on its own and describe a portion of the user flow.

## Checks

A **check** is a **natural language visual assertion** that you can add to any step in your test case.

Examples of valid checks:

* "Only 3 todos should be listed"
* "Make sure image of giraffe is visible"
* "The response from the chat bot should make sense and answer the user's question"

To actually use a check in a test case, chain it to a \`step\` like this:

\`\`\`typescript
test('example')
    .step('Log in')
        .check('Dashboard is visible')
\`\`\`

## Test Data

You can provide additional **test data** relevant to specific step like this:

\`\`\`typescript
test('example')
    .step('Log in')
        .data({ email: "foo@bar.com", password: "foo" })
        .check('Dashboard is visible')
\`\`\`

For sensitive information, use \`secureData\` instead.

\`\`\`typescript
test('example')
    .step('Log in')
        .data({ email: "foo@bar.com" })
        .secureData({ password: process.env.MY_SUPER_SECRET_PASSWORD })
        .check('Dashboard is visible')
\`\`\``,
      'running-tests': `# Running Magnitude Tests

To run your Magnitude test cases, use the CLI:

\`\`\`
npx magnitude
\`\`\`

## Test in Parallel

You can run your Magnitude tests in parallel simply by providing the \`--workers\` or \`-w\` flag with the desired number of parallel workers:

\`\`\`
npx magnitude -w 4
\`\`\`

If any Magnitude test fails, the CLI process will exit with status code 1. When deployed as part of a CI/CD pipeline e.g. with a GitHub Action, this will fail the deployment.

## Test Failures

Magnitude decides to fail a test case if either **(1) any step cannot be completed** or **(2) a check does not hold true**.

It will attempt to execute a test case according to the provided steps and only fail if there is no clear way to accomplish the test case, or if any check isn't satisfied.

## Local Access

Magnitude runs its browser and AI agent on our own infrastructure so you don't have to.

This means that to connect to a locally running server, we need to create a secure network tunnel for our remote browser to access it.

This is all handled automatically - just provide any local URL (e.g. \`localhost:3000\`) to the \`url\` field when creating a test case (or to \`baseUrl\` of config),
and when that test case is run our servers will first automatically establish a reverse tunnel to that server running on your local machine.`,
    };

    return docs[topic] || `# Documentation Not Found\n\nNo documentation found for topic: ${topic}`;
  }

  private async getExample(exampleType: string): Promise<string> {
    // In a real implementation, this would fetch examples from a database or file system
    const examples: Record<string, string> = {
      'basic': `# Basic Magnitude Test Example

\`\`\`typescript
// tests/example.mag.ts
import { test } from 'magnitude-test';

// Example URL override, defaults to configured baseUrl
test('can login with valid credentials', { url: "https://qa-bench.com" })
    .step('Log in to the app')
        .data({ username: "test-user@magnitude.run" }) // arbitrary key/values
        .secureData({ password: "test" }) // sensitive data
        .check('Can see dashboard') // natural language assertion
    .step('Create a new company')
        .data("Make up the first 2 values and use defaults for the rest")
        .check("Company added successfully");
\`\`\``,
      'advanced': `# Advanced Magnitude Test Example

\`\`\`typescript
// tests/advanced.mag.ts
import { test } from 'magnitude-test';

test.group('Authentication Tests', { url: "https://qa-bench.com" }, () => {
    test('can login with valid credentials')
        .step('Log in to the app')
            .data({ username: "test-user@magnitude.run" })
            .secureData({ password: "test" })
            .check('Can see dashboard')
        .step('Create a new company')
            .data("Make up the first 2 values and use defaults for the rest")
            .check("Company added successfully");
    
    test('shows error with invalid credentials')
        .step('Try to log in with invalid credentials')
            .data({ username: "invalid@example.com" })
            .secureData({ password: "wrong" })
            .check('Error message is displayed')
            .check('Still on login page');
})
\`\`\``,
    };

    return examples[exampleType] || `# Example Not Found\n\nNo example found for type: ${exampleType}`;
  }

  private async initializeProject(): Promise<any> {
    console.error('[Setup] Initializing Magnitude project in current directory...');
    
    try {
      // Create tests/magnitude directory
      const testsDir = path.join(process.cwd(), 'tests', 'magnitude');
      await ensureDirectoryExists(testsDir);
      
      // Create magnitude.config.ts
      const configPath = path.join(testsDir, 'magnitude.config.ts');
      const configContent = `import { type MagnitudeConfig } from "magnitude-test";

export default {
    url: "http://localhost:5173",
    apiKey: process.env.MAGNITUDE_API_KEY
} satisfies MagnitudeConfig;`;
      
      // Create example test case
      const exampleTestPath = path.join(testsDir, 'example.mag.ts');
      const exampleTestContent = `import { test } from 'magnitude-test';

test('example test')
    .step('Navigate to the home page')
        .check('Page title is visible')
    .step('Click on login button')
        .data({ username: "example@user.com" })
        .secureData({ password: "use-environment-variable-in-real-tests" })
        .check('Dashboard is visible')`;

      // Write files
      await fs.writeFile(configPath, configContent);
      await fs.writeFile(exampleTestPath, exampleTestContent);
      
      console.error('[Setup] Magnitude project initialized successfully');
      return {
        content: [
          {
            type: 'text',
            text: `Magnitude project initialized successfully in ${testsDir}

Created:
- ${configPath}
- ${exampleTestPath}

Next steps:
1. Install magnitude-test: npm install magnitude-test
2. Get an API key from https://app.magnitude.run/signup
3. Set your API key in the config file or as an environment variable
4. Run your tests with: npx magnitude`,
          },
        ],
      };
    } catch (error) {
      console.error('[Error] Failed to initialize project:', error);
      return {
        content: [
          {
            type: 'text',
            text: `Failed to initialize project: ${error}`,
          },
        ],
        isError: true,
      };
    }
  }

  private async createTestCase(args: any): Promise<any> {
    console.error('[Test] Creating test case:', args.filename);
    
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
      console.error('[Error] Failed to create test case:', error);
      return {
        content: [
          {
            type: 'text',
            text: `Failed to create test case: ${error}`,
          },
        ],
        isError: true,
      };
    }
  }

  private async readTestCase(args: any): Promise<any> {
    console.error('[Test] Reading test case:', args.filename);
    
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
            console.error('[Error] Failed to parse data:', e);
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
            console.error('[Error] Failed to parse secure data:', e);
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
      console.error('[Error] Failed to read test case:', error);
      return {
        content: [
          {
            type: 'text',
            text: `Failed to read test case: ${error}`,
          },
        ],
        isError: true,
      };
    }
  }

  async run() {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error('Magnitude MCP server running on stdio');
  }
}

const server = new MagnitudeMcpServer();
server.run().catch(console.error);
