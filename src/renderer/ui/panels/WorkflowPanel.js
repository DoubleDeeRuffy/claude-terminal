const { escapeHtml } = require('../../utils');
const WorkflowMarketplace = require('./WorkflowMarketplacePanel');
const { getAgents } = require('../../services/AgentService');
const { getSkills } = require('../../services/SkillService');
const { getGraphService, resetGraphService } = require('../../services/WorkflowGraphEngine');
const { projectsState } = require('../../state/projects.state');
const { schemaCache } = require('../../services/WorkflowSchemaCache');
const { showContextMenu } = require('../components/ContextMenu');
const { showConfirm } = require('../components/Modal');
const { createChatView } = require('../components/ChatView');

const {
  // Constants
  HOOK_TYPES, NODE_OUTPUTS, STEP_TYPES, STEP_FIELDS, STEP_TYPE_ALIASES,
  GIT_ACTIONS, WAIT_UNITS, CONDITION_VARS, CONDITION_OPS,
  TRIGGER_CONFIG, CRON_MODES,
  // Functions
  findStepType, buildConditionPreview,
  drawCronPicker, bindWfDropdown, wfDropdown,
  // Formatting
  fmtTime, fmtDuration, statusDot, statusLabel,
  // SVG icons
  svgWorkflow, svgAgent, svgShell, svgGit, svgHttp, svgNotify, svgWait, svgCond,
  svgClock, svgTimer, svgHook, svgChain, svgPlay, svgX, svgScope, svgConc,
  svgEmpty, svgRuns, svgClaude, svgPrompt, svgSkill, svgProject, svgFile, svgDb,
  svgLoop, svgVariable, svgLog, svgTriggerType, svgLink, svgMode, svgEdit,
  svgBranch, svgCode, svgTrash, svgCopy, svgTransform, svgGetVar, svgSwitch,
  svgSubworkflow, svgTeal,
  // Autocomplete & Schema
  getLoopPreview, initSmartSQL,
  // DOM helpers
  upgradeSelectsToDropdowns, setupAutocomplete,
  insertLoopBetween,
} = require('./WorkflowHelpers');

let ctx = null;

const state = {
  workflows: [],
  runs: [],
  activeTab: 'workflows',  // 'workflows' | 'runs' | 'hub'
  viewingRunId: null,       // track which run detail is open
};

const _agentLogs = new Map(); // stepId → [{ type, text, ts }]
const MAX_LOG_ENTRIES = 50;

function init(context) {
  ctx = context;
  WorkflowMarketplace.init(context);
}

async function load() {
  renderPanel();
  await refreshData();
  renderContent();
  registerLiveListeners();
}

const api = window.electron_api?.workflow;

/** Fetch workflows + recent runs from backend */
async function refreshData() {
  try {
    const [wfRes, runRes] = await Promise.all([
      api?.list(),
      api?.getRecentRuns(50),
    ]);
    if (wfRes?.success) state.workflows = wfRes.workflows;
    if (runRes?.success) state.runs = runRes.runs;
  } catch (e) {
    console.error('[WorkflowPanel] Failed to load data:', e);
  }
}

let listenersRegistered = false;
/** Register real-time event listeners for live run updates */
function registerLiveListeners() {
  if (listenersRegistered || !api) return;
  listenersRegistered = true;

  api.onRunStart(({ run }) => {
    state.runs.unshift(run);
    // Clear previous run outputs for fresh tooltip data
    try { getGraphService().clearRunOutputs(); } catch (_) {}
    renderContent();
  });

  api.onRunEnd(({ runId, status, duration }) => {
    const run = state.runs.find(r => r.id === runId);
    if (run) {
      run.status = status;
      run.duration = duration;
    }
    // Clear all agent logs for this run's steps
    for (const step of (run?.steps || [])) _agentLogs.delete(step.id);
    // If viewing this run's detail, re-render it fully (with final outputs)
    if (state.viewingRunId === runId) {
      renderRunDetail(document.getElementById('wf-content'), run);
    } else {
      renderContent();
    }
  });

  const _stepStartTimes = new Map(); // stepId → Date.now()

  api.onStepUpdate(({ runId, stepId, status, output }) => {
    const run = state.runs.find(r => r.id === runId);
    if (run) {
      const step = run.steps?.find(s => s.id === stepId);
      if (step) {
        step.status = status;
        if (output) step.output = output;
      }
    }

    // Track step timing
    if (status === 'running') {
      _stepStartTimes.set(stepId, Date.now());
    }

    // Update canvas node status for live visualization
    try {
      const graphService = getGraphService();
      if (graphService) {
        // Find the graph node matching this stepId
        const graphNode = graphService._nodes?.find(n =>
          n.properties?.stepId === stepId || `node_${n.id}` === stepId
        );
        if (graphNode) {
          // Map runner status to canvas status
          const canvasStatus = status === 'retrying' ? 'running' : status;
          graphService.setNodeStatus(graphNode.id, canvasStatus);

          // Store duration on completion
          if (status === 'success' || status === 'failed' || status === 'skipped') {
            const startTime = _stepStartTimes.get(stepId);
            if (startTime) {
              graphNode._runDuration = Date.now() - startTime;
              _stepStartTimes.delete(stepId);
            }
          }

          // Store error
          if (status === 'failed' && output?.error) {
            graphNode._runError = output.error;
          }

          // Store step output for tooltips and Last Run tab
          if (output && status === 'success') {
            graphService.setNodeOutput(graphNode.id, output);
          }
        }
      }
    } catch (_) { /* ignore */ }

    // Incremental update if viewing this run's detail, otherwise full re-render
    if (state.viewingRunId === runId) {
      _updateStepInDetail(runId, stepId, status, output);
    } else {
      renderContent();
    }

    // Clean up agent logs when step finishes
    if (status === 'success' || status === 'failed' || status === 'skipped') {
      _agentLogs.delete(stepId);
    }
  });

  // MCP graph edit tools signal a reload after modifying definitions.json directly
  api.onListUpdated(({ workflows }) => {
    if (workflows) state.workflows = workflows;
    renderContent();

    // If the editor is open, reload the live graph from the updated definition
    const graphService = getGraphService();
    if (graphService) {
      const editorEl = document.querySelector('.wf-editor');
      const nameEl = editorEl?.querySelector('#wf-ed-name');
      const currentName = nameEl?.value;
      if (currentName && workflows) {
        const updated = workflows.find(w => w.name === currentName);
        if (updated) graphService.loadFromWorkflow(updated);
      }
    }
  });

  // Live streaming logs for Claude/agent nodes
  api.onAgentMessage(({ runId, stepId, message }) => {
    if (!message) return;
    const entries = _agentLogs.get(stepId) || [];

    if (message.type === 'assistant' && message.message?.content) {
      for (const block of message.message.content) {
        if (block.type === 'tool_use') {
          const detail = block.input?.file_path || block.input?.command || block.input?.pattern || '';
          entries.push({ type: 'tool', text: detail ? `${block.name}: ${detail}` : block.name, ts: Date.now() });
        }
        if (block.type === 'text' && block.text) {
          entries.push({ type: 'text', text: block.text.slice(0, 200), ts: Date.now() });
        }
      }
    }
    while (entries.length > MAX_LOG_ENTRIES) entries.shift();
    _agentLogs.set(stepId, entries);
    _scheduleLogUpdate(stepId);
  });
}

/* ─── Live log throttled DOM updater ─────────────────────────────────────── */

let _logTimer = null;
const _pendingLogs = new Set();

function _scheduleLogUpdate(stepId) {
  _pendingLogs.add(stepId);
  if (_logTimer) return;
  _logTimer = requestAnimationFrame(() => {
    _logTimer = null;
    for (const sid of _pendingLogs) _updateLiveLogDOM(sid);
    _pendingLogs.clear();
  });
}

function _updateLiveLogDOM(stepId) {
  const container = document.querySelector(`.wf-live-log[data-step-id="${stepId}"]`);
  if (!container) return;
  const entries = _agentLogs.get(stepId) || [];
  container.innerHTML = entries.map(e =>
    `<div class="wf-log-entry wf-log-entry--${e.type}">` +
    (e.type === 'tool' ? `<span class="wf-log-icon">\u2699</span>` : '') +
    `<span class="wf-log-text">${escapeHtml(e.text)}</span></div>`
  ).join('');
  container.scrollTop = container.scrollHeight;
}

/** Incremental update of a single step in the detail view (avoids full re-render) */
function _updateStepInDetail(runId, stepId, status, output) {
  const run = state.runs.find(r => r.id === runId);
  if (!run) return;
  const stepIdx = run.steps?.findIndex(s => s.id === stepId);
  if (stepIdx === -1) return;

  const stepEl = document.querySelector(`.wf-run-step[data-step-id="${stepId}"]`);
  if (!stepEl) { renderRunDetail(document.getElementById('wf-content'), run); return; }

  // Update status class
  stepEl.className = stepEl.className.replace(/wf-run-step--\w+/g, '');
  stepEl.classList.add(`wf-run-step--${status}`);
  if (status === 'failed') stepEl.classList.add('wf-run-step--error-highlight');

  // Update status icon
  const iconEl = stepEl.querySelector('.wf-run-step-status-icon');
  if (iconEl) {
    iconEl.textContent = status === 'success' ? '\u2713' : status === 'failed' ? '\u2717' : status === 'skipped' ? '\u2013' : '\u2026';
  }

  // Add/remove live log container
  const existingLog = stepEl.querySelector('.wf-live-log');
  if (status === 'running' && !existingLog) {
    const logEl = document.createElement('div');
    logEl.className = 'wf-live-log';
    logEl.dataset.stepId = stepId;
    stepEl.querySelector('.wf-run-step-header')?.after(logEl);
  } else if (status !== 'running' && existingLog) {
    existingLog.remove();
  }

  // Show output when step completes
  if ((status === 'success' || status === 'failed') && output != null) {
    let outputEl = stepEl.querySelector('.wf-run-step-output');
    if (!outputEl) {
      outputEl = document.createElement('div');
      outputEl.className = 'wf-run-step-output';
      outputEl.innerHTML = `<pre class="wf-run-step-pre">${escapeHtml(formatStepOutput(output))}</pre>`;
      stepEl.appendChild(outputEl);
      // Add chevron if missing
      if (!stepEl.querySelector('.wf-run-step-chevron')) {
        const header = stepEl.querySelector('.wf-run-step-header');
        header?.insertAdjacentHTML('beforeend', '<svg class="wf-run-step-chevron" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>');
        header.style.cursor = 'pointer';
        header.addEventListener('click', () => {
          const visible = outputEl.style.display !== 'none';
          outputEl.style.display = visible ? 'none' : 'block';
          stepEl.classList.toggle('expanded', !visible);
        });
      }
    }
  }
}

/* ─── Panel shell ──────────────────────────────────────────────────────────── */

function renderPanel() {
  const el = document.getElementById('workflow-panel');
  if (!el) return;

  el.innerHTML = `
    <div class="wf-panel">
      <div class="wf-topbar">
        <div class="wf-topbar-tabs">
          <button class="wf-tab active" data-wftab="workflows">
            Workflows <span class="wf-badge">3</span>
          </button>
          <button class="wf-tab" data-wftab="runs">
            Historique <span class="wf-badge">4</span>
          </button>
          <button class="wf-tab" data-wftab="hub">
            <svg width="9" height="9" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>
            Hub
          </button>
        </div>
        <button class="wf-create-btn" id="wf-btn-new">
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M12 5v14M5 12h14"/></svg>
          Nouveau
        </button>
      </div>
      <div class="wf-content" id="wf-content"></div>
    </div>
  `;

  el.querySelector('#wf-btn-new').addEventListener('click', () => openEditor());
  el.querySelectorAll('.wf-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      el.querySelectorAll('.wf-tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      state.activeTab = tab.dataset.wftab;
      renderContent();
    });
  });
}

function renderContent() {
  state.viewingRunId = null;
  const el = document.getElementById('wf-content');
  if (!el) return;
  // Update badge counts
  const panel = document.getElementById('workflow-panel');
  if (panel) {
    const badges = panel.querySelectorAll('.wf-badge');
    if (badges[0]) badges[0].textContent = state.workflows.length;
    if (badges[1]) badges[1].textContent = state.runs.length;
  }
  if (state.activeTab === 'workflows') renderWorkflowList(el);
  else if (state.activeTab === 'runs') renderRunHistory(el);
  else if (state.activeTab === 'hub') WorkflowMarketplace.render(el);
}

/* ─── Workflow list ────────────────────────────────────────────────────────── */

function renderWorkflowList(el) {
  if (!state.workflows.length) {
    el.innerHTML = `
      <div class="wf-empty">
        <div class="wf-empty-glyph">${svgWorkflow(36)}</div>
        <p class="wf-empty-title">Aucun workflow</p>
        <p class="wf-empty-sub">Automatisez vos tâches répétitives avec Claude</p>
        <button class="wf-create-btn" id="wf-empty-new">
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M12 5v14M5 12h14"/></svg>
          Créer un workflow
        </button>
      </div>
    `;
    el.querySelector('#wf-empty-new').addEventListener('click', () => openEditor());
    return;
  }

  // Sort: favorites first, then by last run date
  const sorted = [...state.workflows].sort((a, b) => {
    if (a.favorite && !b.favorite) return -1;
    if (!a.favorite && b.favorite) return 1;
    const aRun = state.runs.find(r => r.workflowId === a.id);
    const bRun = state.runs.find(r => r.workflowId === b.id);
    return (bRun?.startedAt || 0) - (aRun?.startedAt || 0);
  });
  el.innerHTML = `<div class="wf-list">${sorted.map(wf => cardHtml(wf)).join('')}</div>`;

  el.querySelectorAll('.wf-card').forEach(card => {
    const id = card.dataset.id;
    card.querySelector('.wf-card-body').addEventListener('click', (e) => {
      // Don't trigger detail when clicking interactive elements
      if (e.target.closest('.wf-card-run') || e.target.closest('.wf-card-edit') || e.target.closest('.wf-switch') || e.target.closest('.wf-card-toggle') || e.target.closest('.wf-card-fav')) return;
      openDetail(id);
    });

    // Favorite toggle
    card.querySelector('.wf-card-fav')?.addEventListener('click', async (e) => {
      e.stopPropagation();
      const wf = state.workflows.find(w => w.id === id);
      if (!wf) return;
      wf.favorite = !wf.favorite;
      await api?.save({ ...wf });
      renderContent();
    });
    card.querySelector('.wf-card-run')?.addEventListener('click', e => { e.stopPropagation(); triggerWorkflow(id); });
    card.querySelector('.wf-card-edit')?.addEventListener('click', e => { e.stopPropagation(); openEditor(id); });
    const toggle = card.querySelector('.wf-card-toggle');
    if (toggle) {
      toggle.addEventListener('change', e => { e.stopPropagation(); toggleWorkflow(id, e.target.checked); });
      toggle.closest('.wf-switch')?.addEventListener('click', e => e.stopPropagation());
    }

    // Right-click context menu
    card.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      e.stopPropagation();
      const wf = state.workflows.find(w => w.id === id);
      if (!wf) return;
      showContextMenu({
        x: e.clientX,
        y: e.clientY,
        items: [
          { label: 'Modifier', icon: svgEdit(), onClick: () => openEditor(id) },
          { label: 'Lancer maintenant', icon: svgPlay(12), onClick: () => triggerWorkflow(id) },
          { label: 'Dupliquer', icon: svgCopy(), onClick: () => duplicateWorkflow(id) },
          { separator: true },
          { label: 'Supprimer', icon: svgTrash(), danger: true, onClick: () => confirmDeleteWorkflow(id, wf.name) },
        ],
      });
    });
  });
}

