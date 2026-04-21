const { StdioServerTransport } = require('@modelcontextprotocol/sdk/server/stdio.js');
const { loadConfig } = require('./config');
const { JiraClient } = require('./jiraClient');
const { createServer } = require('./server');

async function main() {
  const config = loadConfig();
  const jiraClient = new JiraClient(config);
  const server = createServer(jiraClient);
  const transport = new StdioServerTransport();

  await server.connect(transport);
  console.error('jira-mcp server is running');
}

main().catch((error) => {
  console.error('jira-mcp server failed:', error.message);
  process.exit(1);
});
