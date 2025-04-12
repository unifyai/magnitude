import {
  CallToolRequestSchema,
  ErrorCode,
  ListToolsRequestSchema,
  McpError,
} from '@modelcontextprotocol/sdk/types.js';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { z } from 'zod';

// Import handlers
import { initializeProject } from '../handlers/project.js';
import { createTestCase, readTestCase, editTestCase } from '../handlers/testCase.js';
import { runTests } from '../handlers/testRunner.js';
import { getConfiguration, updateConfiguration } from '../handlers/config.js';

// Import schemas
import {
  createToolDefinition,
  toolSchemas,
  InitializeProjectInput,
  CreateTestCaseInput,
  ReadTestCaseInput,
  EditTestCaseInput,
  RunTestsInput,
  GetConfigurationInput,
  UpdateConfigurationInput,
} from '../schemas/toolSchemas.js';

/**
 * Service for handling MCP tools
 */
export class ToolService {
  // Tool handler mapping with type-safe input validation
  private toolHandlers: Record<string, { handler: Function; schema: z.ZodType }> = {
    'initialize_project': { 
      handler: initializeProject, 
      schema: toolSchemas.initialize_project 
    },
    'create_test_case': { 
      handler: createTestCase, 
      schema: toolSchemas.create_test_case 
    },
    'read_test_case': { 
      handler: readTestCase, 
      schema: toolSchemas.read_test_case 
    },
    'edit_test_case': { 
      handler: editTestCase, 
      schema: toolSchemas.edit_test_case 
    },
    'run_tests': { 
      handler: runTests, 
      schema: toolSchemas.run_tests 
    },
    'get_configuration': { 
      handler: getConfiguration, 
      schema: toolSchemas.get_configuration 
    },
    'update_configuration': { 
      handler: updateConfiguration, 
      schema: toolSchemas.update_configuration 
    },
  };

  // Tool definitions for MCP generated from Zod schemas
  private toolDefinitions = [
    createToolDefinition(
      toolSchemas.initialize_project,
      'initialize_project',
      'Initialize a new Magnitude project in the current working directory'
    ),
    createToolDefinition(
      toolSchemas.create_test_case,
      'create_test_case',
      'Create a new Magnitude test case file'
    ),
    createToolDefinition(
      toolSchemas.read_test_case,
      'read_test_case',
      'Read an existing Magnitude test case file'
    ),
    createToolDefinition(
      toolSchemas.edit_test_case,
      'edit_test_case',
      'Edit an existing Magnitude test case file'
    ),
    createToolDefinition(
      toolSchemas.run_tests,
      'run_tests',
      'Run Magnitude tests'
    ),
    createToolDefinition(
      toolSchemas.get_configuration,
      'get_configuration',
      'Get Magnitude configuration'
    ),
    createToolDefinition(
      toolSchemas.update_configuration,
      'update_configuration',
      'Update Magnitude configuration'
    ),
  ];

  /**
   * Call a tool by name with arguments
   * @param name Tool name
   * @param args Tool arguments
   * @returns Tool execution result
   */
  async callTool(name: string, args: any): Promise<any> {
    console.error(`[Tool] Calling tool: ${name}`);
    
    const toolInfo = this.toolHandlers[name];
    if (!toolInfo) {
      throw new McpError(ErrorCode.MethodNotFound, `Unknown tool: ${name}`);
    }
    
    try {
      // Validate input against schema
      const validationResult = toolInfo.schema.safeParse(args);
      
      if (!validationResult.success) {
        console.error(`[Validation] Failed for tool ${name}:`, validationResult.error);
        throw new McpError(
          ErrorCode.InvalidParams, 
          `Invalid parameters for tool ${name}: ${validationResult.error.message}`
        );
      }
      
      // Execute handler with validated input
      return await toolInfo.handler(validationResult.data);
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
