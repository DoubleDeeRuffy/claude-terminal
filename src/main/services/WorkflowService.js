/**
 * WorkflowService
 * Central orchestrator for the workflow automation system.
 *
 * Responsibilities:
 *   - CRUD workflow definitions (delegates to WorkflowStorage)
 *   - Maintain in-memory execution map (active runs)
 *   - Enforce concurrency policies (skip / queue / parallel) per workflow
 *   - Resolve depends_on chains (lazy, cached, no-double-exec)
 *   - Build context variables ($ctx.branch, $ctx.lastCommit, …)
 *   - Emit real-time events to renderer (workflow-run-*, workflow-step-update)
 *   - Forward scheduler triggers (cron, hooks, on_workflow)
 *   - Expose approve-wait / cancel APIs
 */

'use strict';

const crypto    = require('crypto');
const path      = require('path');

const storage   = require('./WorkflowStorage');
const WorkflowRunner    = require('./WorkflowRunner');
const WorkflowScheduler = require('./WorkflowScheduler');
const { getCurrentBranch, getRecentCommits } = require('../utils/git');

// ─── Constants ────────────────────────────────────────────────────────────────

const RUN_STATUS = Object.freeze({
  PENDING:   'pending',
  RUNNING:   'running',
  SUCCESS:   'success',
  FAILED:    'failed',
  CANCELLED: 'cancelled',
  SKIPPED:   'skipped',
});

// ─── WorkflowService ──────────────────────────────────────────────────────────

class WorkflowService {
  constructor() {
    /** @type {BrowserWindow|null} */
    this.mainWindow = null;

    /** @type {Map<string, { run, abortController, resolve, reject }>} */
    this._active = new Map();

    /**
     * Per-workflow queues for concurrency=queue.
     * Map<workflowId, Array<() => Promise>>
     */
    this._queues = new Map();

    /**
     * Cache of recent successful run results for depends_on lazy resolution.
     * Map<workflowId, { completedAt: number, outputs: Object }>
     */
    this._resultsCache = new Map();

    /**
     * Wait step confirmation registry.
     * Map<`${runId}::${stepId}`, resolveFunction>
     */
    this._waitCallbacks = new Map();

    this._scheduler = new WorkflowScheduler();
    this._scheduler.dispatch = (workflowId, triggerData) => {
      this.trigger(workflowId, { triggerData, source: triggerData.source }).catch(err =>
        console.error(`[WorkflowService] Auto-trigger ${workflowId} failed:`, err.message)
      );
    };

    this._chatService = null; // set via setDeps()
    this._projectTypeRegistry = {};
  }

  // ─── Lifecycle ──────────────────────────────────────────────────────────────

  setMainWindow(win) {
    this.mainWindow = win;
  }

  /**
   * Inject external service dependencies (to avoid circular requires).
   * @param {Object} deps
   * @param {Object} deps.chatService
   * @param {Object} [deps.projectTypeRegistry]
   */
  setDeps({ chatService, projectTypeRegistry = {} }) {
    this._chatService = chatService;
    this._projectTypeRegistry = projectTypeRegistry;
  }

  /**
   * Bootstrap: load workflows, start scheduler.
   * Call once after main window is ready.
   */
  init() {
    const workflows = storage.loadWorkflows();
    this._scheduler.reload(workflows);
    console.log(`[WorkflowService] Initialized with ${workflows.length} workflow(s)`);
  }

  destroy() {
    this._scheduler.destroy();
    for (const [, exec] of this._active) {
      exec.abortController.abort();
    }
    this._active.clear();
  }

  // ─── IPC bridge ─────────────────────────────────────────────────────────────

