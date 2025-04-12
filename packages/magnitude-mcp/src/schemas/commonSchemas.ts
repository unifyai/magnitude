import { z } from 'zod';

/**
 * Zod schema for test data entry
 */
export const testDataEntrySchema = z.object({
  key: z.string().describe('Key for the test data entry'),
  value: z.string().describe('Value for the test data entry'),
  sensitive: z.boolean().describe('Whether the data is sensitive'),
});

/**
 * Zod schema for test data
 */
export const testDataSchema = z.object({
  data: z.array(testDataEntrySchema).optional().describe('Array of test data entries'),
  other: z.string().optional().describe('Additional test data information'),
});

/**
 * Zod schema for test step definition
 */
export const testStepDefinitionSchema = z.object({
  description: z.string().describe('Step description'),
  checks: z.array(z.string()).describe('Checks to perform after the step'),
  testData: testDataSchema.describe('Test data for the step'),
});

/**
 * Zod schema for test case definition
 */
export const testCaseDefinitionSchema = z.object({
  url: z.string().url().describe('URL to test'),
  steps: z.array(testStepDefinitionSchema).describe('Test steps to perform'),
});

/**
 * Zod schema for Magnitude configuration
 */
export const magnitudeConfigSchema = z.object({
  apiKey: z.string().optional().describe('API key for Magnitude'),
  url: z.string().url().optional().describe('URL for Magnitude API'),
});

// Type exports derived from Zod schemas
export type TestDataEntry = z.infer<typeof testDataEntrySchema>;
export type TestData = z.infer<typeof testDataSchema>;
export type TestStepDefinition = z.infer<typeof testStepDefinitionSchema>;
export type TestCaseDefinition = z.infer<typeof testCaseDefinitionSchema>;
export type MagnitudeConfig = z.infer<typeof magnitudeConfigSchema>;
