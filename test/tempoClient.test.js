const test = require('node:test');
const assert = require('node:assert/strict');

const { TempoClient, safeJsonParse } = require('../src/tempoClient');

// Fake JiraClient: returns a Jira Server user (name-based, not accountId)
function fakeJiraClient({ username = 'john.doe' } = {}) {
  return {
    getCurrentUser: async () => ({ name: username, displayName: 'John Doe' })
  };
}

// Build a TempoClient backed by a custom fetch stub
function makeClient(fakeFetch, jiraClient) {
  return new TempoClient(
    { baseUrl: 'https://jira.example.com', token: 'jira-token' },
    jiraClient || fakeJiraClient(),
    fakeFetch
  );
}

// Worklog fixture matching Tempo Timesheets 4 response shape
function worklogFixture(overrides = {}) {
  return {
    id: 12345,
    comment: 'Work done',
    dateStarted: '2024-01-15T09:00:00.000+0000',
    timeSpentSeconds: 3600,
    worker: 'john.doe',
    issue: { key: 'PROJ-1', id: 10001 },
    ...overrides
  };
}

test('safeJsonParse falls back to raw payload', () => {
  assert.deepEqual(safeJsonParse('not-json'), { raw: 'not-json' });
});

test('TempoClient derives base URL from JIRA_BASE_URL with Timesheets path', () => {
  const client = new TempoClient(
    { baseUrl: 'https://jira.example.com', token: 'tok' },
    fakeJiraClient(),
    async () => ({ ok: true, status: 204, text: async () => '' })
  );
  assert.equal(client.baseUrl, 'https://jira.example.com/rest/tempo-timesheets/4');
});

test('TempoClient sends Bearer auth using Jira token', async () => {
  let captured;
  const fakeFetch = async (url, init) => {
    captured = { url, init };
    return {
      ok: true,
      status: 200,
      text: async () => JSON.stringify(worklogFixture())
    };
  };

  const client = makeClient(fakeFetch);
  await client.request('GET', '/worklogs/12345');

  assert.equal(captured.url, 'https://jira.example.com/rest/tempo-timesheets/4/worklogs/12345');
  assert.equal(captured.init.headers.Authorization, 'Bearer jira-token');
});

test('TempoClient handles 204 No Content', async () => {
  const fakeFetch = async () => ({ ok: true, status: 204, text: async () => '' });

  const client = makeClient(fakeFetch);
  const result = await client.request('DELETE', '/worklogs/1');

  assert.deepEqual(result, { success: true });
});

test('TempoClient throws readable error on HTTP failure', async () => {
  const fakeFetch = async () => ({
    ok: false,
    status: 400,
    statusText: 'Bad Request',
    text: async () => JSON.stringify({ message: 'Invalid worklog ID' })
  });

  const client = makeClient(fakeFetch);
  await assert.rejects(
    async () => client.request('GET', '/worklogs/bad'),
    /Tempo API request failed \(400\): Invalid worklog ID/
  );
});

test('TempoClient getWorklogs POSTs to /worklogs/search with correct body', async () => {
  let captured;
  const fakeFetch = async (url, init) => {
    captured = { url, init };
    return {
      ok: true,
      status: 200,
      text: async () => JSON.stringify([worklogFixture()])
    };
  };

  const client = makeClient(fakeFetch);
  const result = await client.getWorklogs({ from: '2024-01-01', to: '2024-01-31' });

  assert.equal(
    captured.url,
    'https://jira.example.com/rest/tempo-timesheets/4/worklogs/search'
  );
  assert.equal(captured.init.method, 'POST');
  const body = JSON.parse(captured.init.body);
  assert.equal(body.from, '2024-01-01');
  assert.equal(body.to, '2024-01-31');
  assert.deepEqual(body.worker, ['john.doe']);
  assert.equal(result.total, 1);
  assert.equal(result.worklogs[0].id, 12345);
  assert.equal(result.worklogs[0].issue.key, 'PROJ-1');
});

