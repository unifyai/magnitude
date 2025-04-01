import { chromium } from "playwright";
import { TestCaseAgent } from "./agent";
import { TestCaseStateTracker } from "./common/state";

async function main() {

    const testCase = {
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
            // BOTH parts of this one will fail: it doesnt yet know what company form looks like
            { description: "Create an example company", checks: ["Example company exists"], testData: {} } // THIS will fail without check adaptation
        ]
    };

    const stateTracker = new TestCaseStateTracker(testCase);

    const agent = new TestCaseAgent({
        listeners: [
            {
                onActionTaken: action => console.log(action),
                // onStepCompleted: () => {},
                // onCheckCompleted: () => {},
            }, 
            stateTracker.getListener()
        ]
    });

    stateTracker.onStateChange(
        state => console.log("Test Case State:\n" + JSON.stringify(state, null, 4))
    )

    const browser = await chromium.launch({ headless: false });
    const result = await agent.run(browser, testCase);

    // HARD
    // const result = await agent.run({
    //     url: "https://app.pickcode.io/lessons",
    //     steps: [
    //         { description: "Start the cookie clicker lesson", checks: [] },
    //         { description: "Follow the entire lesson", checks: [] }
    //     ]
    // });

    console.log("Result:", result);
}

main();