function cardHtml(wf) {
  const lastRun = state.runs.find(r => r.workflowId === wf.id);
  const cfg = TRIGGER_CONFIG[wf.trigger?.type] || TRIGGER_CONFIG.manual;
  const runCount = state.runs.filter(r => r.workflowId === wf.id).length;
  const successCount = state.runs.filter(r => r.workflowId === wf.id && r.status === 'success').length;

  return `
    <div class="wf-card ${wf.enabled ? '' : 'wf-card--off'}" data-id="${wf.id}">
      <div class="wf-card-accent wf-card-accent--${cfg.color}"></div>
      <div class="wf-card-body">
        <div class="wf-card-top">
          <div class="wf-card-title-row">
            <button class="wf-card-fav ${wf.favorite ? 'wf-card-fav--active' : ''}" title="${wf.favorite ? 'Retirer des favoris' : 'Ajouter aux favoris'}">
              <svg width="12" height="12" viewBox="0 0 24 24" ${wf.favorite ? 'fill="currentColor"' : 'fill="none"'} stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
            </button>
            <span class="wf-card-name">${escapeHtml(wf.name)}</span>
            ${!wf.enabled ? '<span class="wf-card-paused">PAUSED</span>' : ''}
          </div>
          <div class="wf-card-top-right">
            ${lastRun ? `<span class="wf-status-pill wf-status-pill--${lastRun.status}">${statusDot(lastRun.status)}${statusLabel(lastRun.status)}</span>` : ''}
            <label class="wf-switch"><input type="checkbox" class="wf-card-toggle" ${wf.enabled ? 'checked' : ''}><span class="wf-switch-track"></span></label>
          </div>
        </div>
        <div class="wf-card-pipeline">
          ${(wf.steps || []).map((s, i) => {
            const info = findStepType((s.type || '').split('.')[0]);
            const stepStatus = lastRun ? (lastRun.steps?.[i]?.status || '') : '';
            return `<div class="wf-pipe-step ${stepStatus ? 'wf-pipe-step--' + stepStatus : ''}" title="${escapeHtml(s.type || '')}">
              <span class="wf-chip wf-chip--${info.color}">${info.icon}</span>
              <span class="wf-pipe-label">${escapeHtml(info.label)}</span>
            </div>${i < wf.steps.length - 1 ? '<span class="wf-pipe-arrow"><svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 12h14M12 5l7 7-7 7"/></svg></span>' : ''}`;
          }).join('')}
        </div>
        <div class="wf-card-footer">
          <span class="wf-trigger-tag wf-trigger-tag--${cfg.color}">
            ${cfg.icon}
            ${escapeHtml(cfg.label)}
            ${wf.trigger?.value ? `<code>${escapeHtml(wf.trigger.value)}</code>` : ''}
            ${wf.hookType ? `<code>${escapeHtml(wf.hookType)}</code>` : ''}
          </span>
          <div class="wf-card-stats">
            ${runCount > 0 ? `<span class="wf-card-stat">${svgRuns()} ${runCount} run${runCount > 1 ? 's' : ''}</span>` : ''}
            ${runCount > 0 ? `<span class="wf-card-stat wf-card-stat--rate">${Math.round(successCount / runCount * 100)}%</span>` : ''}
            ${lastRun ? `<span class="wf-card-stat">${svgClock(9)} ${fmtDuration(lastRun.duration)}</span>` : ''}
          </div>
          <button class="wf-card-edit" title="Modifier"><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg></button>
          <button class="wf-card-run" title="Lancer maintenant">${svgPlay(11)} <span>Run</span></button>
        </div>
      </div>
    </div>
  `;
}

/* ─── Run history ──────────────────────────────────────────────────────────── */

function renderRunHistory(el) {
  if (!state.runs.length) {
    el.innerHTML = `<div class="wf-empty"><p class="wf-empty-title">Aucun run</p><p class="wf-empty-sub">Les exécutions s'afficheront ici</p></div>`;
    return;
  }

  const INITIAL_LIMIT = 15;
  const showAll = el._showAllRuns || false;
  const runs = showAll ? state.runs : state.runs.slice(0, INITIAL_LIMIT);
  const hasMore = state.runs.length > INITIAL_LIMIT && !showAll;

  function buildRunRow(run) {
    const wf = state.workflows.find(w => w.id === run.workflowId);
    return `
      <div class="wf-run wf-run--${run.status}" data-run-id="${run.id}">
        <div class="wf-run-bar wf-run-bar--${run.status}"></div>
        <div class="wf-run-body">
          <div class="wf-run-header">
            <div class="wf-run-header-left">
              <span class="wf-run-name">${escapeHtml(wf?.name || 'Supprimé')}</span>
              <div class="wf-run-meta">
                <span class="wf-run-time">${svgClock(9)} ${fmtTime(run.startedAt)}</span>
                <span class="wf-run-duration">${svgTimer()} ${fmtDuration(run.duration)}</span>
              </div>
            </div>
            <div class="wf-run-header-right">
              <span class="wf-run-trigger-tag">${escapeHtml(run.trigger)}</span>
              <span class="wf-status-pill wf-status-pill--${run.status}">${statusDot(run.status)}${statusLabel(run.status)}</span>
            </div>
          </div>
          <div class="wf-run-pipeline">
            ${(run.steps || []).map((s, i) => {
              const sType = (s.type || s.name || '').split('.')[0];
              const info = findStepType(sType);
              const statusIcon = s.status === 'success' ? '✓' : s.status === 'failed' ? '✗' : s.status === 'skipped' ? '–' : s.status === 'running' ? '…' : '';
              return `<div class="wf-run-pipe-step wf-run-pipe-step--${s.status}">
                <span class="wf-run-pipe-icon wf-chip wf-chip--${info.color}">${info.icon}</span>
                <span class="wf-run-pipe-name">${escapeHtml(info.label || sType)}</span>
                ${statusIcon ? `<span class="wf-run-pipe-status">${statusIcon}</span>` : ''}
              </div>${i < (run.steps || []).length - 1 ? '<div class="wf-run-pipe-connector"></div>' : ''}`;
            }).join('')}
          </div>
        </div>
      </div>`;
  }

  el.innerHTML = `
    <div class="wf-runs-header">
      <span class="wf-runs-count">${state.runs.length} run${state.runs.length > 1 ? 's' : ''}</span>
      <button class="wf-runs-clear" id="wf-clear-runs" title="Effacer l'historique">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/></svg>
        Effacer
      </button>
    </div>
    <div class="wf-runs">
      ${runs.map(buildRunRow).join('')}
      ${hasMore ? `<div class="wf-runs-show-more" id="wf-show-more-runs">Afficher ${state.runs.length - INITIAL_LIMIT} runs de plus</div>` : ''}
    </div>
  `;

  // Clear all runs
  const clearBtn = el.querySelector('#wf-clear-runs');
  if (clearBtn) {
    clearBtn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const confirmed = await showConfirm({
        title: 'Effacer l\'historique',
        message: `Supprimer les ${state.runs.length} runs de l'historique ? Cette action est irréversible.`,
        confirmLabel: 'Effacer',
        danger: true,
      });
      if (!confirmed) return;
      await api?.clearAllRuns();
      state.runs = [];
      renderContent();
    });
  }

  // Bind click to open run detail
  el.querySelectorAll('.wf-run[data-run-id]').forEach(runEl => {
    runEl.addEventListener('click', () => {
      const run = state.runs.find(r => r.id === runEl.dataset.runId);
      if (run) renderRunDetail(el, run);
    });
  });

  // Show more button
  const showMoreBtn = el.querySelector('#wf-show-more-runs');
  if (showMoreBtn) {
    showMoreBtn.addEventListener('click', () => {
      el._showAllRuns = true;
      renderRunHistory(el);
    });
  }
}

/* ─── Run Detail View ──────────────────────────────────────────────────── */

function renderRunDetail(el, run) {
  state.viewingRunId = run.id;
  const wf = state.workflows.find(w => w.id === run.workflowId);
  const steps = run.steps || [];
  const totalDuration = run.duration || steps.reduce((s, st) => s + (st.duration || 0), 0) || 1;

  el.innerHTML = `
    <div class="wf-run-detail">
      <div class="wf-run-detail-header">
        <button class="wf-run-detail-back" id="wf-run-back">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
        </button>
        <div class="wf-run-detail-info">
          <span class="wf-run-detail-name">${escapeHtml(wf?.name || 'Workflow supprimé')}</span>
          <div class="wf-run-detail-meta">
            ${svgClock(9)} ${fmtTime(run.startedAt)}
            <span style="margin:0 6px;opacity:.3">·</span>
            ${svgTimer()} ${fmtDuration(run.duration)}
            <span style="margin:0 6px;opacity:.3">·</span>
            <span class="wf-run-trigger-tag" style="font-size:10px">${escapeHtml(run.trigger)}</span>
          </div>
        </div>
        <div class="wf-run-detail-actions">
          ${wf ? `<button class="wf-run-detail-rerun" id="wf-run-rerun" title="Relancer ce workflow">
            ${svgPlay(10)} Re-run
          </button>` : ''}
          <span class="wf-status-pill wf-status-pill--${run.status}">${statusDot(run.status)}${statusLabel(run.status)}</span>
        </div>
      </div>
      <div class="wf-run-detail-steps">
        ${steps.map((step, i) => {
          const sType = (step.type || step.name || '').split('.')[0];
          const info = findStepType(sType);
          const hasOutput = step.output != null;
          const isFailed = step.status === 'failed';
          const isRunningAgent = step.status === 'running' && (sType === 'claude' || sType === 'agent');
          const errorMsg = isFailed && step.error ? step.error : (isFailed && typeof step.output === 'string' && step.output.length < 500 ? step.output : null);
          const pct = Math.max(2, Math.round(((step.duration || 0) / totalDuration) * 100));
          return `
            <div class="wf-run-step wf-run-step--${step.status} ${isFailed ? 'wf-run-step--error-highlight' : ''}" data-step-idx="${i}" data-step-id="${step.id}">
              <div class="wf-run-step-header">
                <span class="wf-run-step-num">${i + 1}</span>
                <span class="wf-run-step-icon wf-chip wf-chip--${info.color}">${info.icon}</span>
                <span class="wf-run-step-name">${escapeHtml(step.id || step.type || '')}</span>
                <span class="wf-run-step-type">${escapeHtml(info.label || sType).toUpperCase()}</span>
                <div class="wf-run-step-timing">
                  <div class="wf-run-step-timing-bar" style="width:${pct}%"></div>
                </div>
                <span class="wf-run-step-dur">${fmtDuration(step.duration)}</span>
                <span class="wf-run-step-status-icon">${step.status === 'success' ? '✓' : step.status === 'failed' ? '✗' : step.status === 'skipped' ? '–' : '…'}</span>
                ${hasOutput ? '<svg class="wf-run-step-chevron" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>' : ''}
              </div>
              ${isRunningAgent ? `<div class="wf-live-log" data-step-id="${step.id}"></div>` : ''}
              ${errorMsg ? `<div class="wf-run-step-error"><span class="wf-run-step-error-label">Error</span> ${escapeHtml(errorMsg)}</div>` : ''}
              ${hasOutput ? `<div class="wf-run-step-output" style="display:${isFailed ? 'block' : 'none'}"><pre class="wf-run-step-pre">${escapeHtml(formatStepOutput(step.output))}</pre></div>` : ''}
            </div>
          `;
        }).join('')}
      </div>
    </div>
  `;

  // Back button
  el.querySelector('#wf-run-back').addEventListener('click', () => {
    state.viewingRunId = null;
    renderContent();
  });

  // Re-run button
  el.querySelector('#wf-run-rerun')?.addEventListener('click', async () => {
    if (run.workflowId) await triggerWorkflow(run.workflowId);
  });

  // Toggle step outputs
  el.querySelectorAll('.wf-run-step').forEach(stepEl => {
    const header = stepEl.querySelector('.wf-run-step-header');
    const output = stepEl.querySelector('.wf-run-step-output');
    if (!output) return;
    header.style.cursor = 'pointer';
    header.addEventListener('click', () => {
      const visible = output.style.display !== 'none';
      output.style.display = visible ? 'none' : 'block';
      stepEl.classList.toggle('expanded', !visible);
    });
  });

  // Populate existing live logs (e.g. when navigating back into detail)
  for (const [stepId, entries] of _agentLogs) {
    if (entries.length > 0) _updateLiveLogDOM(stepId);
  }
}

function formatStepOutput(output) {
  if (output == null) return '';
  if (typeof output === 'string') return output;
  try {
    return JSON.stringify(output, null, 2);
  } catch {
    return String(output);
  }
}

/* ─── Node Graph Editor ─────────────────────────────────────────────────── */

// Cache for DB connections (loaded from disk via IPC, independent of Database panel state)
let _dbConnectionsCache = null;
async function loadDbConnections() {
  try {
    _dbConnectionsCache = await window.electron_api.database.loadConnections() || [];
  } catch { _dbConnectionsCache = []; }
}

// Node type → color mapping for diagram cards
const WF_NODE_COLORS = {
  trigger: '#22c55e', claude: '#a78bfa', shell: '#60a5fa', git: '#f97316',
  http: '#06b6d4', db: '#f59e0b', file: '#e2e8f0', notify: '#ec4899',
  wait: '#94a3b8', log: '#64748b', condition: '#eab308', loop: '#8b5cf6',
  variable: '#10b981',
};

/**
 * Transform a plain-text workflow diagram code block into a visual card.
 * Handles lines like: [Trigger Manuel], ↓, [DB Query] → SELECT * FROM users
 */
function _renderWfDiagramBlock(block, text) {
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
  const items = [];
  for (const line of lines) {
    if (line === '↓' || line === '→') {
      items.push({ type: 'arrow' });
      continue;
    }
    // Match [Node Name] → description  OR  [Node Name]
    const m = line.match(/^\[([^\]]+)\](?:\s*→\s*(.+))?$/);
    if (m) {
      const label = m[1];
      const detail = m[2] || null;
      // Guess node type from label
      const lc = label.toLowerCase();
      let nodeType = 'variable';
      for (const t of Object.keys(WF_NODE_COLORS)) {
        if (lc.includes(t)) { nodeType = t; break; }
      }
      items.push({ type: 'node', label, detail, nodeType });
    } else {
      // Plain text line inside a step (e.g. detail continuation)
      if (items.length && items[items.length - 1].type === 'node' && !items[items.length - 1].detail) {
        items[items.length - 1].detail = line;
      }
    }
  }

  if (!items.some(i => i.type === 'node')) return; // nothing to render

  const rows = items.map(item => {
    if (item.type === 'arrow') {
      return `<div class="wf-diag-arrow">↓</div>`;
    }
    const color = WF_NODE_COLORS[item.nodeType] || '#94a3b8';
    const detail = item.detail ? `<span class="wf-diag-detail" title="${escapeHtml(item.detail)}">${escapeHtml(item.detail)}</span>` : '';
    return `<div class="wf-diag-node" style="--node-color:${color}">
      <span class="wf-diag-dot"></span>
      <span class="wf-diag-label">${escapeHtml(item.label)}</span>
      ${detail}
    </div>`;
  }).join('');

  // Hide original code block chrome (header + pre) and replace with diagram
  block.style.background = 'none';
  block.style.border = 'none';
  block.style.padding = '0';
  block.innerHTML = `<div class="wf-diag-card">${rows}</div>`;
}

