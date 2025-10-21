import logger from '@/logger';
import EventEmitter from "eventemitter3";
import z from "zod";

import { Action } from "@/actions/types";
import { ModelHarness } from "@/ai/modelHarness";
import { AgentEvents } from "@/common/events";
import { AgentConnector } from '@/connectors';
import { Observation, RenderableContent } from '@/memory/observation';
import { LLMClient } from "@/ai/types";
import { AgentError } from "@/agent/errors";
import { AgentMemory, AgentMemoryOptions } from "@/memory";
import { ActionDefinition } from "@/actions";
import { taskActions } from "@/actions/taskActions";
import { ConnectorInstructions, AgentContext, traceAsync, MultiMediaContentPart } from "@/ai/baml_client";
import { telemetrifyAgent } from '@/telemetry/events';
import { isClaude } from '@/ai/util';
import { retryOnError } from '@/common';
import { renderContentParts } from '@/memory/rendering';
import { MultiModelHarness } from '@/ai/multiModelHarness';
import { Image } from '@/memory/image';
import { computePHash, calculateHammingDistance, calculateCosineSimilarity } from './cacheUtils';
import { initializeVertexClient, getEmbeddingForImage } from '@/ai/vertexClient';
import { yellowBright } from 'ansis';
import fs from 'fs';
import path from 'path';


export interface AgentOptions {
    llm?: LLMClient | LLMClient[];
    connectors?: AgentConnector[];
    actions?: ActionDefinition<any>[]; // any additional actions not provided by connectors
    prompt?: string | null; // additional agent-level system prompt instructions
    telemetry?: boolean;
    //executor?: GroundingClient;
}

export interface ActOptions {
    prompt?: string // additional task-level system prompt instructions
    // TODO: reimpl, or maybe for tc agent specifically
	data?: RenderableContent,//string | Record<string, string>
    memory?: AgentMemory,// optional memory starting point
}

// Options for the startAgent helper function

const DEFAULT_CONFIG: Required<Omit<AgentOptions, 'actions'> & { actions: ActionDefinition<any>[] }> = {
    actions: [...taskActions], // Default to taskActions; other actions come from connectors
    connectors: [],
    llm: {
        provider: 'google-ai',
        options: {
            model: 'gemini-2.5-pro-preview-05-06',
            apiKey: process.env.GOOGLE_API_KEY || "YOUR_GOOGLE_API_KEY"
        }
    } as LLMClient,
    prompt: null,
    telemetry: true,
};

export class Agent {
    // maybe remove conns/actions from options since stored sep
    private options: Required<AgentOptions>//Omit<Required<AgentOptions>, 'actions'>;
    private connectors: AgentConnector[];
    private actions: ActionDefinition<any>[]; // actions from connectors + any other additional ones configured
    private actionAbortController: AbortController | null = null;

    private memoryOptions: AgentMemoryOptions;

    public readonly models: MultiModelHarness;

    //public readonly model: ModelHarness;
    //public readonly micro: GroundingService;
    //public readonly events: EventEmitter<AgentEvents>;

    //protected readonly _emitter: EventEmitter<AgentEvents>;
    public readonly events: EventEmitter<AgentEvents> = new EventEmitter();
    
    //public readonly memory: AgentMemory;
    private doneActing: boolean;
    private _paused: boolean = false;
    private _pauseResolve: (() => void) | null = null;

    protected latestTaskMemory: AgentMemory;// | null = null;

