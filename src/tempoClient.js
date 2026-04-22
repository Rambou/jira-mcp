const MAX_PAGES = 500;

class TempoClient {
  constructor({ tempoBaseUrl, tempoApiToken }, jiraClient, fetchImpl = fetch) {
    this.baseUrl = tempoBaseUrl;
    this.token = tempoApiToken;
    this.jiraClient = jiraClient;
    this.fetch = fetchImpl;
  }

  async getWorklogs({ from, to }) {
    const user = await this.jiraClient.getCurrentUser();
    const accountId = user.accountId;

    const allWorklogs = [];
    let nextUrl = `${this.baseUrl}/worklogs/user/${encodeURIComponent(accountId)}?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`;
    let pageCount = 0;

    while (nextUrl && pageCount < MAX_PAGES) {
      const data = await this._fetchUrl('GET', nextUrl);
      allWorklogs.push(...(data.results || []));
      nextUrl = data.metadata?.next || null;
      pageCount++;
    }

    // Enrich worklogs with Jira issue keys (best-effort, in parallel)
    const uniqueIssueIds = [
      ...new Set(allWorklogs.map((w) => w.issue?.id).filter((id) => id != null))
    ];
    const issueKeyMap = {};
    await Promise.all(
      uniqueIssueIds.map(async (id) => {
        try {
          const issue = await this.jiraClient.getIssue(String(id));
          issueKeyMap[id] = issue.key;
        } catch {
          // leave issueKey null if lookup fails
        }
      })
    );

    return {
      worklogs: allWorklogs.map((w) => ({
        ...w,
        issueKey: issueKeyMap[w.issue?.id] || null
      })),
      total: allWorklogs.length
    };
  }

  async createWorklog({ issueKey, timeSpentHours, date, description, startTime }) {
    const [issue, user] = await Promise.all([
      this.jiraClient.getIssue(issueKey),
      this.jiraClient.getCurrentUser()
    ]);

    const payload = {
      issueId: Number(issue.id),
      timeSpentSeconds: Math.round(timeSpentHours * 3600),
      startDate: date,
      authorAccountId: user.accountId,
      description: description || '',
      ...(startTime && { startTime: `${startTime}:00` })
    };

    return this.request('POST', '/worklogs', payload);
  }

  async bulkCreateWorklogs(entries) {
    const user = await this.jiraClient.getCurrentUser();
    const accountId = user.accountId;

    // Group entries by issueKey so each issue gets one bulk request
    const byIssueKey = {};
    for (const entry of entries) {
      if (!byIssueKey[entry.issueKey]) {
        byIssueKey[entry.issueKey] = [];
      }
      byIssueKey[entry.issueKey].push(entry);
    }

    const results = [];
    const errors = [];

    for (const [issueKey, issueEntries] of Object.entries(byIssueKey)) {
      try {
        const issue = await this.jiraClient.getIssue(issueKey);
        const issueId = Number(issue.id);

        const payloads = issueEntries.map((entry) => ({
          timeSpentSeconds: Math.round(entry.timeSpentHours * 3600),
          startDate: entry.date,
          authorAccountId: accountId,
          description: entry.description || '',
          ...(entry.startTime && { startTime: `${entry.startTime}:00` })
        }));

        const createdWorklogs = await this.request(
          'POST',
          `/worklogs/issue/${issueId}/bulk`,
          payloads
        );

        issueEntries.forEach((entry, i) => {
          const created = Array.isArray(createdWorklogs) ? createdWorklogs[i] : null;
          results.push({
            issueKey,
            date: entry.date,
            timeSpentHours: entry.timeSpentHours,
            worklogId: created?.tempoWorklogId || null,
            success: !!created
          });
        });
      } catch (error) {
        issueEntries.forEach((entry) => {
          errors.push({
            issueKey,
            date: entry.date,
            timeSpentHours: entry.timeSpentHours,
            error: error.message
          });
        });
      }
    }

    return {
      results,
      errors,
      totalCreated: results.filter((r) => r.success).length,
      totalFailed: errors.length
    };
  }

  async updateWorklog(worklogId, { timeSpentHours, date, description, startTime }) {
    if (timeSpentHours == null) {
      throw new Error('timeSpentHours is required');
    }
    const existing = await this.request('GET', `/worklogs/${encodeURIComponent(worklogId)}`);

    const timeSpentSeconds = Math.round(timeSpentHours * 3600);
    const payload = {
      authorAccountId: existing.author.accountId,
      startDate: date || existing.startDate,
      timeSpentSeconds,
      billableSeconds: timeSpentSeconds,
      ...(description !== undefined && { description }),
      ...(startTime && { startTime: `${startTime}:00` })
    };

    return this.request('PUT', `/worklogs/${encodeURIComponent(worklogId)}`, payload);
  }

  async deleteWorklog(worklogId) {
    await this.request('DELETE', `/worklogs/${encodeURIComponent(worklogId)}`);
    return { success: true, worklogId };
  }

  async request(method, path, body) {
    return this._fetchUrl(method, `${this.baseUrl}${path}`, body);
  }

  async _fetchUrl(method, url, body) {
    const response = await this.fetch(url, {
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
      const message = (payload && payload.message) || response.statusText;
      throw new Error(`Tempo API request failed (${response.status}): ${message}`);
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
  TempoClient,
  safeJsonParse
};
