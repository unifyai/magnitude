/**
 * Entry in test data
 */
export interface TestDataEntry {
  key: string;
  value: string;
  sensitive: boolean;
}

/**
 * Test data for a step
 */
export interface TestData {
  data?: TestDataEntry[];
  other?: string;
}

/**
 * Definition of a test step
 */
export interface TestStepDefinition {
  description: string;
  checks: string[];
  testData: TestData;
}

/**
 * Definition of a test case
 */
export interface TestCaseDefinition {
  url: string;
  steps: TestStepDefinition[];
}

/**
 * Magnitude configuration
 */
export type MagnitudeConfig = {
  apiKey?: string;
  url?: string;
};
