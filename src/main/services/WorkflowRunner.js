/**
 * WorkflowRunner
 * Executes a single workflow run: resolves variables, evaluates conditions,
 * dispatches each step type. Fully async, cancellable via AbortController.
 *
 * Step types handled:
 *   agent      — Claude Agent SDK session (bypassPermissions)
 *   shell      — child_process.execFile (no shell injection)
 *   git        — uses git.js helpers
 *   http       — native fetch (Node 18+)
 *   notify     — desktop notification + remote push
 *   wait       — pause for human confirmation or timeout
 *   file       — read / write / copy / delete
 *   db         — database query / schema / tables via DatabaseService
 *   condition  — evaluate expression, expose boolean variable
 *   loop       — iterate over an array variable, execute sub-steps
 *   parallel   — concurrent sub-steps, wait for all
 */

'use strict';

const { execFile }  = require('child_process');
const fs            = require('fs');
const path          = require('path');
const crypto        = require('crypto');

const {
  gitCommit, gitPull, gitPush, gitStageFiles,
  checkoutBranch, createBranch, spawnGit,
} = require('../utils/git');

// ─── Variable resolution ──────────────────────────────────────────────────────

/**
 * Resolve all $xxx.yyy and $ctx.yyy references in a string value.
 * @param {string} value
 * @param {Map<string, any>} vars  - step outputs + ctx
 * @returns {string}
 */
function resolveVars(value, vars) {
  if (typeof value !== 'string') return value;
  return value.replace(/\$([a-zA-Z_][\w.]*)(\.[a-zA-Z_][\w.]*)?/g, (match, prefix, suffix) => {
    const key = prefix + (suffix || '');
    // Walk the key path into vars (dot-separated)
    const parts = key.split('.');
    let cur = vars.get(parts[0]);
    for (let i = 1; i < parts.length && cur != null; i++) {
      cur = cur[parts[i]];
    }
    return cur != null ? String(cur) : match;
  });
}

/**
 * Deep-resolve all string leaves of an object.
 * @param {any} obj
 * @param {Map<string, any>} vars
 * @returns {any}
 */
function resolveDeep(obj, vars) {
  if (typeof obj === 'string') return resolveVars(obj, vars);
  if (Array.isArray(obj))     return obj.map(v => resolveDeep(v, vars));
  if (obj && typeof obj === 'object') {
    const out = {};
    for (const [k, v] of Object.entries(obj)) out[k] = resolveDeep(v, vars);
    return out;
  }
  return obj;
}

// ─── Safe condition evaluation ────────────────────────────────────────────────

/**
 * Evaluate a condition string against resolved variables.
 * Supports: ==, !=, >, <, >=, <=, true/false literals.
 * No eval() — purely regex-based.
 * @param {string} condition
 * @param {Map<string, any>} vars
 * @returns {boolean}
 */
function evalCondition(condition, vars) {
  if (!condition || condition.trim() === '') return true;

  const resolved = resolveVars(condition, vars);

  // Boolean literals
  if (resolved === 'true')  return true;
  if (resolved === 'false') return false;

  // Comparison operators (left OP right)
  const match = resolved.match(/^(.+?)\s*(==|!=|>=|<=|>|<)\s*(.+)$/);
  if (!match) {
    // Truthy check (non-empty string / non-zero number)
    const val = resolved.trim();
    if (val === '' || val === '0' || val === 'null' || val === 'undefined') return false;
    return true;
  }

  const [, leftRaw, op, rightRaw] = match;
  const left  = leftRaw.trim();
  const right = rightRaw.trim();

  // Try numeric comparison
  const ln = parseFloat(left);
  const rn = parseFloat(right);
  const numeric = !isNaN(ln) && !isNaN(rn);

  switch (op) {
    case '==': return numeric ? ln === rn : left === right;
    case '!=': return numeric ? ln !== rn : left !== right;
    case '>':  return numeric && ln > rn;
    case '<':  return numeric && ln < rn;
    case '>=': return numeric && ln >= rn;
    case '<=': return numeric && ln <= rn;
    default:   return false;
  }
}

// ─── Shell step ───────────────────────────────────────────────────────────────