test('TempoClient getWorklogs handles empty result set', async () => {
  const fakeFetch = async () => ({
    ok: true,
    status: 200,
    text: async () => JSON.stringify([])
  });

  const client = makeClient(fakeFetch);
  const result = await client.getWorklogs({ from: '2024-01-01', to: '2024-01-31' });

  assert.equal(result.total, 0);
  assert.deepEqual(result.worklogs, []);
});

test('TempoClient createWorklog constructs correct Timesheets payload', async () => {
  let captured;
  const fakeFetch = async (url, init) => {
    captured = { url, init };
    return {
      ok: true,
      status: 200,
      text: async () => JSON.stringify(worklogFixture({ id: 42 }))
    };
  };

  const client = makeClient(fakeFetch);
  const result = await client.createWorklog({
    issueKey: 'PROJ-1',
    timeSpentHours: 2,
    date: '2024-01-15',
    description: 'Working on it',
    startTime: '09:00'
  });

  assert.equal(captured.url, 'https://jira.example.com/rest/tempo-timesheets/4/worklogs');
  assert.equal(captured.init.method, 'POST');

  const body = JSON.parse(captured.init.body);
  assert.equal(body.issue.key, 'PROJ-1');
  assert.equal(body.timeSpentSeconds, 7200);
  assert.equal(body.dateStarted, '2024-01-15T09:00:00.000+0000');
  assert.equal(body.worker, 'john.doe');
  assert.equal(body.comment, 'Working on it');

  assert.equal(result.id, 42);
});

test('TempoClient createWorklog uses midnight when startTime is omitted', async () => {
  let captured;
  const fakeFetch = async (url, init) => {
    captured = { url, init };
    return {
      ok: true,
      status: 200,
      text: async () => JSON.stringify(worklogFixture())
    };
  };

  const client = makeClient(fakeFetch);
  await client.createWorklog({ issueKey: 'PROJ-1', timeSpentHours: 1, date: '2024-01-15' });

  const body = JSON.parse(captured.init.body);
  assert.equal(body.dateStarted, '2024-01-15T00:00:00.000+0000');
});

test('TempoClient createWorklog does not include issueId or authorAccountId', async () => {
  let captured;
  const fakeFetch = async (url, init) => {
    captured = { url, init };
    return {
      ok: true,
      status: 200,
      text: async () => JSON.stringify(worklogFixture())
    };
  };

  const client = makeClient(fakeFetch);
  await client.createWorklog({ issueKey: 'PROJ-1', timeSpentHours: 1, date: '2024-01-15' });

  const body = JSON.parse(captured.init.body);
  assert.equal(Object.hasOwn(body, 'issueId'), false);
  assert.equal(Object.hasOwn(body, 'authorAccountId'), false);
});

test('TempoClient bulkCreateWorklogs creates each worklog individually and reports results', async () => {
  const calls = [];
  const fakeFetch = async (url, init) => {
    calls.push({ url, body: JSON.parse(init.body) });
    return {
      ok: true,
      status: 200,
      text: async () => JSON.stringify(worklogFixture({ id: calls.length * 10 }))
    };
  };

  const client = makeClient(fakeFetch);
  const result = await client.bulkCreateWorklogs([
    { issueKey: 'PROJ-1', timeSpentHours: 1, date: '2024-01-15' },
    { issueKey: 'PROJ-2', timeSpentHours: 2, date: '2024-01-16' }
  ]);

  assert.equal(calls.length, 2);
  assert.equal(calls[0].body.issue.key, 'PROJ-1');
  assert.equal(calls[1].body.issue.key, 'PROJ-2');
  assert.equal(result.totalCreated, 2);
  assert.equal(result.totalFailed, 0);
  assert.equal(result.results[0].issueKey, 'PROJ-1');
  assert.equal(result.results[1].issueKey, 'PROJ-2');
});

