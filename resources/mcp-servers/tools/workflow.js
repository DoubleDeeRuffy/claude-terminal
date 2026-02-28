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

function signalReload() {
  try {
    const triggerDir = path.join(getDataDir(), 'workflows', 'triggers');
    if (!fs.existsSync(triggerDir)) fs.mkdirSync(triggerDir, { recursive: true });
    const f = path.join(triggerDir, `reload_${Date.now()}.json`);
    fs.writeFileSync(f, JSON.stringify({ action: 'reload', source: 'mcp', timestamp: new Date().toISOString() }), 'utf8');
  } catch (e) { log('signalReload error:', e.message); }
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

// -- Graph helpers -------------------------------------------------------------

function loadWorkflowDef(nameOrId) {
  const defs = loadDefinitions();
  return defs.find(w =>
    w.id === nameOrId ||
    (w.name || '').toLowerCase() === nameOrId.toLowerCase()
  ) || null;
}

function saveWorkflowDef(workflow) {
  // Always repair slot refs before saving so the graph renders correctly in LiteGraph
  if (workflow.graph) repairSlotRefs(workflow.graph);
  const file = path.join(getDataDir(), 'workflows', 'definitions.json');
  let defs = [];
  try { if (fs.existsSync(file)) defs = JSON.parse(fs.readFileSync(file, 'utf8')); } catch (_) {}
  const idx = defs.findIndex(w => w.id === workflow.id);
  if (idx >= 0) defs[idx] = workflow;
  else defs.push(workflow);
  const tmp = file + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(defs, null, 2), 'utf8');
  fs.renameSync(tmp, file);
}

// Rebuilds inputs[].link and outputs[].links from the graph.links[] array.
// Fixes legacy workflows where slot references were missing.
function repairSlotRefs(graph) {
  if (!graph || !graph.links) return;
  for (const node of graph.nodes || []) {
    if (node.outputs) for (const o of node.outputs) { if (!Array.isArray(o.links)) o.links = []; }
    if (node.inputs)  for (const i of node.inputs)  { if (i.link === undefined) i.link = null; }
  }
  for (const link of graph.links) {
    const [linkId, fromId, fromSlot, toId, toSlot] = link;
    const src = (graph.nodes || []).find(n => n.id === fromId);
    const dst = (graph.nodes || []).find(n => n.id === toId);
    if (src && src.outputs && src.outputs[fromSlot]) {
      if (!Array.isArray(src.outputs[fromSlot].links)) src.outputs[fromSlot].links = [];
      if (!src.outputs[fromSlot].links.includes(linkId)) src.outputs[fromSlot].links.push(linkId);
    }
    if (dst && dst.inputs && dst.inputs[toSlot]) {
      dst.inputs[toSlot].link = linkId;
    }
  }
}

function nextNodeId(graph) {
  const nodes = (graph && graph.nodes) || [];
  return nodes.length ? Math.max(...nodes.map(n => n.id)) + 1 : 1;
}

function nextLinkId(graph) {
  const links = (graph && graph.links) || [];
  return links.length ? Math.max(...links.map(l => l[0])) + 1 : 1;
}

// Pin type constants (mirror of PIN_TYPES in WorkflowGraphService.js)
// exec=-1 (LiteGraph EVENT), data pins are typed strings
const EXEC = -1;

function slot(name, type) {
  return { name, type, link: null };
}
function outSlot(name, type, i) {
  return { name, type, links: [], slot_index: i };
}
function execIn()  { return [slot('In', EXEC)]; }
function execOut(...names) { return names.map((n, i) => outSlot(n, EXEC, i)); }

