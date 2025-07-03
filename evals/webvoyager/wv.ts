#!/usr/bin/env bun
import { startBrowserAgent } from "../../packages/magnitude-core/src/agent/browserAgent";
import * as fs from "fs";
import * as readline from "readline";
import * as path from "path";
import { createAction } from "../../packages/magnitude-core/src/actions";
import z from "zod";
import { Command } from "commander";
import * as p from "@clack/prompts";
import { Agent } from "../../packages/magnitude-core/src/agent";

const TASKS_PATH = path.join(__dirname, "data", "patchedTasks.jsonl");

// src: https://github.com/MinorJerry/WebVoyager/blob/main/evaluation/auto_eval.py
const EVALUATION_PROMPT = `
As an evaluator, you will be presented with three primary components to assist you in your role:

1. Web Task Instruction: This is a clear and specific directive provided in natural language, detailing the online activity to be carried out. These requirements may include conducting searches, verifying information, comparing prices, checking availability, or any other action relevant to the specified web service (such as Amazon, Apple, ArXiv, BBC News, Booking etc).

2. Result Screenshots: This is a visual representation of the screen showing the result or intermediate state of performing a web task. It serves as visual proof of the actions taken in response to the instruction.

3. Result Response: This is a textual response obtained after the execution of the web task. It serves as textual result in response to the instruction.

-- You DO NOT NEED to interact with web pages or perform actions such as booking flights or conducting searches on websites.
-- You SHOULD NOT make assumptions based on information not presented in the screenshot when comparing it to the instructions.
-- Your primary responsibility is to conduct a thorough assessment of the web task instruction against the outcome depicted in the screenshot and in the response, evaluating whether the actions taken align with the given instructions.
-- NOTE that the instruction may involve more than one task, for example, locating the garage and summarizing the review. Failing to complete either task, such as not providing a summary, should be considered unsuccessful.
-- NOTE that the screenshot is authentic, but the response provided by LLM is generated at the end of web browsing, and there may be discrepancies between the text and the screenshots.
-- Note the difference: 1) Result response may contradict the screenshot, then the content of the screenshot prevails, 2) The content in the Result response is not mentioned on the screenshot, choose to believe the content.

You should elaborate on how you arrived at your final evaluation and then provide a definitive verdict on whether the task has been successfully accomplished, either as 'SUCCESS' or 'NOT SUCCESS'.
`;

interface Task {
    web_name: string;
    id: string;
    ques: string;
    web: string;
}

interface RunOptions {
    workers: string;
    eval?: boolean;
    failed?: boolean;
    failedOnly?: boolean;
    replace?: boolean;
}

interface EvalOptions {
    workers: string;
    replace?: boolean;
}

// Helper functions
async function findTaskById(
    filePath: string,
    taskId: string,
): Promise<Task | null> {
    const fileStream = fs.createReadStream(filePath);
    const rl = readline.createInterface({
        input: fileStream,
        crlfDelay: Infinity,
    });

    for await (const line of rl) {
        try {
            const task: Task = JSON.parse(line);
            if (task.id === taskId) {
                return task;
            }
        } catch (error) {
            console.error("Error parsing JSON line:", error);
        }
    }
    return null;
}

async function getAllTasks(
    filePath: string,
    category?: string,
): Promise<Task[]> {
    const tasks: Task[] = [];
    const fileStream = fs.createReadStream(filePath);
    const rl = readline.createInterface({
        input: fileStream,
        crlfDelay: Infinity,
    });

    for await (const line of rl) {
        try {
            const task: Task = JSON.parse(line);
            if (!category || task.web_name === category) {
                tasks.push(task);
            }
        } catch (error) {
            console.error("Error parsing JSON line:", error);
        }
    }
    return tasks;
}

async function getCategories(): Promise<Map<string, number>> {
    const allTasks = await getAllTasks(TASKS_PATH);
    const categories = new Map<string, number>();

    for (const task of allTasks) {
        categories.set(task.web_name, (categories.get(task.web_name) || 0) + 1);
    }

    return categories;
}

