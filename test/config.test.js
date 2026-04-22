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
      apiBasePath: '/rest/api/3',
      tempoApiToken: null,
      tempoBaseUrl: 'https://api.tempo.io/4'
    }
  );
});

test('loadConfig includes Tempo fields when provided', () => {
  const config = loadConfig({
    JIRA_BASE_URL: 'https://jira.example.com',
    JIRA_TOKEN: 'token',
    TEMPO_API_TOKEN: 'tempo-secret',
    TEMPO_BASE_URL: 'https://api.tempo.io/4/'
  });
  assert.equal(config.tempoApiToken, 'tempo-secret');
  assert.equal(config.tempoBaseUrl, 'https://api.tempo.io/4');
});
