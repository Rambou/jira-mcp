# jira-mcp

A Model Context Protocol (MCP) server for common Jira REST API actions.

## Configuration

Set the following environment variables:

- `JIRA_BASE_URL` (required): Base Jira URL, for example `https://your-domain.atlassian.net`
- `JIRA_TOKEN` (required): Jira API token / PAT
- `JIRA_API_BASE_PATH` (optional): Jira API base path, default `/rest/api/3`

## Run

```bash
npm install
npm start
```

## Available MCP tools

- `jira_get_issue` - Get issue details by key
- `jira_search_issues` - Search with JQL
- `jira_create_issue` - Create an issue
- `jira_add_comment` - Add a comment to an issue
- `jira_transition_issue` - Transition an issue by transition id