function isTaskId(input: string): boolean {
    // Task IDs have format "Category--number"
    return input.includes("--");
}

async function selectCategories(): Promise<string[] | null> {
    const categories = await getCategories();
    
    // Calculate total tasks
    let totalTasks = 0;
    for (const [_, count] of categories) {
        totalTasks += count;
    }
    
    // First ask: all or specific
    const mode = await p.select({
        message: "Which categories would you like to run?",
        options: [
            { value: "all", label: `All Categories (${totalTasks} tasks total)` },
            { value: "specific", label: "Select specific categories" },
        ],
    });

    if (p.isCancel(mode)) {
        p.cancel("Operation cancelled");
        return null;
    }

    if (mode === "all") {
        return Array.from(categories.keys());
    }

    // User chose specific - show multiselect
    const categoryOptions = Array.from(categories.entries()).map(
        ([cat, count]) => ({
            value: cat,
            label: `${cat} (${count} tasks)`,
        }),
    );

    const selected = await p.multiselect({
        message: "Select categories:",
        options: categoryOptions,
        required: true,
    });

    if (p.isCancel(selected)) {
        p.cancel("Operation cancelled");
        return null;
    }

    return selected as string[];
}

async function selectTasksFromCategory(category: string): Promise<Task[] | null> {
    const categoryTasks = await getAllTasks(TASKS_PATH, category);

    const mode = await p.select({
        message: `Found ${categoryTasks.length} tasks in ${category}. How would you like to proceed?`,
        options: [
            { value: "all", label: `Run all ${categoryTasks.length} tasks` },
            { value: "select", label: "Select specific tasks" },
        ],
    });

    if (p.isCancel(mode)) {
        p.cancel("Operation cancelled");
        return null;
    }

    if (mode === "all") {
        return categoryTasks;
    }

    const selectedIds = await p.multiselect({
        message: "Select tasks to run:",
        options: categoryTasks.map((task) => ({
            value: task.id,
            label: `${task.id}: ${task.ques.substring(0, 80)}${task.ques.length > 80 ? "..." : ""}`,
        })),
        required: true,
    });

    if (p.isCancel(selectedIds)) {
        p.cancel("Operation cancelled");
        return null;
    }

    return categoryTasks.filter((task) =>
        (selectedIds as string[]).includes(task.id),
    );
}

async function getTaskStatus(taskId: string): Promise<{
    hasRun: boolean;
    hasEval: boolean;
    isSuccess: boolean;
}> {
    const resultPath = path.join("results", `${taskId}.json`);
    const evalPath = path.join("results", `${taskId}.eval.json`);
    
    const hasRun = fs.existsSync(resultPath);
    const hasEval = fs.existsSync(evalPath);
    let isSuccess = false;

    if (hasEval) {
        try {
            const evalData = JSON.parse(fs.readFileSync(evalPath, "utf-8"));
            isSuccess = evalData.result === "SUCCESS";
        } catch {
            // Error reading eval
        }
    }

    return { hasRun, hasEval, isSuccess };
}

async function filterTasksByOptions(tasks: Task[], options: RunOptions): Promise<Task[]> {
    const filteredTasks: Task[] = [];

    for (const task of tasks) {
        const status = await getTaskStatus(task.id);

        if (options.replace) {
            // Run all tasks regardless of status
            filteredTasks.push(task);
        } else if (options.failedOnly) {
            // Only run failed tasks (has run but not successful)
            if (status.hasRun && !status.isSuccess) {
                filteredTasks.push(task);
            }
        } else if (options.failed) {
            // Run failed tasks and unrun tasks
            if (!status.hasRun || !status.isSuccess) {
                filteredTasks.push(task);
            }
        } else {
            // Default: only run tasks that haven't been run
            if (!status.hasRun) {
                filteredTasks.push(task);
            }
        }
    }

    return filteredTasks;
}

