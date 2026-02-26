'use strict';

/**
 * Workflow Tools Module for Claude Terminal MCP
 *
 * Provides workflow automation tools. Reads workflow definitions and run history
 * from CT_DATA_DIR/workflows/ directory.
 *
 * Tools: workflow_list, workflow_get, workflow_trigger, workflow_cancel,
 *        workflow_runs, workflow_status
 */

const fs = require('fs');
const path = require('path');

// -- Logging ------------------------------------------------------------------

function log(...args) {
  process.stderr.write(`[ct-mcp:workflow] ${args.join(' ')}\n`);
}

// -- Data access --------------------------------------------------------------

function getDataDir() {
  return process.env.CT_DATA_DIR || '';
}

function loadDefinitions() {
  const file = path.join(getDataDir(), 'workflows', 'definitions.json');
  try {
    if (fs.existsSync(file)) {
      const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
      // Format may be [{ workflow: {...} }] or [{id, name, ...}]
      return raw.map(entry => entry.workflow || entry);
    }
  } catch (e) {
    log('Error reading definitions.json:', e.message);
  }
  return [];
}

function loadHistory() {
  const file = path.join(getDataDir(), 'workflows', 'history.json');
  try {
    if (fs.existsSync(file)) return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (e) {
    log('Error reading history.json:', e.message);
  }
  return [];
}

function loadRunResult(runId) {
  const file = path.join(getDataDir(), 'workflows', 'results', `${runId}.json`);
  try {
    if (fs.existsSync(file)) return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (e) {
    log('Error reading run result:', e.message);
  }
  return null;
}

function findWorkflow(nameOrId) {
  const defs = loadDefinitions();
  return defs.find(w =>
    w.id === nameOrId ||
    w.name.toLowerCase() === nameOrId.toLowerCase()
  );
}

// -- Formatters ---------------------------------------------------------------

function formatTrigger(trigger) {
  if (!trigger) return 'manual';
  if (trigger.type === 'cron') return `cron: ${trigger.value}`;
  if (trigger.type === 'hook') return `hook: ${trigger.hookType || trigger.value}`;
  if (trigger.type === 'on_workflow') return `after: ${trigger.value}`;
  return trigger.type || 'manual';
}

function formatDuration(ms) {
  if (!ms) return '—';
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  const m = Math.floor(ms / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  return `${m}m ${s}s`;
}

function formatStatus(status) {
  const icons = { success: 'OK', failed: 'FAIL', running: 'RUN', cancelled: 'CANCEL', pending: 'WAIT', skipped: 'SKIP', queued: 'QUEUE' };
  return icons[status] || status;
}

// -- Tool definitions ---------------------------------------------------------

const tools = [
  {
    name: 'workflow_list',
    description: 'List all workflows configured in Claude Terminal with their trigger type, enabled status, and last run result.',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'workflow_get',
    description: 'Get detailed info about a specific workflow: steps, trigger config, concurrency, dependencies, and recent runs.',
    inputSchema: {
      type: 'object',
      properties: {
        workflow: { type: 'string', description: 'Workflow name or ID' },
      },
      required: ['workflow'],
    },
  },
  {
    name: 'workflow_trigger',
    description: 'Trigger a workflow to run. Returns the run ID. The workflow executes asynchronously — use workflow_runs to check results.',
    inputSchema: {
      type: 'object',
      properties: {
        workflow: { type: 'string', description: 'Workflow name or ID' },
      },
      required: ['workflow'],
    },
  },
  {
    name: 'workflow_cancel',
    description: 'Cancel a running workflow execution.',
    inputSchema: {
      type: 'object',
      properties: {
        run_id: { type: 'string', description: 'Run ID to cancel' },
      },
      required: ['run_id'],
    },
  },
  {
    name: 'workflow_runs',
    description: 'Get run history for a workflow (or all workflows). Shows status, duration, trigger, and step results.',
    inputSchema: {
      type: 'object',
      properties: {
        workflow: { type: 'string', description: 'Workflow name or ID (omit for all workflows)' },
        limit: { type: 'number', description: 'Max runs to return (default: 10)' },
      },
    },
  },
  {
    name: 'workflow_status',
    description: 'Get currently active (running/queued) workflow executions.',
    inputSchema: { type: 'object', properties: {} },
  },
];

// -- Tool handler -------------------------------------------------------------

async function handle(name, args) {
  const ok = (text) => ({ content: [{ type: 'text', text }] });
  const fail = (text) => ({ content: [{ type: 'text', text }], isError: true });

  try {
    if (name === 'workflow_list') {
      const defs = loadDefinitions();
      if (!defs.length) return ok('No workflows configured. Create workflows in Claude Terminal > Workflows panel.');

      const history = loadHistory();

      const lines = defs.map(w => {
        const lastRun = history
          .filter(r => r.workflowId === w.id)
          .sort((a, b) => (b.startedAt || '').localeCompare(a.startedAt || ''))[0];

        const parts = [
          `${w.name}`,
          `  Type: ${formatTrigger(w.trigger)}`,
          `  Enabled: ${w.enabled !== false ? 'yes' : 'no'}`,
          `  Steps: ${(w.steps || []).length}`,
        ];

        if (lastRun) {
          parts.push(`  Last run: ${formatStatus(lastRun.status)} (${lastRun.duration || '—'})`);
        } else {
          parts.push('  Last run: never');
        }

        return parts.join('\n');
      });

      return ok(`Workflows (${defs.length}):\n\n${lines.join('\n\n')}`);
    }

    if (name === 'workflow_get') {
      if (!args.workflow) return fail('Missing required parameter: workflow');
      const wf = findWorkflow(args.workflow);
      if (!wf) return fail(`Workflow "${args.workflow}" not found. Use workflow_list to see available workflows.`);

      const history = loadHistory();
      const runs = history
        .filter(r => r.workflowId === wf.id)
        .sort((a, b) => (b.startedAt || '').localeCompare(a.startedAt || ''))
        .slice(0, 5);

      let output = `# ${wf.name}\n`;
      output += `ID: ${wf.id}\n`;
      output += `Enabled: ${wf.enabled !== false ? 'yes' : 'no'}\n`;
      output += `Trigger: ${formatTrigger(wf.trigger)}\n`;
      output += `Concurrency: ${wf.concurrency || 'skip'}\n`;
      if (wf.scope) output += `Scope: ${wf.scope}\n`;
      if (wf.projectPath) output += `Project: ${wf.projectPath}\n`;

      if (wf.dependsOn && wf.dependsOn.length) {
        output += `Dependencies: ${wf.dependsOn.map(d => `${d.workflow} (max_age: ${d.max_age || '—'})`).join(', ')}\n`;
      }

      output += `\n## Steps (${(wf.steps || []).length})\n`;
      for (const step of (wf.steps || [])) {
        output += `  ${step.id}: ${step.type}`;
        if (step.type === 'agent') output += ` — "${(step.config?.prompt || '').slice(0, 80)}"`;
        if (step.type === 'shell') output += ` — ${(step.config?.command || '').slice(0, 80)}`;
        if (step.type === 'http') output += ` — ${step.config?.method || 'GET'} ${(step.config?.url || '').slice(0, 60)}`;
        if (step.type === 'git') output += ` — ${(step.config?.actions || []).map(a => a.type || a).join(', ')}`;
        if (step.type === 'notify') output += ` — "${(step.config?.title || '').slice(0, 60)}"`;
        if (step.condition) output += ` [if ${step.condition}]`;
        output += '\n';
      }

      if (runs.length) {
        output += `\n## Recent Runs\n`;
        for (const r of runs) {
          const date = r.startedAt ? new Date(r.startedAt).toLocaleString() : '?';
          output += `  ${formatStatus(r.status)} | ${date} | ${r.duration || '—'} | trigger: ${r.trigger || '?'}\n`;
        }
      }

      return ok(output);
    }

    if (name === 'workflow_trigger') {
      if (!args.workflow) return fail('Missing required parameter: workflow');
      const wf = findWorkflow(args.workflow);
      if (!wf) return fail(`Workflow "${args.workflow}" not found. Use workflow_list to see available workflows.`);

      // We can't directly call WorkflowService from the MCP process.
      // Instead, we write a trigger request file that the app picks up.
      const triggerDir = path.join(getDataDir(), 'workflows', 'triggers');
      if (!fs.existsSync(triggerDir)) fs.mkdirSync(triggerDir, { recursive: true });

      const triggerFile = path.join(triggerDir, `${wf.id}_${Date.now()}.json`);
      fs.writeFileSync(triggerFile, JSON.stringify({
        workflowId: wf.id,
        source: 'mcp',
        timestamp: new Date().toISOString(),
      }), 'utf8');

      return ok(`Trigger request sent for workflow "${wf.name}". The app will pick it up and execute it. Use workflow_runs to check results.`);
    }

    if (name === 'workflow_cancel') {
      if (!args.run_id) return fail('Missing required parameter: run_id');
      // Similar to trigger — write cancel request
      const triggerDir = path.join(getDataDir(), 'workflows', 'triggers');
      if (!fs.existsSync(triggerDir)) fs.mkdirSync(triggerDir, { recursive: true });

      const cancelFile = path.join(triggerDir, `cancel_${args.run_id}_${Date.now()}.json`);
      fs.writeFileSync(cancelFile, JSON.stringify({
        action: 'cancel',
        runId: args.run_id,
        source: 'mcp',
        timestamp: new Date().toISOString(),
      }), 'utf8');

      return ok(`Cancel request sent for run "${args.run_id}".`);
    }

    if (name === 'workflow_runs') {
      const limit = Math.min(args.limit || 10, 50);
      const history = loadHistory();

      let runs;
      if (args.workflow) {
        const wf = findWorkflow(args.workflow);
        if (!wf) return fail(`Workflow "${args.workflow}" not found.`);
        runs = history.filter(r => r.workflowId === wf.id);
      } else {
        runs = history;
      }

      runs = runs
        .sort((a, b) => (b.startedAt || '').localeCompare(a.startedAt || ''))
        .slice(0, limit);

      if (!runs.length) return ok('No runs found.');

      const lines = runs.map(r => {
        const date = r.startedAt ? new Date(r.startedAt).toLocaleString() : '?';
        let line = `[${formatStatus(r.status)}] ${r.workflowName || r.workflowId} | ${date} | ${r.duration || '—'}`;
        if (r.trigger) line += ` | trigger: ${r.trigger}`;

        // Step summary
        if (r.steps && r.steps.length) {
          const stepSummary = r.steps.map(s => `${s.id}:${formatStatus(s.status)}`).join(', ');
          line += `\n  Steps: ${stepSummary}`;
        }

        // Error info
        if (r.status === 'failed' && r.steps) {
          const failedStep = r.steps.find(s => s.status === 'failed');
          if (failedStep && failedStep.output) {
            const errLine = String(failedStep.output).split('\n')[0].slice(0, 120);
            line += `\n  Error: ${errLine}`;
          }
        }

        return line;
      });

      const title = args.workflow ? `Runs for "${args.workflow}"` : 'Recent runs (all workflows)';
      return ok(`${title} (${runs.length}):\n\n${lines.join('\n\n')}`);
    }

    if (name === 'workflow_status') {
      const history = loadHistory();
      const active = history.filter(r => r.status === 'running' || r.status === 'pending' || r.status === 'queued');

      if (!active.length) return ok('No active workflow runs.');

      const lines = active.map(r => {
        const date = r.startedAt ? new Date(r.startedAt).toLocaleString() : '?';
        let line = `[${formatStatus(r.status)}] ${r.workflowName || r.workflowId} | started: ${date}`;

        if (r.steps && r.steps.length) {
          const current = r.steps.find(s => s.status === 'running');
          if (current) line += ` | current step: ${current.id} (${current.type})`;
          const done = r.steps.filter(s => s.status === 'success').length;
          line += ` | progress: ${done}/${r.steps.length}`;
        }

        return line;
      });

      return ok(`Active runs (${active.length}):\n\n${lines.join('\n')}`);
    }

    return fail(`Unknown workflow tool: ${name}`);
  } catch (error) {
    log(`Error in ${name}:`, error.message);
    return fail(`Workflow error: ${error.message}`);
  }
}

// -- Cleanup ------------------------------------------------------------------

async function cleanup() {
  // Nothing to clean up — we only read files
}

// -- Exports ------------------------------------------------------------------

module.exports = { tools, handle, cleanup };
