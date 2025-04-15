import { executeCliCommand, handleError, watchProcessForUrls } from './utils/cliUtils.js';
import { logger } from './utils/logger.js';
import { InitializeProjectInput, RunTestsInput, BuildTestsInput } from './schemas.js';

/**
 * Initialize a new Magnitude project
 * @param args Arguments for initializing project
 * @returns MCP response
 */
export async function initProject(args: InitializeProjectInput): Promise<any> {
    const { projectDir } = args;
    logger.info('[Setup] Initializing Magnitude project...');

    try {
        // Use the Magnitude CLI with spawn approach
        const installOutput = await executeCliCommand('npm', ['install', 'magnitude-test'], { cwd: projectDir });
        const initOutput = await executeCliCommand('npx', ['magnitude', 'init'], { cwd: projectDir });

        logger.info('[Setup] Magnitude project initialized successfully');

        return {
            content: [
                {
                    type: 'text',
                    text: `${installOutput}\n\n${initOutput}\nMagnitude project initialized successfully.`,
                },
            ],
        };
    } catch (error) {
        return handleError('Failed to initialize project', error);
    }
}

const runTestsInstructions = `
Run tests for the user by executing 'npx magnitude'

Usage: npx magnitude [options] [command] [filter]

Run Magnitude test cases

Arguments:
  filter                  glob pattern for test files (quote if contains spaces or wildcards)

Options:
  -w, --workers <number>  number of parallel workers for test execution (default: "1")
  -p, --plain             disable pretty output and use logs
  -l, --local             run agent locally (requires Playwright and LLM provider configuration)
  -t, --tunnel            (remote mode only) force enable HTTP tunneling regardless of whether
                          target URL appears local/private
  -r, --remote <url>      specify a custom remote runner
  -k, --key <apiKey>      provide API key
  -h, --help              display help for command

Run tests according to the user's query using this CLI and appropriate options.

When using directly after a build_tests tool call, run just the new or updated test files using a glob pattern.
`

/**
 * Run Magnitude tests and collect URLs from stdout
 * @param args Arguments for running tests
 * @returns MCP response with collected URLs
 */
export async function runTests(args: RunTestsInput): Promise<any> {
    return {
        content: [
            {
                type: 'text',
                text: runTestsInstructions
            }
        ]
    };
}

const buildTestInstructions = `
The following instructions will guide you on how to build effective test cases in Magnitude.

Magnitude is a test framework for writing test cases in *natural language*.

## Syntax
Example test case:
\`\`\`ts
import { test } from 'magnitude-test';

test('can log in')
    .step('Log in')
        .data({ email: "foo@bar.com", password: "foo" })
        .check('Dashboard is visible')
\`\`\`

Notice that it appears more like a DSL than plain typescript.

Every test case begins with test('<what it is testing>').
Then attach steps with .step('<description of what to do in the browser>')
Each step can have:
.check('<visual assertion>')
.data('<freeform description of data>') or
.data({ arbitraryKey: arbitraryValue }) or
.secureData({ arbitraryKey: arbitraryValue }) (for sensitive fields)

check/data/secureData must ALWAYS follow a step, they cannot be attached to the test directly.

Tests can have multiple steps, but you should separate distinct flows into their own tests.

## Style
You should indent steps one level and check/data/secureData two levels. Always follow this style.

## Test Management
Put the test cases in a **new** .mag.ts file if building a fresh page/feature, or edit the relevant **existing** .mag.ts file if expanding on an existing page/feature.

Put related tests in a test.group like this:
\`\`\`ts
import { test } from 'magnitude-test';

test.group('authentication tests', () => {
    test('can log in')
        .step('Log in')
            .data({ email: "foo@bar.com", password: "foo" })
            .check('Dashboard is visible')
    
    test('can sign up')
        .step('Sign up for a new account')
            .data({ email: "foo@bar.com", password: "foo" })
            .check('Profile page is visible')
})
\`\`\`

Unless otherwise specified by the user, only cover the main flows of the page or feature.
Tests should be minimalistic.

## Designing tests
- Keep tests short (a few steps)
- Group related tests with test.group
- Checks should be simple and direct
- Do not add more checks than necessary, only enough to generally verify functionality
- Every test MUST have at least one step. Each check MUST ALWAYS belong to a step.

Now comply with the user's instructions using these building principles.
`;

/**
 * Build test cases by fetching documentation on how to design proper Magnitude test cases
 * @returns MCP response with formatted documentation
 */
export async function buildTests(args: BuildTestsInput): Promise<any> {
    logger.info('[Build] Fetching Magnitude test case documentation');

    return {
        content: [
            {
                type: 'text',
                text: buildTestInstructions
            }
        ]
    }
}