test('TempoClient bulkCreateWorklogs handles partial failures gracefully', async () => {
  let callCount = 0;
  const fakeFetch = async () => {
    callCount++;
    if (callCount === 1) {
      return {
        ok: true,
        status: 200,
        text: async () => JSON.stringify(worklogFixture({ id: 1 }))
      };
    }
    return {
      ok: false,
      status: 500,
      statusText: 'Internal Server Error',
      text: async () => JSON.stringify({ message: 'Server error' })
    };
  };

  const client = makeClient(fakeFetch);
  const result = await client.bulkCreateWorklogs([
    { issueKey: 'PROJ-1', timeSpentHours: 1, date: '2024-01-15' },
    { issueKey: 'PROJ-2', timeSpentHours: 2, date: '2024-01-16' }
  ]);

  assert.equal(result.totalCreated, 1);
  assert.equal(result.totalFailed, 1);
  assert.equal(result.results[0].issueKey, 'PROJ-1');
  assert.equal(result.errors[0].issueKey, 'PROJ-2');
  assert.match(result.errors[0].error, /Tempo API request failed/);
});

test('TempoClient updateWorklog fetches existing worklog then PUTs with merged fields', async () => {
  const calls = [];
  const fakeFetch = async (url, init) => {
    calls.push({ url, method: init.method, body: init.body });
    if (init.method === 'GET') {
      return {
        ok: true,
        status: 200,
        text: async () => JSON.stringify(worklogFixture())
      };
    }
    return {
      ok: true,
      status: 200,
      text: async () => JSON.stringify(worklogFixture({ timeSpentSeconds: 10800 }))
    };
  };

  const client = makeClient(fakeFetch);
  await client.updateWorklog('12345', {
    timeSpentHours: 3,
    date: '2024-01-20',
    description: 'Updated comment'
  });

  assert.equal(calls.length, 2);
  assert.equal(calls[0].method, 'GET');
  assert.equal(calls[0].url, 'https://jira.example.com/rest/tempo-timesheets/4/worklogs/12345');
  assert.equal(calls[1].method, 'PUT');
  assert.equal(calls[1].url, 'https://jira.example.com/rest/tempo-timesheets/4/worklogs/12345');

  const putBody = JSON.parse(calls[1].body);
  assert.equal(putBody.worker, 'john.doe');
  assert.equal(putBody.issue.key, 'PROJ-1');
  assert.equal(putBody.timeSpentSeconds, 10800);
  assert.equal(putBody.dateStarted, '2024-01-20T00:00:00.000+0000');
  assert.equal(putBody.comment, 'Updated comment');
});

test('TempoClient updateWorklog preserves existing dateStarted when date not provided', async () => {
  const calls = [];
  const fakeFetch = async (url, init) => {
    calls.push({ method: init.method, body: init.body });
    if (init.method === 'GET') {
      return {
        ok: true,
        status: 200,
        text: async () => JSON.stringify(worklogFixture())
      };
    }
    return {
      ok: true,
      status: 200,
      text: async () => JSON.stringify(worklogFixture())
    };
  };

  const client = makeClient(fakeFetch);
  await client.updateWorklog('12345', { timeSpentHours: 1 });

  const putBody = JSON.parse(calls[1].body);
  assert.equal(putBody.dateStarted, '2024-01-15T09:00:00.000+0000');
});

test('TempoClient updateWorklog throws when timeSpentHours is missing', async () => {
  const client = makeClient(async () => {});

  await assert.rejects(
    async () => client.updateWorklog('12345', {}),
    /timeSpentHours is required/
  );
});

test('TempoClient deleteWorklog sends DELETE request and returns worklogId', async () => {
  let captured;
  const fakeFetch = async (url, init) => {
    captured = { url, method: init.method };
    return { ok: true, status: 204, text: async () => '' };
  };

  const client = makeClient(fakeFetch);
  const result = await client.deleteWorklog('12345');

  assert.equal(captured.url, 'https://jira.example.com/rest/tempo-timesheets/4/worklogs/12345');
  assert.equal(captured.method, 'DELETE');
  assert.deepEqual(result, { success: true, worklogId: '12345' });
});