function runShellStep(config, vars, signal) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(new Error('Cancelled'));

    const command = resolveVars(config.command || '', vars);
    const cwd     = resolveVars(config.cwd || process.cwd(), vars);
    const timeout = config.timeout ? parseMs(config.timeout) : 60_000;

    // Split into argv-style array (simple: split on space, honour quoted strings)
    const args = parseCommand(command);
    if (!args.length) return resolve({ exitCode: 0, stdout: '', stderr: '' });

    const [cmd, ...rest] = args;
    let child;
    const onAbort = () => { try { child?.kill('SIGKILL'); } catch {} };
    signal?.addEventListener('abort', onAbort, { once: true });

    child = execFile(cmd, rest, { cwd, encoding: 'utf8', maxBuffer: 4 * 1024 * 1024, timeout }, (err, stdout, stderr) => {
      signal?.removeEventListener('abort', onAbort);
      if (signal?.aborted) return reject(new Error('Cancelled'));
      resolve({ exitCode: err?.code ?? 0, stdout: stdout || '', stderr: stderr || '' });
    });
  });
}

/** Minimal command parser: respects double-quoted segments. */
function parseCommand(cmd) {
  const out = [];
  let cur = '';
  let inQuote = false;
  for (let i = 0; i < cmd.length; i++) {
    const c = cmd[i];
    if (c === '"') { inQuote = !inQuote; continue; }
    if (c === ' ' && !inQuote) {
      if (cur) { out.push(cur); cur = ''; }
    } else {
      cur += c;
    }
  }
  if (cur) out.push(cur);
  return out;
}

// ─── Git step ─────────────────────────────────────────────────────────────────

async function runGitStep(config, vars) {
  const cwd     = resolveVars(config.cwd || '', vars);
  const actions = Array.isArray(config.actions) ? config.actions : [config];

  const results = [];
  for (const action of actions) {
    const resolved = resolveDeep(action, vars);
    let res;

    if (resolved.pull)     res = await gitPull(cwd);
    else if (resolved.push)     res = await gitPush(cwd);
    else if (resolved.commit)   res = await (async () => {
      await gitStageFiles(cwd, resolved.files || ['.']);
      return gitCommit(cwd, resolved.commit);
    })();
    else if (resolved.checkout) res = await checkoutBranch(cwd, resolved.checkout);
    else if (resolved.branch)   res = await createBranch(cwd, resolved.branch);
    else if (resolved.command)  res = await spawnGit(cwd, resolved.command.split(/\s+/));
    else res = { success: false, error: 'Unknown git action' };

    results.push(res);
    if (!res.success) {
      return { success: false, error: res.error, results };
    }
  }

  return { success: true, output: results.map(r => r.output || '').join('\n'), results };
}

// ─── HTTP step ────────────────────────────────────────────────────────────────

async function runHttpStep(config, vars, signal) {
  const url     = resolveVars(config.url || '', vars);
  const method  = (config.method || 'GET').toUpperCase();
  const headers = resolveDeep(config.headers || {}, vars);
  const body    = config.body ? JSON.stringify(resolveDeep(config.body, vars)) : undefined;
  const timeout = config.timeout ? parseMs(config.timeout) : 30_000;

  const aborter = new AbortController();
  const timer   = setTimeout(() => aborter.abort(), timeout);
  // Chain external cancellation
  const onAbort = () => aborter.abort();
  signal?.addEventListener('abort', onAbort, { once: true });

  try {
    const res  = await fetch(url, { method, headers, body, signal: aborter.signal });
    const text = await res.text();
    let json;
    try { json = JSON.parse(text); } catch { /* text only */ }
    return { status: res.status, ok: res.ok, body: json ?? text };
  } catch (err) {
    if (signal?.aborted) throw new Error('Cancelled');
    throw err;
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', onAbort);
  }
}

// ─── File step ────────────────────────────────────────────────────────────────

/**
 * Validate that a resolved path stays within the workflow's project directory.
 * Prevents path traversal attacks (e.g. ../../etc/passwd).
 */
