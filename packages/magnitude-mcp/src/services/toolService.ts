import {
  CallToolRequestSchema,
  ErrorCode,
  ListToolsRequestSchema,
  McpError,
} from '@modelcontextprotocol/sdk/types.js';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { z } from 'zod';
import { logger } from '../utils/logger.js';

// Import handlers
import { initializeProject } from '../handlers/project.js';
import { runTests } from '../handlers/testRunner.js';

// Import schemas
import {
  createToolDefinition,
  toolSchemas,
  InitializeProjectInput,
  RunTestsInput,
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
    'run_tests': { 
      handler: runTests, 
      schema: toolSchemas.run_tests 
    },
  };

  // Tool definitions for MCP generated from Zod schemas
  private toolDefinitions = [
    createToolDefinition(
      toolSchemas.initialize_project,
      'initialize_project',
      'Initialize a new Magnitude project in the specified project directory'
    ),
    createToolDefinition(
      toolSchemas.run_tests,
      'run_tests',
      'Run Magnitude tests in the specified project directory'
    ),
  ];

  /**
   * Call a tool by name with arguments
   * @param name Tool name
   * @param args Tool arguments
   * @returns Tool execution result
   */
  async callTool(name: string, args: any): Promise<any> {
    logger.info(`[Tool] Calling tool: ${name}`);
    
    const toolInfo = this.toolHandlers[name];
    if (!toolInfo) {
      throw new McpError(ErrorCode.MethodNotFound, `Unknown tool: ${name}`);
    }
    
    try {
      // Validate input against schema
      const validationResult = toolInfo.schema.safeParse(args);
      
      if (!validationResult.success) {
        logger.error(`[Validation] Failed for tool ${name}:`, validationResult.error);
        throw new McpError(
          ErrorCode.InvalidParams, 
          `Invalid parameters for tool ${name}: ${validationResult.error.message}`
        );
      }
      
      // Execute handler with validated input
      return await toolInfo.handler(validationResult.data);
    } catch (error) {
      logger.error(`[Error] Tool execution failed: ${error}`);
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
    logger.info(`Registering tool handlers: ${this.toolDefinitions}`);
    server.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: this.toolDefinitions,
    }));

    server.setRequestHandler(CallToolRequestSchema, async (request: any) => {
      return this.callTool(request.params.name, request.params.arguments);
    });
  }
}