// Core task execution functions
async function runTask(taskToRun: Task | string) {
    let task: Task | null = null;

    if (typeof taskToRun === "string") {
        task = await findTaskById(TASKS_PATH, taskToRun);
    } else {
        task = taskToRun;
    }

    if (!task) {
        const id = typeof taskToRun === "string" ? taskToRun : taskToRun.id;
        console.error(`Task with ID "${id}" not found in ${TASKS_PATH}.`);
        return;
    }

    // Remove old evaluation file if it exists
    const evalPath = path.join("results", `${task.id}.eval.json`);
    if (fs.existsSync(evalPath)) {
        fs.unlinkSync(evalPath);
        console.log(`Removed old evaluation file: ${evalPath}`);
    }

    console.log(`Running task: ${task.id} - ${task.ques}`);
    console.log(`URL: ${task.web}`);

    const date = new Date();
    const formattedDate = date.toLocaleDateString('en-US', {
        month: 'long',
        day: 'numeric',
        year: 'numeric'
    });

    const agent = await startBrowserAgent({
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
        prompt: `Be careful to satisfy the task criteria precisely. If sequences of actions are failing, go one action at at time.\nConsider that today is ${formattedDate}.`
    });

    let startTime = Date.now();

    let totalInputTokens = 0;
    let totalOutputTokens = 0;
    let totalInputCost = 0.0;
    let totalOutputCost = 0.0;

    agent.events.on("tokensUsed", async (usage) => {
        totalInputTokens += usage.inputTokens;
        totalOutputTokens += usage.outputTokens;
        totalInputCost += usage.inputCost ?? 0.0;
        totalOutputCost += usage.inputCost ?? 0.0;
    });

    let actionCount = 0;
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

    // Set up 15-minute timeout
    const TIMEOUT_MS = 15 * 60 * 1000; // 15 minutes
    let timeoutId: NodeJS.Timeout | null = null;
    let isTimedOut = false;

    try {
        await Promise.race([
            agent.act(task.ques),
            new Promise<void>((_, reject) => {
                timeoutId = setTimeout(() => {
                    isTimedOut = true;
                    reject(new Error(`Task timed out after 15 minutes`));
                }, TIMEOUT_MS);
            })
        ]);
    } catch (error) {
        if (isTimedOut) {
            console.log(`\n⏱️ Task ${task.id} timed out after 15 minutes`);
            
            const memory = await agent.memory.toJSON();
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
                        timedOut: true,
                        timeoutAt: TIMEOUT_MS
                    },
                    null,
                    4,
                ),
            );
        } else {
            throw error;
        }
    } finally {
        if (timeoutId) {
            clearTimeout(timeoutId);
        }
        await agent.stop();
    }

    console.log(`Finished task: ${task.id}`);
}

async function evalTask(taskId: string) {
    const task = (await findTaskById(TASKS_PATH, taskId))!;

    const memoryPath = path.join("results", `${task.id}.json`);
    const memJson = JSON.parse(fs.readFileSync(memoryPath, "utf-8")).memory;

    const agent = new Agent({
        llm: {
            provider: "claude-code",
            options: {
                model: "claude-sonnet-4-20250514",
            },
        },
    });
    await agent.start();
    await agent.memory.loadJSON(memJson);

    const evalResult = await agent.query(
        EVALUATION_PROMPT + "\n\n" + `TASK: ${task.ques}`,
        z.object({
            reasoning: z.string(),
            result: z.enum(["SUCCESS", "NOT SUCCESS"]),
        }),
    );
    console.log(evalResult);

    const evalPath = path.join("results", `${task.id}.eval.json`);
    fs.writeFileSync(evalPath, JSON.stringify(evalResult, null, 4));
}

