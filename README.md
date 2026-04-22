# jira-mcp

A Model Context Protocol (MCP) server for common Jira REST API actions, with built-in Tempo Timesheets worklog support for Jira Server/Data Center.

## Install

```bash
npm install
```

## Configure

Set these environment variables for the MCP server process:

- `JIRA_BASE_URL` (required): Base Jira URL, for example `https://jira.example.com`
- `JIRA_TOKEN` (required): Jira API token or Personal Access Token — also used to authenticate against the Tempo Timesheets plugin
- `JIRA_API_BASE_PATH` (optional): Jira API base path, default `/rest/api/3`

> **Note:** No separate Tempo credentials are needed. The Tempo Timesheets API is accessed at `{JIRA_BASE_URL}/rest/tempo-timesheets/4` using the same `JIRA_TOKEN`.

### Example MCP client configuration

This server uses stdio transport. In an MCP client that supports `mcpServers` (for example Claude Desktop/Cline/Cursor), configure it like this:

```json
{
  "mcpServers": {
    "jira": {
      "command": "npx",
      "args": ["-y", "@rambou/jira-mcp"],
      "env": {
        "JIRA_BASE_URL": "https://jira.example.com",
        "JIRA_TOKEN": "your-token"
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
3. Invoke one of the tools below from your client chat or tool UI.

## Available MCP tools

### Jira tools

- `jira_get_issue` - Get issue details by key
- `jira_search_issues` - Search with JQL
- `jira_create_issue` - Create an issue
- `jira_generate_subtasks` - Generate subtasks for a parent issue when the parent type allows subtasks
- `jira_add_comment` - Add a comment to an issue (comment text should use Jira Wiki Markup, not Markdown)
- `jira_edit_issue_description` - Edit an issue description (description text should use Jira Wiki Markup, not Markdown)
- `jira_transition_issue` - Transition an issue by transition id
- `jira_amend_issue_labels` - Add and/or remove labels on an issue

### Tempo Timesheets worklog tools

These tools require the **Tempo Timesheets** plugin to be installed on your Jira Server/Data Center instance. They use the same `JIRA_TOKEN` for authentication.

- `tempo_list_worklogs` - List Tempo worklogs for the current Jira user within a date range. Parameters: `startDate` (YYYY-MM-DD), `endDate` (YYYY-MM-DD).
- `tempo_create_worklog` - Log time against a Jira issue. Parameters: `issueKey`, `timeSpentHours`, `date` (YYYY-MM-DD), `description` (optional), `startTime` (HH:MM, optional).
- `tempo_bulk_create_worklogs` - Log time against multiple issues in one call. Parameter: `worklogs` (array of `{ issueKey, timeSpentHours, date, description?, startTime? }`). Returns per-entry success/failure.
- `tempo_edit_worklog` - Edit an existing Tempo worklog. Parameters: `worklogId`, `timeSpentHours`, `date` (optional), `description` (optional), `startTime` (optional).
- `tempo_delete_worklog` - Delete a Tempo worklog by ID. Parameter: `worklogId`.

> **Prerequisite:** The Tempo worklog tools use the current Jira user (identified by `JIRA_TOKEN`) as the worklog author. The `tempo_list_worklogs` tool also scopes results to that user.