function openEditor(workflowId = null) {
  const wf = workflowId ? state.workflows.find(w => w.id === workflowId) : null;
  const editorDraft = {
    name: wf?.name || '',
    scope: wf?.scope || 'current',
    concurrency: wf?.concurrency || 'skip',
    dirty: false,
    variables: (wf?.variables || []).map(v => ({ ...v })), // abstract variable definitions
  };

  // ── Render editor into the panel ──
  const panel = document.getElementById('workflow-panel');
  if (!panel) return;

  // Pre-load DB connections from disk (async, used by DB node properties)
  loadDbConnections();

  const graphService = getGraphService();

  // Store previous panel content for restore
  const prevContent = panel.innerHTML;
  const nodeTypes = STEP_TYPES.filter(st => st.type !== 'trigger');

  // ── Build editor HTML ──
  panel.innerHTML = `
    <div class="wf-editor">
      <div class="wf-editor-toolbar">
        <!-- Left: navigation + name -->
        <div class="wf-editor-toolbar-left">
          <button class="wf-editor-back" id="wf-ed-back">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M19 12H5"/><path d="M12 19l-7-7 7-7"/></svg>
            Retour
          </button>
          <div class="wf-editor-toolbar-sep"></div>
          <input class="wf-editor-name wf-input" id="wf-ed-name" value="${escapeHtml(editorDraft.name)}" placeholder="Sans titre…" />
          <span class="wf-editor-dirty" id="wf-ed-dirty" style="display:none" title="Modifications non sauvegardées"></span>
        </div>

        <!-- Center: history + zoom -->
        <div class="wf-editor-toolbar-center">
          <div class="wf-editor-history">
            <button class="wf-ed-hist-btn" id="wf-ed-undo" title="Undo (Ctrl+Z)" disabled>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 7v6h6"/><path d="M21 17a9 9 0 0 0-9-9 9 9 0 0 0-6 2.3L3 13"/></svg>
            </button>
            <button class="wf-ed-hist-btn" id="wf-ed-redo" title="Redo (Ctrl+Y)" disabled>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 7v6h-6"/><path d="M3 17a9 9 0 0 1 9-9 9 9 0 0 1 6 2.3L21 13"/></svg>
            </button>
          </div>
          <div class="wf-editor-toolbar-sep"></div>
          <div class="wf-editor-zoom">
            <button id="wf-ed-zoom-out" title="Zoom out (−)">−</button>
            <span id="wf-ed-zoom-label">100%</span>
            <button id="wf-ed-zoom-in" title="Zoom in (+)">+</button>
            <button id="wf-ed-zoom-reset" title="Reset zoom (1:1)">1:1</button>
            <button id="wf-ed-zoom-fit" title="Fit all nodes (F)">Fit</button>
          </div>
          <div class="wf-editor-toolbar-sep"></div>
          <button class="wf-ed-hist-btn" id="wf-ed-comment" title="Add comment zone (C)">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="8" y1="8" x2="16" y2="8"/><line x1="8" y1="12" x2="13" y2="12"/></svg>
          </button>
          <button class="wf-ed-hist-btn" id="wf-ed-minimap" title="Toggle minimap (M)">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg>
          </button>
        </div>

        <!-- Right: actions -->
        <div class="wf-editor-toolbar-right">
          <button class="wf-editor-btn wf-editor-btn--run" id="wf-ed-run" title="Lancer le workflow">
            <span class="wf-btn-icon"><svg width="9" height="9" viewBox="0 0 10 10" fill="currentColor"><polygon points="2,1 9,5 2,9"/></svg></span>
            Run
          </button>
          <button class="wf-editor-btn wf-editor-btn--ai" id="wf-ed-ai" title="AI Workflow Builder">
            <span class="wf-btn-icon wf-btn-icon--ai"><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg></span>
            AI
          </button>
          <button class="wf-editor-btn wf-editor-btn--primary" id="wf-ed-save" title="Sauvegarder (Ctrl+S)">
            <span class="wf-btn-icon"><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg></span>
            Save
          </button>
        </div>
      </div>
      <div class="wf-editor-body">
        <div class="wf-editor-left-panel">
          <div class="wf-lp-tabs">
            <button class="wf-lp-tab active" data-lp-tab="nodes">Nodes</button>
            <button class="wf-lp-tab" data-lp-tab="vars">Variables</button>
          </div>
          <div class="wf-lp-content" data-lp-content="nodes">
            <div class="wf-editor-palette" id="wf-ed-palette">
              ${[
                { key: 'action', title: 'Actions' },
                { key: 'data',   title: 'Données' },
                { key: 'flow',   title: 'Contrôle' },
              ].map(cat => {
                const items = nodeTypes.filter(st => st.category === cat.key);
                if (!items.length) return '';
                return `<div class="wf-palette-title"><span>${cat.title}</span></div>` +
                  items.map(st => `
                    <div class="wf-palette-item" data-node-type="workflow/${st.type}" data-color="${st.color}" title="${st.desc}" draggable="true">
                      <span class="wf-palette-icon wf-chip wf-chip--${st.color}">${st.icon}</span>
                      <span class="wf-palette-label">${st.label}</span>
                    </div>
                  `).join('');
              }).join('')}
            </div>
          </div>
          <div class="wf-lp-content" data-lp-content="vars" style="display:none">
            <div class="wf-vars-panel" id="wf-vars-panel">
              <div class="wf-vars-panel-header">
                <button class="wf-vars-add-btn" id="wf-vars-add" title="Ajouter une variable">
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                </button>
              </div>
              <div class="wf-vars-list" id="wf-vars-list">
                <div class="wf-vars-empty">
                  <svg class="wf-vars-empty-icon" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/></svg>
                  <span class="wf-vars-empty-text">Cliquer + pour créer<br>une variable</span>
                </div>
              </div>
            </div>
          </div>
        </div>
        <div class="wf-editor-canvas-wrap" id="wf-ed-canvas-wrap">
          <canvas id="wf-litegraph-canvas"></canvas>
        </div>
        <div class="wf-editor-properties" id="wf-ed-properties">
          <div class="wf-props-empty">
            <div class="wf-props-empty-icon-wrap">
              <svg class="wf-props-empty-icon" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/></svg>
            </div>
            <div class="wf-props-empty-title">Propriétés</div>
            <p class="wf-props-empty-text">Sélectionnez un node pour<br>configurer ses paramètres</p>
          </div>
        </div>
      </div>
      <div class="wf-editor-statusbar">
        <span class="wf-sb-section" id="wf-ed-nodecount"><svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/></svg> 0 nodes</span>
        <span class="wf-sb-section wf-sb-selection" id="wf-ed-selection" style="display:none"></span>
        <span class="wf-sb-sep"></span>
        <span class="wf-sb-section wf-sb-name" id="wf-ed-sb-name">${escapeHtml(editorDraft.name) || 'Sans titre'}</span>
        <span class="wf-sb-section wf-sb-dirty" id="wf-ed-sb-dirty" style="display:none">Modifié</span>
        <span class="wf-sb-spacer"></span>
        <span class="wf-sb-section" id="wf-ed-zoom-pct">100%</span>
      </div>
      <div class="wf-ai-panel" id="wf-ai-panel" style="display:none">
        <div class="wf-ai-panel-header">
          <span class="wf-ai-panel-title">✨ AI Workflow Builder</span>
          <button class="wf-ai-panel-close" id="wf-ai-panel-close" title="Fermer">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>
        <div class="wf-ai-panel-chat" id="wf-ai-panel-chat"></div>
      </div>
    </div>
  `;

  // ── Init LiteGraph canvas ──
  const canvasWrap = panel.querySelector('#wf-ed-canvas-wrap');
  const canvasEl = panel.querySelector('#wf-litegraph-canvas');
  canvasEl.width = canvasWrap.offsetWidth;
  canvasEl.height = canvasWrap.offsetHeight;

  graphService.init(canvasEl);

  // ── Left panel tab switching ──
  panel.querySelectorAll('.wf-lp-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      const target = tab.dataset.lpTab;
      panel.querySelectorAll('.wf-lp-tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      panel.querySelectorAll('.wf-lp-content').forEach(c => {
        c.style.display = c.dataset.lpContent === target ? '' : 'none';
      });
    });
  });

  // Load or create empty
  if (wf) {
    graphService.loadFromWorkflow(wf);
  } else {
    graphService.createEmpty();
  }

  // ── Status bar updates ──
  const updateStatusBar = () => {
    const count = graphService.getNodeCount();
    const selCount = graphService.getSelectedCount();
    const countEl = panel.querySelector('#wf-ed-nodecount');
    const selEl = panel.querySelector('#wf-ed-selection');
    const zoomEl = panel.querySelector('#wf-ed-zoom-pct');
    const zoomLabel = panel.querySelector('#wf-ed-zoom-label');
    const sbName = panel.querySelector('#wf-ed-sb-name');
    const sbDirty = panel.querySelector('#wf-ed-sb-dirty');
    const toolbarDirty = panel.querySelector('#wf-ed-dirty');
    const undoBtn = panel.querySelector('#wf-ed-undo');
    const redoBtn = panel.querySelector('#wf-ed-redo');
    if (countEl) countEl.innerHTML = `<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/></svg> ${count} node${count !== 1 ? 's' : ''}`;
    if (selEl) {
      if (selCount > 0) {
        selEl.textContent = `${selCount} sélectionné${selCount > 1 ? 's' : ''}`;
        selEl.style.display = '';
      } else {
        selEl.style.display = 'none';
      }
    }
    const pct = Math.round(graphService.getZoom() * 100);
    if (zoomEl) zoomEl.textContent = `${pct}%`;
    if (zoomLabel) zoomLabel.textContent = `${pct}%`;
    if (sbName) sbName.textContent = editorDraft.name || 'Sans titre';
    if (sbDirty) sbDirty.style.display = editorDraft.dirty ? '' : 'none';
    if (toolbarDirty) toolbarDirty.style.display = editorDraft.dirty ? '' : 'none';
    if (undoBtn) undoBtn.disabled = !graphService.canUndo();
    if (redoBtn) redoBtn.disabled = !graphService.canRedo();
  };
  updateStatusBar();

  // Wire history changes → status bar update
  graphService.onHistoryChanged = updateStatusBar;

  // ── Resize observer ──
  const resizeObs = new ResizeObserver(() => {
    if (canvasWrap && canvasEl) {
      graphService.resize(canvasWrap.offsetWidth, canvasWrap.offsetHeight);
      updateStatusBar();
    }
  });
  resizeObs.observe(canvasWrap);

  // ── Properties panel rendering ──
  const renderProperties = (node) => {
    const propsEl = panel.querySelector('#wf-ed-properties');
    if (!propsEl) return;

    if (!node) {
      // Show workflow options when no node selected
      propsEl.innerHTML = `
        <div class="wf-props-section">
          <div class="wf-props-header wf-props-header--workflow">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
            <div class="wf-props-header-text">
              <div class="wf-props-title">Configuration</div>
              <div class="wf-props-subtitle">Options globales du workflow</div>
            </div>
          </div>
          <div class="wf-step-edit-field">
            <label class="wf-step-edit-label">${svgScope()} Scope d'exécution</label>
            <span class="wf-field-hint">Sur quels projets ce workflow peut s'exécuter</span>
            <select class="wf-step-edit-input wf-props-input" data-prop="scope">
              <option value="current" ${editorDraft.scope === 'current' ? 'selected' : ''}>Projet courant uniquement</option>
              <option value="specific" ${editorDraft.scope === 'specific' ? 'selected' : ''}>Projet spécifique</option>
              <option value="all" ${editorDraft.scope === 'all' ? 'selected' : ''}>Tous les projets</option>
            </select>
          </div>
          <div class="wf-step-edit-field">
            <label class="wf-step-edit-label">${svgConc()} Concurrence</label>
            <span class="wf-field-hint">Comportement si le workflow est déjà en cours</span>
            <select class="wf-step-edit-input wf-props-input" data-prop="concurrency">
              <option value="skip" ${editorDraft.concurrency === 'skip' ? 'selected' : ''}>Skip (ignorer si en cours)</option>
              <option value="queue" ${editorDraft.concurrency === 'queue' ? 'selected' : ''}>Queue (file d'attente)</option>
              <option value="parallel" ${editorDraft.concurrency === 'parallel' ? 'selected' : ''}>Parallel (instances multiples)</option>
            </select>
          </div>
        </div>
      `;
      // Upgrade native selects to custom dropdowns
      upgradeSelectsToDropdowns(propsEl);
      // Bind workflow option inputs
      propsEl.querySelectorAll('.wf-props-input').forEach(input => {
        input.addEventListener('change', () => {
          editorDraft[input.dataset.prop] = input.value;
          editorDraft.dirty = true;
        });
      });
      return;
    }

    // Show node properties
    const nodeType = node.type.replace('workflow/', '');
    const typeInfo = findStepType(nodeType) || { label: nodeType, color: 'muted', icon: '' };
    const props = node.properties || {};

    let fieldsHtml = '';

    // Trigger node properties
    if (nodeType === 'trigger') {
      fieldsHtml = `
        <div class="wf-step-edit-field">
          <label class="wf-step-edit-label">${svgTriggerType()} Déclencheur</label>
          <span class="wf-field-hint">Comment ce workflow démarre</span>
          <select class="wf-step-edit-input wf-node-prop" data-key="triggerType">
            <option value="manual" ${props.triggerType === 'manual' ? 'selected' : ''}>Manuel (bouton play)</option>
            <option value="cron" ${props.triggerType === 'cron' ? 'selected' : ''}>Planifié (cron)</option>
            <option value="hook" ${props.triggerType === 'hook' ? 'selected' : ''}>Hook Claude</option>
            <option value="on_workflow" ${props.triggerType === 'on_workflow' ? 'selected' : ''}>Après un workflow</option>
          </select>
        </div>
        ${props.triggerType === 'cron' ? `
        <div class="wf-step-edit-field">
          <label class="wf-step-edit-label">${svgClock()} Expression cron</label>
          <span class="wf-field-hint">min heure jour mois jour-semaine</span>
          <input class="wf-step-edit-input wf-node-prop wf-field-mono" data-key="triggerValue" value="${escapeHtml(props.triggerValue || '')}" placeholder="*/5 * * * *" />
        </div>` : ''}
        ${props.triggerType === 'hook' ? `
        <div class="wf-step-edit-field">
          <label class="wf-step-edit-label">${svgHook()} Type de hook</label>
          <span class="wf-field-hint">Événement Claude qui déclenche le workflow</span>
          <select class="wf-step-edit-input wf-node-prop" data-key="hookType">
            ${HOOK_TYPES.map(h => `<option value="${h.value}" ${props.hookType === h.value ? 'selected' : ''}>${h.label} — ${h.desc}</option>`).join('')}
          </select>
        </div>` : ''}
        ${props.triggerType === 'on_workflow' ? `
        <div class="wf-step-edit-field">
          <label class="wf-step-edit-label">${svgLink()} Workflow source</label>
          <span class="wf-field-hint">Nom du workflow à surveiller</span>
          <input class="wf-step-edit-input wf-node-prop" data-key="triggerValue" value="${escapeHtml(props.triggerValue || '')}" placeholder="deploy-production" />
        </div>` : ''}
      `;
    }
    // Claude node properties
    else if (nodeType === 'claude') {
      const mode = props.mode || 'prompt';
      const agents = getAgents() || [];
      const skills = (getSkills() || []).filter(s => s.userInvocable !== false);
      const allProjects = projectsState.get().projects || [];
      fieldsHtml = `
        <div class="wf-step-edit-field">
          <label class="wf-step-edit-label">${svgProject()} Exécuter dans</label>
          <span class="wf-field-hint">Répertoire de travail de la session Claude</span>
          <select class="wf-step-edit-input wf-node-prop" data-key="projectId">
            <option value="" ${!props.projectId ? 'selected' : ''}>Projet courant (contexte workflow)</option>
            ${allProjects.map(p => `<option value="${p.id}" ${props.projectId === p.id ? 'selected' : ''}>${escapeHtml(p.name)}</option>`).join('')}
          </select>
        </div>
        <div class="wf-step-edit-field">
          <label class="wf-step-edit-label">${svgMode()} Mode d'exécution</label>
          <div class="wf-claude-mode-tabs">
            <button class="wf-claude-mode-tab ${mode === 'prompt' ? 'active' : ''}" data-mode="prompt">
              ${svgPrompt(16)}
              <span class="wf-claude-mode-tab-label">Prompt</span>
            </button>
            <button class="wf-claude-mode-tab ${mode === 'agent' ? 'active' : ''}" data-mode="agent">
              ${svgAgent()}
              <span class="wf-claude-mode-tab-label">Agent</span>
            </button>
            <button class="wf-claude-mode-tab ${mode === 'skill' ? 'active' : ''}" data-mode="skill">
              ${svgSkill(16)}
              <span class="wf-claude-mode-tab-label">Skill</span>
            </button>
          </div>
        </div>
        ${mode === 'prompt' || !mode ? `
        <div class="wf-step-edit-field">
          <label class="wf-step-edit-label">${svgPrompt(10)} Prompt</label>
          <span class="wf-field-hint">Instructions envoyées à Claude</span>
          <textarea class="wf-step-edit-input wf-node-prop" data-key="prompt" rows="5" placeholder="Analyse ce fichier et résume les changements...">${escapeHtml(props.prompt || '')}</textarea>
        </div>` : ''}
        ${mode === 'agent' ? `
        <div class="wf-step-edit-field">
          <label class="wf-step-edit-label">${svgAgent(10)} Agent</label>
          <span class="wf-field-hint">Worker autonome avec contexte isolé</span>
          <div class="wf-agent-grid">
            ${agents.length ? agents.map(a => `
              <div class="wf-agent-card ${props.agentId === a.id ? 'active' : ''}" data-agent-id="${a.id}">
                <span class="wf-agent-card-icon">${svgAgent(14)}</span>
                <div class="wf-agent-card-text">
                  <span class="wf-agent-card-name">${escapeHtml(a.name)}</span>
                  ${a.description ? `<span class="wf-agent-card-desc">${escapeHtml(a.description)}</span>` : ''}
                </div>
                <svg class="wf-agent-card-check" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
              </div>
            `).join('') : '<div class="wf-agent-empty"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="12" cy="12" r="10"/><path d="M12 8v4M12 16h.01"/></svg>Aucun agent dans ~/.claude/agents/</div>'}
          </div>
        </div>
        <div class="wf-step-edit-field">
          <label class="wf-step-edit-label">${svgPrompt(10)} Instructions</label>
          <span class="wf-field-hint">Contexte additionnel pour l'agent</span>
          <textarea class="wf-step-edit-input wf-node-prop" data-key="prompt" rows="2" placeholder="Focus on performance issues...">${escapeHtml(props.prompt || '')}</textarea>
        </div>` : ''}
        ${mode === 'skill' ? `
        <div class="wf-step-edit-field">
          <label class="wf-step-edit-label">${svgSkill(10)} Skill</label>
          <span class="wf-field-hint">Commande spécialisée à invoquer</span>
          <div class="wf-agent-grid">
            ${skills.length ? skills.map(s => `
              <div class="wf-agent-card ${props.skillId === s.id ? 'active' : ''}" data-skill-id="${s.id}">
                <span class="wf-agent-card-icon">${svgSkill(14)}</span>
                <div class="wf-agent-card-text">
                  <span class="wf-agent-card-name">${escapeHtml(s.name)}</span>
                  ${s.description ? `<span class="wf-agent-card-desc">${escapeHtml(s.description)}</span>` : ''}
                </div>
                <svg class="wf-agent-card-check" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
              </div>
            `).join('') : '<div class="wf-agent-empty"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="12" cy="12" r="10"/><path d="M12 8v4M12 16h.01"/></svg>Aucun skill dans ~/.claude/skills/</div>'}
          </div>
        </div>
        <div class="wf-step-edit-field">
          <label class="wf-step-edit-label">${svgPrompt(10)} Arguments</label>
          <span class="wf-field-hint">Texte passé au skill comme argument</span>
          <textarea class="wf-step-edit-input wf-node-prop" data-key="prompt" rows="2" placeholder="Arguments optionnels...">${escapeHtml(props.prompt || '')}</textarea>
        </div>` : ''}
        <div class="wf-field-row">
          <div class="wf-step-edit-field wf-field-half">
            <label class="wf-step-edit-label">Modèle</label>
            <select class="wf-step-edit-input wf-node-prop" data-key="model">
              <option value="" ${!props.model ? 'selected' : ''}>Auto</option>
              <option value="sonnet" ${props.model === 'sonnet' ? 'selected' : ''}>Sonnet</option>
              <option value="opus" ${props.model === 'opus' ? 'selected' : ''}>Opus</option>
              <option value="haiku" ${props.model === 'haiku' ? 'selected' : ''}>Haiku</option>
            </select>
          </div>
          <div class="wf-step-edit-field wf-field-half">
            <label class="wf-step-edit-label">Effort</label>
            <select class="wf-step-edit-input wf-node-prop" data-key="effort">
              <option value="" ${!props.effort ? 'selected' : ''}>Auto</option>
              <option value="low" ${props.effort === 'low' ? 'selected' : ''}>Low</option>
              <option value="medium" ${props.effort === 'medium' ? 'selected' : ''}>Medium</option>
              <option value="high" ${props.effort === 'high' ? 'selected' : ''}>High</option>
              <option value="max" ${props.effort === 'max' ? 'selected' : ''}>Max</option>
            </select>
          </div>
        </div>
      `;
    }
    // Shell node
    else if (nodeType === 'shell') {
      const allProjects = projectsState.get().projects || [];
      fieldsHtml = `
        <div class="wf-step-edit-field">
          <label class="wf-step-edit-label">${svgProject()} Exécuter dans</label>
          <span class="wf-field-hint">Répertoire de travail de la commande</span>
          <select class="wf-step-edit-input wf-node-prop" data-key="projectId">
            <option value="" ${!props.projectId ? 'selected' : ''}>Projet courant (contexte workflow)</option>
            ${allProjects.map(p => `<option value="${p.id}" ${props.projectId === p.id ? 'selected' : ''}>${escapeHtml(p.name)}</option>`).join('')}
          </select>
        </div>
        <div class="wf-step-edit-field">
          <label class="wf-step-edit-label">${svgShell()} Commande</label>
          <span class="wf-field-hint">Commande bash exécutée dans un terminal</span>
          <textarea class="wf-step-edit-input wf-node-prop wf-field-mono" data-key="command" rows="3" placeholder="npm run build && npm test">${escapeHtml(props.command || '')}</textarea>
        </div>
      `;
    }
    // Git node
    else if (nodeType === 'git') {
      const allProjects = projectsState.get().projects || [];
      fieldsHtml = `
        <div class="wf-step-edit-field">
          <label class="wf-step-edit-label">${svgProject()} Projet cible</label>
          <span class="wf-field-hint">Dépôt git sur lequel opérer</span>
          <select class="wf-step-edit-input wf-node-prop" data-key="projectId">
            <option value="" ${!props.projectId ? 'selected' : ''}>Projet courant (contexte workflow)</option>
            ${allProjects.map(p => `<option value="${p.id}" ${props.projectId === p.id ? 'selected' : ''}>${escapeHtml(p.name)}</option>`).join('')}
          </select>
        </div>
        <div class="wf-step-edit-field">
          <label class="wf-step-edit-label">${svgGit()} Action</label>
          <select class="wf-step-edit-input wf-node-prop" data-key="action">
            ${GIT_ACTIONS.map(a => `<option value="${a.value}" ${props.action === a.value ? 'selected' : ''}>${a.label} — ${a.desc}</option>`).join('')}
          </select>
        </div>
        ${props.action === 'commit' ? `
        <div class="wf-step-edit-field">
          <label class="wf-step-edit-label">${svgEdit()} Message de commit</label>
          <span class="wf-field-hint">Convention: type(scope): description</span>
          <input class="wf-step-edit-input wf-node-prop wf-field-mono" data-key="message" value="${escapeHtml(props.message || '')}" placeholder="feat(auth): add password reset" />
        </div>` : ''}
        ${props.action === 'checkout' || props.action === 'merge' ? `
        <div class="wf-step-edit-field">
          <label class="wf-step-edit-label">${svgBranch()} Branche</label>
          <span class="wf-field-hint">Nom de la branche git</span>
          <input class="wf-step-edit-input wf-node-prop wf-field-mono" data-key="branch" value="${escapeHtml(props.branch || '')}" placeholder="feature/my-branch" />
        </div>` : ''}
      `;
    }
    // HTTP node
    else if (nodeType === 'http') {
      fieldsHtml = `
        <div class="wf-field-row">
          <div class="wf-step-edit-field" style="width:100px;flex-shrink:0">
            <label class="wf-step-edit-label">Méthode</label>
            <select class="wf-step-edit-input wf-node-prop" data-key="method">
              ${['GET','POST','PUT','PATCH','DELETE'].map(m => `<option value="${m}" ${props.method === m ? 'selected' : ''}>${m}</option>`).join('')}
            </select>
          </div>
          <div class="wf-step-edit-field" style="flex:1">
            <label class="wf-step-edit-label">URL</label>
            <input class="wf-step-edit-input wf-node-prop wf-field-mono" data-key="url" value="${escapeHtml(props.url || '')}" placeholder="https://api.example.com/v1/users" />
          </div>
        </div>
        ${['POST','PUT','PATCH'].includes(props.method) ? `
        <div class="wf-step-edit-field">
          <label class="wf-step-edit-label">${svgCode()} Headers</label>
          <span class="wf-field-hint">Objet JSON des en-têtes HTTP</span>
          <textarea class="wf-step-edit-input wf-node-prop wf-field-mono" data-key="headers" rows="2" placeholder='{"Authorization": "Bearer $token"}'>${escapeHtml(props.headers || '')}</textarea>
        </div>
        <div class="wf-step-edit-field">
          <label class="wf-step-edit-label">${svgCode()} Body</label>
          <span class="wf-field-hint">Corps de la requête (JSON)</span>
          <textarea class="wf-step-edit-input wf-node-prop wf-field-mono" data-key="body" rows="3" placeholder='{"name": "John", "email": "john@example.com"}'>${escapeHtml(props.body || '')}</textarea>
        </div>` : ''}
      `;
    }
    // Notify node
    else if (nodeType === 'notify') {
      fieldsHtml = `
        <div class="wf-step-edit-field">
          <label class="wf-step-edit-label">${svgNotify()} Titre</label>
          <input class="wf-step-edit-input wf-node-prop" data-key="title" value="${escapeHtml(props.title || '')}" placeholder="Build terminé" />
        </div>
        <div class="wf-step-edit-field">
          <label class="wf-step-edit-label">${svgEdit()} Message</label>
          <span class="wf-field-hint">Variables : $ctx.project, $ctx.branch, $node_X.output</span>
          <textarea class="wf-step-edit-input wf-node-prop" data-key="message" rows="3" placeholder="Le build de $ctx.project est terminé avec succès.">${escapeHtml(props.message || '')}</textarea>
        </div>
      `;
    }
    // Wait node
    else if (nodeType === 'wait') {
      fieldsHtml = `
        <div class="wf-step-edit-field">
          <label class="wf-step-edit-label">${svgWait()} Durée</label>
          <span class="wf-field-hint">Formats: 5s, 2m, 1h, 500ms</span>
          <input class="wf-step-edit-input wf-node-prop wf-field-mono" data-key="duration" value="${escapeHtml(props.duration || '5s')}" placeholder="5s" />
        </div>
      `;
    }
    // Condition node
    else if (nodeType === 'condition') {
      const condMode = props._condMode || 'builder';
      const currentOp = props.operator || '==';
      const isUnary = currentOp === 'is_empty' || currentOp === 'is_not_empty';
      const compareOps = CONDITION_OPS.filter(o => o.group === 'compare');
      const textOps = CONDITION_OPS.filter(o => o.group === 'text');
      const unaryOps = CONDITION_OPS.filter(o => o.group === 'unary');
      fieldsHtml = `
        <div class="wf-cond-mode-toggle">
          <button class="wf-cond-mode-btn ${condMode === 'builder' ? 'active' : ''}" data-cond-mode="builder">Builder</button>
          <button class="wf-cond-mode-btn ${condMode === 'expression' ? 'active' : ''}" data-cond-mode="expression">Expression</button>
        </div>
        <div class="wf-cond-builder" ${condMode === 'expression' ? 'style="display:none"' : ''}>
          <div class="wf-step-edit-field">
            <label class="wf-step-edit-label">${svgVariable()} Variable</label>
            <span class="wf-field-hint">$variable ou valeur libre — Autocomplete avec $</span>
            <input class="wf-step-edit-input wf-node-prop wf-field-mono" data-key="variable" value="${escapeHtml(props.variable || '')}" placeholder="$ctx.branch" />
          </div>
          <div class="wf-step-edit-field">
            <label class="wf-step-edit-label">Opérateur</label>
            <div class="wf-cond-ops">
              <div class="wf-cond-ops-group">
                ${compareOps.map(o => `<button class="wf-cond-op-btn ${currentOp === o.value ? 'active' : ''}" data-op="${o.value}" title="${o.label}">${o.value}</button>`).join('')}
              </div>
              <div class="wf-cond-ops-group">
                ${textOps.map(o => `<button class="wf-cond-op-btn ${currentOp === o.value ? 'active' : ''}" data-op="${o.value}" title="${o.label}">${o.label}</button>`).join('')}
              </div>
              <div class="wf-cond-ops-group">
                ${unaryOps.map(o => `<button class="wf-cond-op-btn wf-cond-op-unary ${currentOp === o.value ? 'active' : ''}" data-op="${o.value}" title="${o.label}">${o.label}</button>`).join('')}
              </div>
            </div>
          </div>
          <div class="wf-step-edit-field wf-cond-value-field" ${isUnary ? 'style="display:none"' : ''}>
            <label class="wf-step-edit-label">Valeur</label>
            <input class="wf-step-edit-input wf-node-prop wf-field-mono" data-key="value" value="${escapeHtml(props.value || '')}" placeholder="main" />
          </div>
          <div class="wf-cond-preview">
            <code class="wf-cond-preview-code">${escapeHtml(buildConditionPreview(props.variable, currentOp, props.value, isUnary))}</code>
          </div>
        </div>
        <div class="wf-cond-expression" ${condMode === 'builder' ? 'style="display:none"' : ''}>
          <div class="wf-step-edit-field">
            <label class="wf-step-edit-label">${svgVariable()} Expression</label>
            <span class="wf-field-hint">Expression libre — ex: $node_1.rows.length > 0</span>
            <textarea class="wf-step-edit-input wf-node-prop wf-field-mono wf-cond-expr-input" data-key="expression" rows="2" placeholder="$node_1.exitCode == 0">${escapeHtml(props.expression || '')}</textarea>
          </div>
        </div>
      `;
    }
    // Project node
    else if (nodeType === 'project') {
      const allProjects = projectsState.get().projects || [];
      fieldsHtml = `
        <div class="wf-step-edit-field">
          <label class="wf-step-edit-label">${svgProject()} Projet</label>
          <span class="wf-field-hint">Projet cible de cette opération</span>
          <select class="wf-step-edit-input wf-node-prop" data-key="projectId">
            <option value="">-- Choisir un projet --</option>
            ${allProjects.map(p => `<option value="${p.id}" ${props.projectId === p.id ? 'selected' : ''}>${escapeHtml(p.name)}</option>`).join('')}
          </select>
        </div>
        <div class="wf-step-edit-field">
          <label class="wf-step-edit-label">${svgCond()} Action</label>
          <span class="wf-field-hint">Opération à effectuer sur le projet</span>
          <select class="wf-step-edit-input wf-node-prop" data-key="action">
            <option value="set_context" ${props.action === 'set_context' ? 'selected' : ''}>Définir comme contexte actif</option>
            <option value="open" ${props.action === 'open' ? 'selected' : ''}>Ouvrir dans l'éditeur</option>
            <option value="build" ${props.action === 'build' ? 'selected' : ''}>Lancer le build</option>
            <option value="install" ${props.action === 'install' ? 'selected' : ''}>Installer les dépendances</option>
            <option value="test" ${props.action === 'test' ? 'selected' : ''}>Exécuter les tests</option>
          </select>
        </div>
      `;
    }
    // File node
    else if (nodeType === 'file') {
      fieldsHtml = `
        <div class="wf-step-edit-field">
          <label class="wf-step-edit-label">${svgCond()} Action</label>
          <select class="wf-step-edit-input wf-node-prop" data-key="action">
            <option value="read" ${props.action === 'read' ? 'selected' : ''}>Lire le fichier</option>
            <option value="write" ${props.action === 'write' ? 'selected' : ''}>Écrire (remplacer)</option>
            <option value="append" ${props.action === 'append' ? 'selected' : ''}>Ajouter à la fin</option>
            <option value="copy" ${props.action === 'copy' ? 'selected' : ''}>Copier</option>
            <option value="delete" ${props.action === 'delete' ? 'selected' : ''}>Supprimer</option>
            <option value="exists" ${props.action === 'exists' ? 'selected' : ''}>Vérifier existence</option>
          </select>
        </div>
        <div class="wf-step-edit-field">
          <label class="wf-step-edit-label">${svgFile()} Chemin</label>
          <span class="wf-field-hint">Chemin relatif ou absolu du fichier</span>
          <input class="wf-step-edit-input wf-node-prop wf-field-mono" data-key="path" value="${escapeHtml(props.path || '')}" placeholder="./src/index.js" />
        </div>
        ${props.action === 'copy' ? `
        <div class="wf-step-edit-field">
          <label class="wf-step-edit-label">${svgFile()} Destination</label>
          <span class="wf-field-hint">Chemin cible pour la copie</span>
          <input class="wf-step-edit-input wf-node-prop wf-field-mono" data-key="destination" value="${escapeHtml(props.destination || '')}" placeholder="./backup/index.js.bak" />
        </div>` : ''}
        ${props.action === 'write' || props.action === 'append' ? `
        <div class="wf-step-edit-field">
          <label class="wf-step-edit-label">${svgCode()} Contenu</label>
          <span class="wf-field-hint">Texte ou données à écrire dans le fichier</span>
          <textarea class="wf-step-edit-input wf-node-prop wf-field-mono" data-key="content" rows="4" placeholder="console.log('Hello world');">${escapeHtml(props.content || '')}</textarea>
        </div>` : ''}
      `;
    }
    // DB node
    else if (nodeType === 'db') {
      const dbConns = _dbConnectionsCache || [];
      const dbAction = props.action || 'query';
      const selectedConn = dbConns.find(c => c.id === props.connection);
      fieldsHtml = `
        <div class="wf-step-edit-field">
          <label class="wf-step-edit-label">${svgDb()} Connexion</label>
          <span class="wf-field-hint">Base de données configurée dans l'app</span>
          <select class="wf-step-edit-input wf-node-prop" data-key="connection">
            <option value="">-- Choisir une connexion --</option>
            ${dbConns.map(c => `<option value="${c.id}" ${props.connection === c.id ? 'selected' : ''}>${escapeHtml(c.name)} (${c.type || 'sql'})</option>`).join('')}
          </select>
          ${!dbConns.length ? '<span class="wf-field-hint" style="color:rgba(251,191,36,.6)">Aucune connexion — onglet Database</span>' : ''}
          ${selectedConn ? `<span class="wf-field-hint" style="color:rgba(251,191,36,.5)">${selectedConn.type || 'sql'}${selectedConn.host ? ' — ' + escapeHtml(selectedConn.host) : ''}${selectedConn.database ? '/' + escapeHtml(selectedConn.database) : ''}</span>` : ''}
        </div>
        <div class="wf-step-edit-field">
          <label class="wf-step-edit-label">${svgCond()} Action</label>
          <span class="wf-field-hint">Type d'opération sur la base</span>
          <select class="wf-step-edit-input wf-node-prop" data-key="action">
            <option value="query" ${dbAction === 'query' ? 'selected' : ''}>Query — Exécuter une requête SQL</option>
            <option value="schema" ${dbAction === 'schema' ? 'selected' : ''}>Schema — Lister les tables et colonnes</option>
            <option value="tables" ${dbAction === 'tables' ? 'selected' : ''}>Tables — Lister les noms de tables</option>
          </select>
        </div>
        ${dbAction === 'query' ? `
        <div class="wf-step-edit-field">
          <label class="wf-step-edit-label">${svgCode()} Requête SQL</label>
          <div class="wf-sql-templates">
            <button class="wf-sql-tpl" data-tpl="select">SELECT</button>
            <button class="wf-sql-tpl" data-tpl="insert">INSERT</button>
            <button class="wf-sql-tpl" data-tpl="update">UPDATE</button>
            <button class="wf-sql-tpl" data-tpl="delete">DELETE</button>
          </div>
          <textarea class="wf-step-edit-input wf-node-prop wf-field-mono wf-sql-textarea" data-key="query" rows="5" placeholder="SELECT * FROM users WHERE active = 1" spellcheck="false">${escapeHtml(props.query || '')}</textarea>
          <span class="wf-field-hint">Autocomplete : tables et colonnes en tapant. Variables : $ctx, $node_X, $loop</span>
        </div>
        <div class="wf-field-row">
          <div class="wf-step-edit-field wf-field-half">
            <label class="wf-step-edit-label">${svgCond()} Limite</label>
            <span class="wf-field-hint">Max de lignes retournées</span>
            <input class="wf-step-edit-input wf-node-prop wf-field-mono" data-key="limit" type="number" min="1" max="10000" value="${escapeHtml(String(props.limit || 100))}" placeholder="100" />
          </div>
          <div class="wf-step-edit-field wf-field-half">
            <label class="wf-step-edit-label">${svgVariable()} Variable de sortie</label>
            <span class="wf-field-hint">Nom pour accéder au résultat</span>
            <input class="wf-step-edit-input wf-node-prop wf-field-mono" data-key="outputVar" value="${escapeHtml(props.outputVar || '')}" placeholder="dbResult" />
          </div>
        </div>` : ''}
        <div class="wf-db-output-hint">
          <div class="wf-db-output-title">${svgTriggerType()} Sortie disponible ${props.outputVar ? `<code style="margin-left:4px;font-size:10px">$${escapeHtml(props.outputVar)}</code>` : ''}</div>
          ${dbAction === 'query' ? `
          <div class="wf-db-output-items">
            <code>$node_${node.id}.rows</code> <span>tableau des résultats</span>
            <code>$node_${node.id}.columns</code> <span>noms des colonnes</span>
            <code>$node_${node.id}.rowCount</code> <span>nombre de lignes</span>
            <code>$node_${node.id}.duration</code> <span>temps d'exécution (ms)</span>
            <code>$node_${node.id}.firstRow</code> <span>première ligne (objet)</span>
          </div>` : dbAction === 'schema' ? `
          <div class="wf-db-output-items">
            <code>$node_${node.id}.tables</code> <span>liste des tables avec colonnes</span>
            <code>$node_${node.id}.tableCount</code> <span>nombre de tables</span>
          </div>` : `
          <div class="wf-db-output-items">
            <code>$node_${node.id}.tables</code> <span>liste des noms de tables</span>
            <code>$node_${node.id}.tableCount</code> <span>nombre de tables</span>
          </div>`}
        </div>
      `;
    }
    // Loop node
    else if (nodeType === 'loop') {
      // Detect upstream source for preview
      const loopPreview = getLoopPreview(node, graphService);
      const loopMode = props.mode || 'sequential';

      fieldsHtml = `
        <div class="wf-step-edit-field">
          <label class="wf-step-edit-label">${svgLoop()} Source d'itération</label>
          <span class="wf-field-hint">D'où viennent les items à parcourir</span>
          <select class="wf-step-edit-input wf-node-prop" data-key="source">
            <option value="auto" ${(!props.source || props.source === 'auto' || props.source === 'previous_output') ? 'selected' : ''}>Automatique (depuis node connecté)</option>
            <option value="projects" ${props.source === 'projects' ? 'selected' : ''}>Tous les projets enregistrés</option>
            <option value="files" ${props.source === 'files' ? 'selected' : ''}>Fichiers (pattern glob)</option>
            <option value="custom" ${props.source === 'custom' ? 'selected' : ''}>Liste personnalisée</option>
          </select>
        </div>
        ${props.source === 'files' ? `
        <div class="wf-step-edit-field">
          <label class="wf-step-edit-label">${svgFile()} Pattern glob</label>
          <span class="wf-field-hint">Expression pour trouver les fichiers</span>
          <input class="wf-step-edit-input wf-node-prop wf-field-mono" data-key="filter" value="${escapeHtml(props.filter || '')}" placeholder="src/**/*.test.js" />
        </div>` : ''}
        ${props.source === 'custom' ? `
        <div class="wf-step-edit-field">
          <label class="wf-step-edit-label">${svgCode()} Items</label>
          <span class="wf-field-hint">Un item par ligne, ou variable $node_X.rows</span>
          <textarea class="wf-step-edit-input wf-node-prop wf-field-mono" data-key="filter" rows="4" placeholder="api-service\nweb-app\nworker">${escapeHtml(props.filter || '')}</textarea>
        </div>` : ''}
        ${loopPreview.html}
        <div class="wf-loop-options">
          <div class="wf-loop-opt">
            <span class="wf-loop-opt-label">Mode</span>
            <div class="wf-loop-mode-tabs">
              <button class="wf-loop-mode-tab ${loopMode === 'sequential' ? 'active' : ''}" data-mode="sequential" title="Un par un dans l'ordre">Séq.</button>
              <button class="wf-loop-mode-tab ${loopMode === 'parallel' ? 'active' : ''}" data-mode="parallel" title="Tous en parallèle">Par.</button>
            </div>
          </div>
          <div class="wf-loop-opt">
            <span class="wf-loop-opt-label">Limite</span>
            <input class="wf-step-edit-input wf-node-prop wf-field-mono wf-loop-max-input" data-key="maxIterations" type="number" min="1" max="10000" value="${escapeHtml(String(props.maxIterations || ''))}" placeholder="∞" />
          </div>
        </div>
        ${(() => {
          // Item schema preview — from propagated schema or last run data
          const itemSchema = props._itemSchema || node._outputSchema || loopPreview.schema;
          if (itemSchema && itemSchema.length > 0) {
            return `<div class="wf-loop-schema">
              <div class="wf-loop-schema-title">${svgCode()} Structure de $item</div>
              <div class="wf-loop-schema-keys">
                ${itemSchema.map(key => `<div class="wf-loop-schema-key"><code>$item.${escapeHtml(key)}</code></div>`).join('')}
              </div>
              <div class="wf-loop-schema-hint">Utilisez ces chemins dans les nodes du corps de la boucle</div>
            </div>`;
          }
          return `<div class="wf-loop-schema wf-loop-schema--empty">
            <div class="wf-loop-schema-title">${svgCode()} Structure de $item</div>
            <div class="wf-loop-schema-hint">Connectez une source array ou lancez un run pour voir le schéma</div>
          </div>`;
        })()}
        <div class="wf-loop-usage-hint">
          <div class="wf-loop-usage-title">${svgTriggerType()} Variables dans Each</div>
          <div class="wf-loop-usage-items">
            <code>$item</code> <span>${escapeHtml(loopPreview.itemDesc)}</span>
            ${(() => {
              const itemSchema = props._itemSchema || node._outputSchema || loopPreview.schema;
              if (itemSchema && itemSchema.length > 0) {
                return itemSchema.map(key =>
                  `<code>$item.${escapeHtml(key)}</code> <span>Champ "${escapeHtml(key)}"</span>`
                ).join('');
              }
              return '';
            })()}
            <code>$loop.index</code> <span>Index courant (0, 1, 2…)</span>
            <code>$loop.total</code> <span>Nombre total d'items</span>
          </div>
          <div class="wf-loop-usage-tip">Connectez un node au port <strong>Each</strong> pour traiter chaque item</div>
        </div>
      `;
    }
    // Variable node (Set/Get/Increment/Append)
    else if (nodeType === 'variable') {
      const VAR_TYPE_OPTIONS = ['string', 'number', 'boolean', 'array', 'object', 'any'];
      const varType = props.varType || 'any';
      // Collect all variable names defined in this workflow
      const allVarNodes = (graphService?._nodes || []).filter(n =>
        (n.type === 'workflow/variable' || n.type === 'workflow/get_variable') && n.id !== node.id
      );
      const varNames = [...new Set(allVarNodes.map(n => n.properties.name).filter(Boolean))];
      fieldsHtml = `
        ${varNames.length ? `
        <div class="wf-var-browser">
          <div class="wf-var-browser-title">${svgVariable()} Variables du workflow</div>
          <div class="wf-var-browser-list">
            ${varNames.map(v => {
              const vNode = allVarNodes.find(n => n.properties.name === v);
              const vType = vNode?.properties.varType || 'any';
              const color = { string:'#c8c8c8', number:'#60a5fa', boolean:'#4ade80', array:'#fb923c', object:'#a78bfa', any:'#6b7280' }[vType] || '#6b7280';
              return `<button class="wf-var-browser-item" data-varname="${escapeHtml(v)}" title="Cliquer pour utiliser"><code style="color:${color}">$${escapeHtml(v)}</code><span class="wf-var-browser-type" style="color:${color}">${vType}</span></button>`;
            }).join('')}
          </div>
        </div>` : ''}
        <div class="wf-step-edit-field">
          <label class="wf-step-edit-label">${svgCond()} Action</label>
          <select class="wf-step-edit-input wf-node-prop" data-key="action">
            <option value="set" ${props.action === 'set' ? 'selected' : ''}>Définir une valeur</option>
            <option value="get" ${props.action === 'get' ? 'selected' : ''}>Lire la valeur</option>
            <option value="increment" ${props.action === 'increment' ? 'selected' : ''}>Incrémenter (+n)</option>
            <option value="append" ${props.action === 'append' ? 'selected' : ''}>Ajouter à la liste</option>
          </select>
        </div>
        <div class="wf-step-edit-field">
          <label class="wf-step-edit-label">${svgVariable()} Nom</label>
          <span class="wf-field-hint">Identifiant unique de la variable</span>
          <input class="wf-step-edit-input wf-node-prop wf-field-mono" data-key="name" value="${escapeHtml(props.name || '')}" placeholder="buildCount" />
        </div>
        <div class="wf-step-edit-field">
          <label class="wf-step-edit-label">${svgCond()} Type</label>
          <span class="wf-field-hint">Type de la variable (pour les connexions data pins)</span>
          <select class="wf-step-edit-input wf-node-prop" data-key="varType">
            ${VAR_TYPE_OPTIONS.map(t => `<option value="${t}" ${varType === t ? 'selected' : ''}>${t}</option>`).join('')}
          </select>
        </div>
        ${props.action !== 'get' ? `
        <div class="wf-step-edit-field">
          <label class="wf-step-edit-label">${svgEdit()} Valeur</label>
          <span class="wf-field-hint">${props.action === 'increment' ? 'Incrément (nombre)' : 'Valeur à assigner'}</span>
          <input class="wf-step-edit-input wf-node-prop ${props.action === 'increment' ? 'wf-field-mono' : ''}" data-key="value" value="${escapeHtml(props.value || '')}" placeholder="${props.action === 'increment' ? '1' : 'production'}" ${props.action === 'increment' ? 'type="number"' : ''} />
        </div>` : ''}
      `;
    }
    // Get Variable node (pure — no exec)
    else if (nodeType === 'get_variable') {
      const VAR_TYPE_OPTIONS = ['string', 'number', 'boolean', 'array', 'object', 'any'];
      const varType = props.varType || 'any';
      fieldsHtml = `
        <div class="wf-step-edit-field">
          <label class="wf-step-edit-label">${svgVariable()} Variable</label>
          <span class="wf-field-hint">Nom de la variable à lire</span>
          <input class="wf-step-edit-input wf-node-prop wf-field-mono" data-key="name" value="${escapeHtml(props.name || '')}" placeholder="buildCount" />
        </div>
        <div class="wf-step-edit-field">
          <label class="wf-step-edit-label">${svgCond()} Type du pin</label>
          <span class="wf-field-hint">Détermine la couleur et la compatibilité du pin de sortie</span>
          <div class="wf-var-type-picker" id="wf-getvar-type-picker">
            ${VAR_TYPE_OPTIONS.map(t => {
              const color = { string:'#c8c8c8', number:'#60a5fa', boolean:'#4ade80', array:'#fb923c', object:'#a78bfa', any:'#6b7280' }[t] || '#6b7280';
              return `<button class="wf-var-type-btn ${varType === t ? 'active' : ''}" data-type="${t}" style="--btn-color:${color}">${t}</button>`;
            }).join('')}
          </div>
        </div>
      `;
    }
    // Log node
    else if (nodeType === 'log') {
      const logLevel = props.level || 'info';
      const LOG_LEVELS = [
        { value: 'debug', label: 'Debug',   icon: '🔍', color: 'var(--text-muted)' },
        { value: 'info',  label: 'Info',    icon: 'ℹ',  color: '#60a5fa' },
        { value: 'warn',  label: 'Warn',    icon: '⚠',  color: '#fbbf24' },
        { value: 'error', label: 'Error',   icon: '✕',  color: '#f87171' },
      ];
      const LOG_TEMPLATES = [
        { label: 'Status',   value: '[$ctx.project] Step $loop.index completed' },
        { label: 'Result',   value: 'Output: $node_1.stdout' },
        { label: 'Timing',   value: 'Done at $ctx.date' },
      ];
      fieldsHtml = `
        <div class="wf-step-edit-field">
          <label class="wf-step-edit-label">${svgLog()} Niveau</label>
          <div class="wf-log-level-tabs">
            ${LOG_LEVELS.map(l => `
              <button class="wf-log-level-tab ${logLevel === l.value ? 'active' : ''}" data-level="${l.value}" style="${logLevel === l.value ? `--tab-color:${l.color}` : ''}">
                <span class="wf-log-level-icon">${l.icon}</span>
                ${l.label}
              </button>
            `).join('')}
          </div>
        </div>
        <div class="wf-step-edit-field">
          <label class="wf-step-edit-label">${svgEdit()} Message</label>
          <div class="wf-log-tpl-bar">
            ${LOG_TEMPLATES.map(t => `<button class="wf-log-tpl" data-tpl="${escapeHtml(t.value)}" title="${escapeHtml(t.value)}">${t.label}</button>`).join('')}
          </div>
          <textarea class="wf-step-edit-input wf-node-prop wf-log-textarea" data-key="message" rows="3" placeholder="Build finished for $ctx.project">${escapeHtml(props.message || '')}</textarea>
          <div class="wf-log-preview" data-level="${logLevel}">
            <span class="wf-log-preview-badge">${LOG_LEVELS.find(l => l.value === logLevel)?.icon || 'ℹ'}</span>
            <span class="wf-log-preview-text">${escapeHtml(props.message || 'Aperçu du message...')}</span>
          </div>
        </div>
      `;
    }
    // Switch node — visual case editor
    else if (nodeType === 'switch') {
      const cases = (props.cases || '').split(',').map(c => c.trim()).filter(Boolean);
      fieldsHtml = `
        <div class="wf-step-edit-field">
          <label class="wf-step-edit-label">${svgSwitch()} Variable à tester</label>
          <span class="wf-field-hint">Variable dont la valeur détermine la branche</span>
          <input class="wf-step-edit-input wf-node-prop wf-field-mono" data-key="variable" value="${escapeHtml(props.variable || '')}" placeholder="$ctx.branch" />
        </div>
        <div class="wf-step-edit-field">
          <label class="wf-step-edit-label">${svgCond()} Cases</label>
          <span class="wf-field-hint">Chaque case crée un port de sortie. Le port "default" est automatique.</span>
          <div class="wf-switch-cases" id="wf-switch-case-list">
            ${cases.map((c, i) => `
              <div class="wf-switch-case-row" data-idx="${i}">
                <span class="wf-switch-case-idx">${i + 1}</span>
                <input class="wf-switch-case-input wf-field-mono" value="${escapeHtml(c)}" placeholder="valeur" />
                <button class="wf-switch-case-del" title="Supprimer ce case">${svgX(10)}</button>
              </div>
            `).join('')}
          </div>
          <button class="wf-switch-case-add" id="wf-switch-add-case">
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M12 5v14M5 12h14"/></svg>
            Ajouter un case
          </button>
        </div>
        <div class="wf-switch-preview">
          <div class="wf-switch-preview-title">${svgTriggerType()} Ports de sortie</div>
          <div class="wf-switch-preview-ports">
            ${cases.map(c => `<span class="wf-switch-preview-port">${escapeHtml(c)}</span>`).join('')}
            <span class="wf-switch-preview-port wf-switch-preview-port--default">default</span>
          </div>
        </div>
      `;
    }
    // Transform node — data transformation
    else if (nodeType === 'transform') {
      const TRANSFORM_OPS = [
        { value: 'map',            label: 'Map',            desc: 'Transformer chaque élément', tpl: 'item.fieldName' },
        { value: 'filter',         label: 'Filter',         desc: 'Garder les éléments qui matchent', tpl: 'item.status === "active"' },
        { value: 'reduce',         label: 'Reduce',         desc: 'Agréger en une seule valeur', tpl: 'acc + item.value' },
        { value: 'find',           label: 'Find',           desc: 'Trouver le premier élément', tpl: 'item.id === $targetId' },
        { value: 'pluck',          label: 'Pluck',          desc: 'Extraire un seul champ', tpl: 'name' },
        { value: 'count',          label: 'Count',          desc: 'Compter les éléments', tpl: '' },
        { value: 'sort',           label: 'Sort',           desc: 'Trier les éléments', tpl: 'name' },
        { value: 'unique',         label: 'Unique',         desc: 'Supprimer les doublons', tpl: '' },
        { value: 'flatten',        label: 'Flatten',        desc: 'Aplatir les tableaux imbriqués', tpl: '' },
        { value: 'json_parse',     label: 'JSON Parse',     desc: 'Convertir string → objet', tpl: '' },
        { value: 'json_stringify',  label: 'JSON Stringify', desc: 'Convertir objet → string', tpl: '' },
      ];
      const currentOp = props.operation || 'map';
      const opInfo = TRANSFORM_OPS.find(o => o.value === currentOp) || TRANSFORM_OPS[0];
      const needsExpr = !['count', 'unique', 'flatten', 'json_parse', 'json_stringify'].includes(currentOp);
      fieldsHtml = `
        <div class="wf-step-edit-field">
          <label class="wf-step-edit-label">${svgTransform()} Opération</label>
          <div class="wf-transform-ops">
            ${TRANSFORM_OPS.map(o => `
              <button class="wf-transform-op-btn ${currentOp === o.value ? 'active' : ''}" data-op="${o.value}" title="${o.desc}">
                <span class="wf-transform-op-name">${o.label}</span>
                <span class="wf-transform-op-desc">${o.desc}</span>
              </button>
            `).join('')}
          </div>
        </div>
        <div class="wf-step-edit-field">
          <label class="wf-step-edit-label">${svgVariable()} Input</label>
          <span class="wf-field-hint">Source des données — variable ou node output</span>
          <input class="wf-step-edit-input wf-node-prop wf-field-mono" data-key="input" value="${escapeHtml(props.input || '')}" placeholder="$node_1.rows" />
        </div>
        ${needsExpr ? `
        <div class="wf-step-edit-field">
          <label class="wf-step-edit-label">${svgCode()} Expression</label>
          <span class="wf-field-hint">${currentOp === 'pluck' || currentOp === 'sort' ? 'Nom du champ' : currentOp === 'reduce' ? 'acc = accumulateur, item = élément' : 'item = élément courant'}</span>
          <input class="wf-step-edit-input wf-node-prop wf-field-mono" data-key="expression" value="${escapeHtml(props.expression || '')}" placeholder="${escapeHtml(opInfo.tpl)}" />
        </div>` : ''}
        <div class="wf-step-edit-field">
          <label class="wf-step-edit-label">${svgEdit()} Variable de sortie</label>
          <span class="wf-field-hint">Stocker le résultat dans une variable (optionnel)</span>
          <input class="wf-step-edit-input wf-node-prop wf-field-mono" data-key="outputVar" value="${escapeHtml(props.outputVar || '')}" placeholder="transformedData" />
        </div>
        <div class="wf-transform-preview">
          <code class="wf-transform-preview-code">${escapeHtml(currentOp)}(${escapeHtml(props.input || 'input')}${needsExpr && props.expression ? ', ' + escapeHtml(props.expression) : ''})${props.outputVar ? ' → $' + escapeHtml(props.outputVar) : ''}</code>
        </div>
      `;
    }
    // Subworkflow node
    else if (nodeType === 'subworkflow') {
      const allWorkflows = state.workflows || [];
      fieldsHtml = `
        <div class="wf-step-edit-field">
          <label class="wf-step-edit-label">${svgSubworkflow()} Workflow</label>
          <span class="wf-field-hint">Workflow à exécuter comme sous-processus</span>
          <select class="wf-step-edit-input wf-node-prop" data-key="workflow">
            <option value="">-- Choisir un workflow --</option>
            ${allWorkflows.filter(w => w.id !== editorDraft.id).map(w => `<option value="${w.id}" ${props.workflow === w.id ? 'selected' : ''}>${escapeHtml(w.name)}</option>`).join('')}
          </select>
        </div>
        <div class="wf-step-edit-field">
          <label class="wf-step-edit-label">${svgVariable()} Variables d'entrée</label>
          <span class="wf-field-hint">JSON des variables à passer (optionnel)</span>
          <textarea class="wf-step-edit-input wf-node-prop wf-field-mono" data-key="inputVars" rows="3" placeholder='{"key": "$node_1.output"}'>${escapeHtml(props.inputVars || '')}</textarea>
        </div>
      `;
    }

    const customTitle = node.properties._customTitle || '';
    const nodeStepId = `node_${node.id}`;

    // Check for last run data
    const runOutput = graphService?.getNodeOutput?.(node.id);
    const hasRunData = runOutput != null || node._runStatus;
    const activeTab = propsEl._activeTab || 'properties';

    // Build Last Run tab HTML
    let lastRunHtml = '';
    if (hasRunData && activeTab === 'lastrun') {
      const status = node._runStatus || 'unknown';
      const statusCol = { success:'#22c55e', failed:'#ef4444', running:'#f59e0b', skipped:'#6b7280' }[status] || '#888';
      const duration = node._runDuration != null ? `${node._runDuration}ms` : '-';
      const error = node._runError || '';

      let outputsHtml = '';
      if (runOutput && typeof runOutput === 'object') {
        const entries = Object.entries(runOutput);
        outputsHtml = entries.map(([k, v]) => {
          let display, typeLabel;
          if (v === null || v === undefined) { display = 'null'; typeLabel = 'null'; }
          else if (typeof v === 'string') { display = v.length > 200 ? escapeHtml(v.slice(0, 197)) + '...' : escapeHtml(v); typeLabel = 'string'; }
          else if (typeof v === 'number') { display = String(v); typeLabel = 'number'; }
          else if (typeof v === 'boolean') { display = String(v); typeLabel = 'boolean'; }
          else if (Array.isArray(v)) { display = `Array[${v.length}]`; typeLabel = 'array'; }
          else { display = JSON.stringify(v, null, 2); if (display.length > 200) display = display.slice(0, 197) + '...'; display = escapeHtml(display); typeLabel = 'object'; }
          const typeColor = { string:'#c8c8c8', number:'#60a5fa', boolean:'#4ade80', array:'#fb923c', object:'#a78bfa', null:'#6b7280' }[typeLabel] || '#888';
          return `<div class="wf-lastrun-entry">
            <div class="wf-lastrun-key"><code>${escapeHtml(k)}</code><span class="wf-lastrun-type" style="color:${typeColor}">${typeLabel}</span></div>
            <pre class="wf-lastrun-value">${display}</pre>
          </div>`;
        }).join('');
      }

      lastRunHtml = `
        <div class="wf-lastrun-content">
          <div class="wf-lastrun-status-row">
            <span class="wf-lastrun-status-dot" style="background:${statusCol}"></span>
            <span class="wf-lastrun-status-label" style="color:${statusCol}">${status}</span>
            <span class="wf-lastrun-duration">${duration}</span>
          </div>
          ${error ? `<div class="wf-lastrun-error"><span class="wf-lastrun-error-label">Erreur</span><pre class="wf-lastrun-error-msg">${escapeHtml(error)}</pre></div>` : ''}
          ${outputsHtml ? `<div class="wf-lastrun-section"><div class="wf-lastrun-section-title">Outputs</div>${outputsHtml}</div>` : '<div class="wf-lastrun-empty">Aucune donnée de sortie</div>'}
        </div>`;
    }

    propsEl.innerHTML = `
      <div class="wf-props-section" data-node-color="${typeInfo.color}">
        <div class="wf-props-header">
          <span class="wf-chip wf-chip--${typeInfo.color}">${typeInfo.icon}</span>
          <div class="wf-props-header-text">
            <div class="wf-props-title">${typeInfo.label}</div>
            <div class="wf-props-subtitle">${typeInfo.desc}</div>
          </div>
          <span class="wf-props-badge wf-props-badge--${typeInfo.color}">${nodeType.toUpperCase()}</span>
        </div>
        ${hasRunData ? `
        <div class="wf-props-tabs">
          <button class="wf-props-tab ${activeTab === 'properties' ? 'active' : ''}" data-tab="properties">Properties</button>
          <button class="wf-props-tab ${activeTab === 'lastrun' ? 'active' : ''}" data-tab="lastrun">Last Run</button>
        </div>` : ''}
        ${activeTab === 'lastrun' ? lastRunHtml : `
        ${nodeType !== 'trigger' ? `<div class="wf-node-id-badge"><code>$${nodeStepId}</code> <span>ID de ce node pour les variables</span></div>` : ''}
        ${nodeType !== 'trigger' ? `
        <div class="wf-step-edit-field">
          <label class="wf-step-edit-label">${svgEdit()} Nom personnalisé</label>
          <input class="wf-step-edit-input wf-node-prop" data-key="_customTitle" value="${escapeHtml(customTitle)}" placeholder="${typeInfo.label}" />
        </div>` : ''}
        ${fieldsHtml}
        ${nodeType !== 'trigger' ? `
        <div class="wf-props-divider"></div>
        <button class="wf-props-delete" id="wf-props-delete-node">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/></svg>
          Supprimer ce node
        </button>` : ''}
        `}
      </div>
    `;

    // ── Bind tab switching ──
    propsEl.querySelectorAll('.wf-props-tab').forEach(tab => {
      tab.addEventListener('click', () => {
        propsEl._activeTab = tab.dataset.tab;
        renderProperties(node);
      });
    });

    // Upgrade native selects to custom dropdowns
    upgradeSelectsToDropdowns(propsEl);

    // ── Bind property inputs ──
    let _propSnapshotTimer = null;
    propsEl.querySelectorAll('.wf-node-prop').forEach(input => {
      const handler = () => {
        const key = input.dataset.key;
        const val = input.value;
        node.properties[key] = val;
        editorDraft.dirty = true;
        // Update widget display in node
        if (node.widgets) {
          const w = node.widgets.find(w => w.name === key || w.name.toLowerCase() === key.toLowerCase());
          if (w) w.value = val;
        }
        graphService.canvas.setDirty(true, true);
        // Invalidate schema cache when DB connection changes
        if (key === 'connection') {
          schemaCache.invalidate(val);
        }
        // Re-render properties if field affects visibility (trigger type, method, action, mode, connection)
        if (['triggerType', 'method', 'action', 'mode', 'connection'].includes(key)) {
          renderProperties(node);
        }
        // Rebuild Variable pins when action changes (adaptive Get/Set like Unreal)
        if (key === 'action' && node.type === 'workflow/variable') {
          // Sync the widget combo
          const aw = node.widgets?.find(w => w.key === 'action');
          if (aw) aw.value = val;
          graphService._rebuildVariablePins(node);
        }
        // Refresh pin type on get_variable when varType changes
        if (key === 'varType' && node._updatePinType) {
          node._updatePinType();
        }
        // Debounced snapshot so rapid typing doesn't flood the history
        clearTimeout(_propSnapshotTimer);
        _propSnapshotTimer = setTimeout(() => graphService.pushSnapshot(), 600);
      };
      input.addEventListener('input', handler);
      input.addEventListener('change', handler);
    });

    // ── Autocomplete for $variable references ──
    setupAutocomplete(propsEl, node, graphService, schemaCache);

    // ── Initialize Smart SQL for DB nodes ──
    if (nodeType === 'db') {
      initSmartSQL(propsEl, node, graphService, schemaCache, _dbConnectionsCache).catch(e => console.warn('[SmartSQL] init error:', e));
    }

    // Claude mode tabs
    propsEl.querySelectorAll('.wf-claude-mode-tab').forEach(tab => {
      tab.addEventListener('click', () => {
        node.properties.mode = tab.dataset.mode;
        // Update widget
        if (node.widgets) {
          const w = node.widgets.find(w => w.name === 'Mode');
          if (w) w.value = tab.dataset.mode;
        }
        editorDraft.dirty = true;
        graphService.canvas.setDirty(true, true);
        renderProperties(node);
      });
    });

    // Agent card selection
    propsEl.querySelectorAll('.wf-agent-card[data-agent-id]').forEach(card => {
      card.addEventListener('click', () => {
        node.properties.agentId = card.dataset.agentId;
        editorDraft.dirty = true;
        propsEl.querySelectorAll('.wf-agent-card[data-agent-id]').forEach(c => c.classList.remove('active'));
        card.classList.add('active');
      });
    });

    // Skill card selection
    propsEl.querySelectorAll('.wf-agent-card[data-skill-id]').forEach(card => {
      card.addEventListener('click', () => {
        node.properties.skillId = card.dataset.skillId;
        editorDraft.dirty = true;
        propsEl.querySelectorAll('.wf-agent-card[data-skill-id]').forEach(c => c.classList.remove('active'));
        card.classList.add('active');
      });
    });

    // Get Variable type picker buttons
    propsEl.querySelectorAll('.wf-var-type-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const t = btn.dataset.type;
        node.properties.varType = t;
        editorDraft.dirty = true;
        if (node._updatePinType) node._updatePinType();
        // Update active state visually
        propsEl.querySelectorAll('.wf-var-type-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
      });
    });

    // Loop mode tabs (sequential/parallel)
    propsEl.querySelectorAll('.wf-loop-mode-tab').forEach(tab => {
      tab.addEventListener('click', () => {
        node.properties.mode = tab.dataset.mode;
        editorDraft.dirty = true;
        graphService.canvas.setDirty(true, true);
        renderProperties(node);
      });
    });

    // Log level tabs
    propsEl.querySelectorAll('.wf-log-level-tab').forEach(tab => {
      tab.addEventListener('click', () => {
        node.properties.level = tab.dataset.level;
        editorDraft.dirty = true;
        graphService.canvas.setDirty(true, true);
        renderProperties(node);
      });
    });

    // Log template buttons
    propsEl.querySelectorAll('.wf-log-tpl').forEach(btn => {
      btn.addEventListener('click', () => {
        const textarea = propsEl.querySelector('.wf-log-textarea');
        if (textarea) {
          const start = textarea.selectionStart || textarea.value.length;
          const before = textarea.value.substring(0, start);
          const after = textarea.value.substring(textarea.selectionEnd || start);
          textarea.value = before + btn.dataset.tpl + after;
          node.properties.message = textarea.value;
          editorDraft.dirty = true;
          textarea.focus();
          // Update preview
          const preview = propsEl.querySelector('.wf-log-preview-text');
          if (preview) preview.textContent = textarea.value || 'Aperçu du message...';
        }
      });
    });

    // Log message live preview
    const logTextarea = propsEl.querySelector('.wf-log-textarea');
    if (logTextarea) {
      logTextarea.addEventListener('input', () => {
        const preview = propsEl.querySelector('.wf-log-preview-text');
        if (preview) preview.textContent = logTextarea.value || 'Aperçu du message...';
      });
    }

    // Condition mode toggle (Builder / Expression)
    propsEl.querySelectorAll('.wf-cond-mode-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const mode = btn.dataset.condMode;
        node.properties._condMode = mode;
        editorDraft.dirty = true;
        const builderEl = propsEl.querySelector('.wf-cond-builder');
        const exprEl = propsEl.querySelector('.wf-cond-expression');
        if (builderEl && exprEl) {
          builderEl.style.display = mode === 'builder' ? '' : 'none';
          exprEl.style.display = mode === 'expression' ? '' : 'none';
        }
        propsEl.querySelectorAll('.wf-cond-mode-btn').forEach(b => b.classList.toggle('active', b === btn));
        // When switching to expression, sync builder → expression
        if (mode === 'expression' && !node.properties.expression) {
          const isUnary = (node.properties.operator || '==') === 'is_empty' || (node.properties.operator || '==') === 'is_not_empty';
          node.properties.expression = buildConditionPreview(node.properties.variable || '', node.properties.operator || '==', node.properties.value || '', isUnary);
          const exprInput = propsEl.querySelector('.wf-cond-expr-input');
          if (exprInput) exprInput.value = node.properties.expression;
        }
      });
    });

    // Condition operator buttons
    propsEl.querySelectorAll('.wf-cond-op-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const op = btn.dataset.op;
        node.properties.operator = op;
        editorDraft.dirty = true;
        // Toggle active state
        propsEl.querySelectorAll('.wf-cond-op-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        // Show/hide value field based on unary
        const isUnary = op === 'is_empty' || op === 'is_not_empty';
        const valField = propsEl.querySelector('.wf-cond-value-field');
        if (valField) valField.style.display = isUnary ? 'none' : '';
        // Update preview
        const preview = propsEl.querySelector('.wf-cond-preview-code');
        if (preview) preview.textContent = buildConditionPreview(node.properties.variable || '', op, node.properties.value || '', isUnary);
        // Update widget
        if (node.widgets) {
          const w = node.widgets.find(w => w.name === 'operator' || w.name === 'Operator');
          if (w) w.value = op;
        }
        graphService.canvas.setDirty(true, true);
      });
    });

    // Condition live preview update on variable/value change
    const condVarInput = propsEl.querySelector('.wf-cond-builder [data-key="variable"]');
    const condValInput = propsEl.querySelector('.wf-cond-builder [data-key="value"]');
    const condPreview = propsEl.querySelector('.wf-cond-preview-code');
    if (condPreview) {
      const updateCondPreview = () => {
        const v = condVarInput?.value || '';
        const op = node.properties.operator || '==';
        const val = condValInput?.value || '';
        const isUnary = op === 'is_empty' || op === 'is_not_empty';
        condPreview.textContent = buildConditionPreview(v, op, val, isUnary);
      };
      if (condVarInput) condVarInput.addEventListener('input', updateCondPreview);
      if (condValInput) condValInput.addEventListener('input', updateCondPreview);
    }

    // Delete node button
    const deleteBtn = propsEl.querySelector('#wf-props-delete-node');
    if (deleteBtn) {
      deleteBtn.addEventListener('click', () => {
        graphService.graph.remove(node);
        editorDraft.dirty = true;
        renderProperties(null);
        updateStatusBar();
        graphService.canvas.setDirty(true, true);
      });
    }

    // Custom title update (sync to node title)
    const titleInput = propsEl.querySelector('[data-key="_customTitle"]');
    if (titleInput) {
      titleInput.addEventListener('input', () => {
        node.properties._customTitle = titleInput.value;
        node.title = titleInput.value || typeInfo.label;
        editorDraft.dirty = true;
        graphService.canvas.setDirty(true, true);
      });
    }

    // ── Switch case editor ──
    const _syncSwitchCases = () => {
      const rows = propsEl.querySelectorAll('.wf-switch-case-input');
      const cases = Array.from(rows).map(r => r.value.trim()).filter(Boolean);
      node.properties.cases = cases.join(',');
      // Sync widget
      if (node.widgets) {
        const w = node.widgets.find(w => w.key === 'cases');
        if (w) w.value = node.properties.cases;
      }
      editorDraft.dirty = true;
      graphService.canvas._rebuildSwitchOutputs(node);
      graphService.canvas.setDirty(true, true);
      graphService.pushSnapshot();
    };
    // Bind case inputs
    propsEl.querySelectorAll('.wf-switch-case-input').forEach(input => {
      input.addEventListener('change', _syncSwitchCases);
    });
    // Delete case buttons
    propsEl.querySelectorAll('.wf-switch-case-del').forEach(btn => {
      btn.addEventListener('click', () => {
        btn.closest('.wf-switch-case-row')?.remove();
        _syncSwitchCases();
        renderProperties(node);
      });
    });
    // Add case button
    const addCaseBtn = propsEl.querySelector('#wf-switch-add-case');
    if (addCaseBtn) {
      addCaseBtn.addEventListener('click', () => {
        const cases = (node.properties.cases || '').split(',').map(c => c.trim()).filter(Boolean);
        cases.push(`case${cases.length + 1}`);
        node.properties.cases = cases.join(',');
        if (node.widgets) {
          const w = node.widgets.find(w => w.key === 'cases');
          if (w) w.value = node.properties.cases;
        }
        editorDraft.dirty = true;
        graphService.canvas._rebuildSwitchOutputs(node);
        graphService.canvas.setDirty(true, true);
        graphService.pushSnapshot();
        renderProperties(node);
      });
    }

    // ── Transform operation picker ──
    propsEl.querySelectorAll('.wf-transform-op-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        node.properties.operation = btn.dataset.op;
        // Sync widget
        if (node.widgets) {
          const w = node.widgets.find(w => w.key === 'operation');
          if (w) w.value = btn.dataset.op;
        }
        editorDraft.dirty = true;
        graphService.canvas.setDirty(true, true);
        renderProperties(node);
      });
    });

    // ── Variable browser — click to fill name ──
    propsEl.querySelectorAll('.wf-var-browser-item').forEach(btn => {
      btn.addEventListener('click', () => {
        const nameInput = propsEl.querySelector('[data-key="name"]');
        if (nameInput) {
          nameInput.value = btn.dataset.varname;
          node.properties.name = btn.dataset.varname;
          editorDraft.dirty = true;
          graphService.canvas.setDirty(true, true);
        }
      });
    });
  };

  // ── Graph events ──
  graphService.onNodeSelected = (node) => {
    renderProperties(node);
    updateStatusBar();
  };

  graphService.onNodeDeselected = () => {
    renderProperties(null);
  };

  graphService.onGraphChanged = () => {
    editorDraft.dirty = true;
    updateStatusBar();
  };

  // ── Variables panel (Blueprint-style) ──────────────────────────────────────
  // Abstract variable definitions live in editorDraft.variables (not as graph nodes).
  // Clicking a variable inserts a workflow/variable node with name pre-filled.
  const VAR_TYPE_COLORS = {
    string:  '#c8c8c8',
    number:  '#60a5fa',
    boolean: '#4ade80',
    array:   '#fb923c',
    object:  '#a78bfa',
    any:     '#6b7280',
  };
  const VAR_TYPE_LIST = ['string', 'number', 'boolean', 'array', 'object', 'any'];

  const varsList = panel.querySelector('#wf-vars-list');

  /** Generate a unique variable name */
  function nextVarName() {
    const names = new Set(editorDraft.variables.map(v => v.name));
    let i = 1;
    while (names.has(`var${i}`)) i++;
    return `var${i}`;
  }

  /** Also used by the AI chat context injection */
  function collectGraphVariables() {
    return editorDraft.variables;
  }

  function updateVarsPanel() {
    if (!varsList) return;
    const vars = editorDraft.variables;
    if (!vars.length) {
      varsList.innerHTML = `
        <div class="wf-vars-empty">
          <svg class="wf-vars-empty-icon" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/></svg>
          <span class="wf-vars-empty-text">Cliquer + pour créer<br>une variable</span>
        </div>`;
      return;
    }
    varsList.innerHTML = vars.map((v, idx) => {
      const color = VAR_TYPE_COLORS[v.varType] || VAR_TYPE_COLORS.any;
      return `
        <div class="wf-var-item" data-var-idx="${idx}" style="--var-color:${color}" title="Cliquer pour insérer un node Variable">
          <span class="wf-var-dot" style="background:${color}"></span>
          <span class="wf-var-name">${escapeHtml(v.name)}</span>
          <span class="wf-var-type-badge" style="--var-color:${color}">${v.varType || 'any'}</span>
        </div>
      `;
    }).join('');

    // Bind clicks → insert a workflow/variable node with this name
    varsList.querySelectorAll('.wf-var-item').forEach(item => {
      item.addEventListener('click', () => {
        const idx = parseInt(item.dataset.varIdx, 10);
        const v = editorDraft.variables[idx];
        if (!v) return;
        const canvas = graphService.canvas;
        if (!canvas) return;
        const cx = (-canvas.ds.offset[0] + canvasWrap.offsetWidth / 2) / canvas.ds.scale;
        const cy = (-canvas.ds.offset[1] + canvasWrap.offsetHeight / 2) / canvas.ds.scale;
        const node = graphService.addNode('workflow/variable', [cx - 100, cy - 30]);
        if (node) {
          node.properties.name = v.name;
          node.properties.varType = v.varType || 'any';
          node.properties.action = 'get';
          // Update widget value to match
          const actionW = node.widgets?.find(w => w.key === 'action');
          if (actionW) actionW.value = 'get';
          const nameW = node.widgets?.find(w => w.key === 'name');
          if (nameW) nameW.value = v.name;
          graphService._rebuildVariablePins(node);
          graphService._markDirty();
        }
      });

      // Right-click → edit inline
      item.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        const idx = parseInt(item.dataset.varIdx, 10);
        openVarEditor(idx);
      });
    });
  }
  updateVarsPanel();

  /** Open floating popover editor for a variable definition */
  function openVarEditor(idx) {
    const v = editorDraft.variables[idx];
    if (!v) return;

    // Remove any existing popover
    const old = panel.querySelector('.wf-var-popover-backdrop');
    if (old) old.remove();

    const isNew = !v._persisted;
    v._persisted = true;

    const backdrop = document.createElement('div');
    backdrop.className = 'wf-var-popover-backdrop';
    backdrop.innerHTML = `
      <div class="wf-var-popover">
        <div class="wf-var-popover-header">
          <span class="wf-var-popover-title">${isNew ? 'Nouvelle variable' : 'Modifier la variable'}</span>
          <button class="wf-var-popover-close" title="Fermer">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>
        <div class="wf-var-popover-body">
          <div class="wf-var-popover-field">
            <label class="wf-var-popover-label">Nom</label>
            <input class="wf-var-popover-input" id="wf-vp-name" value="${escapeHtml(v.name)}" placeholder="myVariable" spellcheck="false" autocomplete="off" />
          </div>
          <div class="wf-var-popover-field">
            <label class="wf-var-popover-label">Type</label>
            <div class="wf-var-popover-types">
              ${VAR_TYPE_LIST.map(t => {
                const c = VAR_TYPE_COLORS[t];
                return `<button class="wf-var-popover-type-btn ${(v.varType || 'any') === t ? 'active' : ''}" data-type="${t}" style="--type-color:${c}">
                  <span class="wf-var-popover-type-dot" style="background:${c}"></span>
                  ${t}
                </button>`;
              }).join('')}
            </div>
          </div>
        </div>
        <div class="wf-var-popover-footer">
          <button class="wf-var-popover-delete" id="wf-vp-delete">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
            Supprimer
          </button>
          <button class="wf-var-popover-save" id="wf-vp-save">Enregistrer</button>
        </div>
      </div>
    `;

    // Insert into the editor (not body — stays within workflow scope)
    panel.querySelector('.wf-editor').appendChild(backdrop);

    const pop = backdrop.querySelector('.wf-var-popover');
    const nameInput = backdrop.querySelector('#wf-vp-name');

    // Focus
    requestAnimationFrame(() => {
      nameInput.focus();
      nameInput.select();
    });

    // Type buttons
    backdrop.querySelectorAll('.wf-var-popover-type-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        backdrop.querySelectorAll('.wf-var-popover-type-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        v.varType = btn.dataset.type;
      });
    });

    // Close
    const close = () => {
      backdrop.classList.add('closing');
      setTimeout(() => backdrop.remove(), 120);
    };

    // Save
    const save = () => {
      const newName = (nameInput.value || '').trim();
      if (newName) {
        v.name = newName;
        editorDraft.dirty = true;
      }
      updateVarsPanel();
      close();
    };

    backdrop.querySelector('.wf-var-popover-close').addEventListener('click', () => {
      // If new and name is still default, revert
      if (isNew && !nameInput.value.trim()) {
        editorDraft.variables.splice(idx, 1);
      }
      save();
    });
    backdrop.querySelector('#wf-vp-save').addEventListener('click', save);
    nameInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') save();
      if (e.key === 'Escape') close();
      e.stopPropagation();
    });
    nameInput.addEventListener('keyup', (e) => e.stopPropagation());

    // Delete
    backdrop.querySelector('#wf-vp-delete').addEventListener('click', () => {
      editorDraft.variables.splice(idx, 1);
      editorDraft.dirty = true;
      updateVarsPanel();
      close();
    });

    // Click backdrop to close
    backdrop.addEventListener('click', (e) => {
      if (e.target === backdrop) save();
    });
  }

  // Bouton + → add a new abstract variable definition
  const varsAddBtn = panel.querySelector('#wf-vars-add');
  if (varsAddBtn) {
    varsAddBtn.addEventListener('click', () => {
      const name = nextVarName();
      editorDraft.variables.push({ name, varType: 'string' });
      editorDraft.dirty = true;
      updateVarsPanel();
      openVarEditor(editorDraft.variables.length - 1);
    });
  }

  // ── Auto-loop suggestion ──
  graphService.onArrayToSingleConnection = (link, sourceNode, targetNode) => {
    // Remove any existing suggestion popup
    const old = panel.querySelector('.wf-loop-suggest');
    if (old) old.remove();

    // Position popup at the midpoint of the link (converted from graph coords to screen)
    const originPos = graphService.getOutputPinPos(sourceNode.id, link.origin_slot);
    const targetPos = graphService.getInputPinPos(targetNode.id, link.target_slot);
    const mx = (originPos[0] + targetPos[0]) / 2;
    const my = (originPos[1] + targetPos[1]) / 2;
    const screenPos = graphService.graphToScreen(mx, my);
    const canvasRect = graphService.canvasElement.getBoundingClientRect();
    const panelRect = panel.getBoundingClientRect();

    const popup = document.createElement('div');
    popup.className = 'wf-loop-suggest';
    popup.style.left = (canvasRect.left - panelRect.left + screenPos[0]) + 'px';
    popup.style.top = (canvasRect.top - panelRect.top + screenPos[1] + 10) + 'px';
    popup.innerHTML = `
      <div class="wf-loop-suggest-text">Ce lien transporte un tableau. Insérer un Loop ?</div>
      <div class="wf-loop-suggest-actions">
        <button class="wf-loop-suggest-btn wf-loop-suggest-btn--yes">Insérer Loop</button>
        <button class="wf-loop-suggest-btn wf-loop-suggest-btn--no">Ignorer</button>
      </div>
    `;
    panel.appendChild(popup);

    // Auto-dismiss after 6s
    const autoDismiss = setTimeout(() => popup.remove(), 6000);

    popup.querySelector('.wf-loop-suggest-btn--no').addEventListener('click', () => {
      clearTimeout(autoDismiss);
      popup.remove();
    });

    popup.querySelector('.wf-loop-suggest-btn--yes').addEventListener('click', () => {
      clearTimeout(autoDismiss);
      popup.remove();
      insertLoopBetween(graphService, link);
      editorDraft.dirty = true;
      updateStatusBar();
    });
  };

  // ── Toolbar events ──
  // Back
  panel.querySelector('#wf-ed-back').addEventListener('click', () => {
    resizeObs.disconnect();
    resetGraphService();
    renderPanel();
    renderContent();
  });

  // Name input
  panel.querySelector('#wf-ed-name').addEventListener('input', (e) => {
    editorDraft.name = e.target.value;
    editorDraft.dirty = true;
  });

  // Zoom
  panel.querySelector('#wf-ed-zoom-in').addEventListener('click', () => {
    graphService.setZoom(graphService.getZoom() * 1.2);
    updateStatusBar();
  });
  panel.querySelector('#wf-ed-zoom-out').addEventListener('click', () => {
    graphService.setZoom(graphService.getZoom() / 1.2);
    updateStatusBar();
  });
  panel.querySelector('#wf-ed-zoom-reset')?.addEventListener('click', () => {
    graphService.setZoom(1);
    updateStatusBar();
  });
  panel.querySelector('#wf-ed-zoom-fit').addEventListener('click', () => {
    graphService.zoomToFit();
    updateStatusBar();
  });

  // Comment zone
  panel.querySelector('#wf-ed-comment')?.addEventListener('click', () => {
    const s = graphService._scale || 1;
    const ox = graphService._offsetX || 0;
    const oy = graphService._offsetY || 0;
    const cx = (-ox / s) + 200;
    const cy = (-oy / s) + 100;
    graphService.addComment([cx, cy], [300, 200], 'Comment');
    updateStatusBar();
  });

  // Minimap toggle
  panel.querySelector('#wf-ed-minimap')?.addEventListener('click', () => {
    graphService.toggleMinimap();
  });

  // Undo / Redo
  panel.querySelector('#wf-ed-undo').addEventListener('click', () => {
    graphService.undo();
    updateStatusBar();
  });
  panel.querySelector('#wf-ed-redo').addEventListener('click', () => {
    graphService.redo();
    updateStatusBar();
  });

  // ── Shared save logic ──
  const saveWorkflow = async () => {
    const data = graphService.serializeToWorkflow();
    if (!data) return false;
    const workflow = {
      ...(workflowId ? { id: workflowId } : {}),
      name: editorDraft.name,
      enabled: wf?.enabled ?? true,
      trigger: data.trigger,
      ...(data.trigger.type === 'hook' ? { hookType: data.hookType } : {}),
      scope: editorDraft.scope,
      concurrency: editorDraft.concurrency,
      graph: data.graph,
      steps: data.steps,
      variables: editorDraft.variables.filter(v => v.name),
    };
    const res = await api.save(workflow);
    if (res?.success) {
      editorDraft.dirty = false;
      updateStatusBar();
      await refreshData();
      if (!workflowId && res.id) {
        workflowId = res.id;
      }
      return true;
    }
    return false;
  };

  // Save
  panel.querySelector('#wf-ed-save').addEventListener('click', saveWorkflow);

  // Run — always save before triggering to persist graph changes
  panel.querySelector('#wf-ed-run').addEventListener('click', async () => {
    const btn = panel.querySelector('#wf-ed-run');
    btn.disabled = true;
    btn.textContent = 'Saving...';
    try {
      const ok = await saveWorkflow();
      if (!ok) {
        console.warn('[Workflow] Save failed, cannot run');
        return;
      }
      if (workflowId) {
        btn.textContent = 'Running...';
        await triggerWorkflow(workflowId);
      }
    } finally {
      btn.disabled = false;
      btn.innerHTML = '<span class="wf-btn-icon"><svg width="9" height="9" viewBox="0 0 10 10" fill="currentColor"><polygon points="2,1 9,5 2,9"/></svg></span>Run';
    }
  });

  // ── AI Workflow Builder ──
  const aiPanel = panel.querySelector('#wf-ai-panel');
  const aiPanelChat = panel.querySelector('#wf-ai-panel-chat');
  let aiChatInitialized = false;

  const WORKFLOW_SYSTEM_PROMPT = `You are the AI assistant built into the Workflow Builder of Claude Terminal.

Claude Terminal is an Electron desktop app for managing development projects. It includes a visual workflow editor (LiteGraph.js) for automating tasks: git, shell commands, AI tasks, HTTP requests, file operations, databases, notifications, and more.

YOUR ONLY ROLE: help the user build and modify the workflow currently open in the visual editor, using the MCP tools available. You do nothing else — no code help, no project advice, nothing outside of workflow building.

AVAILABLE MCP TOOLS:
- workflow_get_graph(workflow) — read current nodes and links
- workflow_get_variables(workflow) — list all variables defined and referenced in the workflow
- workflow_add_node(workflow, type, pos, properties, title) — add a node
- workflow_connect_nodes(workflow, from_node, from_slot, to_node, to_slot) — connect two nodes
- workflow_update_node(workflow, node_id, properties, title) — update node properties
- workflow_delete_node(workflow, node_id) — delete a node

The "workflow" parameter is the name shown in the editor toolbar.

PIN SYSTEM (Blueprint-style typed data pins):
Each node has exec pins (flow control) AND data pins (typed values).
Exec pins connect flow: slot0=Done/True, slot1=Error/False.
Data pins carry values: string, number, boolean, array, object, any.
Data pins can be connected directly between nodes — the runtime resolves values automatically.
You do NOT need $node_X.stdout syntax when using data pin connections.

NODE TYPES:

workflow/trigger — Entry point (always the first node, required)
  triggerType: manual | cron | hook | on_workflow
  triggerValue: cron expression e.g. "0 9 * * 1-5"
  Exec outputs: slot0=Start

workflow/claude — AI task
  mode: prompt | agent | skill
  prompt, model, effort
  Exec outputs: slot0=Done, slot1=Error
  Data outputs: output (string)

workflow/shell — Terminal command
  command (supports $vars)
  Exec outputs: slot0=Done, slot1=Error
  Data outputs: stdout (string), stderr (string), exitCode (number)

workflow/git — Git operation
  action: pull | push | commit | checkout | merge | stash | stash-pop | reset
  branch, message
  Exec outputs: slot0=Done, slot1=Error
  Data outputs: output (string)

workflow/http — HTTP request
  method: GET | POST | PUT | PATCH | DELETE
  url, headers (JSON string), body (JSON string)
  Exec outputs: slot0=Done, slot1=Error
  Data outputs: body (object), status (number), ok (boolean)

workflow/db — SQL query
  connection (connection name), query (SQL with $vars)
  Exec outputs: slot0=Done, slot1=Error
  Data outputs: rows (array), rowCount (number), firstRow (object)

workflow/file — File operation
  action: read | write | append | copy | delete | exists
  path, content
  Exec outputs: slot0=Done, slot1=Error
  Data outputs: content (string), exists (boolean)

workflow/notify — Desktop notification
  title, message
  Exec output: slot0=Done

workflow/wait — Pause execution
  duration: "5s" | "2m" | "1h"
  Exec output: slot0=Done

workflow/log — Log a message
  level: debug | info | warn | error
  message (supports $vars)
  Exec output: slot0=Done

workflow/condition — Conditional branch
  variable (dot-path to value), operator: == | != | > | < | >= | <= | contains | starts_with | matches | is_empty | is_not_empty
  value
  Exec outputs: slot0=TRUE path, slot1=FALSE path

workflow/loop — Iterate over a list
  source: auto | projects | files | custom
  items ($var pointing to an array)
  Exec outputs: slot0=Each iteration (loop body), slot1=Done (after loop)
  Data outputs: item (any), index (number)

workflow/variable — Store/set a variable
  action: set | get | increment | append
  name, value
  Exec output: slot0=Done
  Data output: value (any)

workflow/get_variable — Read a variable (pure data node, NO exec pins)
  name: variable name to read
  varType: string | number | boolean | array | object | any
  Data output: value (typed)
  NOTE: This node has no exec input/output. Connect its data output directly to another node's data input.
  Use workflow_get_variables to discover existing variables before adding this node.

DATA PIN CONNECTION SLOTS (for workflow_connect_nodes):
When connecting data pins, slot indices start AFTER the exec slots:
  shell: stdout=slot2, stderr=slot3, exitCode=slot4
  db: rows=slot2, rowCount=slot3, firstRow=slot4
  http: body=slot2, status=slot3, ok=slot4
  file: content=slot2, exists=slot3
  loop: item=slot2, index=slot3
  variable: value=slot1
  get_variable: value=slot0
  claude: output=slot2

AVAILABLE VARIABLES IN PROPERTIES (legacy $var syntax, still works):
$ctx.project — current project name
$ctx.branch — active git branch
$node_X.stdout — stdout output of node X (shell/git)
$node_X.body — HTTP response body of node X
$node_X.rows — SQL result rows of node X
$node_X.result — boolean result of condition node X
$loop.item — current item in loop iteration
$loop.index — current index (0-based)

NODE POSITIONING (top-to-bottom, 160px spacing):
Trigger: [100, 100] → next nodes: [100, 260] → [100, 420] → etc.
TRUE branch: same X column, FALSE branch: shift X by +260

APPROACH:
1. ALWAYS start by calling workflow_get_graph to see the current state
2. If the graph is empty, ask the user what they want to automate
3. Build node by node, briefly explaining each step
4. Connect each node immediately after adding it
5. Proactively suggest error handling where relevant
6. Reply in the user's language (French if they write in French, English otherwise)
7. NEVER discuss anything outside of workflow building

DIAGRAM FORMAT (MANDATORY):
Whenever you describe, summarize, or list the nodes of a workflow — whether showing the current state, a proposed plan, or the result after modifications — you MUST use this exact format in a plain code block (no language tag):

\`\`\`
[Node Name] → key detail
↓
[Node Name] → key detail
↓
[Node Name] → key detail
\`\`\`

Rules:
- One line per node, starting with [Node Name] (using the node type label, e.g. [Trigger], [Shell], [Condition], [Notify])
- After → write the most relevant property (command, title, condition, etc.)
- Separate nodes with ↓ on its own line
- NEVER use bullet points, numbered lists, or prose to describe the node structure
- Always show this diagram when the user asks "what does this workflow do", "show me the graph", or after any modification`;

  panel.querySelector('#wf-ed-ai').addEventListener('click', () => {
    const isOpen = aiPanel.style.display !== 'none';
    if (isOpen) {
      aiPanel.style.display = 'none';
      panel.querySelector('#wf-ed-ai').classList.remove('active');
      return;
    }
    aiPanel.style.display = 'flex';
    panel.querySelector('#wf-ed-ai').classList.add('active');

    if (!aiChatInitialized) {
      aiChatInitialized = true;
      const homeDir = window.electron_nodeModules?.os?.homedir() || '';
      const aiProject = { path: homeDir };
      const wfName = editorDraft.name || (workflowId ? state.workflows.find(w => w.id === workflowId)?.name : null) || null;

      // Inject existing variables from editorDraft into the system prompt
      let varsContext = '';
      if (editorDraft.variables.length > 0) {
        varsContext = '\n\nEXISTING VARIABLES IN THIS WORKFLOW:\n' +
          editorDraft.variables.map(v => `- ${v.name} (${v.varType || 'any'})`).join('\n') +
          '\nUse workflow/variable nodes with these names to get/set them.';
      }

      const promptWithContext = wfName
        ? `${WORKFLOW_SYSTEM_PROMPT}\n\nCURRENT WORKFLOW: "${wfName}" — this is the workflow open in the editor right now. Always use this name as the "workflow" parameter in your tool calls.${varsContext}`
        : WORKFLOW_SYSTEM_PROMPT;
      createChatView(aiPanelChat, aiProject, {
        systemPrompt: promptWithContext,
        skipPermissions: true,
        initialPrompt: null,
      });

      // MutationObserver: transform workflow diagram code blocks into visual cards
      const wfGraphObserver = new MutationObserver(() => {
        aiPanelChat.querySelectorAll('.chat-code-block:not([data-wf-rendered])').forEach(block => {
          const code = block.querySelector('code');
          if (!code) return;
          const text = code.textContent || '';
          // Detect workflow diagram pattern: lines with [Node] or ↓ arrows
          if (!text.includes('↓') && !/ → /.test(text)) return;
          block.setAttribute('data-wf-rendered', '1');
          _renderWfDiagramBlock(block, text);
        });
      });
      wfGraphObserver.observe(aiPanelChat, { childList: true, subtree: true });
    }
    // Focus the chat input so Enter works immediately
    setTimeout(() => {
      const chatInput = aiPanelChat.querySelector('.chat-input');
      if (chatInput) chatInput.focus();
    }, 80);
  });

  // Re-focus chat input when clicking anywhere inside the AI panel
  aiPanel.addEventListener('click', (e) => {
    if (e.target.closest('.wf-ai-panel-close')) return;
    const chatInput = aiPanelChat.querySelector('.chat-input');
    if (chatInput && document.activeElement !== chatInput && !e.target.closest('button, a, input, select, textarea')) {
      chatInput.focus();
    }
  });

  // Prevent keyboard events bubbling out of the AI panel to the LiteGraph canvas handlers
  aiPanel.addEventListener('keydown', (e) => {
    e.stopPropagation();
  });
  aiPanel.addEventListener('keyup', (e) => {
    e.stopPropagation();
  });

  panel.querySelector('#wf-ai-panel-close').addEventListener('click', () => {
    aiPanel.style.display = 'none';
    panel.querySelector('#wf-ed-ai').classList.remove('active');
  });

  // ── Palette clicks ──
  panel.querySelectorAll('.wf-palette-item').forEach(item => {
    item.addEventListener('click', () => {
      const typeName = item.dataset.nodeType;
      // Add node at center of current viewport
      const canvas = graphService.canvas;
      const cx = (-canvas.ds.offset[0] + canvasWrap.offsetWidth / 2) / canvas.ds.scale;
      const cy = (-canvas.ds.offset[1] + canvasWrap.offsetHeight / 2) / canvas.ds.scale;
      graphService.addNode(typeName, [cx - 90, cy - 30]);
    });
  });

  // ── Keyboard shortcuts in editor ──
  const editorKeyHandler = (e) => {
    const inInput = ['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName);
    // Delete / Backspace — delete selected nodes
    if ((e.key === 'Delete' || e.key === 'Backspace') && !inInput) {
      graphService.deleteSelected();
      return;
    }
    // Ctrl+Z — Undo
    if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
      e.preventDefault();
      graphService.undo();
      updateStatusBar();
      return;
    }
    // Ctrl+Y or Ctrl+Shift+Z — Redo
    if (((e.ctrlKey || e.metaKey) && e.key === 'y') ||
        ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'z')) {
      e.preventDefault();
      graphService.redo();
      updateStatusBar();
      return;
    }
    // Ctrl+A — Select all
    if ((e.ctrlKey || e.metaKey) && e.key === 'a' && !inInput) {
      e.preventDefault();
      graphService.selectAll();
      updateStatusBar();
      return;
    }
    // Ctrl+D — Duplicate selected
    if ((e.ctrlKey || e.metaKey) && e.key === 'd' && !inInput) {
      e.preventDefault();
      graphService.duplicateSelected();
      updateStatusBar();
      return;
    }
    // F — Fit all nodes
    if (e.key === 'f' && !inInput && !e.ctrlKey && !e.metaKey) {
      graphService.zoomToFit();
      updateStatusBar();
      return;
    }
    // C — Add comment zone
    if (e.key === 'c' && !inInput && !e.ctrlKey && !e.metaKey) {
      const s = graphService._scale || 1;
      const ox = graphService._offsetX || 0;
      const oy = graphService._offsetY || 0;
      const cx = (-ox / s) + 200;
      const cy = (-oy / s) + 100;
      graphService.addComment([cx, cy], [300, 200], 'Comment');
      updateStatusBar();
      return;
    }
    // M — Toggle minimap
    if (e.key === 'm' && !inInput && !e.ctrlKey && !e.metaKey) {
      graphService.toggleMinimap();
      return;
    }
  };
  document.addEventListener('keydown', editorKeyHandler);

  // Cleanup keyboard handler when leaving editor
  const origBack = panel.querySelector('#wf-ed-back');
  if (origBack) {
    const origHandler = origBack.onclick;
    origBack.addEventListener('click', () => {
      document.removeEventListener('keydown', editorKeyHandler);
    }, { once: true });
  }

} // end openEditor

