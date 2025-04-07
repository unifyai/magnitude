import { Command } from 'commander';
import * as fs from 'fs';
import * as path from 'path';
import { RemoteTestRunner } from '@/server';
import { RemoteTestCaseAgent } from '@/client/agent';

const program = new Command();

program
    .name('magnitude-remote')
    .description('Remote runner for Magnitude test case agents')

program
    .command('server')
    .option('-p, --port <port>', 'port to run on', '4444')
    .option('-o, --observer <url>', 'URL of authorizer/observer')
    .option('-s, --sockets-per-tunnel <num>', 'number of sockets to use per HTTP tunnel', '6')
    .action(async (options: { port: number, observer: string, socketsPerTunnel: number }) => {
        const server = new RemoteTestRunner({
            port: Number(options.port),
            observerUrl: options.observer,
            socketsPerTunnel: Number(options.socketsPerTunnel)
        });
        await server.start();
    });

program
    .command('client')
    .action(async (options: { }) => {
        //console.log("client starting")
        const agent = new RemoteTestCaseAgent({
            serverUrl: "https://remote.magnitude.run:4444",
            //serverUrl: "http://localhost:4444",
            //tunnelUrl: "http://localhost:3000",
            listeners: [{
                //onActionTaken(action) { console.log("Did action:", action) }
            }],
            apiKey: process.env.MAGNITUDE_API_KEY,
            //apiKey: 'mag_VRXoq9tXkoWFcmorQBICERG2lME5ozbM',
        });

        const exampleTestCase = {
            url: 'http://magnitude.run',
            //url: "http://localhost:3000",
            steps: [
                {
                    description: "Click get started",
                    checks: [],
                    testData: {}
                    // checks: ["Can see dashboard"],
                    // testData: {
                    //     data: [
                    //         { key: "username", value: "test-user@magnitude.run", sensitive: false },
                    //         { key: "password", value: "test", sensitive: true },
                    //     ] 
                    // }
                },
                // // BOTH parts of this one will fail: it doesnt yet know what company form looks like
                // { description: "Create an example company", checks: ["Example company exists"], testData: {} } // THIS will fail without check adaptation
            ]
        };

        // const exampleTestCase = {
        //     url: "https://qa-bench.com",
        //     steps: [
        //         {
        //             description: "Log in",
        //             checks: ["Can see dashboard"],
        //             testData: {
        //                 data: [
        //                     { key: "username", value: "test-user@magnitude.run", sensitive: false },
        //                     { key: "password", value: "test", sensitive: true },
        //                 ] 
        //             }
        //         },
        //         // // BOTH parts of this one will fail: it doesnt yet know what company form looks like
        //         // { description: "Create an example company", checks: ["Example company exists"], testData: {} } // THIS will fail without check adaptation
        //     ]
        // };

        const result = await agent.run("baz", exampleTestCase);
        //console.log("client done");
        //console.log("Test result:", result);

        // await new Promise((resolve, reject) => {
        //     await client.start();
        // })
        
    });

program.parse();
