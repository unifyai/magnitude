import { Command } from 'commander';
import * as fs from 'fs';
import * as path from 'path';
import { RemoteTestRunner } from './server';
import { RemoteRunnerClient } from './client';

const program = new Command();

program
    .name('magnitude-remote')
    .description('Remote runner for Magnitude test case agents')

program
    .command('server')
    .action(async (options: { }) => {
        const server = new RemoteTestRunner();
        server.start();
    });

program
    .command('client')
    .action(async (options: { }) => {
        console.log("client starting")
        const client = new RemoteRunnerClient();
        await client.run();
        console.log("client done")

        // await new Promise((resolve, reject) => {
        //     await client.start();
        // })
        
    });

program.parse();
