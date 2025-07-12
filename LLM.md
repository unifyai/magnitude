# Magnitude - Vision-First Browser Automation Framework

## Overview
Magnitude is a comprehensive browser automation framework that uses vision AI to control browsers with natural language. It provides a complete ecosystem for browser automation, testing, data extraction, and agent development.

**Key Features:**
- 🧠 Vision-first architecture using visually grounded LLMs
- 🖱️ Precise pixel-coordinate based interactions
- 🔍 Intelligent structured data extraction
- ✅ Built-in test runner with visual assertions
- 🏗️ Modular architecture with multiple specialized packages

## Package Ecosystem

### 1. magnitude-core
**Primary browser automation engine**
- **Import**: `import { Agent, BrowserAgent, startBrowserAgent } from 'magnitude-core'`
- **Purpose**: Core agent functionality, browser interaction, action system
- **Version**: 0.2.20

### 2. magnitude-test
**Testing framework for automated UI testing**
- **Import**: `import { test } from 'magnitude-test'`
- **Purpose**: Test runner, CLI, parallel execution, visual assertions
- **Version**: 0.2.21

### 3. magnitude-extract
**DOM cleaning and structured data extraction**
- **Import**: `import { partitionHtml, serializeToMarkdown } from 'magnitude-extract'`
- **Purpose**: HTML parsing, element classification, markdown conversion
- **Version**: 0.0.2

### 4. magnitude-mcp
**Model Context Protocol server**
- **Binary**: `magnitude-mcp`
- **Purpose**: MCP integration for AI assistants
- **Version**: 0.0.4

### 5. create-magnitude-app
**Project scaffolding tool**
- **Binary**: `npx create-magnitude-app`
- **Purpose**: Interactive project setup and configuration
- **Version**: 0.0.6


## Core API Reference

### magnitude-core Package

#### Agent Class
```typescript
import { Agent } from 'magnitude-core';

// Constructor
const agent = new Agent({
    llm: LLMClient,           // Required: LLM configuration
    connectors?: AgentConnector[],  // Optional: Custom connectors
    actions?: ActionDefinition[],   // Optional: Custom actions
    prompt?: string,          // Optional: System prompt
    telemetry?: boolean       // Optional: Enable telemetry
});

// Core Methods
await agent.start()                    // Initialize agent
await agent.act(task: string)          // Execute natural language task
await agent.exec(action: Action)       // Execute specific action
agent.getConnector<T>(type)           // Get connector instance
agent.require<T>(type)                // Get required connector

// Properties
agent.events                          // EventEmitter for lifecycle events
agent.memory                          // Current task memory
```

#### BrowserAgent Class
```typescript
import { BrowserAgent, startBrowserAgent } from 'magnitude-core';

// Factory function (recommended)
const browserAgent = await startBrowserAgent({
    // Agent options
    llm: { provider: 'anthropic', options: { model: 'claude-3-5-sonnet-20241022' }},
    prompt?: string,
    telemetry?: boolean,
    
    // Browser options
    url?: string,
    browser?: BrowserOptions,
    grounding?: GroundingClient,
    virtualScreenDimensions?: { width: number, height: number },
    
    // Additional options
    narrate?: boolean         // Enable action narration
});

// Core Methods
await browserAgent.nav(url: string)    // Navigate to URL
await browserAgent.act(task: string)   // Execute browser task
const data = await browserAgent.extract(instructions: string, schema: ZodSchema)  // Extract structured data

// Browser Access
browserAgent.page                     // Playwright Page instance
browserAgent.context                  // Playwright BrowserContext
```

#### Action System
```typescript
import { createAction } from 'magnitude-core';
import { z } from 'zod';

// Create custom action
const customAction = createAction({
    name: 'custom:action',
    description: 'Performs custom operation',
    schema: z.object({
        input: z.string(),
        options: z.object({ flag: z.boolean() }).optional()
    }),
    resolver: async ({ input, agent }) => {
        // Implementation logic
        return `Result: ${input.input}`;
    },
    render: (action) => `Executing: ${action.input}`
});

// Built-in task actions
// 'task:done' - Mark task complete
// 'task:fail' - Mark task failed
```

