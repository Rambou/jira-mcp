const test = require('node:test');
const assert = require('node:assert/strict');

const { JiraClient, safeJsonParse } = require('../src/jiraClient');

test('safeJsonParse falls back to raw payload', () => {
  assert.deepEqual(safeJsonParse('not-json'), { raw: 'not-json' });
});

test('JiraClient sends bearer auth and serializes JSON body', async () => {
  let captured;
  const fakeFetch = async (url, init) => {
    captured = { url, init };
    return {
      ok: true,
      status: 200,
      text: async () => JSON.stringify({ key: 'PROJ-1' })
    };
  };

  const client = new JiraClient(
    {
      baseUrl: 'https://jira.example.com',
      token: 'abc123'
    },
    fakeFetch
  );

  const result = await client.createIssue({
    projectKey: 'PROJ',
    issueType: 'Task',
    summary: 'Hello'
  });

  assert.equal(captured.url, 'https://jira.example.com/rest/api/3/issue');
  assert.equal(captured.init.headers.Authorization, 'Bearer abc123');
  assert.equal(result.key, 'PROJ-1');
});

test('JiraClient throws readable Jira API errors', async () => {
  const fakeFetch = async () => ({
    ok: false,
    status: 400,
    statusText: 'Bad Request',
    text: async () => JSON.stringify({ errorMessages: ['Invalid JQL'] })
  });

  const client = new JiraClient(
    {
      baseUrl: 'https://jira.example.com',
      token: 'abc123'
    },
    fakeFetch
  );

  await assert.rejects(
    async () => client.searchIssues({ jql: 'bad query' }),
    /Jira API request failed \(400\): Invalid JQL/
  );
});

test('JiraClient addComment sends plain string body for Jira Server/Data Center', async () => {
  let captured;
  const fakeFetch = async (url, init) => {
    captured = { url, init };
    return {
      ok: true,
      status: 200,
      text: async () => JSON.stringify({ id: '10001' })
    };
  };

  const client = new JiraClient(
    {
      baseUrl: 'https://jira.example.com',
      token: 'abc123',
      apiBasePath: '/rest/api/2'
    },
    fakeFetch
  );

  const result = await client.addComment({
    issueKey: 'PROJ-1',
    comment: '*Bold* _formatted_'
  });

  assert.equal(captured.url, 'https://jira.example.com/rest/api/2/issue/PROJ-1/comment');
  assert.equal(captured.init.body, JSON.stringify({ body: '*Bold* _formatted_' }));
  assert.equal(result.id, '10001');
});

test('JiraClient amendIssueLabels sends add and remove operations', async () => {
  let captured;
  const fakeFetch = async (url, init) => {
    captured = { url, init };
    return {
      ok: true,
      status: 204,
      text: async () => ''
    };
  };

  const client = new JiraClient(
    {
      baseUrl: 'https://jira.example.com',
      token: 'abc123'
    },
    fakeFetch
  );

  const result = await client.amendIssueLabels({
    issueKey: 'PROJ-1',
    addLabels: ['backend', 'urgent'],
    removeLabels: ['triage']
  });

  assert.equal(captured.url, 'https://jira.example.com/rest/api/3/issue/PROJ-1');
  assert.equal(captured.init.method, 'PUT');
  assert.equal(
    captured.init.body,
    JSON.stringify({
      update: {
        labels: [{ add: 'backend' }, { add: 'urgent' }, { remove: 'triage' }]
      }
    })
  );
  assert.deepEqual(result, { success: true });
});

test('JiraClient amendIssueLabels requires at least one add/remove label', async () => {
  const client = new JiraClient({
    baseUrl: 'https://jira.example.com',
    token: 'abc123'
  });

  await assert.rejects(
    async () =>
      client.amendIssueLabels({
        issueKey: 'PROJ-1',
        addLabels: [],
        removeLabels: []
      }),
    /At least one label must be provided to add or remove/
  );
});