function assertPathWithinProject(filePath, vars) {
  const ctx = vars.get('ctx') || {};
  const projectDir = ctx.project;
  if (!projectDir) return; // no project context — skip check (manual runs)
  const resolved = path.resolve(filePath);
  const base = path.resolve(projectDir);
  // Case-insensitive comparison on Windows to prevent bypass via mixed case
  const cmp = process.platform === 'win32'
    ? (a, b) => a.toLowerCase() === b.toLowerCase() || a.toLowerCase().startsWith(b.toLowerCase() + path.sep)
    : (a, b) => a === b || a.startsWith(b + path.sep);
  if (!cmp(resolved, base)) {
    throw new Error(`Path "${filePath}" is outside the project directory`);
  }
}

async function runFileStep(config, vars) {
  const action  = config.action || 'read';
  const p       = resolveVars(config.path || '', vars);
  const dest    = resolveVars(config.dest || '', vars);
  const content = resolveVars(config.content || '', vars);

  // Validate paths stay within the project directory
  if (p) assertPathWithinProject(p, vars);
  if (dest) assertPathWithinProject(dest, vars);

  switch (action) {
    case 'read':
      return { content: fs.readFileSync(p, 'utf8') };
    case 'write':
      fs.mkdirSync(path.dirname(p), { recursive: true });
      fs.writeFileSync(p, content, 'utf8');
      return { success: true };
    case 'append':
      fs.appendFileSync(p, content, 'utf8');
      return { success: true };
    case 'copy':
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      fs.copyFileSync(p, dest);
      return { success: true };
    case 'delete':
      fs.rmSync(p, { force: true, recursive: true });
      return { success: true };
    case 'exists':
      return { exists: fs.existsSync(p) };
    default:
      throw new Error(`Unknown file action: ${action}`);
  }
}

// ─── Database step ───────────────────────────────────────────────────────────

/**
 * Run a database query/schema/tables operation.
 * Requires a DatabaseService instance passed to the runner.
 *
 * @param {Object}  config          - step config
 * @param {Map}     vars            - resolved variables
 * @param {Object}  databaseService - DatabaseService singleton
 * @returns {Promise<Object>}       - { rows, columns, rowCount, duration, firstRow } | { tables, tableCount }
 */
async function runDbStep(config, vars, databaseService) {
  if (!databaseService) throw new Error('DatabaseService not available');

  const connId = resolveVars(config.connection || '', vars);
  if (!connId) throw new Error('No database connection specified');

  const action = config.action || 'query';

  // Ensure connection is active (auto-connect if needed)
  const connections = await databaseService.loadConnections();
  const connConfig = connections.find(c => c.id === connId);
  if (!connConfig) throw new Error(`Database connection "${connId}" not found`);

  // Connect if not already connected
  try {
    await databaseService.connect(connId, connConfig);
  } catch {
    // May already be connected — ignore
  }

  if (action === 'schema') {
    const schema = await databaseService.getSchema(connId, { force: true });
    const tables = schema?.tables || [];
    return { tables, tableCount: tables.length };
  }

  if (action === 'tables') {
    const schema = await databaseService.getSchema(connId, { force: true });
    const tables = (schema?.tables || []).map(t => t.name || t.table_name || t);
    return { tables, tableCount: tables.length };
  }

  // action === 'query'
  const sql   = resolveVars(config.query || '', vars);
  const limit = parseInt(config.limit, 10) || 100;

  if (!sql.trim()) throw new Error('Empty SQL query');

  const start  = Date.now();
  const result = await databaseService.executeQuery(connId, sql, limit);
  const duration = Date.now() - start;

  if (result.error) throw new Error(result.error);

  const rows     = result.rows || [];
  const columns  = result.columns || [];
  const rowCount = result.rowCount ?? rows.length;
  const firstRow = rows.length > 0 ? rows[0] : null;

  return { rows, columns, rowCount, duration, firstRow };
}

// ─── Condition step ───────────────────────────────────────────────────────────

function runConditionStep(config, vars) {
  const result = evalCondition(resolveVars(config.expression || 'true', vars), vars);
  return { result, value: result };
}

// ─── Wait step ────────────────────────────────────────────────────────────────

/**
 * Pause execution. Resolves when:
 *   - `onApprove(runId, stepId)` is called (human confirmation via IPC)
 *   - OR timeout expires (if configured)
 *   - OR signal is aborted
 * @param {Object} config
 * @param {AbortSignal} signal
 * @param {Map<string, Function>} waitCallbacks  - shared registry: key → resolve fn
 * @param {string} runId
 * @param {string} stepId
 */