#### LLM Configuration
```typescript
// Anthropic (Recommended)
const llm = {
    provider: 'anthropic',
    options: {
        model: 'claude-3-5-sonnet-20241022',
        apiKey: process.env.ANTHROPIC_API_KEY,
        temperature: 0.1,
        promptCaching: true
    }
};

// Google AI
const llm = {
    provider: 'google-ai',
    options: {
        model: 'gemini-2.5-pro-preview-05-06',
        apiKey: process.env.GOOGLE_API_KEY,
        temperature: 0.1
    }
};

// OpenAI
const llm = {
    provider: 'openai',
    options: {
        model: 'gpt-4o',
        apiKey: process.env.OPENAI_API_KEY,
        temperature: 0.1
    }
};
```

#### Memory and Observations
```typescript
// Create observations
const obs = Observation.fromConnector('browser', content);
const thoughtObs = Observation.fromThought('Planning next action');
const actionObs = Observation.fromActionTaken('click', 'Clicked button');

// Memory management
const memory = new AgentMemory({
    instructions: 'Complete the task',
    promptCaching: true,
    thoughtLimit: 10
});
```


### magnitude-test Package

#### Test Declaration
```typescript
import { test } from 'magnitude-test';

// Basic test
test('test description', async (agent) => {
    await agent.act('perform action');
    await agent.check('verify condition');
});

// Test with URL override
test('test with custom URL', { url: 'https://example.com' }, async (agent) => {
    await agent.act('navigate and interact');
    await agent.check('verify result');
});

// Grouped tests
test.group('Feature Group', { url: 'https://app.example.com' }, () => {
    test('first test', async (agent) => {
        // Test implementation
    });
    
    test('second test', async (agent) => {
        // Test implementation
    });
});
```

#### Test Configuration
```typescript
// magnitude.config.ts
import { type MagnitudeConfig } from 'magnitude-test';

export default {
    url: "http://localhost:3000",           // Base URL for tests
    llm: {                                  // LLM configuration
        provider: 'anthropic',
        options: {
            model: 'claude-3-5-sonnet-20241022',
            apiKey: process.env.ANTHROPIC_API_KEY
        }
    },
    webServer: {                           // Optional: Start dev server
        command: 'npm run dev',
        url: 'http://localhost:3000',
        timeout: 30000,
        reuseExistingServer: true
    },
    browser: {                             // Browser options
        headless: false,
        slowMo: 100
    },
    grounding: {                           // Vision model for element detection
        provider: 'moondream',
        options: { baseUrl: 'http://localhost:8000' }
    },
    telemetry: false,                      // Disable analytics
    display: {
        showActions: true                   // Show actions in output
    }
} satisfies MagnitudeConfig;
```

#### CLI Usage
```bash
# Run all tests
npx magnitude

# Run specific test files
npx magnitude "**/login.mag.ts"

# Run with multiple workers
npx magnitude --workers 4

# Run with debug output
npx magnitude --debug

# Run with plain output (no colors)
npx magnitude --plain
```

#### TestCaseAgent API
```typescript
// TestCaseAgent extends BrowserAgent with additional methods
interface TestCaseAgent extends BrowserAgent {
    // Visual assertion method
    check(description: string): Promise<void>;
    
    // Event emitter for check lifecycle
    checkEvents: EventEmitter<{
        'checkStarted': (check: string) => void;
        'checkDone': (check: string, passed: boolean) => void;
    }>;
}
```


### magnitude-extract Package

#### HTML Partitioning
```typescript
import { partitionHtml, serializeToMarkdown } from 'magnitude-extract';

// Quick partitioning
const result = partitionHtml(html, {
    skipNavigation: true,        // Skip nav elements
    skipHeaders: true,           // Skip header/footer
    extractTables: true,         // Extract table data
    extractImages: true,         // Extract image metadata
    extractForms: true,          // Extract form fields
    extractLinks: true,          // Extract link data
    minTextLength: 5,           // Minimum text length
    includeCoordinates: true,    // Include element positions
    includeOriginalHtml: true    // Preserve original HTML
});

// Convert to markdown
const markdown = serializeToMarkdown(result, {
    includeMetadata: true,       // Include element metadata
    includeElementIds: true,     // Include unique IDs
    includePageNumbers: true,    // Include page indicators
    preserveHierarchy: true,     // Maintain document structure
    includeFormFields: true,     // Include form field data
    includeImageMetadata: true   // Include image details
});
```

