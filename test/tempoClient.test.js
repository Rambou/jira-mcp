const test = require('node:test');
const assert = require('node:assert/strict');

const { TempoClient, safeJsonParse } = require('../src/tempoClient');

// Fake JiraClient used across tests
function fakeJiraClient({ accountId = 'user-123', issueId = '10001', issueKey = 'PROJ-1' } = {}) {
  return {
    getCurrentUser: async () => ({ accountId }),
    getIssue: async () => ({ id: issueId, key: issueKey })
  };
}

// Build a TempoClient backed by a custom fetch stub
function makeClient(fakeFetch, jiraClient) {
  return new TempoClient(
    { tempoBaseUrl: 'https://api.tempo.io/4', tempoApiToken: 'tempo-token' },
    jiraClient || fakeJiraClient(),
    fakeFetch
  );
}

test('safeJsonParse falls back to raw payload', () => {
  assert.deepEqual(safeJsonParse('not-json'), { raw: 'not-json' });
});

test('TempoClient sends Bearer auth and constructs correct URL', async () => {
  let captured;
  const fakeFetch = async (url, init) => {
    captured = { url, init };
    return {
      ok: true,
      status: 200,
      text: async () => JSON.stringify({ tempoWorklogId: 1 })
    };
  };

  const client = makeClient(fakeFetch);
  await client.request('GET', '/worklogs/1');

  assert.equal(captured.url, 'https://api.tempo.io/4/worklogs/1');
  assert.equal(captured.init.headers.Authorization, 'Bearer tempo-token');
});

test('TempoClient handles 204 No Content', async () => {
  const fakeFetch = async () => ({ ok: true, status: 204, text: async () => '' });

  const client = makeClient(fakeFetch);
  const result = await client.request('DELETE', '/worklogs/1');

  assert.deepEqual(result, { success: true });
});

