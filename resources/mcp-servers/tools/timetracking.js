'use strict';

/**
 * Time Tracking Tools Module for Claude Terminal MCP
 *
 * Provides time tracking analytics. Reads from CT_DATA_DIR/timetracking.json
 * and CT_DATA_DIR/archives/.
 */

const fs = require('fs');
const path = require('path');

// -- Logging ------------------------------------------------------------------

function log(...args) {
  process.stderr.write(`[ct-mcp:timetracking] ${args.join(' ')}\n`);
}

// -- Data access --------------------------------------------------------------

function getDataDir() {
  return process.env.CT_DATA_DIR || '';
}

function loadTimeTracking() {
  const file = path.join(getDataDir(), 'timetracking.json');
  try {
    if (fs.existsSync(file)) return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (e) {
    log('Error reading timetracking.json:', e.message);
  }
  return { version: 3, month: '', global: { sessions: [] }, projects: {} };
}

function loadProjects() {
  const file = path.join(getDataDir(), 'projects.json');
  try {
    if (fs.existsSync(file)) return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (e) {}
  return { projects: [] };
}

// -- Helpers ------------------------------------------------------------------

function formatDuration(ms) {
  if (!ms || ms <= 0) return '0m';
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

function isToday(isoStr) {
  if (!isoStr) return false;
  const d = new Date(isoStr);
  const now = new Date();
  return d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate();
}

function isThisWeek(isoStr) {
  if (!isoStr) return false;
  const d = new Date(isoStr);
  const now = new Date();
  const startOfWeek = new Date(now);
  startOfWeek.setDate(now.getDate() - now.getDay());
  startOfWeek.setHours(0, 0, 0, 0);
  return d >= startOfWeek;
}

function sumDuration(sessions, filterFn) {
  return sessions
    .filter(s => !filterFn || filterFn(s.startTime || s.endTime))
    .reduce((sum, s) => sum + (s.duration || 0), 0);
}

// -- Tool definitions ---------------------------------------------------------

const tools = [
  {
    name: 'time_today',
    description: 'Get time spent today: total and per project breakdown.',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'time_week',
    description: 'Get time spent this week: total and per project breakdown.',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'time_project',
    description: 'Get detailed time tracking for a specific project: today, this week, this month, all time, and recent sessions.',
    inputSchema: {
      type: 'object',
      properties: {
        project: { type: 'string', description: 'Project name or ID' },
      },
      required: ['project'],
    },
  },
  {
    name: 'time_summary',
    description: 'Get a full time tracking summary: this month stats, top projects, daily breakdown for the last 7 days.',
    inputSchema: { type: 'object', properties: {} },
  },
];

// -- Tool handler -------------------------------------------------------------

async function handle(name, args) {
  const ok = (text) => ({ content: [{ type: 'text', text }] });
  const fail = (text) => ({ content: [{ type: 'text', text }], isError: true });

  try {
    const tt = loadTimeTracking();
    const projData = loadProjects();
    const projectMap = new Map();
    for (const p of (projData.projects || [])) {
      projectMap.set(p.id, p.name || path.basename(p.path || p.id));
    }

    if (name === 'time_today') {
      const globalToday = sumDuration(tt.global?.sessions || [], isToday);

      const projectLines = [];
      for (const [pid, pdata] of Object.entries(tt.projects || {})) {
        const dur = sumDuration(pdata.sessions || [], isToday);
        if (dur > 0) {
          projectLines.push({ name: projectMap.get(pid) || pid, duration: dur });
        }
      }
      projectLines.sort((a, b) => b.duration - a.duration);

      let output = `Today: ${formatDuration(globalToday)}\n`;
      if (projectLines.length) {
        output += `${'─'.repeat(30)}\n`;
        for (const p of projectLines) {
          output += `  ${p.name}: ${formatDuration(p.duration)}\n`;
        }
      } else {
        output += 'No project activity tracked today.';
      }
      return ok(output);
    }

    if (name === 'time_week') {
      const globalWeek = sumDuration(tt.global?.sessions || [], isThisWeek);

      const projectLines = [];
      for (const [pid, pdata] of Object.entries(tt.projects || {})) {
        const dur = sumDuration(pdata.sessions || [], isThisWeek);
        if (dur > 0) {
          projectLines.push({ name: projectMap.get(pid) || pid, duration: dur });
        }
      }
      projectLines.sort((a, b) => b.duration - a.duration);

      let output = `This week: ${formatDuration(globalWeek)}\n`;
      if (projectLines.length) {
        output += `${'─'.repeat(30)}\n`;
        for (const p of projectLines) {
          output += `  ${p.name}: ${formatDuration(p.duration)}\n`;
        }
      } else {
        output += 'No project activity tracked this week.';
      }
      return ok(output);
    }

    if (name === 'time_project') {
      if (!args.project) return fail('Missing required parameter: project');

      // Find project
      let pid = null;
      for (const p of (projData.projects || [])) {
        if (p.id === args.project ||
          (p.name || '').toLowerCase() === args.project.toLowerCase() ||
          path.basename(p.path || '').toLowerCase() === args.project.toLowerCase()) {
          pid = p.id;
          break;
        }
      }
      if (!pid) return fail(`Project "${args.project}" not found.`);

      const pdata = tt.projects?.[pid];
      if (!pdata || !pdata.sessions?.length) {
        return ok(`No time tracked for ${projectMap.get(pid) || pid}.`);
      }

      const sessions = pdata.sessions;
      const today = sumDuration(sessions, isToday);
      const week = sumDuration(sessions, isThisWeek);
      const total = sumDuration(sessions);

      let output = `# ${projectMap.get(pid) || pid}\n`;
      output += `Today: ${formatDuration(today)}\n`;
      output += `This week: ${formatDuration(week)}\n`;
      output += `This month: ${formatDuration(total)}\n`;
      output += `Sessions: ${sessions.length}\n`;

      // Recent sessions (last 10)
      const recent = sessions
        .filter(s => s.startTime)
        .sort((a, b) => (b.startTime || '').localeCompare(a.startTime || ''))
        .slice(0, 10);

      if (recent.length) {
        output += `\n## Recent Sessions\n`;
        for (const s of recent) {
          const date = new Date(s.startTime).toLocaleString();
          output += `  ${date} — ${formatDuration(s.duration)}\n`;
        }
      }

      return ok(output);
    }

    if (name === 'time_summary') {
      const globalSessions = tt.global?.sessions || [];
      const monthTotal = sumDuration(globalSessions);
      const weekTotal = sumDuration(globalSessions, isThisWeek);
      const todayTotal = sumDuration(globalSessions, isToday);

      let output = `# Time Tracking Summary\n`;
      output += `Month (${tt.month || '?'}): ${formatDuration(monthTotal)}\n`;
      output += `This week: ${formatDuration(weekTotal)}\n`;
      output += `Today: ${formatDuration(todayTotal)}\n`;
      output += `Sessions: ${globalSessions.length}\n`;

      // Top projects this month
      const projectTotals = [];
      for (const [pid, pdata] of Object.entries(tt.projects || {})) {
        const dur = sumDuration(pdata.sessions || []);
        if (dur > 0) {
          projectTotals.push({ name: projectMap.get(pid) || pid, duration: dur });
        }
      }
      projectTotals.sort((a, b) => b.duration - a.duration);

      if (projectTotals.length) {
        output += `\n## Top Projects (this month)\n`;
        for (const p of projectTotals.slice(0, 15)) {
          const pct = monthTotal > 0 ? Math.round((p.duration / monthTotal) * 100) : 0;
          output += `  ${p.name}: ${formatDuration(p.duration)} (${pct}%)\n`;
        }
      }

      // Daily breakdown (last 7 days)
      const dailyMap = new Map();
      for (const s of globalSessions) {
        if (!s.startTime) continue;
        const day = s.startTime.slice(0, 10); // YYYY-MM-DD
        dailyMap.set(day, (dailyMap.get(day) || 0) + (s.duration || 0));
      }

      const days = [...dailyMap.entries()]
        .sort((a, b) => b[0].localeCompare(a[0]))
        .slice(0, 7);

      if (days.length) {
        output += `\n## Last 7 Days\n`;
        for (const [day, dur] of days) {
          output += `  ${day}: ${formatDuration(dur)}\n`;
        }
      }

      return ok(output);
    }

    return fail(`Unknown time tracking tool: ${name}`);
  } catch (error) {
    log(`Error in ${name}:`, error.message);
    return fail(`Time tracking error: ${error.message}`);
  }
}

// -- Cleanup ------------------------------------------------------------------

async function cleanup() {}

// -- Exports ------------------------------------------------------------------

module.exports = { tools, handle, cleanup };
