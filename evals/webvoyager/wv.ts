#!/usr/bin/env bun
import { startBrowserAgent } from '../../packages/magnitude-core/src/agent/browserAgent';
//import { webActions } from '../../packages/magnitude-core/src/actions/webActions';
import * as fs from 'fs';
import * as readline from 'readline';
import * as path from 'path';
import { createAction } from '../../packages/magnitude-core/src/actions';
import z from 'zod';
import { Command } from 'commander';
import * as p from '@clack/prompts';
import { Agent } from '../../packages/magnitude-core/src/agent';

const TASKS_PATH = path.join(__dirname, 'data', 'patchedTasks.jsonl');

// src: https://github.com/MinorJerry/WebVoyager/blob/main/evaluation/auto_eval.py
const EVALUATION_PROMPT=`
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
`

interface Task {
    web_name: string;
    id: string;
    ques: string;
    web: string;
}

async function findTaskById(filePath: string, taskId: string): Promise<Task | null> {
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
            console.error('Error parsing JSON line:', error);
        }
    }
    return null;
}

async function getAllTasks(filePath: string, category?: string): Promise<Task[]> {
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
            console.error('Error parsing JSON line:', error);
        }
    }
    return tasks;
}

async function evalTask(taskId: string) {
    const task = (await findTaskById(TASKS_PATH, taskId))!;

    const memoryPath = path.join('results', `${task.id}.json`);
    const memJson = JSON.parse(fs.readFileSync(memoryPath, 'utf-8')).memory;

    const agent = new Agent({
        llm: {
            provider: 'claude-code',
            options: {
                model: 'claude-sonnet-4-20250514',
            }
        },
    });
    await agent.start();
    await agent.memory.loadJSON(memJson);//.load(memoryPath);
    
    // TODO: Implement eval
    const evalResult = await agent.query(EVALUATION_PROMPT, z.object({ reasoning: z.string(), result: z.enum(['SUCCESS', 'NOT SUCCESS']) }));
    console.log(evalResult);

    const evalPath = path.join('results', `${task.id}.eval.json`);
    fs.writeFileSync(evalPath, JSON.stringify(evalResult, null, 4));
    //agent.query('pass fail')
}

async function runTask(taskToRun: Task | string) {
    let task: Task | null = null;

    if (typeof taskToRun === 'string') {
        task = await findTaskById(TASKS_PATH, taskToRun);
    } else {
        task = taskToRun;
    }

    if (!task) {
        const id = typeof taskToRun === 'string' ? taskToRun : taskToRun.id;
        console.error(`Task with ID "${id}" not found in ${TASKS_PATH}.`);
        return;
    }

    console.log(`Running task: ${task.id} - ${task.ques}`);
    console.log(`URL: ${task.web}`);

    const agent = await startBrowserAgent({
        llm: {
            provider: 'claude-code',
            options: {
                model: 'claude-sonnet-4-20250514',
            }
        },
        url: task.web,
        actions: [
            // Instead of typical task actions, have an answer action
            createAction({
                name: 'answer',
                description: 'Give final answer',
                schema: z.string(),
                resolver: async ({ input, agent }) => {
                    console.log("ANSWER GIVEN:", input);
                    await agent.queueDone();
                }
            })
        ],
        narrate: true
    });

    let startTime = Date.now();

    let totalInputTokens = 0;
    let totalOutputTokens = 0;
    let totalInputCost = 0.0;
    let totalOutputCost = 0.0;

    agent.events.on('tokensUsed', async (usage) => {
        totalInputTokens += usage.inputTokens;
        totalOutputTokens += usage.outputTokens;
        totalInputCost += usage.inputCost ?? 0.0;
        totalOutputCost += usage.inputCost ?? 0.0;
    });

    let actionCount = 0;
    agent.events.on('actionDone', async () => {
        const memory = await agent.memory.toJSON();
        //console.log('Memory:', memory);
        actionCount += 1;

        fs.writeFileSync(path.join('results', `${task.id}.json`), JSON.stringify({
            time: Date.now() - startTime,
            actionCount,
            totalInputTokens,
            totalOutputTokens,
            totalInputCost,
            totalOutputCost,
            memory
        } , null, 4));
        
    });

    await agent.act(task.ques);

    await agent.stop();

    // const memory = await agent.memory.toJSON();
    // console.log('Memory:', memory);

    // fs.writeFileSync(path.join('results', task.id), memory);

    console.log(`Finished task: ${task.id}`);
}