    private visualCacheConfig = {
        enabled: process.env.CACHE_ENABLED === 'true',
        apiUrl: process.env.UNIFY_BASE_URL || 'http://localhost:8000/v0',
        project: process.env.UNIFY_PROJECT || 'Assistant',
        context: process.env.CACHE_CONTEXT || 'VisualSemanticCache',
        // Embedding-based caching (primary method when enabled)
        useImageEmbedding: process.env.CACHE_USE_IMAGE_EMBEDDING === 'true', // Controls whether to use embeddings or pHash
        imageEmbeddingThreshold: parseFloat(process.env.CACHE_IMAGE_EMBEDDING_THRESHOLD || '0.15'), // Max cosine distance for full image embedding
        roiEmbeddingThreshold: parseFloat(process.env.CACHE_ROI_EMBEDDING_THRESHOLD || '0.15'), // Max cosine distance for ROI embedding
        // pHash-based caching (fallback when embeddings disabled)
        visualsimilarityThreshold: parseInt(process.env.CACHE_VISUAL_SIMILARITY_THRESHOLD || '35', 10), // Max hamming distance for pHash comparison
        roiPhashThreshold: parseInt(process.env.CACHE_ROI_PHASH_THRESHOLD || '3', 10), // Max hamming distance for ROI pHash comparison
        // Common settings
        textSimilarityThreshold: parseFloat(process.env.CACHE_TEXT_SIMILARITY_THRESHOLD || '0.1'), // Max cosine similarity for text comparison
        overwrite: process.env.UNIFY_OVERWRITE_PROJECT === 'true', // Whether to overwrite existing project/context
        roiWidth: parseInt(process.env.CACHE_ROI_WIDTH || '100', 10), // Width of ROI around first interaction
        roiHeight: parseInt(process.env.CACHE_ROI_HEIGHT || '100', 10), // Height of ROI around first interaction
    };
    constructor(baseConfig: Partial<AgentOptions> = {}) {
        this.options = {
            ...DEFAULT_CONFIG,
            ...baseConfig,
            connectors: baseConfig.connectors ?? [],
            actions: [...(baseConfig.actions || DEFAULT_CONFIG.actions)], 
        } as Required<AgentOptions>;

        this.connectors = this.options.connectors;

        // Aggregate actions from connectors
        //const aggregatedActions = [...this.options.actions];
        this.actions = [...this.options.actions];
        for (const connector of this.connectors) {
            this.actions.push(...(connector.getActionSpace ? connector.getActionSpace() : []));
        }
        // Deduplicate actions by name
        // TODO: maybe error instead, or automatically differentiate them?
        //this.options.actions = Array.from(new Map(aggregatedActions.map(actDef => [actDef.name, actDef])).values());

        const llms = Array.isArray(this.options.llm) ? this.options.llm : [this.options.llm];

        let doPromptCaching = false;
        for (const client of llms ) {
            // If any LLM is prompt-caching compatible, turn on prompt caching overall for memory etc.
            if (isClaude(client) && (client.provider === 'anthropic' || client.provider === 'claude-code')) {
                // Prompt-caching compatible client

                if ('promptCaching' in client.options && client.options.promptCaching !== undefined) {
                    doPromptCaching = client.options.promptCaching;
                } else {
                    // Default to true if not specified, and override on client config to true
                    doPromptCaching = true;
                    client.options.promptCaching = true;
                }
            }
        }

        //this.model = new ModelHarness({ llm: this.options.llm });
        this.models = new MultiModelHarness(llms);
        this.models.events.on('tokensUsed', (usage) => this.events.emit('tokensUsed', usage), this);
        this.doneActing = false;
        this._paused = false;
        this._pauseResolve = null;

        this.memoryOptions = {
            // TODO: maybe do if Gemini or other prompt caching supported providers as well
            // Claude supports prompt caching but only via Anthropic, not on Bedrock
            promptCaching: doPromptCaching
        };

        // Empty memory will get replaced on first act(), but this prevents errors from having undefined memory
        this.latestTaskMemory = new AgentMemory(this.memoryOptions);
    }

    public getConnector<C extends AgentConnector>(
        connectorClass: new (...args: any[]) => C
    ): C | undefined {
        return this.connectors.find(c => c instanceof connectorClass) as C | undefined;
    }

    public require<C extends AgentConnector>(
        connectorClass: new (...args: any[]) => C
    ): C {
        const connector = this.getConnector(connectorClass);
        if (!connector) throw new Error(`Missing required connector ${connectorClass}`);
        return connector;
    }

    async start(): Promise<void> { 
        // Register telemetry if enabled - do on start instead of cons to prevent weird subclass event issues
        if (this.options.telemetry) telemetrifyAgent(this);

        if (this.visualCacheConfig.enabled) {
            await this._setupVisualCache();
            
            // Initialize Vertex AI if embeddings are enabled
            if (this.visualCacheConfig.useImageEmbedding) {
                try {
                    await initializeVertexClient();
                    logger.info("Vertex AI client initialized for image embeddings");
                } catch (error) {
                    logger.warn(`Failed to initialize Vertex AI client: ${(error as Error).message}. Falling back to pHash.`);
                    // Disable embeddings if initialization failed
                    this.visualCacheConfig.useImageEmbedding = false;
                }
            }
        }
        //console.log('setting up model')
        await this.models.setup();
        //console.log('done setting up model')

        logger.info("Agent: Starting connectors...");
        for (const connector of this.connectors) {
            if (connector.onStart) await connector.onStart(); 
        }
        this.events.emit('start');
        logger.info("Agent: All connectors started.");

        // logger.info("Making initial observations...");
        // await this._recordConnectorObservations();
        // logger.info("Initial observations recorded");
        // Initial observations are handled by the first getObservations call in exec
    }

    identifyAction(action: Action) {
        // Get definition corresponding to an action
        const actionDefinition = this.actions.find(def => def.name === action.variant);

        if (!actionDefinition) {
            // It's possible the action name was from a connector that is no longer active,
            // or the action space was not correctly aggregated.
            throw new AgentError(`Undefined action type '${action.variant}'. Ensure agent is configured with appropriate action definitions from connectors.`);
        }
        return actionDefinition;
    }
    