function runWaitStep(config, signal, waitCallbacks, runId, stepId) {
  return new Promise((resolve, reject) => {
    const key     = `${runId}::${stepId}`;
    const timeout = config.timeout ? parseMs(config.timeout) : null;

    const done = (result) => {
      waitCallbacks.delete(key);
      clearTimeout(timer);
      resolve(result);
    };

    waitCallbacks.set(key, done);

    const timer = timeout
      ? setTimeout(() => done({ timedOut: true, approved: false }), timeout)
      : null;

    const onAbort = () => {
      waitCallbacks.delete(key);
      clearTimeout(timer);
      reject(new Error('Cancelled'));
    };
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

// ─── Agent step ───────────────────────────────────────────────────────────────

/**
 * Run a Claude agent session for a workflow step.
 * We delegate to ChatService.startSession() with bypassPermissions
 * and wait for the session to complete (chat-done event).
 *
 * @param {Object}   config
 * @param {Map}      vars
 * @param {AbortSignal} signal
 * @param {Object}   chatService  - main ChatService singleton
 * @param {Function} onMessage    - called with each SDK message (for logging)
 */
/**
 * Build a JSON Schema object from user-defined output fields.
 * @param {Array<{name:string, type:string}>} fields
 * @returns {Object} JSON Schema
 */
function buildJsonSchema(fields) {
  const properties = {};
  const required = [];
  for (const field of fields) {
    if (!field.name) continue;
    required.push(field.name);
    switch (field.type) {
      case 'number':  properties[field.name] = { type: 'number' }; break;
      case 'boolean': properties[field.name] = { type: 'boolean' }; break;
      case 'array':   properties[field.name] = { type: 'array', items: { type: 'string' } }; break;
      case 'object':  properties[field.name] = { type: 'object' }; break;
      default:        properties[field.name] = { type: 'string' }; break;
    }
  }
  return { type: 'object', properties, required, additionalProperties: false };
}

async function runAgentStep(config, vars, signal, chatService, onMessage) {
  const mode     = config.mode || 'prompt';
  const prompt   = resolveVars(config.prompt || '', vars);
  const cwd      = resolveVars(config.cwd || process.cwd(), vars);
  const model    = config.model || null;
  const effort   = config.effort || null;
  const maxTurns = config.maxTurns || 30;

  if (signal?.aborted) throw new Error('Cancelled');

  // Build session options based on mode
  const sessionOpts = {
    cwd,
    prompt,
    permissionMode: 'bypassPermissions',
    model,
    effort,
    maxTurns,
  };

  // Skill mode: pass skill to SDK
  if (mode === 'skill' && config.skillId) {
    sessionOpts.skills = [config.skillId];
  }

  // Structured output: build JSON schema from field definitions
  if (config.outputSchema && config.outputSchema.length > 0) {
    const validFields = config.outputSchema.filter(f => f.name);
    if (validFields.length > 0) {
      sessionOpts.outputFormat = { type: 'json_schema', schema: buildJsonSchema(validFields) };
    }
  }

  return new Promise((resolve, reject) => {
    let sessionId;
    let stdout = '';
    let structuredOutput = null;
    let cleanup;

    const onAbort = () => {
      if (sessionId) {
        try { chatService.interrupt(sessionId); } catch {}
        try { chatService.closeSession(sessionId); } catch {}
      }
      cleanup?.();
      reject(new Error('Cancelled'));
    };
    signal?.addEventListener('abort', onAbort, { once: true });

    let unregisterInterceptor;

    const interceptor = (channel, data) => {
      if (channel === 'chat-message' && onMessage) onMessage(data.message);
      if (channel === 'chat-message' && data.message?.type === 'assistant') {
        const content = data.message?.message?.content;
        if (Array.isArray(content)) {
          for (const block of content) {
            if (block.type === 'text') stdout += block.text;
          }
        }
      }
      // Capture structured output from result message
      if (channel === 'chat-message' && data.message?.type === 'result' && data.message?.structured_output) {
        structuredOutput = data.message.structured_output;
      }
      if (channel === 'chat-done') {
        signal?.removeEventListener('abort', onAbort);
        unregisterInterceptor?.();
        cleanup?.();
        const result = { output: stdout.trim(), success: true };
        // Merge structured output fields into step result (accessible as $stepId.fieldName)
        if (structuredOutput && typeof structuredOutput === 'object') {
          Object.assign(result, structuredOutput);
        }
        resolve(result);
      }
      if (channel === 'chat-error') {
        signal?.removeEventListener('abort', onAbort);
        unregisterInterceptor?.();
        cleanup?.();
        reject(new Error(data.error || 'Agent step failed'));
      }
    };

    chatService.startSession(sessionOpts).then(id => {
      sessionId = id;
      unregisterInterceptor = chatService.addSessionInterceptor(id, interceptor);
      cleanup = () => {};
    }).catch(err => {
      signal?.removeEventListener('abort', onAbort);
      unregisterInterceptor?.();
      reject(err);
    });
  });
}

// ─── Notify step ─────────────────────────────────────────────────────────────

/**
 * @param {Object} config
 * @param {Map}    vars
 * @param {Function} sendFn  - main process _send (workflow-notify channel)
 */
async function runNotifyStep(config, vars, sendFn) {
  const message  = resolveVars(config.message || '', vars);
  const channels = config.channels || ['desktop'];
  const title    = resolveVars(config.title || 'Workflow', vars);

  const tasks = [];

  for (const ch of channels) {
    if (ch === 'desktop') {
      // Delegate to renderer notification system via a dedicated channel
      sendFn('workflow-notify-desktop', { title, message });
    } else if (typeof ch === 'object') {
      // { discord: '$secrets.URL' } or { slack: '...' }
      const [type, urlRaw] = Object.entries(ch)[0];
      const url = resolveVars(urlRaw, vars);
      if (!url || url.startsWith('$')) continue; // unresolved secret → skip

      let body;
      if (type === 'discord') {
        body = JSON.stringify({ content: message });
      } else if (type === 'slack') {
        body = JSON.stringify({ text: message });
      } else {
        body = JSON.stringify({ message });
      }

      tasks.push(
        fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body,
        }).catch(err => console.warn(`[WorkflowRunner] Notify ${type} failed:`, err.message))
      );
    }
  }

  await Promise.allSettled(tasks);
  return { sent: true, message };
}

// ─── Time parser ──────────────────────────────────────────────────────────────

function parseMs(value) {
  if (typeof value === 'number') return value;
  if (typeof value !== 'string') return 60_000;
  const match = value.match(/^(\d+(?:\.\d+)?)(ms|s|m|h)$/);
  if (!match) return parseInt(value, 10) || 60_000;
  const [, n, unit] = match;
  const num = parseFloat(n);
  const multipliers = { ms: 1, s: 1000, m: 60_000, h: 3_600_000 };
  return Math.round(num * (multipliers[unit] || 1000));
}

// ─── Main executor ────────────────────────────────────────────────────────────

class WorkflowRunner {
  /**
   * @param {Object} opts
   * @param {Function}          opts.sendFn        - (channel, data) => void, sends to renderer
   * @param {Object}            opts.chatService   - ChatService singleton
   * @param {Map<string, Function>} opts.waitCallbacks - shared wait registry
   * @param {Object}            opts.projectTypeRegistry - { fivem, api, ... } services for native steps
   */
  constructor({ sendFn, chatService, waitCallbacks, projectTypeRegistry = {}, databaseService = null }) {
    this._send              = sendFn;
    this._chatService       = chatService;
    this._waitCallbacks     = waitCallbacks;
    this._projectTypeRegistry = projectTypeRegistry;
    this._databaseService   = databaseService;
  }

  /**
   * Execute a full workflow run.
   * Supports both legacy steps[] format and new graph format.
   * @param {Object} workflow
   * @param {Object} run              - run record (has .id, .triggerData, etc.)
   * @param {AbortController} abort
   * @param {Map<string, any>} [extraVars]  - e.g. depends_on results
   * @returns {Promise<{ success: boolean, outputs: Object, error?: string }>}
   */
  async execute(workflow, run, abort, extraVars = new Map()) {
    const vars = new Map([
      // Context variables
      ['ctx', {
        project:    workflow.scope?.project || '',
        branch:     run.contextBranch  || '',
        date:       new Date().toISOString(),
        lastCommit: run.contextCommit  || '',
        trigger:    run.trigger         || 'manual',
      }],
      ['trigger', run.triggerData || {}],
      // Inject depends_on outputs
      ...extraVars,
    ]);

    const stepOutputs = {};

    const globalTimeoutMs = workflow.timeout ? parseMs(workflow.timeout) : null;
    const globalTimer = globalTimeoutMs
      ? setTimeout(() => abort.abort(), globalTimeoutMs)
      : null;

    try {
      if (workflow.graph && workflow.graph.nodes) {
        // New graph-based execution
        await this._executeGraph(workflow.graph, vars, run.id, abort.signal, stepOutputs, workflow);
      } else {
        // Legacy linear steps execution
        const steps = workflow.steps || [];
        await this._runSteps(steps, vars, run.id, abort.signal, stepOutputs, workflow);
      }
      return { success: true, outputs: stepOutputs };
    } catch (err) {
      if (abort.signal.aborted) {
        return { success: false, cancelled: true, outputs: stepOutputs, error: 'Cancelled' };
      }
      return { success: false, outputs: stepOutputs, error: err.message };
    } finally {
      if (globalTimer) clearTimeout(globalTimer);
    }
  }

  // ─── Graph-based execution ───────────────────────────────────────────────────

  /**
   * Execute a workflow graph using BFS traversal from the trigger node.
   * Follows LiteGraph links and handles Condition node branching.
   *
   * @param {Object} graphData          - LiteGraph serialized graph { nodes[], links[] }
   * @param {Map<string, any>} vars     - Resolved variables
   * @param {string} runId              - Current run ID
   * @param {AbortSignal} signal        - Cancellation signal
   * @param {Object} stepOutputs        - Accumulator for step outputs
   * @param {Object} workflow           - Full workflow object
   */
  async _executeGraph(graphData, vars, runId, signal, stepOutputs, workflow) {
    const { nodes, links } = graphData;
    if (!nodes || !nodes.length) return;

    // Build lookup maps
    const nodeById = new Map();
    for (const node of nodes) {
      nodeById.set(node.id, node);
    }

    // Build adjacency: linkId → link data
    // LiteGraph link format: [link_id, origin_id, origin_slot, target_id, target_slot, type]
    const linkById = new Map();
    if (links) {
      for (const link of links) {
        linkById.set(link[0], {
          id:         link[0],
          originId:   link[1],
          originSlot: link[2],
          targetId:   link[3],
          targetSlot: link[4],
          type:       link[5],
        });
      }
    }

    // Build outgoing connections map: nodeId → Map<slotIndex, targetNodeId[]>
    const outgoing = new Map();
    for (const [, link] of linkById) {
      if (!outgoing.has(link.originId)) outgoing.set(link.originId, new Map());
      const slots = outgoing.get(link.originId);
      if (!slots.has(link.originSlot)) slots.set(link.originSlot, []);
      slots.get(link.originSlot).push(link.targetId);
    }

    // Find the trigger node
    const triggerNode = nodes.find(n => n.type === 'workflow/trigger');
    if (!triggerNode) {
      throw new Error('No trigger node found in graph');
    }

    // BFS traversal from trigger node
    // The trigger has output slot 0 = "Start"
    const visited = new Set();
    const queue = this._getNextNodes(triggerNode.id, 0, outgoing); // slot 0 = Start

    // Emit trigger as running then success
    this._emitStep(runId, { id: `node_${triggerNode.id}`, type: 'trigger' }, 'running', null);
    this._emitStep(runId, { id: `node_${triggerNode.id}`, type: 'trigger' }, 'success', null);
    visited.add(triggerNode.id);

    let lastError = null;

    while (queue.length > 0) {
      if (signal.aborted) throw new Error('Cancelled');

      const nodeId = queue.shift();
      if (visited.has(nodeId)) continue;
      visited.add(nodeId);

      const nodeData = nodeById.get(nodeId);
      if (!nodeData) continue;

      // Convert node to step format for the dispatcher
      const stepType = nodeData.type.replace('workflow/', '');
      const step = {
        id:   `node_${nodeData.id}`,
        type: stepType,
        ...(nodeData.properties || {}),
      };

      if (stepType === 'condition') {
        // Condition nodes don't fail — they evaluate and branch
        try {
          await this._runOneStep(step, vars, runId, signal, stepOutputs, workflow);
        } catch (err) {
          if (signal.aborted) throw err;
          // Condition eval failed — treat as false
          stepOutputs[step.id] = { result: false, value: false };
        }
        const outputResult = stepOutputs[step.id];
        const condResult = outputResult?.result ?? outputResult?.value ?? true;
        const nextSlot = condResult ? 0 : 1;
        queue.push(...this._getNextNodes(nodeId, nextSlot, outgoing));
      } else {
        // Normal step: try to execute
        try {
          await this._runOneStep(step, vars, runId, signal, stepOutputs, workflow);
          // Success → follow slot 0 (Done)
          queue.push(...this._getNextNodes(nodeId, 0, outgoing));
        } catch (err) {
          if (signal.aborted) throw err;
          lastError = err;

          // Check if error slot (slot 1) is connected
          const errorTargets = this._getNextNodes(nodeId, 1, outgoing);
          if (errorTargets.length > 0) {
            // Error is handled — follow the error path
            // Store error info for downstream nodes
            vars.set(step.id, { error: err.message, success: false });
            stepOutputs[step.id] = { error: err.message, success: false };
            queue.push(...errorTargets);
          } else {
            // No error handler — propagate failure
            throw err;
          }
        }
      }
    }

    // If we got here with a lastError but it was handled via error slots, that's OK
    // The run is considered successful if no unhandled errors occurred
  }

  /**
   * Get the list of node IDs connected to a specific output slot.
   * @param {number} nodeId
   * @param {number} slotIndex
   * @param {Map} outgoing - adjacency map
   * @returns {number[]}
   */
  _getNextNodes(nodeId, slotIndex, outgoing) {
    const slots = outgoing.get(nodeId);
    if (!slots) return [];
    return slots.get(slotIndex) || [];
  }

  /**
   * Recursively execute a list of steps.
   * @private
   */
  async _runSteps(steps, vars, runId, signal, stepOutputs, workflow) {
    for (const step of steps) {
      if (signal.aborted) throw new Error('Cancelled');

      // Evaluate condition
      if (step.condition && !evalCondition(resolveVars(step.condition, vars), vars)) {
        this._emitStep(runId, step, 'skipped', null);
        continue;
      }

      await this._runOneStep(step, vars, runId, signal, stepOutputs, workflow);
    }
  }

  /**
   * Execute one step with retry logic.
   * @private
   */
  async _runOneStep(step, vars, runId, signal, stepOutputs, workflow) {
    const maxAttempts = (step.retry ?? 0) + 1;
    const retryDelay  = step.retry_delay ? parseMs(step.retry_delay) : 5_000;
    const stepTimeout = step.timeout ? parseMs(step.timeout) : null;

    let lastErr;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      if (signal.aborted) throw new Error('Cancelled');

      this._emitStep(runId, step, 'running', null, attempt > 1 ? attempt : undefined);

      // Per-step timeout: chain into a child abort
      let stepAbort = signal;
      let stepTimer;
      if (stepTimeout) {
        const controller = new AbortController();
        stepTimer = setTimeout(() => controller.abort(), stepTimeout);
        // Propagate parent cancellation
        signal.addEventListener('abort', () => controller.abort(), { once: true });
        stepAbort = controller.signal;
      }

      try {
        const output = await this._dispatchStep(step, vars, runId, stepAbort, workflow);

        if (stepTimer) clearTimeout(stepTimer);

        // Store output under step.id for downstream variable access
        if (step.id) {
          vars.set(step.id, output);
          stepOutputs[step.id] = output;
        }

        this._emitStep(runId, step, 'success', output);
        return; // success — exit retry loop

      } catch (err) {
        if (stepTimer) clearTimeout(stepTimer);
        lastErr = err;

        if (signal.aborted) throw err; // propagate cancellation immediately

        if (attempt < maxAttempts) {
          this._emitStep(runId, step, 'retrying', { error: err.message, attempt });
          await sleep(retryDelay, signal);
        }
      }
    }

    // All attempts exhausted
    this._emitStep(runId, step, 'failed', { error: lastErr?.message });
    throw lastErr;
  }

  /**
   * Dispatch to the correct step handler.
   * @private
   */
  async _dispatchStep(step, vars, runId, signal, workflow) {
    const type = step.type || '';

    // ── Built-in universal steps ──────────────────────────────────────────────

    if (type === 'agent' || type === 'claude') {
      return runAgentStep(step, vars, signal, this._chatService, (msg) => {
        this._send('workflow-agent-message', { runId, stepId: step.id, message: msg });
      });
    }

    if (type === 'shell') {
      return runShellStep(step, vars, signal);
    }

    if (type === 'git') {
      return runGitStep(step, vars);
    }

    if (type === 'http') {
      return runHttpStep(step, vars, signal);
    }

    if (type === 'file') {
      return runFileStep(step, vars);
    }

    if (type === 'db') {
      return runDbStep(step, vars, this._databaseService);
    }

    if (type === 'condition') {
      return runConditionStep(step, vars);
    }

    if (type === 'notify') {
      return runNotifyStep(step, vars, this._send);
    }

    if (type === 'wait') {
      return runWaitStep(step, signal, this._waitCallbacks, runId, step.id || `step_${Date.now()}`);
    }

    if (type === 'loop') {
      return this._runLoopStep(step, vars, runId, signal, workflow);
    }

    if (type === 'parallel') {
      return this._runParallelStep(step, vars, runId, signal, workflow);
    }

    // ── Project-type native steps (fivem.ensure, api.request, …) ─────────────

    const dotIdx = type.indexOf('.');
    if (dotIdx > 0) {
      const prefix  = type.slice(0, dotIdx);
      const subType = type.slice(dotIdx + 1);
      const handler = this._projectTypeRegistry[prefix];
      if (handler?.executeWorkflowStep) {
        return handler.executeWorkflowStep(subType, step, vars, signal);
      }
    }

    throw new Error(`Unknown step type: ${type}`);
  }

  /**
   * loop step: iterate over vars[step.over], run sub-steps for each item.
   * @private
   */
  async _runLoopStep(step, vars, runId, signal, workflow) {
    const overKey = resolveVars(step.over || '', vars);
    // Resolve the iterable — it may be a direct var key or a path into a var
    const parts = overKey.replace(/^\$/, '').split('.');
    let items = vars.get(parts[0]);
    for (let i = 1; i < parts.length && items != null; i++) items = items[parts[i]];

    if (!Array.isArray(items)) {
      throw new Error(`loop: "${step.over}" did not resolve to an array`);
    }

    const results = [];
    for (let idx = 0; idx < items.length; idx++) {
      if (signal.aborted) throw new Error('Cancelled');

      const itemVars = new Map(vars);
      itemVars.set('item', items[idx]);
      itemVars.set('index', idx);

      const iterOutputs = {};
      await this._runSteps(step.steps || [], itemVars, runId, signal, iterOutputs, workflow);
      results.push(iterOutputs);
    }

    return { items: results };
  }

  /**
   * parallel step: run all sub-steps concurrently, collect results.
   * @private
   */
  async _runParallelStep(step, vars, runId, signal, workflow) {
    const substeps = step.steps || [];
    const settled  = await Promise.allSettled(
      substeps.map(sub => {
        const outputs = {};
        return this._runOneStep(sub, vars, runId, signal, outputs, workflow)
          .then(() => outputs[sub.id]);
      })
    );

    const results = {};
    for (let i = 0; i < substeps.length; i++) {
      const s = substeps[i];
      results[s.id || `p${i}`] = settled[i].status === 'fulfilled'
        ? settled[i].value
        : { error: settled[i].reason?.message };
    }

    const anyFailed = settled.some(r => r.status === 'rejected');
    if (anyFailed && step.failFast !== false) {
      throw new Error('One or more parallel steps failed');
    }

    return results;
  }

  // ─── Event emission ─────────────────────────────────────────────────────────

  _emitStep(runId, step, status, output, attempt) {
    this._send('workflow-step-update', {
      runId,
      stepId:  step.id,
      stepType: step.type,
      status,
      output: this._safeOutput(output),
      attempt,
    });
  }

  _safeOutput(output) {
    if (!output) return null;
    try {
      JSON.stringify(output);
      return output;
    } catch {
      return { _raw: String(output) };
    }
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function sleep(ms, signal) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener('abort', () => {
      clearTimeout(timer);
      reject(new Error('Cancelled'));
    }, { once: true });
  });
}

module.exports = WorkflowRunner;
