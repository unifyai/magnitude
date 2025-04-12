# Magnitude MCP

Before using any tools for Magnitude, ensure that Magnitude is configured in the user's current project.

To do so, search for a `magnitude.config.ts`. If this does not exist, you can assume that the project is not configured.

## Configuring Magnitude

To configure Magnitude in the user's project:

First install the Magnitude test runner in the user's project:
```
npm install magnitude-test
```

Then, initialize a basic test case stcurrructure by running:
```
npx magnitude init
```

This will create a basic tests directory `tests/magnitude` with:
- `magnitude.config.ts`: Magnitude test configuration file
- `example.mag.ts`: An example test file

## Using Tools

Once the project is configured with Magnitude, use tools appropriately to comply with user requests regarding creating and running test cases.