    async exec(action: Action, memory?: AgentMemory): Promise<void> {
        /**
         * Execute an action that belongs to this Agent's action space.
         * Provide memory to record the action taken, its results, and any connector observations to that memory.
         */
        let actionDefinition = this.identifyAction(action);
        
        let input: any;
        if (actionDefinition.schema instanceof z.ZodObject) {
            let variant: string;
            ({ variant, ...input } = action);
        } else {
            input = (action as any).input; 
        }

        let parsed = actionDefinition.schema.safeParse(input);

        if (!parsed.success) {
            throw new AgentError(`Generated action '${action.variant}' violates input schema: ${parsed.error.message}`, { adaptable: true });
        }

        this.events.emit('actionStarted', action);
        
        let resolvedCoords: { x: number; y: number } | null = null;
        const resolverResult = await actionDefinition.resolver(
            { input: parsed.data, agent: this }
        );

        // Capture coordinates from resolver or input
        if (resolverResult && typeof resolverResult === 'object' && 'resolvedCoords' in resolverResult) {
            const coords = resolverResult.resolvedCoords;
            if (coords && typeof coords === 'object' && 'x' in coords && 'y' in coords &&
                typeof coords.x === 'number' && typeof coords.y === 'number') {
                resolvedCoords = { x: coords.x, y: coords.y };
            }
        } else {
            const inputData = parsed.data as any;
            if (inputData && typeof inputData === 'object') {
                if (typeof inputData.x === 'number' && typeof inputData.y === 'number') {
                    resolvedCoords = { x: inputData.x, y: inputData.y };
                } else if (inputData.from && typeof inputData.from === 'object' && 
                           typeof inputData.from.x === 'number' && typeof inputData.from.y === 'number') {
                    resolvedCoords = { x: inputData.from.x, y: inputData.from.y };
                }
            }
        }

        if (resolvedCoords) {
            (action as any)._resolvedCoords = resolvedCoords;
        }

        this.events.emit('actionDone', action);

        if (memory) {
            memory.recordObservation(Observation.fromActionTaken(actionDefinition.name, JSON.stringify(action)));

            let contentToRecord: RenderableContent | undefined = undefined;
            if (resolverResult) {
                if (typeof resolverResult === 'object' && 'resolvedCoords' in resolverResult) {
                    contentToRecord = (resolverResult as any).renderableContent;
                } else {
                    contentToRecord = resolverResult as RenderableContent;
                }
            }

            if (contentToRecord !== undefined && contentToRecord !== null) {
                memory.recordObservation(Observation.fromActionResult(actionDefinition.name, contentToRecord));
            }

            // Collect and record observations from connectors
            await this._recordConnectorObservations(memory);
        }
    }

    protected async _recordConnectorObservations(memory: AgentMemory) {
        for (const connector of this.connectors) {
            try {
                // could do Promise.all if matters
                const connObservations = connector.collectObservations ? await connector.collectObservations() : [];
                //observations.push(...connObservations);
                for (const obs of connObservations) {
                    memory.recordObservation(obs);
                }
            } catch (error) {
                logger.warn(`Agent: Error getting observations from connector ${connector.id}: ${error instanceof Error ? error.message : String(error)}`);
            }
        }
    }

    get memory(): AgentMemory {
        //if (!this.latestTaskMemory) throw new Error("No memory available");
        return this.latestTaskMemory;
    }

    async act(taskOrSteps: string | string[], options: ActOptions = {}): Promise<void> {
        const instructions = [
            ...(this.options.prompt ? [this.options.prompt] : []),
            ...(options.prompt ? [options.prompt] : []),
        ].join('\n');
        const taskMemory = options.memory ?? new AgentMemory({ ...this.memoryOptions, instructions: instructions === '' ? undefined : instructions });

        if (Array.isArray(taskOrSteps)) {
            const steps = taskOrSteps;

            //this.events.emit('actStarted', steps.join(', '));

            // trace overall task
            await (traceAsync('multistep', async (steps: string[], options: ActOptions) => {
                for (const step of steps) {
                    this.events.emit('actStarted', step, options);
                    await this._traceAct(step, taskMemory, options);
                    this.events.emit('actDone', step, options);
                }
            })(steps, options));

            //this.events.emit('actDone', steps.join(', '));
        } else {
            const task = taskOrSteps;

            this.events.emit('actStarted', task, options);

            await this._traceAct(task, taskMemory, options);
            this.events.emit('actDone', task, options);
        }
    }

    async _traceAct(task: string, memory: AgentMemory, options: ActOptions = {}) {
        // memory not serializable to trace so bake it
        await (traceAsync('act', async (task: string) => {
            await this._act(task, memory, options);
        })(task));
    }

    private async _buildContext(memory: AgentMemory): Promise<AgentContext> {
        const messages = await memory.render();

        const connectorInstructions: ConnectorInstructions[] = [];

        for (const connector of this.connectors) {
            if (connector.getInstructions) {
                const instructions = await connector.getInstructions();

                if (instructions) {
                    connectorInstructions.push({
                        connectorId: connector.id,
                        instructions: instructions
                    });
                }
            }
        }

        return {
            instructions: memory.instructions,
            observationContent: messages,
            //observationContent: content,
            connectorInstructions: connectorInstructions
        };
    }

    public interrupt(): void {
        if (this.actionAbortController) {
            console.log("Interrupting current action...");
            this.actionAbortController.abort();
            this.actionAbortController = null;
        }
    }

