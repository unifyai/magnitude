import { z } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';
import {
  testCaseDefinitionSchema,
  testStepDefinitionSchema,
  magnitudeConfigSchema
} from './commonSchemas.js';

/**
 * Schema for initialize_project tool
 * No input parameters required
 */
export const initializeProjectSchema = z.object({}).strict();

/**
 * Schema for create_test_case tool
 */
export const createTestCaseSchema = z.object({
  filename: z.string().describe('Path to the test file to create'),
  name: z.string().describe('Name of the test case'),
  testCase: testCaseDefinitionSchema.describe('Test case definition'),
}).strict();

/**
 * Schema for read_test_case tool
 */
export const readTestCaseSchema = z.object({
  filename: z.string().describe('Path to the test file to read'),
}).strict();

/**
 * Schema for edit operations on test cases
 */
export const testCaseOperationSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('addStep'),
    index: z.number().optional(),
    value: testStepDefinitionSchema,
  }),
  z.object({
    type: z.literal('removeStep'),
    index: z.number(),
  }),
  z.object({
    type: z.literal('editStep'),
    index: z.number(),
    value: testStepDefinitionSchema,
  }),
  z.object({
    type: z.literal('changeUrl'),
    value: z.object({
      url: z.string().url(),
    }),
  }),
]);

/**
 * Schema for edit_test_case tool
 */
export const editTestCaseSchema = z.object({
  filename: z.string().describe('Path to the test file to edit'),
  name: z.string().optional().describe('New name for the test case'),
  testCase: testCaseDefinitionSchema.partial().optional().describe('Updated test case definition'),
  operations: z.array(testCaseOperationSchema).optional().describe('Operations to perform on the test case'),
}).strict();

/**
 * Schema for run_tests tool
 */
export const runTestsSchema = z.object({
  pattern: z.string().optional().describe('Glob pattern for test files'),
  workers: z.number().optional().describe('Number of parallel workers'),
}).strict();

/**
 * Schema for get_configuration tool
 */
export const getConfigurationSchema = z.object({
  configPath: z.string().optional().describe('Path to the configuration file'),
}).strict();

/**
 * Schema for update_configuration tool
 */
export const updateConfigurationSchema = z.object({
  configPath: z.string().optional().describe('Path to the configuration file'),
  config: magnitudeConfigSchema.describe('Configuration to update'),
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
  create_test_case: createTestCaseSchema,
  read_test_case: readTestCaseSchema,
  edit_test_case: editTestCaseSchema,
  run_tests: runTestsSchema,
  get_configuration: getConfigurationSchema,
  update_configuration: updateConfigurationSchema,
};

// Type exports derived from Zod schemas
export type InitializeProjectInput = z.infer<typeof initializeProjectSchema>;
export type CreateTestCaseInput = z.infer<typeof createTestCaseSchema>;
export type ReadTestCaseInput = z.infer<typeof readTestCaseSchema>;
export type EditTestCaseInput = z.infer<typeof editTestCaseSchema>;
export type RunTestsInput = z.infer<typeof runTestsSchema>;
export type GetConfigurationInput = z.infer<typeof getConfigurationSchema>;
export type UpdateConfigurationInput = z.infer<typeof updateConfigurationSchema>;
