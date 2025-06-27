#!/usr/bin/env bun
import { startBrowserAgent } from '../../packages/magnitude-core/src/agent/browserAgent';
//import { webActions } from '../../packages/magnitude-core/src/actions/webActions';
import * as fs from 'fs';
import * as readline from 'readline';
import * as path from 'path';
import { createAction } from '../../packages/magnitude-core/src/actions';
import z from 'zod';
import { Command } from 'commander';

const TASKS_PATH = path.join(__dirname, 'data', 'patchedTasks.jsonl');

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
            provider: 'anthropic',
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

    agent.events.on('actionDone', async () => {
        const memory = await agent.memory.toJSON();
        //console.log('Memory:', memory);

        fs.writeFileSync(path.join('results', `${task.id}.json`), JSON.stringify(memory, null, 4));
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
    console.log(`Running all tasks in category: ${category}`);
    const categoryTasks = await getAllTasks(TASKS_PATH, category);
    
    if (categoryTasks.length === 0) {
        console.error(`No tasks found for category: ${category}`);
        return;
    }
    
    console.log(`Found ${categoryTasks.length} tasks in category ${category}`);
    
    // Run tasks one at a time
    for (let i = 0; i < categoryTasks.length; i++) {
        const task = categoryTasks[i];
        console.log(`\n[${i + 1}/${categoryTasks.length}] Running task: ${task.id}`);
        await runTask(task);
    }
    
    console.log(`\nCompleted all ${categoryTasks.length} tasks in category ${category}`);
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
    .command('category <name>')
    .description('Run all tasks in a specific category')
    .action(async (name: string) => {
        await runTasksByCategory(name);
    });

program
    .command('list')
    .description('List all available categories')
    .action(async () => {
        await listCategories();
    });

// Default action when no command is provided
// program
//     .action(async () => {
//         await runRandomTask();
//     });

program.parseAsync().catch(console.error);