    async _act(description: string, memory: AgentMemory, options: ActOptions = {}): Promise<void> {
        this.doneActing = false;
        this.actionAbortController = new AbortController();
        const signal = this.actionAbortController.signal;
        logger.info(`Act: ${description}`);

        // for now simply add data to task
        let dataContentParts: MultiMediaContentPart[] = [];
        if (options.data) {
            //description += "\nUse the following data where appropriate:\n";
            // description += "\n<data>\n";
            // // if (typeof options.data === 'string') {
            // //     description += options.data;
            // // } else {
            // //     description += Object.entries(options.data).map(([k, v]) => `${k}: ${v}`).join("\n");
            // // }
            // const parts = renderParts(options.data);
            // description += "\n</data>";
            dataContentParts = await renderContentParts(options.data, { mode: 'json', indent: 2 });
        }
        //this.events.emit('stepStart', description);

        //const testData = convertOptionsToTestData(options);

        // Initialize task memory and record initial observations
        // Combine any agent-level and task-level instructions
        
        this.latestTaskMemory = memory;

        // record initial observations
        logger.info("Making initial observations...");
        await this._recordConnectorObservations(memory);
        logger.info("Initial observations recorded");

        const initialScreenshot = memory.getLatestScreenshot();

        if (this.visualCacheConfig.enabled && initialScreenshot) {
            const cachedResult = await this.queryCache(description, initialScreenshot);
            if (cachedResult && cachedResult.actions.length > 0)  {
                console.log(yellowBright("⚡ CACHE HIT. Replaying full action trajectory."));
                this.events.emit('thought', "Found a similar past situation in my cache. Replaying the full set of actions I took before.");

                // Replay the entire cached trajectory
                for (const action of cachedResult.actions) {
                    if (signal.aborted) throw new AgentError("Action was interrupted.", { variant: 'cancelled' });
                    await this.exec(action, memory);
                }
                return; // The task is complete, so we exit the _act method.
            }
        }

        const fullTrajectory: Action[] = []; // To store all actions for this task

        try {
            while (true) {
                if (signal.aborted) {
                    throw new AgentError("Action was interrupted by the user.", { variant: 'cancelled' });
                }
                // Removed direct screenshot/tabState access here; it's part of memoryContext via connectors
                logger.info(`Creating partial recipe`);

            let reasoning: string = "";
            let actions: Action[] = [];

            try {
                const memoryContext = await this._buildContext(memory);
                await retryOnError(
                    async () => {
                        ({ reasoning, actions } = await this.models.partialAct(
                            memoryContext,
                            description,
                            dataContentParts,
                            this.actions 
                        ));
                        if (actions.length === 0) {
                            // Empty action list behavior - default wait else ... err? what if not in action space?
                            //actions.push()
                            throw new AgentError(`No actions generated`);
                        }
                    },
                    // HTTP body is not JSON - comes from Anthropic sometimes, weird error
                    // Sometimes Anthropic will give 401 Unauthorized randomly even when authorized
                    {
                        mode: 'retry_on_partial_message',
                        errorSubstrings: ['HTTP body is not JSON', '401 Unauthorized', 'No actions generated'],
                        retryLimit: 3,
                        delayMs: 1000,
                        showWarnOnRetry: true
                    }
                );
            } catch (error: unknown) {
                logger.error(`Error planning actions: ${error instanceof Error ? error.message : String(error)}`);
                /**
                 * (1) Failure to conform to JSON
                 * (2) Misconfigured BAML client / bad API key
                 * (3) Network error (past max retries)
                 */
                // this.fail({
                //     variant: 'misalignment',
                //     message: `Could not create partial recipe -> ${(error as Error).message}`
                // });
                throw new AgentError(
                    `Error planning actions: ${(error as Error).message}`, { variant: 'misalignment' }
                )
            }

            logger.info({ reasoning, actions }, `Partial recipe created`);
            
            // Could be emitted in memory and bubbled up instead of recordThought was called in more places
            this.events.emit('thought', reasoning);
            memory.recordThought(reasoning);

            // Execute partial recipe
            for (const action of actions) {
                await this._waitIfPaused();
                if (this.doneActing) break;
                if (signal.aborted) {
                    throw new AgentError("Action was interrupted by the user.", { variant: 'cancelled' });
                }
                await this.exec(action, memory);
                fullTrajectory.push(action); // Add executed action to the full trajectory

                // const postActionScreenshot = await this.screenshot();
                // const actionDescriptor: ActionDescriptor = { ...action, screenshot: postActionScreenshot.image } as ActionDescriptor;
                // this.events.emit('action', actionDescriptor);
                logger.info({ action }, `Action taken`);
            }

            // If macro expects these actions should complete the step, break
            // if (finished) {
            //     break;
            // }
            await this._waitIfPaused();
            if (this.doneActing) {
                if (this.visualCacheConfig.enabled && initialScreenshot && fullTrajectory.length > 0) {
                    logger.info("Task complete. Populating cache with full trajectory.");
                    
                    let firstActionCoords: { x: number; y: number } | null = null;
                    for (const action of fullTrajectory) {
                        const coords = (action as any)._resolvedCoords;
                        if (coords && typeof coords.x === 'number' && typeof coords.y === 'number') {
                            firstActionCoords = { x: coords.x, y: coords.y };
                            break;
                        }
                        else if ('x' in action && 'y' in action && 
                                 typeof action.x === 'number' && typeof action.y === 'number') {
                            firstActionCoords = { x: action.x, y: action.y };
                            break;
                        }
                        else if ('input' in action && typeof action.input === 'object' && action.input) {
                            if ('x' in action.input && 'y' in action.input && 
                                typeof action.input.x === 'number' && typeof action.input.y === 'number') {
                                firstActionCoords = { x: action.input.x, y: action.input.y };
                                break;
                            }
                            else if ('from' in action.input && typeof action.input.from === 'object' && 
                                     action.input.from && 'x' in action.input.from && 'y' in action.input.from &&
                                     typeof action.input.from.x === 'number' && typeof action.input.from.y === 'number') {
                                firstActionCoords = { x: action.input.from.x, y: action.input.from.y };
                                break;
                            }
                        }
                    }
                    
                    this.populateCache(description, initialScreenshot, fullTrajectory, firstActionCoords)
                        .catch(err => logger.warn(`Failed to populate visual cache: ${err.message}`));
                }
                break;
            }
        }
        } catch (error) {
            if (error instanceof AgentError && error.options.variant === 'cancelled') {
                logger.info("Act loop gracefully terminated due to interruption.");
                return; // Suppress the error and exit cleanly
            }
            // Re-throw other errors
            throw error;
        } finally {
            // Clean up the controller when the act loop finishes
            this.actionAbortController = null;
        }

        logger.info(`Done with step`);
        //this.events.emit('stepSuccess');
        //this.currentTaskMemory = null;
    }

