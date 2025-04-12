import { test } from 'magnitude-test';

test('Updated Test Case', { url: "https://example.org" })
    .step('Navigate to homepage')
        .data({"username":"tester"})
        .secureData({"password":"updated_password"})
        .data("Updated test info")
        .check('Page title should be "Example Domain"')
    .step('Click login button')
        .data("New step")
        .check('Should redirect to login page')
