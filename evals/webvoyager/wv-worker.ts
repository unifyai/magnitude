#!/usr/bin/env bun
import { startBrowserAgent } from "../../packages/magnitude-core/src/agent/browserAgent";
import * as fs from "fs";
import * as path from "path";
import { createAction } from "../../packages/magnitude-core/src/actions";
import z from "zod";
import { chromium } from "patchright";

interface Task {
    web_name: string;
    id: string;
    ques: string;
    web: string;
}

async function runTaskInWorker(task: Task, runEval: boolean) {
    const MAX_CRASH_RETRIES = 3;
    let crashAttempts = 0;
    
    while (crashAttempts < MAX_CRASH_RETRIES) {
        console.log(`[Worker] Running task: ${task.id} - ${task.ques}`);
        console.log(`[Worker] URL: ${task.web}`);

        let startTime = Date.now();
        let context: any = null;
        let agent: any = null;
        let totalInputTokens = 0;
        let totalOutputTokens = 0;
        let totalInputCost = 0.0;
        let totalOutputCost = 0.0;
        let actionCount = 0;

        try {
        const date = new Date();
        const formattedDate = date.toLocaleDateString('en-US', {
            month: 'long',
            day: 'numeric',
            year: 'numeric'
        });

        context = await chromium.launchPersistentContext("", {
            channel: "chrome",
            headless: false,
            viewport: { width: 1024, height: 768 },
            deviceScaleFactor: process.platform === 'darwin' ? 2 : 1
        });

        agent = await startBrowserAgent({
            browser: { context: context },
            llm: {
                provider: "claude-code",
                options: {
                    model: "claude-sonnet-4-20250514",
                    temperature: 0.5
                },
            },
            url: task.web,
            actions: [
                createAction({
                    name: "answer",
                    description: "Give final answer",
                    schema: z.string(),
                    resolver: async ({ input, agent }) => {
                        console.log("ANSWER GIVEN:", input);
                        await agent.queueDone();
                    },
                }),
            ],
            narrate: true,
            prompt: `Be careful to satisfy the task criteria precisely. If sequences of actions are failing, go one action at at time.\nConsider that today is ${formattedDate}.`,
            screenshotMemoryLimit: 3,
        });

        agent.events.on("tokensUsed", async (usage) => {
            totalInputTokens += usage.inputTokens;
            totalOutputTokens += usage.outputTokens;
            totalInputCost += usage.inputCost ?? 0.0;
            totalOutputCost += usage.inputCost ?? 0.0;
        });

        agent.events.on("actionDone", async () => {
            const memory = await agent.memory.toJSON();
            actionCount += 1;

            fs.writeFileSync(
                path.join("results", `${task.id}.json`),
                JSON.stringify(
                    {
                        time: Date.now() - startTime,
                        actionCount,
                        totalInputTokens,
                        totalOutputTokens,
                        totalInputCost,
                        totalOutputCost,
                        memory,
                    },
                    null,
                    4,
                ),
            );
        });

        // Set up timeout
        const TIMEOUT_MS = 20 * 60 * 1000; // 20 minutes
        await Promise.race([
            agent.act(task.ques),
            new Promise<void>((_, reject) => {
                setTimeout(() => {
                    reject(new Error(`Task timed out after 20 minutes`));
                }, TIMEOUT_MS);
            })
        ]);

            console.log(`[Worker] Finished task: ${task.id}`);
            return { success: true, taskId: task.id };

        } catch (error) {
            const errorMessage = (error as Error).message;
            console.error(`[Worker] Error in task ${task.id}:`, error);
            
            // Check if it's a recoverable crash
            const isRecoverableCrash = errorMessage.includes('net::ERR_ABORTED') || 
                                      errorMessage.includes('Target page, context or browser has been closed') ||
                                      errorMessage.includes('Failed to connect') ||
                                      errorMessage.includes('ENOENT');
            
            if (isRecoverableCrash && crashAttempts < MAX_CRASH_RETRIES - 1) {
                crashAttempts++;
                console.log(`[Worker] 🔄 Retrying crashed task ${task.id} (crash attempt ${crashAttempts}/${MAX_CRASH_RETRIES})...`);
                // Small delay before retrying
                await new Promise(resolve => setTimeout(resolve, 2000));
                continue; // Retry the task
            }
            
            // Save error state
            const memory = agent ? await agent.memory.toJSON() : null;
            fs.writeFileSync(
                path.join("results", `${task.id}.json`),
                JSON.stringify(
                    {
                        time: Date.now() - startTime,
                        actionCount,
                        totalInputTokens,
                        totalOutputTokens,
                        totalInputCost,
                        totalOutputCost,
                        memory,
                        error: errorMessage,
                        timedOut: errorMessage.includes('timed out'),
                        crashAttempts: crashAttempts + 1
                    },
                    null,
                    4,
                ),
            );
            
            return { success: false, taskId: task.id, error: errorMessage };
        } finally {
            // Cleanup
            try {
                if (agent) await agent.stop();
            } catch (e) {
                console.error("[Worker] Error stopping agent:", e);
            }
            
            try {
                if (context) await context.close();
            } catch (e) {
                console.error("[Worker] Error closing context:", e);
            }
        }
    }
    
    // Should never reach here
    return { success: false, taskId: task.id, error: 'Max retries exceeded' };
}

// Bun worker message handler
self.onmessage = async (event: MessageEvent) => {
    const { task, runEval } = event.data;
    
    try {
        const result = await runTaskInWorker(task, runEval);
        self.postMessage({ type: 'complete', result });
        
        // Force garbage collection before worker exits
        if (global.gc) {
            global.gc();
        }
    } catch (error) {
        self.postMessage({ type: 'error', error: (error as Error).message });
    }
};