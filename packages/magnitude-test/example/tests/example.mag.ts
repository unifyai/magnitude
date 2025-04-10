import { test } from 'magnitude-test';

// test.group('Authorization', () => {
//     test('login')
//         .step("Log in to the app")
//             .data({ email: 'test-user@magnitude.run' })
//             .secureData({ password: 'test' })
//             .check('dashboard is visible');
// });

// test('login')
//     .step("Log in to the app")
//         .data({ email: 'test-user@magnitude.run' })
//         .secureData({ password: 'test' })
//         .check('dashboard is visible');

// test('create todo', { url: 'https://demo.playwright.dev/todomvc' })
//     .step('Create a todo')
//         .check('Todo is added')

const sampleTodos = [
    "Take out the trash",
    //"foo",
    "Buy groceries",
    "Build more test cases with Magnitude"
];

test.group('todo demo tests', { url: 'https://demo.playwright.dev/todomvc' }, () => {
    // test('can add a todo')
    //     .step('Enter and add a todo')
    //         .data({ todo: sampleTodos[0]! })
    //         .check('Todo appears')

    test('can add todos')
        .step('Create 3 todos')
            .data(sampleTodos.join(", "))
            .check('Should see all 3 todos')
        .step('Mark each todo complete')
            .check('Says no items left')

    // test('can mark todos complete')
    //     .step('Add a todo')
    //         .check('Says one item left')
    //     .step('Mark the todo as done')
    //         .check('Says no items left')
})


// test('scroll test', { url: 'https://en.wikipedia.org/wiki/Sloth' })
//     .step('scroll to bottom')

// test('company-create', { url: `https://qa-bench.com` })
//     .step("Login to the app")
//         .check("Can see dashboard")
//         .data({ username: "test-user@magnitude.run" })
//         .secureData({ password: "test" })
//     .step("Create a new company")
//         .data("Make up the first 2 values and use defaults for the rest")
//         .check("Company added successfully");

// Example URL override, defaults to configured baseUrl
// test('can login with valid credentials')
//     .step('Log in to the app')
//         .data({ username: "test-user@magnitude.run" }) // arbitrary key/values
//         .secureData({ password: "test" }) // sensitive data
//         .check('Can see dashboard') // natural language assertion
//     // .step('Create a new company')
//     //     .data("Make up the first 2 values and use defaults for the rest")
//     //     .check("Company added successfully");


// test.group('Company Management', { url: 'https://qa-bench.com' }, () => {

//     test('company-create', { url: `https://qa-bench.com` })
//         .step("Login to the app")
//             .check("Can see dashboard")
//             .data({ username: "test-user@magnitude.run" })
//             .secureData({ password: "test" })
//         .step("Create a new company")
//             .data("Make up the first 2 values and use defaults for the rest")
//             .check("Company added successfully");  
        
//     // test('login')
//     //     .step("Log in to the app")
//     //         .data({ email: 'test-user@magnitude.run' })
//     //         .secureData({ password: 'test' })
//     //         .check('dashboard is visible');
    
//     // Adding a bug, should show a problem
//     // test('company-create', { url: `https://qa-bench.com?bugs=["companies.create.failSilently"]` })
//     //     .step("Login to the app")
//     //         .check("Can see dashboard")
//     //         .data({ username: "test-user@magnitude.run" })
//     //         .secureData({ password: "test" })
//     //     .step("Create a new company")
//     //         .data("Make up the first 2 values and use defaults for the rest")
//     //         .check("Company added successfully");  
// });
