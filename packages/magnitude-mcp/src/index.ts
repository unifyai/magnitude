#!/usr/bin/env node
import { MagnitudeMCPServer } from './server.js';

/**
 * Main entry point for the Magnitude MCP server
 */
const server = new MagnitudeMCPServer();
server.run().catch(console.log);