#### Advanced Usage
```typescript
import { DOMPartitioner, DOMCleaner, ElementClassifier, MarkdownSerializer } from 'magnitude-extract';

// Custom partitioning pipeline
const cleaner = new DOMCleaner({ skipNavigation: true });
const classifier = new ElementClassifier();
const partitioner = new DOMPartitioner({ extractTables: true });
const serializer = new MarkdownSerializer({ includeMetadata: true });

const result = partitioner.partition(html);
const markdown = serializer.serialize(result);
```

#### Element Types
```typescript
enum ElementType {
    // Text elements
    TITLE, NARRATIVE_TEXT, TEXT, PARAGRAPH, ABSTRACT, CAPTION,
    
    // Lists
    LIST, LIST_ITEM, BULLETED_TEXT,
    
    // Structure
    HEADER, FOOTER, SECTION_HEADER, HEADLINE, SUB_HEADLINE,
    
    // Media
    IMAGE, PICTURE, FIGURE, TABLE,
    
    // Forms
    FORM, FIELD_NAME, VALUE, CHECK_BOX_CHECKED, CHECK_BOX_UNCHECKED,
    RADIO_BUTTON_CHECKED, RADIO_BUTTON_UNCHECKED,
    
    // Code and links
    CODE_SNIPPET, FORMULA, LINK, NAVIGATION
}
```

#### CLI Tool
```bash
# Extract from URL
unstructured-ts https://example.com --output result.md

# With options
unstructured-ts https://example.com \
    --include-metadata \
    --include-page-numbers \
    --no-images \
    --min-text-length 10 \
    --verbose
```


### magnitude-mcp Package

#### MCP Server
```bash
# Start MCP server
magnitude-mcp

# Use with MCP inspector
npx @modelcontextprotocol/inspector magnitude-mcp
```

#### Available Tools
```typescript
// Initialize Magnitude in a project
{
    "name": "magnitude_init_project",
    "description": "Initialize Magnitude testing in a Node.js project",
    "inputSchema": {
        "type": "object",
        "properties": {
            "projectDir": {
                "type": "string",
                "description": "Absolute path to the Node.js project directory"
            }
        },
        "required": ["projectDir"]
    }
}

// Get test running instructions
{
    "name": "magnitude_run_tests",
    "description": "Get instructions for running Magnitude tests"
}

// Get test building instructions
{
    "name": "magnitude_build_tests",
    "description": "Get detailed instructions for writing Magnitude test cases"
}
```

### create-magnitude-app Package

#### Interactive Setup
```bash
# Create new project
npx create-magnitude-app

# Create with specific name
npx create-magnitude-app my-automation-project
```

#### Supported Configurations
- **LLM Models**: Claude Sonnet 4, Qwen 2.5 VL 72B
- **Providers**: Anthropic, Claude Code, OpenRouter
- **Assistants**: Cursor, Cline, Claude Code, Gemini CLI, Windsurf
- **Package Managers**: bun, pnpm, yarn, deno, npm


## Usage Patterns

### Basic Browser Automation
```typescript
import { startBrowserAgent } from 'magnitude-core';

const agent = await startBrowserAgent({
    llm: {
        provider: 'anthropic',
        options: {
            model: 'claude-3-5-sonnet-20241022',
            apiKey: process.env.ANTHROPIC_API_KEY
        }
    },
    url: 'https://example.com',
    narrate: true  // Enable action descriptions
});

// Navigate and interact
await agent.nav('https://app.example.com');
await agent.act('Fill out the contact form with my details');

// Extract structured data
const contacts = await agent.extract(
    'Get all contact information from the page',
    z.array(z.object({
        name: z.string(),
        email: z.string().email(),
        phone: z.string().optional()
    }))
);

console.log('Extracted contacts:', contacts);
```

### Testing Web Applications
```typescript
// tests/magnitude/login.mag.ts
import { test } from 'magnitude-test';

test.group('Authentication', { url: 'https://app.example.com' }, () => {
    test('successful login', async (agent) => {
        await agent.act('Click the login button');
        await agent.act('Enter email "user@example.com" and password "password123"');
        await agent.act('Submit the login form');
        await agent.check('User is successfully logged in and redirected to dashboard');
    });
    
    test('invalid credentials', async (agent) => {
        await agent.act('Click the login button');
        await agent.act('Enter invalid credentials');
        await agent.act('Submit the login form');
        await agent.check('Error message is displayed for invalid credentials');
    });
});
```

