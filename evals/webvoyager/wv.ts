#!/usr/bin/env bun
import { startBrowserAgent } from "../../packages/magnitude-core/src/agent/browserAgent";
//import { webActions } from '../../packages/magnitude-core/src/actions/webActions';
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
  await agent.memory.loadJSON(memJson); //.load(memoryPath);

  // TODO: Implement eval
  const evalResult = await agent.query(
    EVALUATION_PROMPT,
    z.object({
      reasoning: z.string(),
      result: z.enum(["SUCCESS", "NOT SUCCESS"]),
    }),
  );
  console.log(evalResult);

  const evalPath = path.join("results", `${task.id}.eval.json`);
  fs.writeFileSync(evalPath, JSON.stringify(evalResult, null, 4));
  //agent.query('pass fail')
}

async function findUnevaluatedTasks(): Promise<string[]> {
  const unevaluatedTasks: string[] = [];

  // Check if results directory exists
  if (!fs.existsSync("results")) {
    return unevaluatedTasks;
  }

  // Get all result files
  const files = fs.readdirSync("results");
  const resultFiles = files.filter(
    (f) => f.endsWith(".json") && !f.endsWith(".eval.json"),
  );

  for (const resultFile of resultFiles) {
    const taskId = resultFile.replace(".json", "");
    const evalPath = path.join("results", `${taskId}.eval.json`);

    // Check if eval file exists
    if (!fs.existsSync(evalPath)) {
      unevaluatedTasks.push(taskId);
    }
  }

  return unevaluatedTasks;
}

