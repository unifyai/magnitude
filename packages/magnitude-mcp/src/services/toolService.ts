import {
  CallToolRequestSchema,
  ErrorCode,
  ListToolsRequestSchema,
  McpError,
} from '@modelcontextprotocol/sdk/types.js';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';

// Import handlers
import { initializeProject } from '../handlers/project.js';
import { createTestCase, readTestCase, editTestCase } from '../handlers/testCase.js';
import { runTests } from '../handlers/testRunner.js';
import { getConfiguration, updateConfiguration } from '../handlers/config.js';

/**
 * Service for handling MCP tools
 */
export class ToolService {
  // Tool handler mapping
  private toolHandlers: Record<string, Function> = {
    'initialize_project': initializeProject,
    'create_test_case': createTestCase,
    'read_test_case': readTestCase,
    'edit_test_case': editTestCase,
    'run_tests': runTests,
    'get_configuration': getConfiguration,
    'update_configuration': updateConfiguration,
  };

  // Tool definitions for MCP
  private toolDefinitions = [
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
  ];

  /**
   * Call a tool by name with arguments
   * @param name Tool name
   * @param args Tool arguments
   * @returns Tool execution result
   */
  async callTool(name: string, args: any): Promise<any> {
    console.error(`[Tool] Calling tool: ${name}`);
    
    const handler = this.toolHandlers[name];
    if (!handler) {
      throw new McpError(ErrorCode.MethodNotFound, `Unknown tool: ${name}`);
    }
    
    try {
      return await handler(args);
    } catch (error) {
      console.error(`[Error] Tool execution failed: ${error}`);
      if (error instanceof McpError) {
        throw error;
      }
      throw new McpError(ErrorCode.InternalError, `Tool execution failed: ${error}`);
    }
  }

  /**
   * Register tool handlers with the server
   * @param server MCP server
   */
  registerToolHandlers(server: Server): void {
    server.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: this.toolDefinitions,
    }));

    server.setRequestHandler(CallToolRequestSchema, async (request: any) => {
      return this.callTool(request.params.name, request.params.arguments);
    });
  }
}
