/**
 * WorkflowScheduler
 * Manages all workflow triggers:
 *   - Cron (setInterval-based, minute-granular)
 *   - Hook events (forwarded from HookEventServer via IPC)
 *   - on_workflow (post-run callbacks)
 *   - Manual (fire-and-forget via IPC)
 *
 * Exposes a single `dispatch(workflowId, triggerData)` callback
 * that is set by WorkflowService.
 */

'use strict';

// ─── Cron parsing ─────────────────────────────────────────────────────────────

/**
 * Parse a 5-field cron expression into a matcher function.
 * Fields: minute hour dom month dow
 * Supports: * / , -
 * @param {string} expr
 * @returns {(date: Date) => boolean}
 */
function parseCron(expr) {
  const fields = expr.trim().split(/\s+/);
  if (fields.length !== 5) throw new Error(`Invalid cron expression: "${expr}"`);
  const [minF, hourF, domF, monF, dowF] = fields;

  const parseField = (field, min, max) => {
    if (field === '*') return () => true;

    const parts = field.split(',');
    const matchers = parts.map(part => {
      // */step
      if (part.startsWith('*/')) {
        const step = parseInt(part.slice(2), 10);
        return (v) => (v - min) % step === 0;
      }
      // range a-b
      if (part.includes('-')) {
        const [a, b] = part.split('-').map(Number);
        return (v) => v >= a && v <= b;
      }
      // exact value
      const n = parseInt(part, 10);
      return (v) => v === n;
    });
    return (v) => matchers.some(m => m(v));
  };

  const matchMin  = parseField(minF,  0, 59);
  const matchHour = parseField(hourF, 0, 23);
  const matchDom  = parseField(domF,  1, 31);
  const matchMon  = parseField(monF,  1, 12);
  const matchDow  = parseField(dowF,  0, 6);   // 0 = Sunday

  return (date) => {
    return matchMin(date.getMinutes())
      && matchHour(date.getHours())
      && matchDom(date.getDate())
      && matchMon(date.getMonth() + 1)
      && matchDow(date.getDay());
  };
}

// ─── Hook condition evaluation ────────────────────────────────────────────────

/**
 * Very lightweight condition checker for hook combined triggers.
 * Evaluates a string condition against the hook event object.
 * @param {string|undefined} condition
 * @param {Object} hookEvent
 * @returns {boolean}
 */
function evalHookCondition(condition, hookEvent) {
  if (!condition || !condition.trim()) return true;
  // Replace $trigger.xxx with the actual value
  const resolved = condition.replace(/\$trigger\.([a-zA-Z_][\w.]*)/g, (_, path) => {
    const parts = path.split('.');
    let val = hookEvent;
    for (const p of parts) val = val?.[p];
    return val != null ? String(val) : '';
  });
  // Evaluate basic comparisons
  const match = resolved.match(/^(.+?)\s*(==|!=|>=|<=|>|<)\s*(.+)$/);
  if (!match) return resolved.trim() !== '' && resolved.trim() !== 'false';
  const [, left, op, right] = match;
  switch (op) {
    case '==': return left.trim() === right.trim();
    case '!=': return left.trim() !== right.trim();
    default:   return false;
  }
}

// ─── WorkflowScheduler class ──────────────────────────────────────────────────

class WorkflowScheduler {
  constructor() {
    /** Cron tick interval handle */
    this._cronTimer    = null;
    /** Last tick minute — prevent double-firing within the same minute */
    this._lastTickMin  = -1;
    /** Map<workflowId, cronMatcher> */
    this._cronJobs     = new Map();
    /** Loaded workflow definitions — refreshed on every reload() call */
    this._workflows    = [];
    /**
     * Callback invoked when a trigger fires.
     * Signature: (workflowId, triggerData) => void
     */
    this.dispatch      = null;
  }

  // ─── Public API ─────────────────────────────────────────────────────────────

  /**
   * Load/reload workflow definitions and rebuild cron jobs.
   * @param {Object[]} workflows
   */
  reload(workflows) {
    this._workflows = workflows || [];
    this._rebuildCronJobs();
    this._ensureCronTimer();
  }

  /**
   * Call this when a Claude hook event arrives.
   * Checks all hook-triggered workflows and fires matching ones.
   * @param {Object} hookEvent  { type: string, data: Object, ... }
   */
  onHookEvent(hookEvent) {
    const { type: hookType } = hookEvent;
    for (const wf of this._workflows) {
      if (!wf.enabled) continue;
      const trigger = wf.trigger || {};
      if (trigger.type !== 'hook') continue;
      if (trigger.hookType && trigger.hookType !== hookType) continue;
      if (!evalHookCondition(trigger.condition, hookEvent)) continue;

      this.dispatch?.(wf.id, {
        source:    'hook',
        hookType,
        hookEvent,
      });
    }
  }

  /**
   * Call this when a workflow finishes (for on_workflow chaining).
   * @param {string} finishedWorkflowName
   * @param {Object} result  — { success, outputs, … }
   */
  onWorkflowComplete(finishedWorkflowName, result) {
    for (const wf of this._workflows) {
      if (!wf.enabled) continue;
      const trigger = wf.trigger || {};
      if (trigger.type !== 'on_workflow') continue;
      if (trigger.value !== finishedWorkflowName) continue;
      if (!evalHookCondition(trigger.condition, result)) continue;

      this.dispatch?.(wf.id, {
        source:    'on_workflow',
        workflow:  finishedWorkflowName,
        trigger:   result,
      });
    }
  }

  /**
   * Stop all timers / teardown.
   */
  destroy() {
    if (this._cronTimer) {
      clearTimeout(this._cronTimer);   // works for both setTimeout and setInterval handles
      clearInterval(this._cronTimer);
      this._cronTimer = null;
    }
    this._cronJobs.clear();
    this._workflows = [];
  }

  // ─── Private ─────────────────────────────────────────────────────────────────

  _rebuildCronJobs() {
    this._cronJobs.clear();
    for (const wf of this._workflows) {
      if (!wf.enabled) continue;
      const trigger = wf.trigger || {};
      if (trigger.type !== 'cron') continue;
      if (!trigger.value) continue;

      try {
        const matcher = parseCron(trigger.value);
        this._cronJobs.set(wf.id, { matcher, name: wf.name });
      } catch (err) {
        console.warn(`[WorkflowScheduler] Bad cron for "${wf.name}": ${err.message}`);
      }
    }
  }

  _ensureCronTimer() {
    if (this._cronTimer) return; // already running
    if (this._cronJobs.size === 0) return; // no cron jobs, skip timer
    // Align to next full minute, then tick every 60s
    const now   = Date.now();
    const delay = 60_000 - (now % 60_000);
    // Assign a sentinel immediately to prevent duplicate timers during the delay
    this._cronTimer = setTimeout(() => {
      this._tick();
      this._cronTimer = setInterval(() => this._tick(), 60_000);
    }, delay);
  }

  _tick() {
    const now = new Date();
    const min = now.getMinutes();

    // Guard: only fire once per minute (handles timer drift)
    if (min === this._lastTickMin) return;
    this._lastTickMin = min;

    for (const [wfId, { matcher }] of this._cronJobs) {
      if (matcher(now)) {
        this.dispatch?.(wfId, {
          source: 'cron',
          firedAt: now.toISOString(),
        });
      }
    }
  }
}

module.exports = WorkflowScheduler;