### Data Extraction Pipeline
```typescript
import { partitionHtml, serializeToMarkdown } from 'magnitude-extract';
import { startBrowserAgent } from 'magnitude-core';

const agent = await startBrowserAgent({ /* config */ });

// Navigate to target page
await agent.nav('https://news.example.com');

// Get page HTML
const html = await agent.page.content();

// Extract structured content
const result = partitionHtml(html, {
    extractTables: true,
    extractImages: true,
    skipNavigation: true,
    minTextLength: 10
});

// Convert to markdown
const markdown = serializeToMarkdown(result, {
    includeMetadata: true,
    preserveHierarchy: true
});

// Use agent for intelligent extraction
const articles = await agent.extract(
    'Extract all news articles with their metadata',
    z.array(z.object({
        title: z.string(),
        summary: z.string(),
        author: z.string().optional(),
        publishDate: z.string().optional(),
        category: z.string().optional()
    }))
);
```

### Custom Actions
```typescript
import { createAction, Agent } from 'magnitude-core';
import { z } from 'zod';

// Create custom action for API integration
const apiAction = createAction({
    name: 'api:create-user',
    description: 'Create a new user via API',
    schema: z.object({
        name: z.string(),
        email: z.string().email(),
        role: z.enum(['admin', 'user'])
    }),
    resolver: async ({ input, agent }) => {
        const response = await fetch('/api/users', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(input)
        });
        
        if (!response.ok) {
            throw new Error(`API error: ${response.statusText}`);
        }
        
        const user = await response.json();
        return `Created user: ${user.name} (${user.id})`;
    }
});

// Use custom action
const agent = new Agent({
    llm: { /* config */ },
    actions: [apiAction]
});

await agent.start();
await agent.act('Create a new admin user named John Doe with email john@example.com');
```


## Advanced Configuration

### Browser Options
```typescript
const browserOptions = {
    browser: {
        headless: false,           // Show browser window
        slowMo: 100,              // Slow down actions
        devtools: true,           // Open DevTools
        args: ['--start-maximized'], // Chrome arguments
        viewport: { width: 1920, height: 1080 }
    },
    virtualScreenDimensions: { width: 1920, height: 1080 },
    minScreenshots: 3,         // Minimum screenshots for context
    grounding: {               // Vision model configuration
        provider: 'moondream',
        options: { baseUrl: 'http://localhost:8000' }
    }
};
```

### Memory Management
```typescript
const memoryOptions = {
    instructions: 'You are a helpful automation assistant',
    promptCaching: true,       // Enable prompt caching for efficiency
    thoughtLimit: 10          // Limit internal thoughts
};

const agent = new Agent({
    llm: { /* config */ },
    memory: memoryOptions
});
```

### Event Handling
```typescript
const agent = new Agent({ /* config */ });

// Listen to agent events
agent.events.on('started', () => {
    console.log('Agent started');
});

agent.events.on('actionTaken', (action) => {
    console.log('Action taken:', action.name);
});

agent.events.on('error', (error) => {
    console.error('Agent error:', error);
});

// For test agents
const testAgent = await startTestCaseAgent({ /* config */ });

testAgent.checkEvents.on('checkStarted', (description) => {
    console.log('Starting check:', description);
});

testAgent.checkEvents.on('checkDone', (description, passed) => {
    console.log(`Check ${passed ? 'passed' : 'failed'}:`, description);
});
```

### Connector System
```typescript
import { AgentConnector, BrowserConnector } from 'magnitude-core';

// Custom connector
class DatabaseConnector implements AgentConnector {
    id = 'database';
    
    async onStart() {
        // Initialize database connection
    }
    
    async onStop() {
        // Cleanup database connection
    }
    
    getActionSpace() {
        return [/* custom database actions */];
    }
    
    async collectObservations() {
        // Return database state observations
        return [];
    }
}

const agent = new Agent({
    llm: { /* config */ },
    connectors: [
        new BrowserConnector({ url: 'https://example.com' }),
        new DatabaseConnector()
    ]
});
```