async function runTasksParallel(tasks: Task[], workers: number, runEval: boolean = false) {
    if (workers === 1) {
        // Run tasks one at a time
        for (let i = 0; i < tasks.length; i++) {
            const task = tasks[i];
            console.log(`\n[${i + 1}/${tasks.length}] Running task: ${task.id}`);
            await runTask(task);
            
            if (runEval) {
                console.log(`Evaluating task: ${task.id}`);
                await evalTask(task.id);
            }
        }
    } else {
        // Run tasks in parallel with worker pool
        let taskIndex = 0;
        let completedTasks = 0;

        const runWorker = async (workerId: number) => {
            while (taskIndex < tasks.length) {
                const currentIndex = taskIndex++;
                const task = tasks[currentIndex];

                console.log(
                    `\n[Worker ${workerId}] Starting task ${currentIndex + 1}/${tasks.length}: ${task.id}`,
                );

                try {
                    await runTask(task);
                    
                    if (runEval) {
                        console.log(`[Worker ${workerId}] Evaluating task: ${task.id}`);
                        await evalTask(task.id);
                    }
                    
                    completedTasks++;
                    console.log(
                        `\n[Worker ${workerId}] Completed task ${currentIndex + 1}/${tasks.length}: ${task.id} (${completedTasks} total completed)`,
                    );
                } catch (error) {
                    console.error(
                        `\n[Worker ${workerId}] Error in task ${task.id}:`,
                        error,
                    );
                    completedTasks++;
                }
            }
        };

        const workerPromises: Promise<void>[] = [];
        for (let i = 0; i < workers; i++) {
            workerPromises.push(runWorker(i + 1));
        }

        await Promise.all(workerPromises);
    }

    console.log(`\nCompleted ${tasks.length} task${tasks.length !== 1 ? "s" : ""}`);
}

async function evalTasksParallel(taskIds: string[], workers: number) {
    if (workers === 1) {
        for (let i = 0; i < taskIds.length; i++) {
            const taskId = taskIds[i];
            console.log(`\n[${i + 1}/${taskIds.length}] Evaluating task: ${taskId}`);
            try {
                await evalTask(taskId);
            } catch (error) {
                console.error(`Error evaluating task ${taskId}:`, error);
            }
        }
    } else {
        let taskIndex = 0;
        let completedTasks = 0;

        const runWorker = async (workerId: number) => {
            while (taskIndex < taskIds.length) {
                const currentIndex = taskIndex++;
                const taskId = taskIds[currentIndex];

                console.log(
                    `\n[Worker ${workerId}] Starting evaluation ${currentIndex + 1}/${taskIds.length}: ${taskId}`,
                );

                try {
                    await evalTask(taskId);
                    completedTasks++;
                    console.log(
                        `\n[Worker ${workerId}] Completed evaluation ${currentIndex + 1}/${taskIds.length}: ${taskId} (${completedTasks} total completed)`,
                    );
                } catch (error) {
                    console.error(
                        `\n[Worker ${workerId}] Error evaluating task ${taskId}:`,
                        error,
                    );
                    completedTasks++;
                }
            }
        };

        const workerPromises: Promise<void>[] = [];
        for (let i = 0; i < workers; i++) {
            workerPromises.push(runWorker(i + 1));
        }

        await Promise.all(workerPromises);
    }

    console.log(`\nCompleted evaluation of ${taskIds.length} task${taskIds.length !== 1 ? "s" : ""}`);
}

// Commands
const program = new Command();

