import { Command } from 'commander';
import * as fs from 'fs';
import * as path from 'path';
import { RemoteTestRunner } from './server';
import { RemoteTestCaseAgent } from './client';

const program = new Command();

program
    .name('magnitude-remote')
    .description('Remote runner for Magnitude test case agents')

program
    .command('server')
    .action(async (options: { }) => {
        const server = new RemoteTestRunner();
        await server.start();
    });

program
    .command('client')
    .action(async (options: { }) => {
        console.log("client starting")
        const client = new RemoteTestCaseAgent();

        const exampleTestCase = {
            url: "https://qa-bench.com",
            steps: [
                {
                    description: "Log in",
                    checks: ["Can see dashboard"],
                    testData: {
                        data: [
                            { key: "username", value: "test-user@magnitude.run", sensitive: false },
                            { key: "password", value: "test", sensitive: true },
                        ] 
                    }
                },
                // // BOTH parts of this one will fail: it doesnt yet know what company form looks like
                // { description: "Create an example company", checks: ["Example company exists"], testData: {} } // THIS will fail without check adaptation
            ]
        };

        await client.run(exampleTestCase);
        console.log("client done")

        // await new Promise((resolve, reject) => {
        //     await client.start();
        // })
        
    });

program.parse();
