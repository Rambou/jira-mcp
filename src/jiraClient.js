class JiraClient {
  constructor({ baseUrl, token, apiBasePath = '/rest/api/3' }, fetchImpl = fetch) {
    this.baseUrl = baseUrl;
    this.token = token;
    this.apiBasePath = apiBasePath;
    this.fetch = fetchImpl;
  }

  async getIssue(issueKey) {
    return this.request('GET', `/issue/${encodeURIComponent(issueKey)}`);
  }

  async searchIssues({ jql, maxResults = 20, fields }) {
    return this.request('POST', '/search', {
      jql,
      maxResults,
      fields
    });
  }

  async createIssue({ projectKey, issueType, summary, description }) {
    const payload = {
      fields: {
        project: { key: projectKey },
        issuetype: { name: issueType },
        summary
      }
    };

    if (description) {
      payload.fields.description = {
        type: 'doc',
        version: 1,
        content: [
          {
            type: 'paragraph',
            content: [{ type: 'text', text: description }]
          }
        ]
      };
    }

    return this.request('POST', '/issue', payload);
  }

  async addComment({ issueKey, comment }) {
    return this.request('POST', `/issue/${encodeURIComponent(issueKey)}/comment`, {
      body: comment
    });
  }

  async transitionIssue({ issueKey, transitionId }) {
    return this.request('POST', `/issue/${encodeURIComponent(issueKey)}/transitions`, {
      transition: {
        id: String(transitionId)
      }
    });
  }

  async amendIssueLabels({ issueKey, addLabels = [], removeLabels = [] }) {
    const labelUpdates = [
      ...addLabels.map((label) => ({ add: label })),
      ...removeLabels.map((label) => ({ remove: label }))
    ];

    if (labelUpdates.length === 0) {
      throw new Error('At least one label must be provided to add or remove');
    }

    return this.request('PUT', `/issue/${encodeURIComponent(issueKey)}`, {
      update: {
        labels: labelUpdates
      }
    });
  }

  async request(method, path, body) {
    const response = await this.fetch(`${this.baseUrl}${this.apiBasePath}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${this.token}`,
        Accept: 'application/json',
        'Content-Type': 'application/json'
      },
      body: body ? JSON.stringify(body) : undefined
    });

    if (response.status === 204) {
      return { success: true };
    }

    const text = await response.text();
    const payload = text ? safeJsonParse(text) : null;

    if (!response.ok) {
      const message = (payload && payload.errorMessages && payload.errorMessages.join('; ')) || response.statusText;
      throw new Error(`Jira API request failed (${response.status}): ${message}`);
    }

    return payload;
  }
}

function safeJsonParse(value) {
  try {
    return JSON.parse(value);
  } catch {
    return { raw: value };
  }
}

module.exports = {
  JiraClient,
  safeJsonParse
};
