const test = require('node:test');
const assert = require('node:assert/strict');

const { loadConfig, normalizeBaseUrl } = require('../src/config');

test('normalizeBaseUrl removes trailing slashes', () => {
  assert.equal(normalizeBaseUrl('https://jira.example.com///'), 'https://jira.example.com');
});

test('loadConfig requires base URL and token', () => {
  assert.throws(() => loadConfig({ JIRA_TOKEN: 'abc' }), /JIRA_BASE_URL is required/);
  assert.throws(() => loadConfig({ JIRA_BASE_URL: 'https://jira.example.com' }), /JIRA_TOKEN is required/);
});

test('loadConfig applies defaults', () => {
  assert.deepEqual(
    loadConfig({
      JIRA_BASE_URL: 'https://jira.example.com/',
      JIRA_TOKEN: 'token'
    }),
    {
      baseUrl: 'https://jira.example.com',
      token: 'token',
      apiBasePath: '/rest/api/3'
    }
  );
});
