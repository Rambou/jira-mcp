function normalizeBaseUrl(url) {
  return url.replace(/\/+$/, '');
}

function loadConfig(env = process.env) {
  const baseUrl = env.JIRA_BASE_URL;
  const token = env.JIRA_TOKEN;

  if (!baseUrl) {
    throw new Error('JIRA_BASE_URL is required');
  }

  if (!token) {
    throw new Error('JIRA_TOKEN is required');
  }

  return {
    baseUrl: normalizeBaseUrl(baseUrl),
    token,
    apiBasePath: env.JIRA_API_BASE_PATH || '/rest/api/3'
  };
}

module.exports = {
  loadConfig,
  normalizeBaseUrl
};