    // --- CACHE HELPER METHODS ---

    private async _setupVisualCache(): Promise<void> {
        const { apiUrl, project, context, overwrite } = this.visualCacheConfig;

        try {
            const unifyKey = process.env.UNIFY_KEY || '';
            const authHeader = `Bearer ${unifyKey}`.trim();

            // Step 1: Handle project creation/overwrite
            const projectCheckResponse = await fetch(`${apiUrl}/project/${project}`, { headers: { 'Authorization': authHeader } });
            
            if (projectCheckResponse.status === 200 && overwrite) {
                // Project exists and overwrite is enabled - delete it first
                const deleteResponse = await fetch(`${apiUrl}/project/${project}`, {
                    method: 'DELETE',
                    headers: { 'Authorization': authHeader }
                });
                if (!deleteResponse.ok && deleteResponse.status !== 404) {
                    throw new Error(`Failed to delete existing project: ${await deleteResponse.text()}`);
                }
            }
            
            // Create project if it doesn't exist or was just deleted
            if (projectCheckResponse.status === 404 || overwrite) {
                const projectCreateResponse = await fetch(`${apiUrl}/project`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'Authorization': authHeader },
                    body: JSON.stringify({ name: project })
                });
                if (!projectCreateResponse.ok) {
                    throw new Error(`Failed to create project: ${await projectCreateResponse.text()}`);
                }
            } else if (!projectCheckResponse.ok) {
                throw new Error(`Failed to check for project: ${await projectCheckResponse.text()}`);
            }

