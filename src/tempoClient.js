const TEMPO_BASE_PATH = '/rest/tempo-timesheets/4';

class TempoClient {
  constructor({ baseUrl, token }, jiraClient, fetchImpl = fetch) {
    this.baseUrl = `${baseUrl}${TEMPO_BASE_PATH}`;
    this.token = token;
    this.jiraClient = jiraClient;
    this.fetch = fetchImpl;
  }

  async getWorklogs({ from, to }) {
    const user = await this.jiraClient.getCurrentUser();
    const username = user.name;

    const worklogs = await this.request('POST', '/worklogs/search', {
      from,
      to,
      worker: [username]
    });

    const list = Array.isArray(worklogs) ? worklogs : [];
    return { worklogs: list, total: list.length };
  }

  async createWorklog({ issueKey, timeSpentHours, date, description, startTime }) {
    const user = await this.jiraClient.getCurrentUser();

    const payload = {
      comment: description || '',
      dateStarted: formatDateStarted(date, startTime),
      timeSpentSeconds: Math.round(timeSpentHours * 3600),
      worker: user.name,
      issue: { key: issueKey }
    };

    return this.request('POST', '/worklogs', payload);
  }

  async bulkCreateWorklogs(entries) {
    const user = await this.jiraClient.getCurrentUser();
    const username = user.name;

    const outcomes = await Promise.allSettled(
      entries.map((entry) =>
        this.request('POST', '/worklogs', {
          comment: entry.description || '',
          dateStarted: formatDateStarted(entry.date, entry.startTime),
          timeSpentSeconds: Math.round(entry.timeSpentHours * 3600),
          worker: username,
          issue: { key: entry.issueKey }
        })
      )
    );

    const results = [];
    const errors = [];

    outcomes.forEach((outcome, i) => {
      const entry = entries[i];
      if (outcome.status === 'fulfilled') {
        results.push({
          issueKey: entry.issueKey,
          date: entry.date,
          timeSpentHours: entry.timeSpentHours,
          worklogId: outcome.value?.id || null,
          success: true
        });
      } else {
        errors.push({
          issueKey: entry.issueKey,
          date: entry.date,
          timeSpentHours: entry.timeSpentHours,
          error: outcome.reason?.message || String(outcome.reason)
        });
      }
    });

    return {
      results,
      errors,
      totalCreated: results.length,
      totalFailed: errors.length
    };
  }

  async updateWorklog(worklogId, { timeSpentHours, date, description, startTime }) {
    if (timeSpentHours == null) {
      throw new Error('timeSpentHours is required');
    }

    const existing = await this.request('GET', `/worklogs/${encodeURIComponent(worklogId)}`);

    const payload = {
      comment: description !== undefined ? description : (existing.comment || ''),
      dateStarted: date ? formatDateStarted(date, startTime) : existing.dateStarted,
      timeSpentSeconds: Math.round(timeSpentHours * 3600),
      worker: existing.worker,
      issue: { key: existing.issue.key }
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

function formatDateStarted(date, startTime) {
  const time = startTime ? `${startTime}:00.000` : '00:00:00.000';
  return `${date}T${time}+0000`;
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