// Legacy: removed old wizard code. The old openBuilder function has been replaced
// by the node graph editor above.
/* ─── Detail ───────────────────────────────────────────────────────────────── */

function openDetail(id) {
  const wf = state.workflows.find(w => w.id === id);
  if (!wf) return;
  const runs = state.runs.filter(r => r.workflowId === id);
  const cfg = TRIGGER_CONFIG[wf.trigger?.type] || TRIGGER_CONFIG.manual;

  const overlay = document.createElement('div');
  overlay.className = 'wf-overlay';
  overlay.innerHTML = `
    <div class="wf-modal wf-modal--detail">
      <div class="wf-modal-hd">
        <div class="wf-modal-hd-left">
          <span class="wf-detail-dot ${runs[0]?.status || ''}"></span>
          <span class="wf-modal-title">${escapeHtml(wf.name)}</span>
        </div>
        <div style="display:flex;gap:6px;align-items:center">
          <button class="wf-btn-primary wf-btn-sm" id="wf-run-now">${svgPlay()} Lancer</button>
          <button class="wf-btn-ghost wf-btn-sm" id="wf-edit">Modifier</button>
          <button class="wf-modal-x" id="wf-det-close">${svgX(12)}</button>
        </div>
      </div>
      <div class="wf-modal-bd wf-detail-bd">
        <div class="wf-detail-meta">
          <div class="wf-detail-meta-item">
            <span class="wf-detail-meta-icon wf-chip wf-chip--${cfg.color}">${cfg.icon}</span>
            <div>
              <div class="wf-detail-meta-label">Trigger</div>
              <div class="wf-detail-meta-val">${cfg.label}${wf.trigger?.value ? ` · <code>${escapeHtml(wf.trigger.value)}</code>` : ''}${wf.hookType ? ` · <code>${escapeHtml(wf.hookType)}</code>` : ''}</div>
            </div>
          </div>
          <div class="wf-detail-meta-item">
            <span class="wf-detail-meta-icon wf-chip wf-chip--muted">${svgScope()}</span>
            <div>
              <div class="wf-detail-meta-label">Scope</div>
              <div class="wf-detail-meta-val">${escapeHtml(wf.scope || 'current')}</div>
            </div>
          </div>
          <div class="wf-detail-meta-item">
            <span class="wf-detail-meta-icon wf-chip wf-chip--muted">${svgConc()}</span>
            <div>
              <div class="wf-detail-meta-label">Concurrence</div>
              <div class="wf-detail-meta-val">${escapeHtml(wf.concurrency || 'skip')}</div>
            </div>
          </div>
        </div>

        <div class="wf-detail-section">
          <div class="wf-detail-sec-title">Séquence</div>
          <div class="wf-detail-steps">
            ${(wf.steps || []).map((s, i) => {
              const info = findStepType((s.type || '').split('.')[0]);
              return `
                <div class="wf-det-step">
                  <span class="wf-det-step-n">${i + 1}</span>
                  <span class="wf-chip wf-chip--${info.color}">${info.icon}</span>
                  <span class="wf-det-step-type">${escapeHtml(s.type || '')}</span>
                  <span class="wf-det-step-id">\$${escapeHtml(s.id || '')}</span>
                  ${s.condition ? `<span class="wf-det-step-cond">if</span>` : ''}
                </div>
                ${i < wf.steps.length - 1 ? '<div class="wf-det-connector"></div>' : ''}
              `;
            }).join('')}
          </div>
        </div>

        ${runs.length ? `
          <div class="wf-detail-section">
            <div class="wf-detail-sec-title">Derniers runs</div>
            ${runs.slice(0, 3).map(run => `
              <div class="wf-run wf-run--sm">
                <div class="wf-run-bar wf-run-bar--${run.status}"></div>
                <div class="wf-run-body">
                  <div class="wf-run-top">
                    <span class="wf-status-pill wf-status-pill--${run.status}">${statusLabel(run.status)}</span>
                    <span class="wf-run-meta-inline">${svgClock()} ${fmtTime(run.startedAt)} · ${svgTimer()} ${fmtDuration(run.duration)}</span>
                  </div>
                </div>
              </div>
            `).join('')}
          </div>
        ` : ''}
      </div>
    </div>
  `;

  document.body.appendChild(overlay);
  overlay.querySelector('#wf-det-close').addEventListener('click', () => overlay.remove());
  overlay.querySelector('#wf-edit').addEventListener('click', () => { overlay.remove(); openEditor(id); });
  overlay.querySelector('#wf-run-now').addEventListener('click', () => { triggerWorkflow(id); overlay.remove(); });
  overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });
}