## Best Practices

### 1. Task Decomposition
```typescript
// ❌ Too vague
await agent.act('Complete the entire checkout process');

// ✅ Clear, specific steps
await agent.act('Add the blue t-shirt to cart');
await agent.act('Navigate to checkout page');
await agent.act('Fill in shipping address');
await agent.act('Select express shipping');
await agent.act('Complete payment with saved card');
```

### 2. Effective Data Extraction
```typescript
// ❌ Unclear schema
const data = await agent.extract('Get product info', z.object({
    info: z.string()
}));

// ✅ Detailed, structured schema
const products = await agent.extract(
    'Extract all product information from the current page',
    z.array(z.object({
        name: z.string().describe('Product name'),
        price: z.number().describe('Price in USD'),
        rating: z.number().min(0).max(5).describe('Star rating out of 5'),
        availability: z.enum(['in-stock', 'out-of-stock', 'limited']),
        description: z.string().optional().describe('Product description'),
        imageUrl: z.string().url().optional().describe('Product image URL')
    }))
);
```

### 3. Robust Testing
```typescript
// ❌ Weak assertions
test('login works', async (agent) => {
    await agent.act('login');
    await agent.check('it worked');
});

// ✅ Specific, verifiable assertions
test('successful login redirects to dashboard', async (agent) => {
    await agent.act('Enter valid credentials and submit login form');
    await agent.check('URL contains "/dashboard" and welcome message is visible');
    await agent.check('Navigation menu shows user profile dropdown');
    await agent.check('Page title is "Dashboard - MyApp"');
});
```

### 4. Error Handling
```typescript
// ❌ No error handling
await agent.act('Submit form');

// ✅ Graceful error handling
try {
    await agent.act('Submit the contact form');
    await agent.check('Success message is displayed');
} catch (error) {
    console.error('Form submission failed:', error);
    // Take screenshot for debugging
    await agent.page.screenshot({ path: 'error-screenshot.png' });
    throw error;
}
```

### 5. Performance Optimization
```typescript
// ❌ Sequential operations
for (const url of urls) {
    await agent.nav(url);
    const data = await agent.extract(/* ... */);
}

// ✅ Parallel processing where possible
const results = await Promise.all(
    urls.map(async (url) => {
        const agent = await startBrowserAgent({ /* config */ });
        await agent.nav(url);
        return agent.extract(/* ... */);
    })
);
```

## Troubleshooting

### Common Issues

1. **Element Not Found**
   - Use more descriptive language: "Click the blue 'Submit' button in the bottom right"
   - Wait for elements: "Wait for the loading spinner to disappear, then click submit"

2. **Slow Performance**
   - Enable prompt caching: `promptCaching: true`
   - Reduce screenshot frequency: `minScreenshots: 1`
   - Use headless mode: `headless: true`

3. **Inconsistent Results**
   - Add explicit waits: "Wait for the page to fully load"
   - Use specific selectors: "Click the button with text 'Continue'"
   - Verify state: "Ensure the form is visible before filling it"

4. **Memory Issues**
   - Limit thought history: `thoughtLimit: 5`
   - Clear observations periodically
   - Use smaller context windows

### Debug Mode
```typescript
// Enable debug logging
const agent = await startBrowserAgent({
    llm: { /* config */ },
    debug: true,
    narrate: true  // Show action descriptions
});

// CLI debug mode
// npx magnitude --debug
```

## Environment Variables

```bash
# LLM API Keys
ANTHROPIC_API_KEY=your_anthropic_key
OPENAI_API_KEY=your_openai_key
GOOGLE_API_KEY=your_google_key

# Optional: Custom endpoints
MOONDREAM_BASE_URL=http://localhost:8000
CUSTOM_LLM_ENDPOINT=https://api.example.com

# Magnitude settings
MAGNITUDE_TELEMETRY=false
MAGNITUDE_DEBUG=true
```

## Resources

- **Documentation**: https://docs.magnitude.run
- **GitHub**: https://github.com/magnitudedev/magnitude
- **Discord**: https://discord.gg/VcdpMh9tTy
- **Examples**: https://github.com/magnitudedev/magnitude/tree/main/examples
- **WebVoyager Benchmark**: 94% success rate

## License
Apache 2.0 - See LICENSE file for details