async function evalAllUnevaluated(workers: number = 1) {
  const unevaluatedTasks = await findUnevaluatedTasks();

  if (unevaluatedTasks.length === 0) {
    console.log("No unevaluated tasks found.");
    return;
  }

  console.log(
    `Found ${unevaluatedTasks.length} unevaluated task${unevaluatedTasks.length !== 1 ? "s" : ""}`,
  );

  if (workers === 1) {
    // Evaluate tasks one at a time
    for (let i = 0; i < unevaluatedTasks.length; i++) {
      const taskId = unevaluatedTasks[i];
      console.log(
        `\n[${i + 1}/${unevaluatedTasks.length}] Evaluating task: ${taskId}`,
      );
      try {
        await evalTask(taskId);
      } catch (error) {
        console.error(`Error evaluating task ${taskId}:`, error);
      }
    }
  } else {
    // Evaluate tasks in parallel with worker pool
    let taskIndex = 0;
    let completedTasks = 0;

    const runWorker = async (workerId: number) => {
      while (taskIndex < unevaluatedTasks.length) {
        const currentIndex = taskIndex++;
        const taskId = unevaluatedTasks[currentIndex];

        console.log(
          `\n[Worker ${workerId}] Starting evaluation ${currentIndex + 1}/${unevaluatedTasks.length}: ${taskId}`,
        );

        try {
          await evalTask(taskId);
          completedTasks++;
          console.log(
            `\n[Worker ${workerId}] Completed evaluation ${currentIndex + 1}/${unevaluatedTasks.length}: ${taskId} (${completedTasks} total completed)`,
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

    // Start all workers
    const workerPromises: Promise<void>[] = [];
    for (let i = 0; i < workers; i++) {
      workerPromises.push(runWorker(i + 1));
    }

    // Wait for all workers to complete
    await Promise.all(workerPromises);
  }

  console.log(
    `\nCompleted evaluation of ${unevaluatedTasks.length} task${unevaluatedTasks.length !== 1 ? "s" : ""}`,
  );
}

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

  const agent = await startBrowserAgent({
    llm: {
      provider: "claude-code",
      options: {
        model: "claude-sonnet-4-20250514",
      },
    },
    url: task.web,
    actions: [
      // Instead of typical task actions, have an answer action
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
    //console.log('Memory:', memory);
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

  await agent.act(task.ques);

  await agent.stop();

  // const memory = await agent.memory.toJSON();
  // console.log('Memory:', memory);

  // fs.writeFileSync(path.join('results', task.id), memory);

  console.log(`Finished task: ${task.id}`);
}

async function listCategories() {
  console.log("Available categories:");
  const allTasks = await getAllTasks(TASKS_PATH);
  const categories = new Map<string, number>();

  for (const task of allTasks) {
    categories.set(task.web_name, (categories.get(task.web_name) || 0) + 1);
  }

  // Keep original order from Map insertion
  for (const [category, count] of categories) {
    console.log(`  ${category}: ${count} tasks`);
  }
}

async function showStats(verbose: boolean = false) {
  // Get all eval results
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

  // Category statistics
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

  // Process each eval file
  for (const evalFile of evalFiles) {
    const taskId = evalFile.replace(".eval.json", "");
    const evalPath = path.join(resultsDir, evalFile);
    const resultPath = path.join(resultsDir, `${taskId}.json`);

    try {
      // Read eval result
      const evalData = JSON.parse(fs.readFileSync(evalPath, "utf-8"));
      const isSuccess = evalData.result === "SUCCESS";

      // Extract category from task ID (format: Category--number)
      const category = taskId.split("--")[0];

      // Initialize category stats if needed
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

      // Read cost and action data from result file
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

      // Store individual task data if verbose
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

  // Display statistics
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

    // Show individual task details if verbose
    if (verbose && stats.tasks) {
      // Sort tasks by ID for consistent display
      stats.tasks.sort((a, b) => a.taskId.localeCompare(b.taskId));
      
      for (const task of stats.tasks) {
        const timeMin = (task.time / 1000 / 60).toFixed(1);
        const status = task.success ? "✓" : "✗";
        console.log(
          `  ${status} ${task.taskId.padEnd(20)} | Cost: $${task.cost.toFixed(2).padStart(6)} | Actions: ${task.actions.toString().padStart(3)} | Time: ${timeMin.padStart(5)} min`
        );
      }
      console.log(); // Empty line after each category
    }

    totalTasks += stats.total;
    totalSuccess += stats.success;
    totalCost += stats.totalCost;
    totalActions += stats.totalActions;
  }

  // Display totals
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

async function runRandomTask() {
  console.log("Running a random task...");
  const allTasks = await getAllTasks(TASKS_PATH);
  if (allTasks.length === 0) {
    console.error(`No tasks found in ${TASKS_PATH}. Cannot run a random task.`);
    return;
  }
  const randomIndex = Math.floor(Math.random() * allTasks.length);
  const randomTask = allTasks[randomIndex];
  await runTask(randomTask);
}

async function runTasksByCategory(category: string, workers: number = 1, failedOnly: boolean = false) {
  const categoryTasks = await getAllTasks(TASKS_PATH, category);

  if (categoryTasks.length === 0) {
    console.error(`No tasks found for category: ${category}`);
    return;
  }

  let tasksToRun: Task[] = [];

  if (failedOnly) {
    // Filter to only non-successful tasks
    const nonSuccessfulTasks: Task[] = [];
    
    for (const task of categoryTasks) {
      const evalPath = path.join("results", `${task.id}.eval.json`);
      let isSuccess = false;
      
      try {
        const evalData = JSON.parse(fs.readFileSync(evalPath, "utf-8"));
        isSuccess = evalData.result === "SUCCESS";
      } catch {
        // No eval file means task hasn't been evaluated, so include it
        isSuccess = false;
      }
      
      if (!isSuccess) {
        nonSuccessfulTasks.push(task);
      }
    }
    
    if (nonSuccessfulTasks.length === 0) {
      console.log(`All tasks in category ${category} are successful!`);
      return;
    }
    
    console.log(`Found ${nonSuccessfulTasks.length} non-successful tasks (out of ${categoryTasks.length} total) in category: ${category}`);
    tasksToRun = nonSuccessfulTasks;
  } else {
    p.intro(`Found ${categoryTasks.length} tasks in category: ${category}`);

    const mode = await p.select({
      message: "How would you like to run the tasks?",
      options: [
        { value: "all", label: `Run all ${categoryTasks.length} tasks` },
        { value: "select", label: "Select specific tasks to run" },
      ],
    });

    if (p.isCancel(mode)) {
      p.cancel("Operation cancelled");
      return;
    }

    if (mode === "all") {
      tasksToRun = categoryTasks;
    } else {
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
        return;
      }

      tasksToRun = categoryTasks.filter((task) =>
        (selectedIds as string[]).includes(task.id),
      );
    }
  }

  p.outro(
    `Running ${tasksToRun.length} task${tasksToRun.length !== 1 ? "s" : ""} with ${workers} worker${workers !== 1 ? "s" : ""}`,
  );

  if (workers === 1) {
    // Run tasks one at a time
    for (let i = 0; i < tasksToRun.length; i++) {
      const task = tasksToRun[i];
      console.log(`\n[${i + 1}/${tasksToRun.length}] Running task: ${task.id}`);
      await runTask(task);
    }
  } else {
    // Run tasks in parallel with worker pool
    let taskIndex = 0;
    let completedTasks = 0;

    const runWorker = async (workerId: number) => {
      while (taskIndex < tasksToRun.length) {
        const currentIndex = taskIndex++;
        const task = tasksToRun[currentIndex];

        console.log(
          `\n[Worker ${workerId}] Starting task ${currentIndex + 1}/${tasksToRun.length}: ${task.id}`,
        );

        try {
          await runTask(task);
          completedTasks++;
          console.log(
            `\n[Worker ${workerId}] Completed task ${currentIndex + 1}/${tasksToRun.length}: ${task.id} (${completedTasks} total completed)`,
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

    // Start all workers
    const workerPromises: Promise<void>[] = [];
    for (let i = 0; i < workers; i++) {
      workerPromises.push(runWorker(i + 1));
    }

    // Wait for all workers to complete
    await Promise.all(workerPromises);
  }

  console.log(
    `\nCompleted ${tasksToRun.length} task${tasksToRun.length !== 1 ? "s" : ""} in category ${category}`,
  );
}

const program = new Command();

program
  .command("category [name]")
  .description("Run all tasks in a specific category")
  .option("-w, --workers <number>", "Number of parallel workers", "1")
  .action(async (name: string | undefined, options: { workers: string }) => {
    let category = name;

    if (!category) {
      // Get all categories first
      const allTasks = await getAllTasks(TASKS_PATH);
      const categories = new Map<string, number>();

      for (const task of allTasks) {
        categories.set(task.web_name, (categories.get(task.web_name) || 0) + 1);
      }

      const categoryOptions = Array.from(categories.entries()).map(
        ([cat, count]) => ({
          value: cat,
          label: `${cat} (${count} tasks)`,
        }),
      );

      const selected = await p.select({
        message: "Select a category:",
        options: categoryOptions,
      });

      if (p.isCancel(selected)) {
        p.cancel("Operation cancelled");
        return;
      }

      category = selected as string;
    }

    await runTasksByCategory(category, parseInt(options.workers));
  });

program
  .command("list")
  .description("List all available categories")
  .action(async () => {
    await listCategories();
  });

program
  .command("run <taskId>")
  .description("Run a specific task by ID")
  .action(async (taskId: string) => {
    await runTask(taskId);
  });

program
  .command("eval [taskId]")
  .description("Evaluate tasks that have been run")
  .option("-w, --workers <number>", "Number of parallel workers", "1")
  .option("--all", "Evaluate all tasks with results but no eval")
  .action(
    async (
      taskId: string | undefined,
      options: { workers: string; all: boolean },
    ) => {
      const workers = parseInt(options.workers);

      if (options.all) {
        await evalAllUnevaluated(workers);
      } else if (taskId) {
        await evalTask(taskId);
      } else {
        console.error("Please provide a task ID or use --all flag");
      }
    },
  );

program
  .command("stats")
  .description("Show evaluation statistics by category")
  .option("-v, --verbose", "Show detailed stats for each task")
  .action(async (options: { verbose?: boolean }) => {
    await showStats(options.verbose || false);
  });

program
  .command("rr [category]")
  .option("-w, --workers <number>", "Number of parallel workers", "1")
  .action(async (category: string | undefined, options: { workers: string }) => {
    let selectedCategory = category;

    if (!selectedCategory) {
      // Get all categories first
      const allTasks = await getAllTasks(TASKS_PATH);
      const categories = new Map<string, number>();

      for (const task of allTasks) {
        categories.set(task.web_name, (categories.get(task.web_name) || 0) + 1);
      }

      const categoryOptions = Array.from(categories.entries()).map(
        ([cat, count]) => ({
          value: cat,
          label: `${cat} (${count} tasks)`,
        }),
      );

      const selected = await p.select({
        message: "Select a category:",
        options: categoryOptions,
      });

      if (p.isCancel(selected)) {
        p.cancel("Operation cancelled");
        return;
      }

      selectedCategory = selected as string;
    }

    await runTasksByCategory(selectedCategory, parseInt(options.workers), true);
  });

// Default action when no command is provided
// program
//     .action(async () => {
//         await runRandomTask();
//     });

program.parseAsync().catch(console.error);
