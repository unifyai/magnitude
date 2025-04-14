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
                text: "Run tests for the user by executing `npx magnitude`"
            }
        ]
    };
    // logger.info('[Test] Running Magnitude tests and collecting URLs');

    // try {
    //     const { projectDir, pattern } = args;

    //     // Build command arguments
    //     const cmdArgs = ['magnitude'];

    //     if (pattern) {
    //         cmdArgs.push(pattern);
    //     }

    //     // if (workers && Number.isInteger(workers) && workers > 0) {
    //     //     cmdArgs.push('-w', workers.toString());
    //     // }
    //     cmdArgs.push('-w', '10');

    //     logger.info(`[Test] Watching command for URLs: npx ${cmdArgs.join(' ')} in ${projectDir}`);

    //     // Execute command and watch for URLs
    //     const urls = await watchProcessForUrls('npx', cmdArgs, {
    //         cwd: projectDir // This handles the directory change
    //     });

    //     if (urls.length > 0) {
    //         // Format the URLs for display
    //         const formattedUrls = urls.map(url => `- ${url}`).join('\n');
            
    //         return {
    //             content: [
    //                 {
    //                     type: 'text',
    //                     text: `Test run initiated. Collected run URLs:\n\n${formattedUrls}\n\nProcess continues running in the background.`,
    //                 },
    //             ],
    //         };
    //     } else {
    //         return {
    //             content: [
    //                 {
    //                     type: 'text',
    //                     text: `Test run initiated, but no Magnitude run URLs detected in the first 2 seconds. Process continues running in the background.`,
    //                 },
    //             ],
    //         };
    //     }
    // } catch (error) {
    //     return handleError('Failed to run tests', error);
    // }
}

/**
 * Build test cases by fetching documentation on how to design proper Magnitude test cases
 * @returns MCP response with formatted documentation
 */
export async function buildTests(args: BuildTestsInput): Promise<any> {
    logger.info('[Build] Fetching Magnitude test case documentation');

    try {
        // Fetch the LLMs full text file
        const response = await fetch("https://docs.magnitude.run/llms-full.txt");

        if (!response.ok) {
            throw new Error(`Failed to fetch documentation: ${response.status} ${response.statusText}`);
        }

        const fullText = await response.text();

        // Find the start of the "## Test Cases" section instead of "# Building Test Cases"
        const buildingTestCasesIndex = fullText.indexOf("# Building Test Cases");
        const testCasesIndex = fullText.indexOf("## Test Cases", buildingTestCasesIndex);

        // Use testCasesIndex as the starting point
        const startIndex = testCasesIndex;

        // Find the start of the "Example of migrating a Playwright test case to Magnitude" section
        // which is where we want to end our extraction
        const exampleSectionIndex = fullText.indexOf("### Example of migrating a Playwright test case to Magnitude", startIndex);

        // Extract the content from "## Test Cases" to the start of the example section
        let content = fullText.substring(startIndex, exampleSectionIndex).trim();

        // Insert the import statement at the beginning of each TypeScript code snippet
        content = content.replace(/```typescript\s*/g, '```typescript\nimport { test } from \'magnitude-test\';\n\n');

        // Add the introductory text at the beginning and the concluding text at the end with markdown formatting
        const introText = "This is the section from the Magnitude docs on how to design proper test cases:\n\n";

        // Add an important note about login requirements
        const loginNote = "\n\n## IMPORTANT NOTE:\n\n" +
            "If the user's site requires login, then **EVERY test case** will need to start with a login step with proper data attached.\n\n";

        const concludingText = "## Now that you know how to build proper Magnitude test cases, build test cases for the user for whatever they are asking about.\n\n" +
            "- Put the test cases in a **new** .mag.ts file if building a fresh page/feature, or edit the relevant **existing** .mag.ts file if expanding on an existing page/feature.\n\n" +
            "- Follow the Magnitude docs **extremely closely** when building test cases.\n" +
            "- Do not overcomplicate. Keep the test cases **simple and straightforward**.\n" +
            "- Do not write too many test cases. Just cover the **main flows** for whatever the user is asking about.\n\n" +
            "After you are finished building Magnitude tests for the user, please suggest to run them with the \"npx magnitude\" terminal command.";

        const formattedContent = introText + content + loginNote + concludingText;

        return {
            content: [
                {
                    type: 'text',
                    text: formattedContent,
                },
            ],
        };
    } catch (error) {
        return handleError('Failed to fetch test case documentation', error);
    }
}