            // Step 2: Check if the context exists
            const contextCheckResponse = await fetch(`${apiUrl}/project/${project}/contexts/${context}`, { headers: { 'Authorization': authHeader } });
            if (contextCheckResponse.status === 404) {
                const contextCreateResponse = await fetch(`${apiUrl}/project/${project}/contexts`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'Authorization': authHeader },
                    body: JSON.stringify({
                        name: context,
                        description: "Cache for UI automation screenshots and instructions."
                    })
                });
                if (!contextCreateResponse.ok) {
                    throw new Error(`Failed to create context: ${await contextCreateResponse.text()}`);
                }
            } else if (!contextCheckResponse.ok) {
                throw new Error(`Failed to check for context: ${await contextCheckResponse.text()}`);
            }


        } catch (error: any) {
            console.error(`Could not initialize Visual Semantic Cache. Caching will be disabled. Error: ${error.message}`);
            this.visualCacheConfig.enabled = false;
        }
    }

    private async queryCache(instruction: string, screenshot: Image): Promise<{ actions: Action[] } | null> {
        const queryStartTime = Date.now();
        console.log("🔍 [CACHE PERF] Starting cache query...");
        
        const { apiUrl, project, context, visualsimilarityThreshold, textSimilarityThreshold, roiWidth, roiHeight, roiPhashThreshold, useImageEmbedding, imageEmbeddingThreshold, roiEmbeddingThreshold } = this.visualCacheConfig;
        const unifyKey = process.env.UNIFY_KEY || '';
        const authHeader = `Bearer ${unifyKey}`.trim();

        try {
            const escapedInstruction = instruction.replace(/'/g, "''");
            
            let filterClauses: string[] = [];
            let sortingObject: Record<string, string> = {};
            
            // Text similarity (always included)
            filterClauses.push(`cosine(instruction_embed, embed('${escapedInstruction}')) < ${textSimilarityThreshold}`);
            sortingObject[`cosine(instruction_embed, embed('${escapedInstruction}'))`] = "ascending";
            
            if (useImageEmbedding) {
                logger.info("Using embedding mode for cache query");
                const currentScreenshotB64 = await screenshot.toBase64();
                const imageDataUri = `data:image/png;base64,${currentScreenshotB64}`;
                const escapedImageDataUri = imageDataUri.replace(/'/g, "''");
                const imageSimilarityExpr = `cosine(image_embedding, embed_image('${escapedImageDataUri}'))`;

                filterClauses.push(`${imageSimilarityExpr} < ${imageEmbeddingThreshold}`);
                sortingObject[imageSimilarityExpr] = "ascending"; // Sort by the same expression
                logger.info("Using embed_image() with base64 for cache query filter.");
            } else {
                // *** pHash Mode: Compute hash for filtering ***
                logger.info("Using pHash mode for cache query");
                const currentPHash = await computePHash(screenshot);
                filterClauses.push(`phash_distance(image_phash, '${currentPHash}') < ${visualsimilarityThreshold}`);
                sortingObject[`phash_distance(image_phash, '${currentPHash}')`] = "ascending";
                logger.info("Using pHash for initial cache query filter.");
            }
            
            const queryPayload = {
                project: project,
                context: context,
                filter_expr: filterClauses.join(' and '),
                limit: 3,
                sorting: JSON.stringify(sortingObject)
            };
            
            const fullUrl = `${apiUrl}/logs/query`;
            logger.debug(`Querying cache: POST ${fullUrl}`);
            
            const response = await fetch(fullUrl, {
                method: 'POST',
                headers: {
                    'Authorization': authHeader,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(queryPayload)
            });

            // Debug: save screenshot
            try {
                const debugDir = path.join(process.cwd(), 'debug_screenshots');
                if (!fs.existsSync(debugDir)) {
                    fs.mkdirSync(debugDir, { recursive: true });
                }
                const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
                const mode = useImageEmbedding ? 'embedding' : 'phash';
                await screenshot.saveToFile(path.join(debugDir, `query_screenshot_${mode}_${timestamp}.png`));
            } catch (error) {
                logger.warn('Failed to save debug screenshot:', error);
            }

            if (!response.ok) {
                const errorText = await response.text();
                logger.error("Error response body:", errorText);
                logger.error(`Cache query failed with status ${response.status}: ${errorText}`);
                return null;
            }

            const results = await response.json();
            
            if (results && results.logs && results.logs.length > 0) {
                logger.info(`Cache query returned ${results.logs.length} candidates. Verifying...`);
                
                let currentRoiVector: number[] | null = null;
                if (useImageEmbedding) {
                    const firstCandidateCoords = results.logs[0]?.entries?.first_action_coords;
                    if (firstCandidateCoords && typeof firstCandidateCoords.x === 'number' && typeof firstCandidateCoords.y === 'number') {
                        try {
                            const cropX = firstCandidateCoords.x - roiWidth / 2;
                            const cropY = firstCandidateCoords.y - roiHeight / 2;
                            const currentRoiImage = await screenshot.crop(cropX, cropY, roiWidth, roiHeight);
                            const currentRoiB64 = await currentRoiImage.toBase64();
                            // Get embedding for the current ROI once
                            currentRoiVector = await getEmbeddingForImage(currentRoiB64);
                            if (!currentRoiVector) {
                                logger.warn("Failed to get precomputed ROI embedding. ROI verification will be skipped.");
                            } else {
                                logger.debug(`Successfully precomputed ROI embedding (dimension: ${currentRoiVector.length})`);
                            }
                        } catch (cropOrEmbedError) {
                            logger.warn(`Error precomputing ROI embedding: ${(cropOrEmbedError as Error).message}. ROI verification will be skipped.`);
                        }
                    } else {
                        logger.info("First cache candidate lacks ROI coords.");
                    }
                }
                
                for (const log of results.logs) {
                    const candidateEntries = log.entries;
                    const derivedEntries = log.derived_entries;
                    const candidateCoords = candidateEntries?.first_action_coords;
                    
                    if (useImageEmbedding) {
                        if (candidateCoords && typeof candidateCoords.x === 'number' && typeof candidateCoords.y === 'number' && currentRoiVector) {
                            const candidateRoiVector = derivedEntries?.roi_embedding;
                            if (!candidateRoiVector || !Array.isArray(candidateRoiVector)) {
                                logger.warn(`Candidate ${log.id} ROI embedding vector missing. Skipping.`);
                                continue;
                            }
                            
                            const similarity = calculateCosineSimilarity(currentRoiVector, candidateRoiVector);
                            const distance = 1.0 - similarity;
                            
                            if (distance <= roiEmbeddingThreshold) {
                                logger.info(`ROI verified for ${log.id}.`);
                                if (candidateEntries.tool_trajectory) {
                                    try {
                                        const totalQueryDuration = Date.now() - queryStartTime;
                                        console.log(`⏱️  [CACHE PERF] ✅ CACHE HIT (embedding+ROI) - Total: ${totalQueryDuration}ms`);
                                        return { actions: JSON.parse(candidateEntries.tool_trajectory) };
                                    } catch (parseError) {
                                        logger.warn(`Failed to parse tool_trajectory for ${log.id}.`);
                                        continue;
                                    }
                                } else {
                                    logger.warn(`Candidate ${log.id} missing tool_trajectory.`);
                                    continue;
                                }
                            } else {
                                logger.info(`ROI verification failed for ${log.id}.`);
                                continue;
                            }
                        } else {
                            logger.info(`Accepting ${log.id} based on global match.`);
                            if (candidateEntries.tool_trajectory) {
                                try {
                                    const totalQueryDuration = Date.now() - queryStartTime;
                                    console.log(`⏱️  [CACHE PERF] ✅ CACHE HIT (embedding global) - Total: ${totalQueryDuration}ms`);
                                    return { actions: JSON.parse(candidateEntries.tool_trajectory) };
                                } catch (parseError) {
                                    logger.warn(`Failed to parse tool_trajectory for ${log.id}.`);
                                    continue;
                                }
                            } else {
                                logger.warn(`Candidate ${log.id} missing tool_trajectory.`);
                                continue;
                            }
                        }
                    } else {
                        if (candidateCoords && typeof candidateCoords.x === 'number' && typeof candidateCoords.y === 'number') {
                            const candidateRoiPHash = candidateEntries?.roi_phash;
                            if (candidateRoiPHash && typeof candidateRoiPHash === 'string') {
                                try {
                                    const cropX = candidateCoords.x - roiWidth / 2;
                                    const cropY = candidateCoords.y - roiHeight / 2;
                                    const currentRoiImage = await screenshot.crop(cropX, cropY, roiWidth, roiHeight);
                                    const currentRoiPHash = await computePHash(currentRoiImage);
                                    const distance = calculateHammingDistance(currentRoiPHash, candidateRoiPHash);
                                    logger.info(`ROI pHash: Candidate ${log.id}, distance ${distance} (threshold ${roiPhashThreshold})`);
                                    if (distance <= roiPhashThreshold) {
                                        logger.info(`ROI verified for ${log.id}. Using cache.`);
                                        if (candidateEntries.tool_trajectory) {
                                            try {
                                                return { actions: JSON.parse(candidateEntries.tool_trajectory) };
                                            } catch (parseError) {
                                                logger.warn(`Failed to parse tool_trajectory for pHash hit ${log.id}: ${parseError}. Trying next candidate.`);
                                                continue;
                                            }
                                        } else {
                                            logger.warn(`pHash cache candidate ${log.id} missing tool_trajectory. Trying next candidate.`);
                                            continue;
                                        }
                                    } else {
                                        logger.info(`ROI verification failed for ${log.id}.`);
                                        continue;
                                    }
                                } catch (error) {
                                    logger.warn(`ROI pHash error for ${log.id}: ${(error as Error).message}`);
                                    continue;
                                }
                            } else {
                                logger.warn(`Candidate ${log.id} lacks ROI data. Accepting based on global match.`);
                                if (candidateEntries.tool_trajectory) {
                                    try {
                                        return { actions: JSON.parse(candidateEntries.tool_trajectory) };
                                    } catch (parseError) {
                                        logger.warn(`Failed to parse tool_trajectory for pHash global match ${log.id}: ${parseError}. Trying next candidate.`);
                                        continue;
                                    }
                                } else {
                                    logger.warn(`pHash global match candidate ${log.id} missing tool_trajectory. Trying next candidate.`);
                                    continue;
                                }
                            }
                        } else {
                            // Candidate lacks ROI coords - accept based on global match
                            logger.info(`Candidate ${log.id} (pHash) lacks ROI data. Accepting based on global match.`);
                            if (candidateEntries.tool_trajectory) {
                                try {
                                    return { actions: JSON.parse(candidateEntries.tool_trajectory) };
                                } catch (parseError) {
                                    logger.warn(`Failed to parse tool_trajectory for pHash global match ${log.id}: ${parseError}. Trying next candidate.`);
                                    continue;
                                }
                            } else {
                                logger.warn(`pHash global match candidate ${log.id} missing tool_trajectory. Trying next candidate.`);
                                continue;
                            }
                        }
                    }
                } // End candidate loop
                logger.info("No cache candidates passed verification.");
                return null;
            } else {
                logger.info("No matching logs found (initial query)");
            }
        } catch (error) {
            logger.error(`Error during cache query: ${error instanceof Error ? error.message : String(error)}`);
        }

        return null;
    }

    private async populateCache(instruction: string, screenshot: Image, actions: Action[], firstActionCoords: { x: number; y: number } | null): Promise<void> {
        const { apiUrl, project, context, roiWidth, roiHeight, useImageEmbedding } = this.visualCacheConfig;
        
        logger.info("Input instruction:", instruction);
        logger.info("Input actions:", actions);
        logger.info("First action coords:", firstActionCoords);
        logger.info("Config:", { apiUrl, project, context, useImageEmbedding });
        
        // Get authentication headers
        const unifyKey = process.env.UNIFY_KEY || '';
        const authHeader = `Bearer ${unifyKey}`.trim();
        
        const authHeaders = {
            'Content-Type': 'application/json',
            'Authorization': authHeader
        };
        
        // Prepare entries based on embedding mode
        const entries: any = {
            instruction,
            tool_trajectory: JSON.stringify(actions)
        };
        
        let derivedLogsToCreate: Array<{ key: string; equation: string }> = [];
        let roiPHash: string | null = null;
        let storedCoords: { x: number; y: number } | null = null;
        
        if (useImageEmbedding) {
            logger.info("Using embedding mode for cache population");
            
            const screenshotB64 = await screenshot.toBase64();
            entries.initial_screenshot_b64 = screenshotB64;
            
            derivedLogsToCreate.push({
                key: 'image_embedding',
                equation: 'embed_image({log:initial_screenshot_b64})'
            });
            
            if (firstActionCoords) {
                try {
                    const cropX = firstActionCoords.x - roiWidth / 2;
                    const cropY = firstActionCoords.y - roiHeight / 2;
                    const roiImage = await screenshot.crop(cropX, cropY, roiWidth, roiHeight);
                    const roiB64 = await roiImage.toBase64();
                    
                    entries.roi_screenshot_b64 = roiB64;
                    entries.first_action_coords = firstActionCoords;
                    storedCoords = firstActionCoords;
                    
                    derivedLogsToCreate.push({
                        key: 'roi_embedding',
                        equation: 'embed_image({log:roi_screenshot_b64})'
                    });
                    
                    logger.info(`Stored ROI base64 at coords (${firstActionCoords.x}, ${firstActionCoords.y})`);
                    
                    // Debug: save ROI
                    try {
                        const debugDir = path.join(process.cwd(), 'debug_screenshots');
                        if (!fs.existsSync(debugDir)) fs.mkdirSync(debugDir, { recursive: true });
                        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
                        await roiImage.saveToFile(path.join(debugDir, `populate_roi_embedding_${timestamp}.png`));
                    } catch (error) {
                        logger.warn('Failed to save debug ROI:', error);
                    }
                } catch (error) {
                    logger.warn(`Failed to process ROI for embedding: ${(error as Error).message}`);
                }
            }
        } else {
            logger.info("Using pHash mode for cache population");
            
            const imagePHash = await computePHash(screenshot);
            entries.image_phash = imagePHash;
            
            if (firstActionCoords) {
                try {
                    const cropX = firstActionCoords.x - roiWidth / 2;
                    const cropY = firstActionCoords.y - roiHeight / 2;
                    const roiImage = await screenshot.crop(cropX, cropY, roiWidth, roiHeight);
                    
                    roiPHash = await computePHash(roiImage);
                    entries.roi_phash = roiPHash;
                    entries.first_action_coords = firstActionCoords;
                    storedCoords = firstActionCoords;
                    
                    logger.info(`Computed ROI pHash: ${roiPHash} at coords (${firstActionCoords.x}, ${firstActionCoords.y})`);
                    
                    // Debug: save ROI
                    try {
                        const debugDir = path.join(process.cwd(), 'debug_screenshots');
                        if (!fs.existsSync(debugDir)) fs.mkdirSync(debugDir, { recursive: true });
                        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
                        await roiImage.saveToFile(path.join(debugDir, `populate_roi_${roiPHash}_${timestamp}.png`));
                    } catch (error) {
                        logger.warn('Failed to save debug ROI:', error);
                    }
                } catch (error) {
                    logger.warn(`Failed to compute ROI pHash: ${(error as Error).message}`);
                }
            }
        }
        
        const baseLogPayload = {
            project,
            context,
            entries
        };
        
        // Debug: save screenshot
        try {
            const debugDir = path.join(process.cwd(), 'debug_screenshots');
            if (!fs.existsSync(debugDir)) fs.mkdirSync(debugDir, { recursive: true });
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
            const mode = useImageEmbedding ? 'embedding' : 'phash';
            await screenshot.saveToFile(path.join(debugDir, `populate_screenshot_${mode}_${timestamp}.png`));
        } catch (error) {
            logger.warn('Failed to save debug screenshot:', error);
        }
        
        const baseLogResponse = await fetch(`${apiUrl}/logs`, {
            method: 'POST',
            headers: authHeaders,
            body: JSON.stringify(baseLogPayload)
        });

        if (!baseLogResponse.ok) {
            const errorText = await baseLogResponse.text();
            logger.error("Base log error response:", errorText);
            logger.warn(`Failed to create base log: ${errorText}`);
            return; // Exit if base log creation failed
        }
        
        const baseLogData = await baseLogResponse.json();
        
        const logEventId = baseLogData.log_event_ids?.[0];
        if (!logEventId) {
            logger.warn("Did not receive log_event_id. Cannot create derived logs.");
            return;
        }
        
        const createDerivedLog = async (key: string, equation: string) => {
            const derivedPayload = {
                project, context, key, equation,
                referenced_logs: { "log": [logEventId] }
            };
            
            const response = await fetch(`${apiUrl}/logs/derived`, {
                method: 'POST',
                headers: authHeaders,
                body: JSON.stringify(derivedPayload)
            });
            
            if (!response.ok) {
                const errorText = await response.text();
                logger.warn(`Failed to create derived log for '${key}': ${errorText}`);
            }
        };
        
        await createDerivedLog("instruction_embed", "embed({log:instruction})");
        
        for (const derivedLog of derivedLogsToCreate) {
            await createDerivedLog(derivedLog.key, derivedLog.equation);
        }
    }

    async query<T extends z.Schema>(query: string, schema: T): Promise<z.infer<T>> {
        // Record observations in case no act() was used beforehand
        await this._recordConnectorObservations(this.latestTaskMemory);
        const memoryContext = await this._buildContext(this.memory);//this.memory.buildContext(this.connectors);
        return await this.models.query(memoryContext, query, schema);
    }

    async queueDone() {
        this.doneActing = true;
    }

    private async _waitIfPaused(): Promise<void> {
        if (!this._paused) return;
        this.events.emit('pause');
        logger.info("Agent: Paused");
        await new Promise<void>((resolve) => {
            this._pauseResolve = resolve;
        });
    }

    pause(): void {
        this._paused = true;
    }

    resume(): void {
        this._paused = false;
        if (this._pauseResolve) {
            this._pauseResolve();
            this._pauseResolve = null;
        }
        this.events.emit('resume');
        logger.info("Agent: Resumed");
    }

    get paused(): boolean {
        return this._paused;
    }

    async stop() {
        /**
         * Stop the agent and close the browser context.
         * May be called asynchronously and interrupt an agent in the middle of a action sequence.
         */
        this.doneActing = true;
        if (this._paused) {
            this.resume(); // unblock so loop can see doneActing and exit
        }
        logger.info("Agent: Stopping connectors...");
        for (const connector of this.connectors) {
            try {
                if (connector.onStop) await connector.onStop();
            } catch (error) {
                logger.warn(`Agent: Error stopping connector ${connector.id}: ${error instanceof Error ? error.message : String(error)}`);
            }
        }
        this.events.emit('stop');
        logger.info("Agent: All connectors stopped.");
        logger.info("Agent: Stopped successfully.");
    }

    // async dumpMemoryJSON() {
    //     return await this.memory.toJSON();
    // }
}
