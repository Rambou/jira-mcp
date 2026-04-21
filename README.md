# jira-mcp

A Model Context Protocol (MCP) server for common Jira REST API actions.

## Install

```bash
npm install
```

## Configure

Set these environment variables for the MCP server process:

- `JIRA_BASE_URL` (required): Base Jira URL, for example `https://your-domain.atlassian.net`
- `JIRA_TOKEN` (required): Jira API token / PAT
- `JIRA_API_BASE_PATH` (optional): Jira API base path, default `/rest/api/3`

### Example MCP client configuration

This server uses stdio transport. In an MCP client that supports `mcpServers` (for example Claude Desktop/Cline/Cursor), configure it like this:

```json
{
  "mcpServers": {
    "jira": {
      "command": "npx",
      "args": ["-y", "@rambou/jira-mcp"],
      "env": {
        "JIRA_BASE_URL": "https://your-domain.atlassian.net",
        "JIRA_TOKEN": "your-token",
        "JIRA_API_BASE_PATH": "/rest/api/3"
      }
    }
  }
}
```

For local development from this repository, you can also use:

```bash
npm start
```

## Use from MCP clients

1. Add the server configuration in your MCP client.
2. Restart/reload the MCP client.
3. Invoke one of the Jira tools below from your client chat or tool UI.

## Available MCP tools

- `jira_get_issue` - Get issue details by key
- `jira_search_issues` - Search with JQL
- `jira_create_issue` - Create an issue
- `jira_add_comment` - Add a comment to an issue
- `jira_transition_issue` - Transition an issue by transition id
