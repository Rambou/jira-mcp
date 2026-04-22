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

test('JiraClient createIssue includes parent when parentIssueKey is provided', async () => {
  let captured;
  const fakeFetch = async (url, init) => {
    captured = { url, init };
    return {
      ok: true,
      status: 200,
      text: async () => JSON.stringify({ key: 'PROJ-2' })
    };
  };

  const client = new JiraClient(
    {
      baseUrl: 'https://jira.example.com',
      token: 'abc123'
    },
    fakeFetch
  );

  await client.createIssue({
    projectKey: 'PROJ',
    issueType: 'Sub-task',
    summary: 'Child issue',
    parentIssueKey: 'PROJ-1'
  });

  const payload = JSON.parse(captured.init.body);
  assert.deepEqual(payload.fields.parent, { key: 'PROJ-1' });
});

test('JiraClient createSubtasks creates subtasks when parent type allows it', async () => {
  const calls = [];
  const fakeFetch = async (url, init) => {
    calls.push({ url, init });

    if (url.endsWith('/issue/PROJ-1?fields=issuetype,project')) {
      return {
        ok: true,
        status: 200,
        text: async () =>
          JSON.stringify({
            fields: {
              issuetype: { name: 'Task', subtask: false },
              project: { key: 'PROJ' }
            }
          })
      };
    }

    return {
      ok: true,
      status: 200,
      text: async () => JSON.stringify({ key: `PROJ-${calls.length}` })
    };
  };

  const client = new JiraClient(
    {
      baseUrl: 'https://jira.example.com',
      token: 'abc123'
    },
    fakeFetch
  );

  const result = await client.createSubtasks({
    parentIssueKey: 'PROJ-1',
    subtasks: [{ summary: 'Subtask 1' }, { summary: 'Subtask 2', description: 'Details' }]
  });

  assert.equal(result.allowed, true);
  assert.equal(result.created.length, 2);
  assert.equal(calls.length, 3);

  const firstSubtaskPayload = JSON.parse(calls[1].init.body);
  assert.equal(firstSubtaskPayload.fields.issuetype.name, 'Sub-task');
  assert.deepEqual(firstSubtaskPayload.fields.parent, { key: 'PROJ-1' });
});

test('JiraClient createSubtasks does not create subtasks under a subtask parent', async () => {
  const calls = [];
  const fakeFetch = async (url) => {
    calls.push(url);
    return {
      ok: true,
      status: 200,
      text: async () =>
        JSON.stringify({
          fields: {
            issuetype: { name: 'Sub-task', subtask: true },
            project: { key: 'PROJ' }
          }
        })
    };
  };

  const client = new JiraClient(
    {
      baseUrl: 'https://jira.example.com',
      token: 'abc123'
    },
    fakeFetch
  );

  const result = await client.createSubtasks({
    parentIssueKey: 'PROJ-2',
    subtasks: [{ summary: 'Should not be created' }]
  });

  assert.equal(result.allowed, false);
  assert.equal(result.created.length, 0);
  assert.equal(calls.length, 1);
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
