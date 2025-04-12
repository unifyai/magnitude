import { z } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';

/**
 * Schema for initialize_project tool
 * No input parameters required
 */
export const initializeProjectSchema = z.object({}).strict();

/**
 * Schema for run_tests tool
 */
export const runTestsSchema = z.object({
  pattern: z.string().optional().describe('Glob pattern for test files'),
  workers: z.number().optional().describe('Number of parallel workers'),
}).strict();

/**
 * Helper function to convert a Zod schema to a JSON Schema for MCP compatibility
 * @param schema Zod schema
 * @param name Tool name
 * @param description Tool description
 * @returns Tool definition compatible with MCP
 */
export function createToolDefinition(schema: z.ZodType, name: string, description: string) {
  // Convert Zod schema to JSON Schema
  const inputSchema = zodToJsonSchema(schema, {
    $refStrategy: 'none',
    target: 'jsonSchema7',
  });
  
  return {
    name,
    description,
    inputSchema,
  };
}

// Map of all tool schemas
export const toolSchemas = {
  initialize_project: initializeProjectSchema,
  run_tests: runTestsSchema,
};

// Type exports derived from Zod schemas
export type InitializeProjectInput = z.infer<typeof initializeProjectSchema>;
export type RunTestsInput = z.infer<typeof runTestsSchema>;