test('TempoClient throws readable Tempo API errors', async () => {
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

test('TempoClient getWorklogs fetches single page and enriches with issue keys', async () => {
  const calls = [];
  const fakeFetch = async (url) => {
    calls.push(url);
    return {
      ok: true,
      status: 200,
      text: async () =>
        JSON.stringify({
          results: [
            {
              tempoWorklogId: 1,
              issue: { id: 10001 },
              timeSpentSeconds: 3600,
              startDate: '2024-01-15'
            }
          ],
          metadata: {}
        })
    };
  };

  const client = makeClient(fakeFetch);
  const result = await client.getWorklogs({ from: '2024-01-01', to: '2024-01-31' });

  assert.equal(calls.length, 1);
  assert.equal(result.total, 1);
  assert.equal(result.worklogs[0].issueKey, 'PROJ-1');
  assert.equal(result.worklogs[0].tempoWorklogId, 1);
});

test('TempoClient getWorklogs follows pagination metadata.next', async () => {
  const calls = [];
  const fakeFetch = async (url) => {
    calls.push(url);
    const isFirst = calls.length === 1;
    return {
      ok: true,
      status: 200,
      text: async () =>
        JSON.stringify({
          results: [
            { tempoWorklogId: isFirst ? 1 : 2, issue: { id: 10001 }, timeSpentSeconds: 3600, startDate: '2024-01-15' }
          ],
          metadata: isFirst
            ? { next: 'https://api.tempo.io/4/worklogs/user/user-123?from=2024-01-01&to=2024-01-31&offset=50' }
            : {}
        })
    };
  };

  const client = makeClient(fakeFetch);
  const result = await client.getWorklogs({ from: '2024-01-01', to: '2024-01-31' });

  assert.equal(calls.length, 2);
  assert.equal(
    calls[1],
    'https://api.tempo.io/4/worklogs/user/user-123?from=2024-01-01&to=2024-01-31&offset=50'
  );
  assert.equal(result.total, 2);
});

test('TempoClient getWorklogs handles empty result set', async () => {
  const fakeFetch = async () => ({
    ok: true,
    status: 200,
    text: async () => JSON.stringify({ results: [], metadata: {} })
  });

  const client = makeClient(fakeFetch);
  const result = await client.getWorklogs({ from: '2024-01-01', to: '2024-01-31' });

  assert.equal(result.total, 0);
  assert.deepEqual(result.worklogs, []);
});

test('TempoClient createWorklog constructs correct payload', async () => {
  let captured;
  const fakeFetch = async (url, init) => {
    captured = { url, init };
    return {
      ok: true,
      status: 200,
      text: async () => JSON.stringify({ tempoWorklogId: 42 })
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

  assert.equal(captured.url, 'https://api.tempo.io/4/worklogs');
  assert.equal(captured.init.method, 'POST');

  const body = JSON.parse(captured.init.body);
  assert.equal(body.issueId, 10001);
  assert.equal(body.timeSpentSeconds, 7200);
  assert.equal(body.startDate, '2024-01-15');
  assert.equal(body.authorAccountId, 'user-123');
  assert.equal(body.description, 'Working on it');
  assert.equal(body.startTime, '09:00:00');

  assert.equal(result.tempoWorklogId, 42);
});

test('TempoClient createWorklog omits startTime when not provided', async () => {
  let captured;
  const fakeFetch = async (url, init) => {
    captured = { url, init };
    return {
      ok: true,
      status: 200,
      text: async () => JSON.stringify({ tempoWorklogId: 43 })
    };
  };

  const client = makeClient(fakeFetch);
  await client.createWorklog({
    issueKey: 'PROJ-1',
    timeSpentHours: 1,
    date: '2024-01-15'
  });

  const body = JSON.parse(captured.init.body);
  assert.equal(Object.hasOwn(body, 'startTime'), false);
});

test('TempoClient bulkCreateWorklogs groups entries by issue and reports results', async () => {
  let capturedUrl;
  let capturedBody;
  const fakeFetch = async (url, init) => {
    capturedUrl = url;
    capturedBody = JSON.parse(init.body);
    return {
      ok: true,
      status: 200,
      text: async () => JSON.stringify([{ tempoWorklogId: 1 }, { tempoWorklogId: 2 }])
    };
  };

  const client = makeClient(fakeFetch);
  const result = await client.bulkCreateWorklogs([
    { issueKey: 'PROJ-1', timeSpentHours: 1, date: '2024-01-15' },
    { issueKey: 'PROJ-1', timeSpentHours: 2, date: '2024-01-16' }
  ]);

  assert.equal(capturedUrl, 'https://api.tempo.io/4/worklogs/issue/10001/bulk');
  assert.equal(capturedBody.length, 2);
  assert.equal(capturedBody[0].timeSpentSeconds, 3600);
  assert.equal(capturedBody[1].timeSpentSeconds, 7200);
  assert.equal(result.totalCreated, 2);
  assert.equal(result.totalFailed, 0);
  assert.equal(result.results[0].worklogId, 1);
  assert.equal(result.results[1].worklogId, 2);
});

test('TempoClient bulkCreateWorklogs handles partial failures gracefully', async () => {
  const failingJira = {
    getCurrentUser: async () => ({ accountId: 'user-123' }),
    getIssue: async (key) => {
      if (key === 'PROJ-1') return { id: '10001', key: 'PROJ-1' };
      throw new Error('Issue not found: ' + key);
    }
  };
  const fakeFetch = async () => ({
    ok: true,
    status: 200,
    text: async () => JSON.stringify([{ tempoWorklogId: 1 }])
  });

  const client = makeClient(fakeFetch, failingJira);
  const result = await client.bulkCreateWorklogs([
    { issueKey: 'PROJ-1', timeSpentHours: 1, date: '2024-01-15' },
    { issueKey: 'BAD-999', timeSpentHours: 2, date: '2024-01-16' }
  ]);

  assert.equal(result.totalCreated, 1);
  assert.equal(result.totalFailed, 1);
  assert.equal(result.results[0].issueKey, 'PROJ-1');
  assert.equal(result.errors[0].issueKey, 'BAD-999');
  assert.match(result.errors[0].error, /Issue not found/);
});

test('TempoClient updateWorklog fetches existing worklog then sends update', async () => {
  const calls = [];
  const fakeFetch = async (url, init) => {
    calls.push({ url, method: init.method, body: init.body });
    if (init.method === 'GET') {
      return {
        ok: true,
        status: 200,
        text: async () =>
          JSON.stringify({
            tempoWorklogId: '99',
            author: { accountId: 'user-abc' },
            startDate: '2024-01-10',
            timeSpentSeconds: 3600
          })
      };
    }
    return {
      ok: true,
      status: 200,
      text: async () => JSON.stringify({ tempoWorklogId: '99' })
    };
  };

  const client = makeClient(fakeFetch);
  await client.updateWorklog('99', {
    timeSpentHours: 3,
    date: '2024-01-15',
    description: 'Updated description'
  });

  assert.equal(calls.length, 2);
  assert.equal(calls[0].method, 'GET');
  assert.equal(calls[0].url, 'https://api.tempo.io/4/worklogs/99');
  assert.equal(calls[1].method, 'PUT');
  assert.equal(calls[1].url, 'https://api.tempo.io/4/worklogs/99');

  const putBody = JSON.parse(calls[1].body);
  assert.equal(putBody.authorAccountId, 'user-abc');
  assert.equal(putBody.startDate, '2024-01-15');
  assert.equal(putBody.timeSpentSeconds, 10800);
  assert.equal(putBody.billableSeconds, 10800);
  assert.equal(putBody.description, 'Updated description');
});

test('TempoClient updateWorklog preserves existing startDate when not provided', async () => {
  const calls = [];
  const fakeFetch = async (url, init) => {
    calls.push({ method: init.method, body: init.body });
    if (init.method === 'GET') {
      return {
        ok: true,
        status: 200,
        text: async () =>
          JSON.stringify({
            tempoWorklogId: '77',
            author: { accountId: 'user-abc' },
            startDate: '2024-01-10',
            timeSpentSeconds: 1800
          })
      };
    }
    return {
      ok: true,
      status: 200,
      text: async () => JSON.stringify({ tempoWorklogId: '77' })
    };
  };

  const client = makeClient(fakeFetch);
  await client.updateWorklog('77', { timeSpentHours: 1 });

  const putBody = JSON.parse(calls[1].body);
  assert.equal(putBody.startDate, '2024-01-10');
});

test('TempoClient updateWorklog throws when timeSpentHours is missing', async () => {
  const client = makeClient(async () => {});

  await assert.rejects(
    async () => client.updateWorklog('99', {}),
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
  const result = await client.deleteWorklog('55');

  assert.equal(captured.url, 'https://api.tempo.io/4/worklogs/55');
  assert.equal(captured.method, 'DELETE');
  assert.deepEqual(result, { success: true, worklogId: '55' });
});