async function listCategories() {
    console.log('Available categories:');
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

async function runRandomTask() {
    console.log('Running a random task...');
    const allTasks = await getAllTasks(TASKS_PATH);
    if (allTasks.length === 0) {
        console.error(`No tasks found in ${TASKS_PATH}. Cannot run a random task.`);
        return;
    }
    const randomIndex = Math.floor(Math.random() * allTasks.length);
    const randomTask = allTasks[randomIndex];
    await runTask(randomTask);
}

async function runTasksByCategory(category: string) {
    const categoryTasks = await getAllTasks(TASKS_PATH, category);
    
    if (categoryTasks.length === 0) {
        console.error(`No tasks found for category: ${category}`);
        return;
    }
    
    p.intro(`Found ${categoryTasks.length} tasks in category: ${category}`);
    
    const mode = await p.select({
        message: 'How would you like to run the tasks?',
        options: [
            { value: 'all', label: `Run all ${categoryTasks.length} tasks` },
            { value: 'select', label: 'Select specific tasks to run' }
        ]
    });
    
    if (p.isCancel(mode)) {
        p.cancel('Operation cancelled');
        return;
    }
    
    let tasksToRun: Task[] = [];
    
    if (mode === 'all') {
        tasksToRun = categoryTasks;
    } else {
        const selectedIds = await p.multiselect({
            message: 'Select tasks to run:',
            options: categoryTasks.map(task => ({
                value: task.id,
                label: `${task.id}: ${task.ques.substring(0, 80)}${task.ques.length > 80 ? '...' : ''}`
            })),
            required: true
        });
        
        if (p.isCancel(selectedIds)) {
            p.cancel('Operation cancelled');
            return;
        }
        
        tasksToRun = categoryTasks.filter(task => 
            (selectedIds as string[]).includes(task.id)
        );
    }
    
    p.outro(`Running ${tasksToRun.length} task${tasksToRun.length !== 1 ? 's' : ''}`);
    
    // Run tasks one at a time
    for (let i = 0; i < tasksToRun.length; i++) {
        const task = tasksToRun[i];
        console.log(`\n[${i + 1}/${tasksToRun.length}] Running task: ${task.id}`);
        await runTask(task);
    }
    
    console.log(`\nCompleted ${tasksToRun.length} task${tasksToRun.length !== 1 ? 's' : ''} in category ${category}`);
}

const program = new Command();

program
    .name('webvoyager-eval')
    .description('Run WebVoyager evaluation tasks')
    .version('1.0.0');

program
    .command('task <taskId>')
    .description('Run a specific task by ID')
    .action(async (taskId: string) => {
        await runTask(taskId);
    });

program
    .command('random')
    .description('Run a random task')
    .action(async () => {
        await runRandomTask();
    });

program
    .command('category [name]')
    .description('Run all tasks in a specific category')
    .action(async (name?: string) => {
        let category = name;
        
        if (!category) {
            // Get all categories first
            const allTasks = await getAllTasks(TASKS_PATH);
            const categories = new Map<string, number>();
            
            for (const task of allTasks) {
                categories.set(task.web_name, (categories.get(task.web_name) || 0) + 1);
            }
            
            const categoryOptions = Array.from(categories.entries()).map(([cat, count]) => ({
                value: cat,
                label: `${cat} (${count} tasks)`
            }));
            
            const selected = await p.select({
                message: 'Select a category:',
                options: categoryOptions
            });
            
            if (p.isCancel(selected)) {
                p.cancel('Operation cancelled');
                return;
            }
            
            category = selected as string;
        }
        
        await runTasksByCategory(category);
    });

program
    .command('list')
    .description('List all available categories')
    .action(async () => {
        await listCategories();
    });

program
    .command('eval <taskId>')
    .description('Evaluate tasks that have been run')
    .action(async (taskId: string) => {
        await evalTask(taskId);
    })

// Default action when no command is provided
// program
//     .action(async () => {
//         await runRandomTask();
//     });

program.parseAsync().catch(console.error);
