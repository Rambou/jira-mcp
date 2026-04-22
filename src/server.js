const { McpServer } = require('@modelcontextprotocol/sdk/server/mcp.js');
const { z } = require('zod');

function createServer(jiraClient) {
  const server = new McpServer({
    name: 'jira-mcp',
    version: '1.0.0'
  });

  server.registerTool(
    'jira_get_issue',
    {
      description: 'Get a Jira issue by key',
      inputSchema: {
        issueKey: z.string().min(1).describe('Issue key, e.g. PROJ-123')
      }
    },
    async ({ issueKey }) => {
      const result = await jiraClient.getIssue(issueKey);
      return jsonContent(result);
    }
  );

  server.registerTool(
    'jira_search_issues',
    {
      description: 'Search Jira issues with JQL',
      inputSchema: {
        jql: z.string().min(1).describe('JQL query string'),
        maxResults: z.number().int().min(1).max(100).optional(),
        fields: z.array(z.string()).optional()
      }
    },
    async ({ jql, maxResults, fields }) => {
      const result = await jiraClient.searchIssues({ jql, maxResults, fields });
      return jsonContent(result);
    }
  );

  server.registerTool(
    'jira_create_issue',
    {
      description: 'Create a Jira issue',
      inputSchema: {
        projectKey: z.string().min(1),
        issueType: z.string().min(1).default('Task'),
        summary: z.string().min(1),
        description: z.string().optional()
      }
    },
    async ({ projectKey, issueType, summary, description }) => {
      const result = await jiraClient.createIssue({ projectKey, issueType, summary, description });
      return jsonContent(result);
    }
  );

  server.registerTool(
    'jira_add_comment',
    {
      description: 'Add a comment to a Jira issue (use Jira Wiki Markup, not Markdown)',
      inputSchema: {
        issueKey: z.string().min(1),
        comment: z.string().min(1).describe('Comment text in Jira Wiki Markup (not Markdown)')
      }
    },
    async ({ issueKey, comment }) => {
      const result = await jiraClient.addComment({ issueKey, comment });
      return jsonContent(result);
    }
  );

  server.registerTool(
    'jira_transition_issue',
    {
      description: 'Transition a Jira issue to a new status by transition ID',
      inputSchema: {
        issueKey: z.string().min(1),
        transitionId: z.union([z.string().min(1), z.number().int().positive()])
      }
    },
    async ({ issueKey, transitionId }) => {
      const result = await jiraClient.transitionIssue({ issueKey, transitionId });
      return jsonContent(result);
    }
  );

  server.registerTool(
    'jira_amend_issue_labels',
    {
      description: 'Add and/or remove labels on a Jira issue',
      inputSchema: {
        issueKey: z.string().min(1),
        addLabels: z.array(z.string().min(1)).optional(),
        removeLabels: z.array(z.string().min(1)).optional()
      }
    },
    async ({ issueKey, addLabels, removeLabels }) => {
      if ((!addLabels || addLabels.length === 0) && (!removeLabels || removeLabels.length === 0)) {
        throw new Error('At least one label must be provided to add or remove');
      }

      const result = await jiraClient.amendIssueLabels({ issueKey, addLabels, removeLabels });
      return jsonContent(result);
    }
  );

  return server;
}

function jsonContent(result) {
  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify(result, null, 2)
      }
    ]
  };
}

module.exports = {
  createServer,
  jsonContent
};