  _send(channel, data) {
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.webContents.send(channel, data);
    }
  }

  // ─── Hook event forwarding ───────────────────────────────────────────────────

  onHookEvent(hookEvent) {
    this._scheduler.onHookEvent(hookEvent);
  }

  // ─── Workflow CRUD ───────────────────────────────────────────────────────────

  listWorkflows() {
    return storage.loadWorkflows();
  }

  getWorkflow(id) {
    return storage.getWorkflow(id);
  }

  /**
   * Create or update a workflow definition.
   * Validates cycle-free depends_on before saving.
   * @param {Object} workflow
   * @returns {{ success: boolean, workflow?: Object, error?: string }}
   */
  saveWorkflow(workflow) {
    const all = storage.loadWorkflows();
    const dependsOn = (workflow.dependsOn || []).map(d => d.workflow || d);

    // Cycle detection
    const { hasCycle, cycle } = storage.detectCycle(workflow.id || '__new__', dependsOn, all);
    if (hasCycle) {
      return {
        success: false,
        error: `Circular dependency detected: ${cycle.join(' → ')}`,
      };
    }

    const saved = storage.upsertWorkflow(workflow);
    // Reload scheduler
    this._scheduler.reload(storage.loadWorkflows());
    return { success: true, workflow: saved };
  }

  /**
   * @param {string} id
   * @returns {{ success: boolean, error?: string }}
   */
  deleteWorkflow(id) {
    const deleted = storage.deleteWorkflow(id);
    if (!deleted) return { success: false, error: 'Workflow not found' };
    storage.deleteRunsForWorkflow(id);
    this._scheduler.reload(storage.loadWorkflows());
    this._resultsCache.delete(id);
    return { success: true };
  }

  /**
   * Toggle enabled state.
   * @param {string} id
   * @param {boolean} enabled
   */
  setEnabled(id, enabled) {
    const wf = storage.getWorkflow(id);
    if (!wf) return { success: false, error: 'Workflow not found' };
    const updated = { ...wf, enabled };
    storage.upsertWorkflow(updated);
    this._scheduler.reload(storage.loadWorkflows());
    return { success: true, workflow: updated };
  }

  // ─── Run history ─────────────────────────────────────────────────────────────

  getRunsForWorkflow(workflowId, limit) {
    return storage.getRunsForWorkflow(workflowId, limit);
  }

  getRecentRuns(limit) {
    return storage.getRecentRuns(limit);
  }

  getRun(runId) {
    return storage.getRun(runId);
  }

  getRunResult(runId) {
    return storage.loadResultPayload(runId);
  }

  getActiveRuns() {
    return [...this._active.values()].map(e => ({ ...e.run }));
  }

  // ─── Trigger ─────────────────────────────────────────────────────────────────

  /**
   * Trigger a workflow by id (manual or from scheduler).
   * Enforces concurrency policy.
   * @param {string} workflowId
   * @param {Object} [opts]
   * @param {Object} [opts.triggerData]  - Data attached to the trigger event
   * @param {string} [opts.source]       - 'manual' | 'cron' | 'hook' | 'on_workflow'
   * @param {string} [opts.projectPath]  - Override project path for context variables
   * @returns {Promise<{ success: boolean, runId?: string, queued?: boolean, error?: string }>}
   */
  async trigger(workflowId, opts = {}) {
    const workflow = storage.getWorkflow(workflowId);
    if (!workflow) return { success: false, error: 'Workflow not found' };
    if (!workflow.enabled) return { success: false, error: 'Workflow is disabled' };

    const concurrency = workflow.concurrency || 'skip';
    const isRunning   = this._isRunning(workflowId);

    if (isRunning) {
      if (concurrency === 'skip') {
        return { success: false, skipped: true, error: 'Workflow already running (concurrency: skip)' };
      }
      if (concurrency === 'queue') {
        return this._enqueue(workflowId, opts);
      }
      // parallel — fall through to execute
    }

    return this._startRun(workflow, opts);
  }

  /**
   * Cancel a running or queued run.
   * @param {string} runId
   */
  cancel(runId) {
    const exec = this._active.get(runId);
    if (!exec) return { success: false, error: 'Run not found or already finished' };
    exec.abortController.abort();
    return { success: true };
  }

  /**
   * Approve a wait step (resume execution).
   * @param {string} runId
   * @param {string} stepId
   * @param {Object} [data]  - Optional data passed back to the step
   */
  approveWait(runId, stepId, data = {}) {
    const key = `${runId}::${stepId}`;
    const cb  = this._waitCallbacks.get(key);
    if (!cb) return { success: false, error: 'Wait step not found' };
    cb({ approved: true, data });
    return { success: true };
  }

  // ─── Dependency resolution ───────────────────────────────────────────────────

  /**
   * Resolve all depends_on for a workflow.
   * Returns a Map of workflowId → outputs for use as extraVars.
   * Lazy: uses cache if within max_age; triggers run if stale/missing.
   * @param {Object} workflow
   * @param {Set<string>} [inProgress]  - IDs currently being resolved (cycle guard)
   * @returns {Promise<Map<string, any>>}
   */
  async _resolveDependencies(workflow, inProgress = new Set()) {
    const deps    = workflow.dependsOn || [];
    const extraVars = new Map();

    for (const dep of deps) {
      const depId   = dep.workflow;
      const maxAge  = dep.max_age ? parseMs(dep.max_age) : null;

      // Prevent circular wait
      if (inProgress.has(depId)) {
        console.warn(`[WorkflowService] Circular dependency skip: ${depId}`);
        continue;
      }

      // Check cache
      const cached = this._resultsCache.get(depId);
      const isValid = cached && (!maxAge || Date.now() - cached.completedAt < maxAge);

      if (isValid) {
        extraVars.set(depId, cached.outputs);
        continue;
      }

      // Check if dep is already running — wait for it
      const running = this._findRunningByWorkflowId(depId);
      if (running) {
        console.log(`[WorkflowService] Waiting for in-flight dependency: ${depId}`);
        const result = await running.promise.catch(() => ({}));
        extraVars.set(depId, result.outputs || {});
        continue;
      }

      // Not running, not cached — trigger it and wait
      inProgress.add(depId);
      const depWorkflow = storage.getWorkflow(depId);
      if (!depWorkflow) {
        console.warn(`[WorkflowService] depends_on workflow not found: ${depId}`);
        continue;
      }

      const { runId } = await this._startRun(depWorkflow, { source: 'depends_on' }, inProgress);
      // Wait for it to finish
      const exec = this._active.get(runId);
      if (exec) {
        const result = await exec.promise.catch(() => ({}));
        extraVars.set(depId, result.outputs || {});
      }

      inProgress.delete(depId);
    }

    return extraVars;
  }

  // ─── Core run logic ──────────────────────────────────────────────────────────

  async _startRun(workflow, opts = {}, inProgress = new Set()) {
    const runId      = `run_${crypto.randomUUID().slice(0, 12)}`;
    const startedAt  = new Date().toISOString();
    const source     = opts.source || 'manual';
    const triggerData = opts.triggerData || {};

    // Build context variables
    const contextVars = await this._buildContext(workflow, opts.projectPath);

    const run = {
      id:          runId,
      workflowId:  workflow.id,
      workflowName: workflow.name,
      status:      RUN_STATUS.RUNNING,
      trigger:     source,
      triggerData,
      startedAt,
      duration:    null,
      steps:       (workflow.steps || []).map(s => ({
        id:     s.id,
        type:   s.type,
        status: RUN_STATUS.PENDING,
        duration: null,
      })),
      ...contextVars,
    };

    // Persist initial record
    storage.appendRun(run);

    // Emit to renderer
    this._send('workflow-run-start', { run });

    const abortController = new AbortController();

    let resolveExec, rejectExec;
    const promise = new Promise((res, rej) => { resolveExec = res; rejectExec = rej; });

    this._active.set(runId, { run, abortController, promise, resolve: resolveExec, reject: rejectExec });

    // Execute asynchronously
    this._executeRun(workflow, run, abortController, inProgress, opts)
      .then(result => {
        this._finalizeRun(run, result, workflow);
        resolveExec(result);
      })
      .catch(err => {
        this._finalizeRun(run, { success: false, error: err.message, outputs: {} }, workflow);
        rejectExec(err);
      })
      .finally(() => {
        this._active.delete(runId);
        this._drainQueue(workflow.id);
      });

    return { success: true, runId };
  }

  async _executeRun(workflow, run, abortController, inProgress, opts) {
    // 1. Resolve dependencies
    let extraVars = new Map();
    if (workflow.dependsOn?.length) {
      extraVars = await this._resolveDependencies(workflow, new Set(inProgress));
    }

    // 2. Create runner
    const runner = new WorkflowRunner({
      sendFn:              this._send.bind(this),
      chatService:         this._chatService,
      waitCallbacks:       this._waitCallbacks,
      projectTypeRegistry: this._projectTypeRegistry,
    });

    // 3. Execute
    return runner.execute(workflow, run, abortController, extraVars);
  }

  _finalizeRun(run, result, workflow) {
    const now      = Date.now();
    const duration = Math.round((now - new Date(run.startedAt).getTime()) / 1000);
    const status   = result.cancelled
      ? RUN_STATUS.CANCELLED
      : result.success
        ? RUN_STATUS.SUCCESS
        : RUN_STATUS.FAILED;

    const patch = { status, duration: `${duration}s`, finishedAt: new Date().toISOString() };
    storage.updateRun(run.id, patch);

    // Persist large output payload separately
    if (result.outputs && Object.keys(result.outputs).length) {
      storage.saveResultPayload(run.id, { outputs: result.outputs });
    }

    // Update results cache (only on success)
    if (status === RUN_STATUS.SUCCESS) {
      this._resultsCache.set(run.id /* wf.id? */, {
        completedAt: now,
        outputs:     result.outputs || {},
      });
      // Also key by workflowId for depends_on lookup
      this._resultsCache.set(workflow.id, {
        completedAt: now,
        outputs:     result.outputs || {},
      });
    }

    // Notify renderer
    this._send('workflow-run-end', {
      runId:      run.id,
      workflowId: run.workflowId,
      status,
      duration:   patch.duration,
      error:      result.error,
    });

    // Notify on_workflow triggers
    if (status === RUN_STATUS.SUCCESS || status === RUN_STATUS.FAILED) {
      this._scheduler.onWorkflowComplete(workflow.name, {
        success:    status === RUN_STATUS.SUCCESS,
        outputs:    result.outputs || {},
        workflowId: workflow.id,
      });
    }

    // Send desktop notification on failure
    if (status === RUN_STATUS.FAILED) {
      this._send('workflow-notify-desktop', {
        title:   `Workflow failed: ${workflow.name}`,
        message: result.error || 'An error occurred',
        type:    'error',
      });
    }
  }

  // ─── Concurrency queue ───────────────────────────────────────────────────────

  _isRunning(workflowId) {
    for (const { run } of this._active.values()) {
      if (run.workflowId === workflowId) return true;
    }
    return false;
  }

  _findRunningByWorkflowId(workflowId) {
    for (const exec of this._active.values()) {
      if (exec.run.workflowId === workflowId) return exec;
    }
    return null;
  }

  _enqueue(workflowId, opts) {
    if (!this._queues.has(workflowId)) this._queues.set(workflowId, []);
    const queue = this._queues.get(workflowId);

    return new Promise((resolve) => {
      queue.push({ opts, resolve });
      // Notify renderer a run is queued
      this._send('workflow-run-queued', { workflowId, queueLength: queue.length });
    });
  }

  _drainQueue(workflowId) {
    const queue = this._queues.get(workflowId);
    if (!queue || !queue.length) return;
    const { opts, resolve } = queue.shift();
    if (!queue.length) this._queues.delete(workflowId);
    const workflow = storage.getWorkflow(workflowId);
    if (!workflow || !workflow.enabled) { resolve({ success: false, error: 'Workflow disabled' }); return; }
    this._startRun(workflow, opts)
      .then(resolve)
      .catch(() => resolve({ success: false, error: 'Queue run failed' }));
  }

  // ─── Context variable builders ────────────────────────────────────────────────

  async _buildContext(workflow, projectPath) {
    const vars = {};
    const cwd  = projectPath || this._resolveProjectPath(workflow);
    if (cwd) {
      try {
        vars.contextBranch = await getCurrentBranch(cwd);
        const commits = await getRecentCommits(cwd, 1);
        vars.contextCommit = commits[0]
          ? `${commits[0].hash} ${commits[0].message}`
          : '';
      } catch { /* git info optional */ }
    }
    return vars;
  }

  _resolveProjectPath(workflow) {
    // Scope.project = 'specific' may carry a path in scope.projectPath
    return workflow.scope?.projectPath || null;
  }

  // ─── Dependency graph for UI ─────────────────────────────────────────────────

  /**
   * Return a simple adjacency list for the UI dependency graph panel.
   * @returns {{ nodes: Object[], edges: Object[] }}
   */
  getDependencyGraph() {
    const workflows = storage.loadWorkflows();
    const nodes = workflows.map(wf => ({
      id:      wf.id,
      name:    wf.name,
      enabled: wf.enabled,
    }));
    const edges = [];
    for (const wf of workflows) {
      for (const dep of (wf.dependsOn || [])) {
        edges.push({ from: wf.id, to: dep.workflow || dep, maxAge: dep.max_age });
      }
      // on_workflow trigger
      if (wf.trigger?.type === 'on_workflow') {
        const target = workflows.find(w => w.name === wf.trigger.value);
        if (target) edges.push({ from: target.id, to: wf.id, type: 'chain' });
      }
    }
    return { nodes, edges };
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function parseMs(value) {
  if (typeof value === 'number') return value;
  if (typeof value !== 'string') return 0;
  const m = value.match(/^(\d+(?:\.\d+)?)(ms|s|m|h)$/);
  if (!m) return parseInt(value, 10) || 0;
  const mul = { ms: 1, s: 1000, m: 60_000, h: 3_600_000 };
  return Math.round(parseFloat(m[1]) * (mul[m[2]] || 1000));
}

// ─── Singleton export ─────────────────────────────────────────────────────────

module.exports = new WorkflowService();
