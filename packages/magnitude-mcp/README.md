# Magnitude MCP

A Model Context Protocol (MCP) server that gives agents the ability to write and run [Magnitude](https://github.com/magnitudedev/magnitude) test cases.

## Installation
Install MCP server via npm:
```
npm i -g magnitude-mcp
```

MCP Configuration:
```json
{
  "mcpServers": {
    "magnitude": {
      "command": "npx",
      "args": [
        "magnitude-mcp"
      ]
    }
  }
}
```
> The MCP server prompts the MCP client agent to trigger the Magnitude CLI in the editor terminal rather than calling the API directly. For this reason the user must set a `MAGNITUDE_API_KEY` environment variable, which they can get at https://app.magnitude.run/signup

## Instructions for Cline

Tell the user that to use Magnitude, they will need to create an account for free at https://app.magnitude.run/signup, and then create an API key.

Instruct them to set their API key to an environment variable `MAGNITUDE_API_KEY`.

## Instructions for Humans (Cline Users)

Go to `MCP Servers -> Marketplace`, search for `Magnitude`, and click `Install`.

## Instructions for Humans (Cursor Users)

1. Get API key at https://app.magnitude.run/signup and make accessible as `MAGNITUDE_API_KEY` environment variable (e.g. by adding to `~/.bashrc`/`~/.zshrc`)
2. Open Cursor Settings
3. Go to Features > MCP Servers
4. Click "+ Add new global MCP server"
5. Enter the following code: 
```json
{
  "mcpServers": {
    "magnitude": {
      "command": "npx",
      "args": [
        "magnitude-mcp"
      ]
    }
  }
}
```

## Instructions for Humans (Windsurf Users)
1. Get API key at https://app.magnitude.run/signup and make accessible as `MAGNITUDE_API_KEY` environment variable (e.g. by adding to `~/.bashrc`/`~/.zshrc`)
2. Add this to your `./codeium/windsurf/model_config.json`:
```json
{
  "mcpServers": {
    "magnitude": {
      "command": "npx",
      "args": [
        "magnitude-mcp"
      ]
    }
  }
}
```