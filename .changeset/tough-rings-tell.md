---
"magnitude-test": minor
---

Each test file and magnitude.config.ts is now loaded in a separate thread using node:worker_threads, so you should be able to use any dependencies and not worry about global variable pollution. 

Deno and Bun are supported to run your tests without an intermediate TypeScript compilation step.