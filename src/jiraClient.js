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

  async createIssue({ projectKey, issueType, summary, description, parentIssueKey }) {
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

    if (parentIssueKey) {
      payload.fields.parent = { key: parentIssueKey };
    }

    return this.request('POST', '/issue', payload);
  }

  async createSubtasks({ parentIssueKey, subtasks, subtaskIssueType = 'Sub-task' }) {
    const parentIssue = await this.request(
      'GET',
      `/issue/${encodeURIComponent(parentIssueKey)}?fields=issuetype,project`
    );

    if (parentIssue?.fields?.issuetype?.subtask) {
      return {
        allowed: false,
        reason: 'Cannot create subtasks under a subtask issue',
        parentIssueKey,
        parentIssueType: parentIssue.fields.issuetype.name,
        created: []
      };
    }

    const projectKey = parentIssue?.fields?.project?.key;

    if (!projectKey) {
      throw new Error(`Could not determine project key for parent issue: ${parentIssueKey}`);
    }

    const created = [];
    for (const subtask of subtasks) {
      const result = await this.createIssue({
        projectKey,
        issueType: subtaskIssueType,
        summary: subtask.summary,
        description: subtask.description,
        parentIssueKey
      });
      created.push(result);
    }

    return {
      allowed: true,
      parentIssueKey,
      parentIssueType: parentIssue.fields?.issuetype?.name,
      created
    };
  }

  async addComment({ issueKey, comment }) {
    return this.request('POST', `/issue/${encodeURIComponent(issueKey)}/comment`, {
      body: comment
    });
  }

  async updateIssueDescription({ issueKey, description }) {
    return this.request('PUT', `/issue/${encodeURIComponent(issueKey)}`, {
      fields: {
        description
      }
    });
  }

  async transitionIssue({ issueKey, transitionId }) {
    return this.request('POST', `/issue/${encodeURIComponent(issueKey)}/transitions`, {
      transition: {
        id: String(transitionId)
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