program
    .command("run [input]")
    .description("Run tasks by category or task ID")
    .option("-w, --workers <number>", "Number of parallel workers", "1")
    .option("--eval", "Automatically run evaluation after each task")
    .option("--failed", "Include failed tasks (default: only unrun tasks)")
    .option("--failed-only", "Only run failed tasks")
    .option("--replace", "Run all tasks regardless of status")
    .action(async (input: string | undefined, options: RunOptions) => {
        const workers = parseInt(options.workers);
        let tasksToRun: Task[] = [];

        if (input && isTaskId(input)) {
            // Single task ID provided
            const task = await findTaskById(TASKS_PATH, input);
            if (!task) {
                console.error(`Task ${input} not found`);
                return;
            }
            tasksToRun = [task];
        } else if (input) {
            // Category name provided
            const categoryTasks = await getAllTasks(TASKS_PATH, input);
            if (categoryTasks.length === 0) {
                console.error(`No tasks found for category: ${input}`);
                return;
            }
            
            // Ask for task selection
            const selectedTasks = await selectTasksFromCategory(input);
            if (!selectedTasks) return;
            
            tasksToRun = await filterTasksByOptions(selectedTasks, options);
        } else {
            // No input - ask for categories
            const selectedCategories = await selectCategories();
            if (!selectedCategories) return;

            if (selectedCategories.length === 1) {
                // Single category - ask for task selection
                const selectedTasks = await selectTasksFromCategory(selectedCategories[0]);
                if (!selectedTasks) return;
                
                tasksToRun = await filterTasksByOptions(selectedTasks, options);
            } else {
                // Multiple categories - run all tasks in each
                for (const category of selectedCategories) {
                    const categoryTasks = await getAllTasks(TASKS_PATH, category);
                    const filteredTasks = await filterTasksByOptions(categoryTasks, options);
                    tasksToRun.push(...filteredTasks);
                }
            }
        }

        if (tasksToRun.length === 0) {
            console.log("No tasks match the criteria");
            return;
        }

        p.outro(`Running ${tasksToRun.length} task${tasksToRun.length !== 1 ? "s" : ""} with ${workers} worker${workers !== 1 ? "s" : ""}`);
        
        await runTasksParallel(tasksToRun, workers, options.eval || false);
    });

program
    .command("eval [input]")
    .description("Evaluate tasks by category or task ID")
    .option("-w, --workers <number>", "Number of parallel workers", "1")
    .option("--replace", "Re-run evaluations even if they already exist")
    .action(async (input: string | undefined, options: EvalOptions) => {
        const workers = parseInt(options.workers);
        let taskIdsToEval: string[] = [];

        if (input && isTaskId(input)) {
            // Single task ID provided
            taskIdsToEval = [input];
        } else if (input) {
            // Category name provided
            const categoryTasks = await getAllTasks(TASKS_PATH, input);
            if (categoryTasks.length === 0) {
                console.error(`No tasks found for category: ${input}`);
                return;
            }
            
            // Filter to tasks that have been run
            for (const task of categoryTasks) {
                const status = await getTaskStatus(task.id);
                if (status.hasRun && (options.replace || !status.hasEval)) {
                    taskIdsToEval.push(task.id);
                }
            }
        } else {
            // No input - ask for categories
            const selectedCategories = await selectCategories();
            if (!selectedCategories) return;

            for (const category of selectedCategories) {
                const categoryTasks = await getAllTasks(TASKS_PATH, category);
                for (const task of categoryTasks) {
                    const status = await getTaskStatus(task.id);
                    if (status.hasRun && (options.replace || !status.hasEval)) {
                        taskIdsToEval.push(task.id);
                    }
                }
            }
        }

        if (taskIdsToEval.length === 0) {
            console.log("No tasks need evaluation");
            return;
        }

        p.outro(`Evaluating ${taskIdsToEval.length} task${taskIdsToEval.length !== 1 ? "s" : ""} with ${workers} worker${workers !== 1 ? "s" : ""}`);
        
        await evalTasksParallel(taskIdsToEval, workers);
    });

program
    .command("stats")
    .description("Show evaluation statistics")
    .option("-v, --verbose", "Show detailed stats for each task")
    .action(async (options: { verbose?: boolean }) => {
        await showStats(options.verbose || false);
    });