/* ─── Actions ──────────────────────────────────────────────────────────────── */

async function saveWorkflow(draft, existingId) {
  if (!api) return;
  const workflow = {
    ...(existingId ? { id: existingId } : {}),
    name: draft.name,
    enabled: true,
    trigger: {
      type: draft.trigger,
      value: draft.triggerValue || '',
    },
    ...(draft.trigger === 'hook' ? { hookType: draft.hookType } : {}),
    scope: draft.scope,
    concurrency: draft.concurrency,
    steps: draft.steps,
  };
  const res = await api.save(workflow);
  if (res?.success) {
    await refreshData();
    renderContent();
  }
}

async function triggerWorkflow(id) {
  if (!api) return;
  // Pass the currently opened project path so the runner has a valid cwd
  const pState = projectsState.get();
  const openedProject = (pState.projects || []).find(p => p.id === pState.openedProjectId);
  const projectPath = openedProject?.path || '';
  await api.trigger(id, { projectPath });
  // Live listener will update UI when run starts
}

async function toggleWorkflow(id, enabled) {
  if (!api) return;
  const res = await api.enable(id, enabled);
  if (res?.success) {
    const wf = state.workflows.find(w => w.id === id);
    if (wf) wf.enabled = enabled;
  }
}

async function confirmDeleteWorkflow(id, name) {
  if (!api) return;
  // Simple confirmation via a small modal overlay
  const overlay = document.createElement('div');
  overlay.className = 'wf-confirm-overlay';
  overlay.innerHTML = `
    <div class="wf-confirm-box">
      <div class="wf-confirm-title">${svgTrash(16)} Supprimer le workflow</div>
      <div class="wf-confirm-text">Supprimer <strong>${escapeHtml(name || 'ce workflow')}</strong> ? Cette action est irréversible.</div>
      <div class="wf-confirm-actions">
        <button class="wf-confirm-btn wf-confirm-btn--cancel">Annuler</button>
        <button class="wf-confirm-btn wf-confirm-btn--delete">Supprimer</button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);

  overlay.querySelector('.wf-confirm-btn--cancel').addEventListener('click', () => overlay.remove());
  overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });

  overlay.querySelector('.wf-confirm-btn--delete').addEventListener('click', async () => {
    overlay.remove();
    const res = await api.delete(id);
    if (res?.success) {
      state.workflows = state.workflows.filter(w => w.id !== id);
      renderContent();
    }
  });
}

async function duplicateWorkflow(id) {
  if (!api) return;
  const wf = state.workflows.find(w => w.id === id);
  if (!wf) return;
  const copy = {
    name: wf.name + ' (copie)',
    enabled: false,
    trigger: { ...wf.trigger },
    scope: wf.scope,
    concurrency: wf.concurrency,
    steps: JSON.parse(JSON.stringify(wf.steps || [])),
  };
  const res = await api.save(copy);
  if (res?.success) {
    await refreshData();
    renderContent();
  }
}


module.exports = { init, load };