// Returns the default inputs/outputs slot definitions for a node type
// Includes typed data pins (string/number/boolean/array/object/any)
function getNodeSlots(type) {
  switch (type) {
    case 'workflow/trigger':
      return { inputs: [], outputs: execOut('Start') };

    case 'workflow/claude':
      return {
        inputs: execIn(),
        outputs: [
          outSlot('Done',  EXEC,     0),
          outSlot('Error', EXEC,     1),
          outSlot('output','string', 2),
        ],
      };

    case 'workflow/shell':
      return {
        inputs: execIn(),
        outputs: [
          outSlot('Done',    EXEC,     0),
          outSlot('Error',   EXEC,     1),
          outSlot('stdout',  'string', 2),
          outSlot('stderr',  'string', 3),
          outSlot('exitCode','number', 4),
        ],
      };

    case 'workflow/git':
      return {
        inputs: execIn(),
        outputs: [
          outSlot('Done',   EXEC,     0),
          outSlot('Error',  EXEC,     1),
          outSlot('output', 'string', 2),
        ],
      };

    case 'workflow/http':
      return {
        inputs: execIn(),
        outputs: [
          outSlot('Done',   EXEC,     0),
          outSlot('Error',  EXEC,     1),
          outSlot('body',   'object', 2),
          outSlot('status', 'number', 3),
          outSlot('ok',     'boolean',4),
        ],
      };

    case 'workflow/db':
      return {
        inputs: execIn(),
        outputs: [
          outSlot('Done',     EXEC,     0),
          outSlot('Error',    EXEC,     1),
          outSlot('rows',     'array',  2),
          outSlot('rowCount', 'number', 3),
          outSlot('firstRow', 'object', 4),
        ],
      };

    case 'workflow/file':
      return {
        inputs: execIn(),
        outputs: [
          outSlot('Done',    EXEC,      0),
          outSlot('Error',   EXEC,      1),
          outSlot('content', 'string',  2),
          outSlot('exists',  'boolean', 3),
        ],
      };

    case 'workflow/condition':
      return { inputs: execIn(), outputs: execOut('TRUE', 'FALSE') };

    case 'workflow/loop':
      return {
        inputs: [
          slot('In',    EXEC),
          slot('array', 'array'),
        ],
        outputs: [
          outSlot('Each',  EXEC,    0),
          outSlot('Done',  EXEC,    1),
          outSlot('item',  'any',   2),
          outSlot('index', 'number',3),
        ],
      };

    case 'workflow/variable':
      return {
        inputs: execIn(),
        outputs: [
          outSlot('Done',  EXEC,  0),
          outSlot('value', 'any', 1),
        ],
      };

    case 'workflow/get_variable':
      // Pure node: no exec pins, just a data output
      return {
        inputs: [],
        outputs: [outSlot('value', 'any', 0)],
      };

    case 'workflow/transform':
      return {
        inputs: [
          slot('In',    EXEC),
          slot('input', 'any'),
        ],
        outputs: [
          outSlot('Done',   EXEC,  0),
          outSlot('Error',  EXEC,  1),
          outSlot('result', 'any', 2),
        ],
      };

    case 'workflow/log':
      return {
        inputs: [
          slot('In',      EXEC),
          slot('message', 'string'),
        ],
        outputs: execOut('Done'),
      };

    case 'workflow/notify':
    case 'workflow/wait':
      return { inputs: execIn(), outputs: execOut('Done') };

    case 'workflow/subworkflow':
      return {
        inputs: execIn(),
        outputs: [
          outSlot('Done',    EXEC,     0),
          outSlot('Error',   EXEC,     1),
          outSlot('outputs', 'object', 2),
        ],
      };

    case 'workflow/switch':
      // Switch: default output only (cases are dynamic — use workflow_update_node to set Cases)
      return { inputs: execIn(), outputs: execOut('Default') };

    default:
      // Fallback: Done + Error
      return { inputs: execIn(), outputs: execOut('Done', 'Error') };
  }
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

  // ── Graph editing tools ────────────────────────────────────────────────────

  {
    name: 'workflow_create',
    description: 'Create a new workflow with an optional initial graph. Returns the new workflow ID. Use this to start building a workflow from scratch.',
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Workflow name (required)' },
        trigger_type: { type: 'string', enum: ['manual', 'cron', 'hook', 'on_workflow'], description: 'Trigger type (default: manual)' },
        trigger_value: { type: 'string', description: 'Cron expression or hook type depending on trigger_type' },
        graph: { type: 'object', description: 'Optional full LiteGraph JSON { nodes[], links[] } to set immediately' },
      },
      required: ['name'],
    },
  },
  {
    name: 'workflow_add_node',
    description: 'Add a node to an existing workflow graph. Returns the new node ID. Available types: workflow/trigger, workflow/shell, workflow/claude, workflow/git, workflow/http, workflow/db, workflow/file, workflow/notify, workflow/wait, workflow/log, workflow/condition, workflow/loop, workflow/variable, workflow/get_variable, workflow/transform, workflow/subworkflow, workflow/switch. workflow/get_variable is a pure data node (no exec pins) — connect it directly to any data input pin to supply a variable value.',
    inputSchema: {
      type: 'object',
      properties: {
        workflow: { type: 'string', description: 'Workflow name or ID' },
        type: { type: 'string', description: 'Node type (e.g. workflow/shell, workflow/condition)' },
        pos: {
          type: 'array',
          items: { type: 'number' },
          description: 'Position [x, y] on the canvas. Layout tip: trigger at [100,100], chain downward +160px each step',
        },
        properties: { type: 'object', description: 'Node properties (command, prompt, variable, operator, value, etc.)' },
        title: { type: 'string', description: 'Optional custom display title for the node' },
      },
      required: ['workflow', 'type'],
    },
  },
  {
    name: 'workflow_connect_nodes',
    description: 'Connect an output slot of one node to an input slot of another. Slot conventions: most nodes have 1 input (slot 0) and outputs slot0=Done/True, slot1=Error/False. Condition: slot0=TRUE path, slot1=FALSE path. Loop: slot0=Each body, slot1=Done.',
    inputSchema: {
      type: 'object',
      properties: {
        workflow: { type: 'string', description: 'Workflow name or ID' },
        from_node: { type: 'number', description: 'Origin node ID' },
        from_slot: { type: 'number', description: 'Output slot index (0=Done/True/Start, 1=Error/False/Each)' },
        to_node: { type: 'number', description: 'Target node ID' },
        to_slot: { type: 'number', description: 'Input slot index (almost always 0)' },
      },
      required: ['workflow', 'from_node', 'from_slot', 'to_node', 'to_slot'],
    },
  },
  {
    name: 'workflow_update_node',
    description: 'Update properties or title of an existing node in a workflow graph.',
    inputSchema: {
      type: 'object',
      properties: {
        workflow: { type: 'string', description: 'Workflow name or ID' },
        node_id: { type: 'number', description: 'Node ID to update' },
        properties: { type: 'object', description: 'Properties to merge into the node (partial update)' },
        title: { type: 'string', description: 'New custom title for the node' },
      },
      required: ['workflow', 'node_id'],
    },
  },
  {
    name: 'workflow_delete_node',
    description: 'Delete a node (and all its connected links) from a workflow graph.',
    inputSchema: {
      type: 'object',
      properties: {
        workflow: { type: 'string', description: 'Workflow name or ID' },
        node_id: { type: 'number', description: 'Node ID to delete' },
      },
      required: ['workflow', 'node_id'],
    },
  },
  {
    name: 'workflow_get_variables',
    description: 'List all variables declared in a workflow. Shows variable nodes (Set/Get), their type (string/number/boolean/array/object/any), and current default value. Also lists get_variable nodes that reference variables not defined in this workflow.',
    inputSchema: {
      type: 'object',
      properties: {
        workflow: { type: 'string', description: 'Workflow name or ID' },
      },
      required: ['workflow'],
    },
  },
  {
    name: 'workflow_get_graph',
    description: 'Get the full graph (nodes + links) of a workflow in a readable format. Use this to understand the current structure before making changes.',
    inputSchema: {
      type: 'object',
      properties: {
        workflow: { type: 'string', description: 'Workflow name or ID' },
      },
      required: ['workflow'],
    },
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

      // Display graph nodes (LiteGraph format)
      const graphNodes = (wf.graph && wf.graph.nodes) || [];
      const graphLinks = (wf.graph && wf.graph.links) || [];
      if (graphNodes.length) {
        output += `\n## Graph Nodes (${graphNodes.length})\n`;
        for (const node of graphNodes) {
          const ntype = (node.type || '').replace('workflow/', '');
          const title = node.properties?._customTitle ? ` "${node.properties._customTitle}"` : '';
          output += `  [${node.id}] ${ntype}${title}`;
          const props = Object.entries(node.properties || {})
            .filter(([k, v]) => !k.startsWith('_') && v !== '' && v !== null && v !== undefined)
            .map(([k, v]) => `${k}=${JSON.stringify(v)}`);
          if (props.length) output += ` — ${props.slice(0, 4).join(', ')}`;
          output += '\n';
        }
        output += `\n## Links (${graphLinks.length})\n`;
        for (const l of graphLinks) {
          const srcNode = graphNodes.find(n => n.id === l[1]);
          const dstNode = graphNodes.find(n => n.id === l[3]);
          const srcType = (srcNode?.type || '').replace('workflow/', '');
          const dstType = (dstNode?.type || '').replace('workflow/', '');
          const srcOut = srcNode?.outputs?.[l[2]]?.name || `slot${l[2]}`;
          const dstIn  = dstNode?.inputs?.[l[4]]?.name  || `slot${l[4]}`;
          output += `  ${srcType}[${l[1]}].${srcOut} → ${dstType}[${l[3]}].${dstIn}\n`;
        }

        // Show declared variables (variable nodes with action=set)
        const varNodes = graphNodes.filter(n => n.type === 'workflow/variable' && n.properties?.action === 'set' && n.properties?.name);
        const getVarNodes = graphNodes.filter(n => n.type === 'workflow/get_variable' && n.properties?.name);
        if (varNodes.length || getVarNodes.length) {
          output += `\n## Variables\n`;
          for (const n of varNodes) {
            const t = n.properties.varType || 'any';
            output += `  SET ${n.properties.name} (${t})`;
            if (n.properties.value) output += ` = ${String(n.properties.value).slice(0, 40)}`;
            output += '\n';
          }
          for (const n of getVarNodes) {
            const t = n.properties.varType || 'any';
            const alreadyShown = varNodes.some(v => v.properties.name === n.properties.name);
            if (!alreadyShown) output += `  GET ${n.properties.name} (${t}) — referenced but not defined in this workflow\n`;
          }
        }
      } else {
        output += `\nNo graph nodes yet. Use workflow_add_node to start building.\n`;
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

    // ── workflow_get_variables ───────────────────────────────────────────────

    if (name === 'workflow_get_variables') {
      if (!args.workflow) return fail('Missing required parameter: workflow');
      const wf = loadWorkflowDef(args.workflow);
      if (!wf) return fail(`Workflow "${args.workflow}" not found.`);

      const nodes = (wf.graph && wf.graph.nodes) || [];
      const defined = new Map();
      const referenced = new Map();

      for (const n of nodes) {
        if (n.type === 'workflow/variable' && n.properties?.name) {
          const name2 = n.properties.name;
          const t = n.properties.varType || 'any';
          const val = n.properties.value;
          const action = n.properties.action || 'set';
          if (!defined.has(name2)) defined.set(name2, []);
          defined.get(name2).push({ action, type: t, value: val, nodeId: n.id });
        }
        if (n.type === 'workflow/get_variable' && n.properties?.name) {
          const name2 = n.properties.name;
          const t = n.properties.varType || 'any';
          if (!referenced.has(name2)) referenced.set(name2, []);
          referenced.get(name2).push({ type: t, nodeId: n.id });
        }
      }

      if (!defined.size && !referenced.size) {
        return ok(`No variables in workflow "${wf.name}".\n\nTo add a variable:\n- Use workflow_add_node with type "workflow/variable" and properties { name: "myVar", action: "set", value: "initial", varType: "string" }\n- Or use workflow_add_node with type "workflow/get_variable" and properties { name: "myVar", varType: "string" } to read a variable inline (no exec pins needed).`);
      }

      let out = `# Variables in "${wf.name}"\n\n`;

      if (defined.size) {
        out += `## Declared Variables (${defined.size})\n`;
        for (const [varName, usages] of defined) {
          const types = [...new Set(usages.map(u => u.type))].join('/');
          const setUsages = usages.filter(u => u.action === 'set');
          const val = setUsages[0]?.value;
          out += `  ${varName} (${types})`;
          if (val !== undefined && val !== '') out += ` = ${JSON.stringify(val)}`;
          out += ` — nodes: ${usages.map(u => `[${u.nodeId}] ${u.action}`).join(', ')}\n`;
        }
        out += '\n';
      }

      if (referenced.size) {
        const unreferenced = [...referenced.entries()].filter(([n]) => !defined.has(n));
        if (unreferenced.length) {
          out += `## Get Variable References (not defined in this workflow — ${unreferenced.length})\n`;
          for (const [varName, usages] of unreferenced) {
            const types = [...new Set(usages.map(u => u.type))].join('/');
            out += `  ${varName} (${types}) — nodes: ${usages.map(u => `[${u.nodeId}]`).join(', ')}\n`;
          }
          out += '\n';
        }
      }

      out += `Tip: Connect a "workflow/get_variable" node output directly to any data input pin to pass a variable value without exec flow.`;
      return ok(out);
    }

    // ── workflow_get_graph ───────────────────────────────────────────────────

    if (name === 'workflow_get_graph') {
      if (!args.workflow) return fail('Missing required parameter: workflow');
      const wf = loadWorkflowDef(args.workflow);
      if (!wf) return fail(`Workflow "${args.workflow}" not found. Use workflow_list to see available workflows.`);

      const graph = wf.graph || { nodes: [], links: [] };
      const nodes = graph.nodes || [];
      const links = graph.links || [];

      if (!nodes.length) return ok(`Workflow "${wf.name}" has an empty graph. Use workflow_add_node to start building.`);

      const nodeLines = nodes.map(n => {
        const props = Object.entries(n.properties || {})
          .filter(([k]) => !k.startsWith('_'))
          .map(([k, v]) => `${k}=${JSON.stringify(v)}`)
          .join(', ');
        const title = n.properties?._customTitle ? ` "${n.properties._customTitle}"` : '';
        return `  Node ${n.id}: ${n.type}${title} @ [${(n.pos || [0,0]).join(',')}]${props ? `\n    props: ${props}` : ''}`;
      });

      // link[link_id, origin_id, origin_slot, target_id, target_slot, type]
      const linkLines = links.map(l =>
        `  Link: node${l[1]} slot${l[2]} → node${l[3]} slot${l[4]}`
      );

      let out = `# Graph: ${wf.name} (${wf.id})\n\n`;
      out += `## Nodes (${nodes.length})\n${nodeLines.join('\n')}\n\n`;
      out += `## Links (${links.length})\n${linkLines.join('\n') || '  (none)'}`;
      return ok(out);
    }

    // ── workflow_create ──────────────────────────────────────────────────────

    if (name === 'workflow_create') {
      if (!args.name) return fail('Missing required parameter: name');

      const crypto = require('crypto');
      const id = `wf_${crypto.randomUUID().slice(0, 8)}`;

      // Build default trigger node
      const triggerType = args.trigger_type || 'manual';
      const triggerSlots = getNodeSlots('workflow/trigger');
      const triggerNode = {
        id: 1,
        type: 'workflow/trigger',
        pos: [100, 100],
        size: [180, 60],
        flags: {},
        order: 1,
        mode: 0,
        inputs: triggerSlots.inputs,
        outputs: triggerSlots.outputs,
        properties: {
          triggerType,
          triggerValue: args.trigger_value || '',
        },
      };

      const graph = args.graph || { nodes: [triggerNode], links: [], groups: [] };

      const workflow = {
        id,
        name: args.name,
        enabled: true,
        trigger: { type: triggerType, value: args.trigger_value || '' },
        graph,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      saveWorkflowDef(workflow);
      signalReload();
      log(`Created workflow "${args.name}" (${id})`);
      return ok(`Workflow "${args.name}" created successfully.\nID: ${id}\nTrigger: ${triggerType}\nNodes: ${graph.nodes.length} (trigger node added at ID 1)\n\nUse workflow_add_node with workflow="${id}" to add more nodes.`);
    }

    // ── workflow_add_node ────────────────────────────────────────────────────

    if (name === 'workflow_add_node') {
      if (!args.workflow) return fail('Missing required parameter: workflow');
      if (!args.type) return fail('Missing required parameter: type');

      const wf = loadWorkflowDef(args.workflow);
      if (!wf) return fail(`Workflow "${args.workflow}" not found.`);

      const graph = wf.graph || { nodes: [], links: [], groups: [] };
      const nodeId = nextNodeId(graph);

      const slots = getNodeSlots(args.type);
      const node = {
        id: nodeId,
        type: args.type,
        pos: args.pos || [100, 100 + nodeId * 160],
        size: [200, 80],
        flags: {},
        order: nodeId,
        mode: 0,
        inputs: slots.inputs,
        outputs: slots.outputs,
        properties: args.properties || {},
      };
      if (args.title) node.properties._customTitle = args.title;

      graph.nodes = [...(graph.nodes || []), node];
      wf.graph = graph;
      wf.updatedAt = new Date().toISOString();
      saveWorkflowDef(wf);
      signalReload();

      log(`Added node ${nodeId} (${args.type}) to workflow ${wf.id}`);
      return ok(`Node added successfully.\nNode ID: ${nodeId}\nType: ${args.type}\nPosition: [${node.pos.join(',')}]\n\nUse this ID (${nodeId}) when connecting nodes with workflow_connect_nodes.`);
    }

    // ── workflow_connect_nodes ───────────────────────────────────────────────

    if (name === 'workflow_connect_nodes') {
      const { workflow: wfArg, from_node, from_slot, to_node, to_slot } = args;
      if (!wfArg) return fail('Missing required parameter: workflow');
      if (from_node == null || from_slot == null || to_node == null || to_slot == null) {
        return fail('Missing required parameters: from_node, from_slot, to_node, to_slot');
      }

      const wf = loadWorkflowDef(wfArg);
      if (!wf) return fail(`Workflow "${wfArg}" not found.`);

      const graph = wf.graph || { nodes: [], links: [], groups: [] };
      const nodes = graph.nodes || [];

      if (!nodes.find(n => n.id === from_node)) return fail(`Node ${from_node} not found in graph.`);
      if (!nodes.find(n => n.id === to_node)) return fail(`Node ${to_node} not found in graph.`);

      // Check duplicate link
      const existing = (graph.links || []).find(l =>
        l[1] === from_node && l[2] === from_slot && l[3] === to_node && l[4] === to_slot
      );
      if (existing) return ok(`Link already exists between node ${from_node} slot ${from_slot} → node ${to_node} slot ${to_slot}.`);

      const linkId = nextLinkId(graph);
      // LiteGraph link format: [link_id, origin_id, origin_slot, target_id, target_slot, type]
      const link = [linkId, from_node, from_slot, to_node, to_slot, -1];
      graph.links = [...(graph.links || []), link];

      // Update outputs[from_slot].links on source node
      const srcNode = nodes.find(n => n.id === from_node);
      if (srcNode) {
        if (!srcNode.outputs) srcNode.outputs = getNodeSlots(srcNode.type).outputs;
        if (srcNode.outputs[from_slot]) {
          if (!srcNode.outputs[from_slot].links) srcNode.outputs[from_slot].links = [];
          if (!srcNode.outputs[from_slot].links.includes(linkId)) {
            srcNode.outputs[from_slot].links.push(linkId);
          }
        }
      }

      // Update inputs[to_slot].link on target node
      const dstNode = nodes.find(n => n.id === to_node);
      if (dstNode) {
        if (!dstNode.inputs) dstNode.inputs = getNodeSlots(dstNode.type).inputs;
        if (dstNode.inputs[to_slot]) {
          dstNode.inputs[to_slot].link = linkId;
        }
      }

      wf.graph = graph;
      wf.updatedAt = new Date().toISOString();
      saveWorkflowDef(wf);
      signalReload();

      log(`Connected node ${from_node}:${from_slot} → node ${to_node}:${to_slot} in workflow ${wf.id}`);
      return ok(`Connection created: node ${from_node} (slot ${from_slot}) → node ${to_node} (slot ${to_slot})`);
    }

    // ── workflow_update_node ─────────────────────────────────────────────────

    if (name === 'workflow_update_node') {
      if (!args.workflow) return fail('Missing required parameter: workflow');
      if (args.node_id == null) return fail('Missing required parameter: node_id');

      const wf = loadWorkflowDef(args.workflow);
      if (!wf) return fail(`Workflow "${args.workflow}" not found.`);

      const graph = wf.graph || { nodes: [], links: [] };
      const nodeIdx = (graph.nodes || []).findIndex(n => n.id === args.node_id);
      if (nodeIdx < 0) return fail(`Node ${args.node_id} not found in graph.`);

      const node = graph.nodes[nodeIdx];
      if (args.properties) {
        node.properties = { ...node.properties, ...args.properties };
      }
      if (args.title !== undefined) {
        node.properties._customTitle = args.title;
      }
      graph.nodes[nodeIdx] = node;

      wf.graph = graph;
      wf.updatedAt = new Date().toISOString();
      saveWorkflowDef(wf);
      signalReload();

      log(`Updated node ${args.node_id} in workflow ${wf.id}`);
      return ok(`Node ${args.node_id} updated successfully.`);
    }

    // ── workflow_delete_node ─────────────────────────────────────────────────

    if (name === 'workflow_delete_node') {
      if (!args.workflow) return fail('Missing required parameter: workflow');
      if (args.node_id == null) return fail('Missing required parameter: node_id');

      const wf = loadWorkflowDef(args.workflow);
      if (!wf) return fail(`Workflow "${args.workflow}" not found.`);

      const graph = wf.graph || { nodes: [], links: [] };
      const beforeCount = (graph.nodes || []).length;
      graph.nodes = (graph.nodes || []).filter(n => n.id !== args.node_id);
      if (graph.nodes.length === beforeCount) return fail(`Node ${args.node_id} not found in graph.`);

      // Remove all links connected to this node and clean up slot references
      const removedLinkIds = new Set(
        (graph.links || []).filter(l => l[1] === args.node_id || l[3] === args.node_id).map(l => l[0])
      );
      const removedLinks = removedLinkIds.size;
      graph.links = (graph.links || []).filter(l => l[1] !== args.node_id && l[3] !== args.node_id);

      // Clean orphaned link references from remaining nodes' slots
      for (const n of graph.nodes || []) {
        if (n.outputs) {
          for (const out of n.outputs) {
            if (out.links) out.links = out.links.filter(lid => !removedLinkIds.has(lid));
          }
        }
        if (n.inputs) {
          for (const inp of n.inputs) {
            if (removedLinkIds.has(inp.link)) inp.link = null;
          }
        }
      }

      wf.graph = graph;
      wf.updatedAt = new Date().toISOString();
      saveWorkflowDef(wf);
      signalReload();

      log(`Deleted node ${args.node_id} (+ ${removedLinks} links) from workflow ${wf.id}`);
      return ok(`Node ${args.node_id} deleted (${removedLinks} link(s) also removed).`);
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