async function showStats(verbose: boolean = false) {
    const resultsDir = "results";
    if (!fs.existsSync(resultsDir)) {
        console.log("No results directory found.");
        return;
    }

    const files = fs.readdirSync(resultsDir);
    const evalFiles = files.filter(f => f.endsWith(".eval.json"));

    if (evalFiles.length === 0) {
        console.log("No evaluation results found.");
        return;
    }

    const categoryStats = new Map<string, {
        total: number;
        success: number;
        totalCost: number;
        totalActions: number;
        tasks?: Array<{
            taskId: string;
            success: boolean;
            cost: number;
            actions: number;
            time: number;
        }>;
    }>();

    for (const evalFile of evalFiles) {
        const taskId = evalFile.replace(".eval.json", "");
        const evalPath = path.join(resultsDir, evalFile);
        const resultPath = path.join(resultsDir, `${taskId}.json`);

        try {
            const evalData = JSON.parse(fs.readFileSync(evalPath, "utf-8"));
            const isSuccess = evalData.result === "SUCCESS";

            const category = taskId.split("--")[0];

            if (!categoryStats.has(category)) {
                categoryStats.set(category, {
                    total: 0,
                    success: 0,
                    totalCost: 0,
                    totalActions: 0,
                    tasks: verbose ? [] : undefined,
                });
            }

            const stats = categoryStats.get(category)!;
            stats.total += 1;
            if (isSuccess) {
                stats.success += 1;
            }

            let taskCost = 0;
            let taskActions = 0;
            let taskTime = 0;

            if (fs.existsSync(resultPath)) {
                const resultData = JSON.parse(fs.readFileSync(resultPath, "utf-8"));
                taskCost = (resultData.totalInputCost || 0) + (resultData.totalOutputCost || 0);
                taskActions = resultData.actionCount || 0;
                taskTime = resultData.time || 0;

                stats.totalCost += taskCost;
                stats.totalActions += taskActions;
            }

            if (verbose && stats.tasks) {
                stats.tasks.push({
                    taskId,
                    success: isSuccess,
                    cost: taskCost,
                    actions: taskActions,
                    time: taskTime,
                });
            }
        } catch (error) {
            console.error(`Error processing ${evalFile}:`, error);
        }
    }

    console.log("\n=== Evaluation Statistics by Category ===\n");
    console.log("Category         | Success Rate      | Avg Cost   | Avg Actions");
    console.log("-----------------|-------------------|------------|------------");

    let totalTasks = 0;
    let totalSuccess = 0;
    let totalCost = 0;
    let totalActions = 0;

    for (const [category, stats] of categoryStats) {
        const successRate = (stats.success / stats.total) * 100;
        const avgCost = stats.totalCost / stats.total;
        const avgActions = stats.totalActions / stats.total;

        console.log(
            `${category.padEnd(16)} | ${stats.success}/${stats.total} (${successRate.toFixed(1)}%)`.padEnd(37) +
            ` | $${avgCost.toFixed(2).padStart(8)} | ${avgActions.toFixed(1).padStart(10)}`
        );

        if (verbose && stats.tasks) {
            stats.tasks.sort((a, b) => a.taskId.localeCompare(b.taskId));

            for (const task of stats.tasks) {
                const timeMin = (task.time / 1000 / 60).toFixed(1);
                const status = task.success ? "✓" : "✗";
                console.log(
                    `  ${status} ${task.taskId.padEnd(20)} | Cost: $${task.cost.toFixed(2).padStart(6)} | Actions: ${task.actions.toString().padStart(3)} | Time: ${timeMin.padStart(5)} min`
                );
            }
            console.log();
        }

        totalTasks += stats.total;
        totalSuccess += stats.success;
        totalCost += stats.totalCost;
        totalActions += stats.totalActions;
    }

    console.log("-----------------|-------------------|------------|------------");
    const overallSuccessRate = (totalSuccess / totalTasks) * 100;
    const overallAvgCost = totalCost / totalTasks;
    const overallAvgActions = totalActions / totalTasks;

    console.log(
        `${"TOTAL".padEnd(16)} | ${totalSuccess}/${totalTasks} (${overallSuccessRate.toFixed(1)}%)`.padEnd(37) +
        ` | $${overallAvgCost.toFixed(2).padStart(8)} | ${overallAvgActions.toFixed(1).padStart(10)}`
    );

    console.log(`\nTotal evaluated tasks: ${totalTasks}`);
}

program.parseAsync().catch(console.error);