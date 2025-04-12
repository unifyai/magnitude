import {
  ErrorCode,
  ListResourcesRequestSchema,
  ListResourceTemplatesRequestSchema,
  McpError,
  ReadResourceRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';

/**
 * Service for handling MCP resources
 */
export class ResourceService {
  // Documentation resource mapping
  private docs: Record<string, string> = {
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
  
  // Example resource mapping
  private examples: Record<string, string> = {
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

  /**
   * Get documentation for a topic
   * @param topic Documentation topic
   * @returns Documentation content
   */
  getDocumentation(topic: string): string {
    return this.docs[topic] || `# Documentation Not Found\n\nNo documentation found for topic: ${topic}`;
  }

  /**
   * Get example for a type
   * @param exampleType Example type
   * @returns Example content
   */
  getExample(exampleType: string): string {
    return this.examples[exampleType] || `# Example Not Found\n\nNo example found for type: ${exampleType}`;
  }

  /**
   * Register resource handlers with the server
   * @param server MCP server
   */
  registerResourceHandlers(server: Server): void {
    // Documentation resources
    server.setRequestHandler(ListResourceTemplatesRequestSchema, async () => ({
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

    server.setRequestHandler(ReadResourceRequestSchema, async (request: any) => {
      const docsMatch = request.params.uri.match(/^magnitude:\/\/docs\/(.+)$/);
      const examplesMatch = request.params.uri.match(/^magnitude:\/\/examples\/(.+)$/);

      if (docsMatch) {
        const topic = docsMatch[1];
        return {
          contents: [
            {
              uri: request.params.uri,
              mimeType: 'text/markdown',
              text: this.getDocumentation(topic),
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
              text: this.getExample(exampleType),
            },
          ],
        };
      }

      throw new McpError(
        ErrorCode.InvalidRequest,
        `Invalid URI format: ${request.params.uri}`
      );
    });

    server.setRequestHandler(ListResourcesRequestSchema, async () => ({
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
}
