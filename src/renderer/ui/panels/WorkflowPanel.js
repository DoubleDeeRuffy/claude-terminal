const { escapeHtml } = require('../../utils');
const WorkflowMarketplace = require('./WorkflowMarketplacePanel');

let ctx = null;

const HOOK_TYPES = [
  { value: 'PreToolUse',        label: 'PreToolUse',        desc: 'Avant chaque outil' },
  { value: 'PostToolUse',       label: 'PostToolUse',       desc: 'Après chaque outil' },
  { value: 'PostToolUseFailure',label: 'PostToolUseFailure',desc: 'Après échec d\'un outil' },
  { value: 'Notification',      label: 'Notification',      desc: 'À chaque notification' },
  { value: 'UserPromptSubmit',  label: 'UserPromptSubmit',  desc: 'Soumission d\'un prompt' },
  { value: 'SessionStart',      label: 'SessionStart',      desc: 'Début de session' },
  { value: 'SessionEnd',        label: 'SessionEnd',        desc: 'Fin de session' },
  { value: 'Stop',              label: 'Stop',              desc: 'À l\'arrêt de Claude' },
  { value: 'SubagentStart',     label: 'SubagentStart',     desc: 'Lancement d\'un sous-agent' },
  { value: 'SubagentStop',      label: 'SubagentStop',      desc: 'Arrêt d\'un sous-agent' },
  { value: 'PreCompact',        label: 'PreCompact',        desc: 'Avant compaction mémoire' },
  { value: 'PermissionRequest', label: 'PermissionRequest', desc: 'Demande de permission' },
  { value: 'Setup',             label: 'Setup',             desc: 'Phase de setup' },
  { value: 'TeammateIdle',      label: 'TeammateIdle',      desc: 'Teammate inactif' },
  { value: 'TaskCompleted',     label: 'TaskCompleted',     desc: 'Tâche terminée' },
  { value: 'ConfigChange',     label: 'ConfigChange',     desc: 'Changement de config' },
  { value: 'WorktreeCreate',   label: 'WorktreeCreate',   desc: 'Création de worktree' },
  { value: 'WorktreeRemove',   label: 'WorktreeRemove',   desc: 'Suppression de worktree' },
];

const STEP_TYPES = [
  { type: 'agent',     label: 'Agent',     color: 'accent',   icon: svgAgent(),  desc: 'Prompt Claude' },
  { type: 'shell',     label: 'Shell',     color: 'info',     icon: svgShell(),  desc: 'Commande bash' },
  { type: 'git',       label: 'Git',       color: 'purple',   icon: svgGit(),    desc: 'Opération git' },
  { type: 'http',      label: 'HTTP',      color: 'cyan',     icon: svgHttp(),   desc: 'Requête API' },
  { type: 'notify',    label: 'Notify',    color: 'warning',  icon: svgNotify(), desc: 'Notification' },
  { type: 'wait',      label: 'Wait',      color: 'muted',    icon: svgWait(),   desc: 'Temporisation' },
  { type: 'condition', label: 'Condition', color: 'success',  icon: svgCond(),   desc: 'Branchement' },
];

const STEP_FIELDS = {
  shell:     [{ key: 'command', label: 'Commande', placeholder: 'npm run build', mono: true }],
  agent:     [
    { key: 'prompt', label: 'Prompt', placeholder: 'Analyse le code et corrige les erreurs...', textarea: true },
    { key: 'model', label: 'Modèle', placeholder: 'claude-sonnet-4-5-20250929 (optionnel)' },
  ],
  git:       [{ key: 'command', label: 'Commande git', placeholder: 'pull / push / commit -m "msg"', mono: true }],
  http:      [
    { key: 'url', label: 'URL', placeholder: 'https://api.example.com/endpoint', mono: true },
    { key: 'method', label: 'Méthode', type: 'select', options: ['GET', 'POST', 'PUT', 'DELETE'] },
  ],
  notify:    [
    { key: 'title', label: 'Titre', placeholder: 'Build terminé' },
    { key: 'message', label: 'Message', placeholder: 'Le build $project est OK', textarea: true },
  ],
  wait:      [{ key: 'duration', label: 'Durée', placeholder: '30s / 5m / 1h' }],
  condition: [{ key: 'expression', label: 'Expression', placeholder: '$ctx.branch == main', mono: true }],
};

const TRIGGER_CONFIG = {
  cron: {
    label: 'Cron',
    desc: 'Planifié à heures fixes',
    icon: svgClock(),
    color: 'info',
    extra: 'cronPicker',
  },
  hook: {
    label: 'Hook Claude',
    desc: 'Réagit aux événements',
    icon: svgHook(),
    color: 'accent',
    extra: 'hookType',
  },
  on_workflow: {
    label: 'Après workflow',
    desc: 'Enchaîné à un autre',
    icon: svgChain(),
    color: 'purple',
    fields: [
      { id: 'triggerValue', label: 'Nom du workflow source', placeholder: 'Daily Code Review', mono: false },
    ],
  },
  manual: {
    label: 'Manuel',
    desc: 'Déclenché à la demande',
    icon: svgPlay(),
    color: 'success',
    fields: [],
  },
};

/* ─── Cron picker ──────────────────────────────────────────────────────────── */

const CRON_MODES = [
  { id: 'interval', label: 'Intervalle' },
  { id: 'daily',    label: 'Quotidien' },
  { id: 'weekly',   label: 'Hebdo' },
  { id: 'monthly',  label: 'Mensuel' },
  { id: 'custom',   label: 'Custom' },
];

const DAYS_OF_WEEK = [
  { value: 1, label: 'Lundi' },    { value: 2, label: 'Mardi' },
  { value: 3, label: 'Mercredi' }, { value: 4, label: 'Jeudi' },
  { value: 5, label: 'Vendredi' }, { value: 6, label: 'Samedi' },
  { value: 0, label: 'Dimanche' },
];

const INTERVAL_OPTIONS = [
  { value: 5,  label: '5 min' },   { value: 10, label: '10 min' },
  { value: 15, label: '15 min' },  { value: 20, label: '20 min' },
  { value: 30, label: '30 min' },  { value: 60, label: '1 heure' },
  { value: 120, label: '2 heures' }, { value: 180, label: '3 heures' },
  { value: 240, label: '4 heures' }, { value: 360, label: '6 heures' },
  { value: 480, label: '8 heures' }, { value: 720, label: '12 heures' },
];

function buildCronFromMode(mode, v) {
  switch (mode) {
    case 'interval': {
      const mins = v.interval || 15;
      if (mins >= 60) return `0 */${mins / 60} * * *`;
      return `*/${mins} * * * *`;
    }
    case 'daily':   return `${v.minute || 0} ${v.hour ?? 8} * * *`;
    case 'weekly':  return `${v.minute || 0} ${v.hour ?? 8} * * ${v.dow ?? 1}`;
    case 'monthly': return `${v.minute || 0} ${v.hour ?? 8} ${v.dom || 1} * *`;
    default: return v.raw || '* * * * *';
  }
}

function parseCronToMode(expr) {
  if (!expr || !expr.trim()) return { mode: 'daily', values: { hour: 8, minute: 0 } };
  const parts = expr.trim().split(/\s+/);
  if (parts.length !== 5) return { mode: 'custom', values: { raw: expr } };

  const [min, hour, dom, mon, dow] = parts;

  // Interval: */N * * * * or 0 */N * * *
  if (min.startsWith('*/') && hour === '*' && dom === '*' && mon === '*' && dow === '*') {
    return { mode: 'interval', values: { interval: parseInt(min.slice(2)) } };
  }
  if (min === '0' && hour.startsWith('*/') && dom === '*' && mon === '*' && dow === '*') {
    return { mode: 'interval', values: { interval: parseInt(hour.slice(2)) * 60 } };
  }

  // Weekly: N N * * N
  if (/^\d+$/.test(min) && /^\d+$/.test(hour) && dom === '*' && mon === '*' && /^\d+$/.test(dow)) {
    return { mode: 'weekly', values: { hour: +hour, minute: +min, dow: +dow } };
  }

  // Monthly: N N N * *
  if (/^\d+$/.test(min) && /^\d+$/.test(hour) && /^\d+$/.test(dom) && mon === '*' && dow === '*') {
    return { mode: 'monthly', values: { hour: +hour, minute: +min, dom: +dom } };
  }

  // Daily: N N * * *
  if (/^\d+$/.test(min) && /^\d+$/.test(hour) && dom === '*' && mon === '*' && dow === '*') {
    return { mode: 'daily', values: { hour: +hour, minute: +min } };
  }

  return { mode: 'custom', values: { raw: expr } };
}

/** Build HTML for a custom dropdown (div-based, no native <select>) */
function wfDropdown(key, options, selectedValue) {
  const sel = options.find(o => String(o.value) === String(selectedValue)) || options[0];
  return `<div class="wf-cdrop" data-cv="${key}">
    <button class="wf-cdrop-btn" type="button">${escapeHtml(sel.label)}<svg width="8" height="5" viewBox="0 0 8 5" fill="none"><path d="M1 1l3 3 3-3" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg></button>
    <div class="wf-cdrop-list">${options.map(o =>
      `<div class="wf-cdrop-item ${String(o.value) === String(selectedValue) ? 'active' : ''}" data-val="${o.value}">${escapeHtml(o.label)}</div>`
    ).join('')}</div>
  </div>`;
}

/** Bind a wfDropdown by data-cv key inside a container. Calls onChange(value) on pick. */
function bindWfDropdown(container, key, onChange) {
  const drop = container.querySelector(`.wf-cdrop[data-cv="${key}"]`);
  if (!drop) return;
  const btn = drop.querySelector('.wf-cdrop-btn');
  const list = drop.querySelector('.wf-cdrop-list');

  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    document.querySelectorAll('.wf-cdrop.open').forEach(d => { if (d !== drop) d.classList.remove('open'); });
    drop.classList.toggle('open');
    if (drop.classList.contains('open')) {
      const active = list.querySelector('.wf-cdrop-item.active');
      if (active) active.scrollIntoView({ block: 'nearest' });
    }
  });

  list.querySelectorAll('.wf-cdrop-item').forEach(item => {
    item.addEventListener('click', (e) => {
      e.stopPropagation();
      drop.classList.remove('open');
      btn.firstChild.textContent = item.textContent;
      list.querySelectorAll('.wf-cdrop-item').forEach(it => it.classList.remove('active'));
      item.classList.add('active');
      onChange(item.dataset.val);
    });
  });

  // Close on outside click — auto-cleanup if element is detached from DOM
  const close = (e) => {
    if (!document.body.contains(drop)) { document.removeEventListener('click', close); return; }
    if (!drop.contains(e.target)) { drop.classList.remove('open'); document.removeEventListener('click', close); }
  };
  document.addEventListener('click', close);
}

/** Generate option arrays for the cron dropdowns */
function cronOpts() {
  return {
    hour: Array.from({ length: 24 }, (_, i) => ({ value: i, label: String(i).padStart(2, '0') })),
    minute: [0, 15, 30, 45].map(m => ({ value: m, label: String(m).padStart(2, '0') })),
    dow: DAYS_OF_WEEK,
    dom: Array.from({ length: 28 }, (_, i) => ({ value: i + 1, label: `${i + 1}` })),
    interval: INTERVAL_OPTIONS,
  };
}

function drawCronPicker(container, draft) {
  const parsed = parseCronToMode(draft.triggerValue);
  let cronMode = parsed.mode;
  let cronValues = { ...parsed.values };
  const opts = cronOpts();
  let _prevCloseAll = null; // Track previous document listener for cleanup

  const render = () => {
    // Clean up previous document-level listener before re-render
    if (_prevCloseAll) {
      document.removeEventListener('click', _prevCloseAll);
      _prevCloseAll = null;
    }
    let phrase = '';
    switch (cronMode) {
      case 'interval':
        phrase = `<span class="wf-cron-label">Toutes les</span>${wfDropdown('interval', opts.interval, cronValues.interval || 15)}`;
        break;
      case 'daily':
        phrase = `<span class="wf-cron-label">Chaque jour à</span>${wfDropdown('hour', opts.hour, cronValues.hour ?? 8)}<span class="wf-cron-label">h</span>${wfDropdown('minute', opts.minute, cronValues.minute || 0)}`;
        break;
      case 'weekly':
        phrase = `<span class="wf-cron-label">Chaque</span>${wfDropdown('dow', opts.dow, cronValues.dow ?? 1)}<span class="wf-cron-label">à</span>${wfDropdown('hour', opts.hour, cronValues.hour ?? 8)}<span class="wf-cron-label">h</span>${wfDropdown('minute', opts.minute, cronValues.minute || 0)}`;
        break;
      case 'monthly':
        phrase = `<span class="wf-cron-label">Le</span>${wfDropdown('dom', opts.dom, cronValues.dom || 1)}<span class="wf-cron-label">de chaque mois à</span>${wfDropdown('hour', opts.hour, cronValues.hour ?? 8)}<span class="wf-cron-label">h</span>${wfDropdown('minute', opts.minute, cronValues.minute || 0)}`;
        break;
      case 'custom':
        phrase = `<input class="wf-input wf-input--mono" id="wf-cron-raw" placeholder="0 8 * * *" value="${escapeHtml(cronValues.raw || draft.triggerValue || '')}">`;
        break;
    }

    const cron = cronMode === 'custom' ? (cronValues.raw || draft.triggerValue || '') : buildCronFromMode(cronMode, cronValues);
    draft.triggerValue = cron;

    container.innerHTML = `
      <div class="wf-cron-modes">
        ${CRON_MODES.map(m => `<button class="wf-cron-mode ${cronMode === m.id ? 'active' : ''}" data-cm="${m.id}">${m.label}</button>`).join('')}
      </div>
      <div class="wf-cron-phrase">${phrase}</div>
      ${cron ? `<div class="wf-cron-preview"><code>${escapeHtml(cron)}</code></div>` : ''}
    `;

    // Bind mode buttons
    container.querySelectorAll('[data-cm]').forEach(btn => {
      btn.addEventListener('click', () => {
        cronMode = btn.dataset.cm;
        cronValues = { hour: cronValues.hour ?? 8, minute: cronValues.minute || 0, dow: cronValues.dow ?? 1, dom: cronValues.dom || 1, interval: cronValues.interval || 15 };
        render();
      });
    });

    // Bind custom dropdowns
    container.querySelectorAll('.wf-cdrop').forEach(drop => {
      const btn = drop.querySelector('.wf-cdrop-btn');
      const list = drop.querySelector('.wf-cdrop-list');
      const key = drop.dataset.cv;

      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        // Close all other open dropdowns first
        container.querySelectorAll('.wf-cdrop.open').forEach(d => { if (d !== drop) d.classList.remove('open'); });
        drop.classList.toggle('open');
        // Scroll active item into view
        if (drop.classList.contains('open')) {
          const activeItem = list.querySelector('.wf-cdrop-item.active');
          if (activeItem) activeItem.scrollIntoView({ block: 'nearest' });
        }
      });

      list.querySelectorAll('.wf-cdrop-item').forEach(item => {
        item.addEventListener('click', (e) => {
          e.stopPropagation();
          const val = isNaN(+item.dataset.val) ? item.dataset.val : +item.dataset.val;
          cronValues[key] = val;
          drop.classList.remove('open');
          // Update button label
          btn.firstChild.textContent = item.textContent;
          // Mark active
          list.querySelectorAll('.wf-cdrop-item').forEach(it => it.classList.remove('active'));
          item.classList.add('active');
          // Update cron
          draft.triggerValue = buildCronFromMode(cronMode, cronValues);
          const prev = container.querySelector('.wf-cron-preview code');
          if (prev) prev.textContent = draft.triggerValue;
        });
      });
    });

    // Close dropdowns on outside click
    const closeAll = (e) => {
      if (!container.contains(e.target)) {
        container.querySelectorAll('.wf-cdrop.open').forEach(d => d.classList.remove('open'));
      }
    };
    _prevCloseAll = closeAll;
    document.addEventListener('click', closeAll);

    // Bind custom input
    const rawInput = container.querySelector('#wf-cron-raw');
    if (rawInput) {
      rawInput.addEventListener('input', () => {
        cronValues.raw = rawInput.value;
        draft.triggerValue = rawInput.value;
        const prev = container.querySelector('.wf-cron-preview code');
        if (prev) prev.textContent = rawInput.value;
      });
    }
  };

  render();
}

const state = {
  workflows: [],
  runs: [],
  activeTab: 'workflows',  // 'workflows' | 'runs' | 'hub'
};

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
    renderContent();
  });

  api.onRunEnd(({ runId, status, duration }) => {
    const run = state.runs.find(r => r.id === runId);
    if (run) {
      run.status = status;
      run.duration = duration;
    }
    renderContent();
  });

  api.onStepUpdate(({ runId, stepId, status, output }) => {
    const run = state.runs.find(r => r.id === runId);
    if (run) {
      const step = run.steps?.find(s => s.id === stepId);
      if (step) step.status = status;
    }
    renderContent();
  });
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

  el.querySelector('#wf-btn-new').addEventListener('click', () => openBuilder());
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
    el.querySelector('#wf-empty-new').addEventListener('click', () => openBuilder());
    return;
  }

  el.innerHTML = `<div class="wf-list">${state.workflows.map(wf => cardHtml(wf)).join('')}</div>`;

  el.querySelectorAll('.wf-card').forEach(card => {
    const id = card.dataset.id;
    card.querySelector('.wf-card-body').addEventListener('click', (e) => {
      // Don't trigger detail when clicking interactive elements
      if (e.target.closest('.wf-card-run') || e.target.closest('.wf-switch') || e.target.closest('.wf-card-toggle')) return;
      openDetail(id);
    });
    card.querySelector('.wf-card-run')?.addEventListener('click', e => { e.stopPropagation(); triggerWorkflow(id); });
    const toggle = card.querySelector('.wf-card-toggle');
    if (toggle) {
      toggle.addEventListener('change', e => { e.stopPropagation(); toggleWorkflow(id, e.target.checked); });
      toggle.closest('.wf-switch')?.addEventListener('click', e => e.stopPropagation());
    }
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
            const info = STEP_TYPES.find(x => x.type === (s.type || '').split('.')[0]) || STEP_TYPES[0];
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

  el.innerHTML = `
    <div class="wf-runs">
      ${state.runs.map(run => {
        const wf = state.workflows.find(w => w.id === run.workflowId);
        const steps = run.steps || [];
        const totalSteps = steps.length;
        const doneSteps = steps.filter(s => s.status === 'success').length;
        const failedSteps = steps.filter(s => s.status === 'failed').length;

        return `
          <div class="wf-run wf-run--${run.status}">
            <div class="wf-run-indicator">
              <div class="wf-run-indicator-icon wf-run-indicator-icon--${run.status}">
                ${run.status === 'success' ? '<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg>' :
                  run.status === 'failed' ? '<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg>' :
                  '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>'}
              </div>
              <div class="wf-run-indicator-line"></div>
            </div>
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
                  const info = STEP_TYPES.find(x => x.type === sType) || STEP_TYPES[0];
                  return `<div class="wf-run-pipe-step wf-run-pipe-step--${s.status}">
                    <span class="wf-run-pipe-icon wf-chip wf-chip--${info.color}">${info.icon}</span>
                    <span class="wf-run-pipe-name">${escapeHtml(s.type || s.name || '')}</span>
                    <span class="wf-run-pipe-dur">${fmtDuration(s.duration)}</span>
                    <span class="wf-run-pipe-status">${s.status === 'success' ? '✓' : s.status === 'failed' ? '✗' : s.status === 'skipped' ? '–' : '…'}</span>
                  </div>${i < run.steps.length - 1 ? '<div class="wf-run-pipe-connector"></div>' : ''}`;
                }).join('')}
              </div>
            </div>
          </div>
        `;
      }).join('')}
    </div>
  `;
}

/* ─── Builder wizard ───────────────────────────────────────────────────────── */

function openBuilder(workflowId = null) {
  const wf = workflowId ? state.workflows.find(w => w.id === workflowId) : null;
  const draft = {
    name: wf?.name || '',
    trigger: wf?.trigger?.type || 'manual',
    triggerValue: wf?.trigger?.value || '',
    hookType: wf?.hookType || 'PostToolUse',
    scope: wf?.scope || 'current',
    concurrency: wf?.concurrency || 'skip',
    steps: wf?.steps ? wf.steps.map(s => ({ ...s })) : [],
    _editingIdx: -1,
  };

  let step = 1;
  const STEPS = ['Déclencheur', 'Étapes', 'Options'];

  const overlay = document.createElement('div');
  overlay.className = 'wf-overlay';

  const rebind = () => {
    /* close */
    overlay.querySelector('.wf-modal-x').addEventListener('click', () => overlay.remove());
    overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });

    /* nav */
    overlay.querySelector('#wf-prev')?.addEventListener('click', () => {
      sync(); step--; draw();
    });
    overlay.querySelector('#wf-next')?.addEventListener('click', () => {
      sync();
      if (step === 1 && !draft.name.trim()) {
        overlay.querySelector('#wf-name')?.focus();
        overlay.querySelector('#wf-name')?.classList.add('wf-input--err');
        return;
      }
      step++; draw();
    });
    overlay.querySelector('#wf-save')?.addEventListener('click', () => {
      sync(); saveWorkflow(draft, workflowId); overlay.remove();
    });

    /* trigger cards */
    overlay.querySelectorAll('[data-trigger]').forEach(card => {
      card.addEventListener('click', () => {
        overlay.querySelectorAll('[data-trigger]').forEach(c => c.classList.remove('active'));
        card.classList.add('active');
        draft.trigger = card.dataset.trigger;
        drawTriggerSub();
      });
    });

    /* hook picker */
    overlay.querySelectorAll('[data-hook]').forEach(btn => {
      btn.addEventListener('click', () => {
        overlay.querySelectorAll('[data-hook]').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        draft.hookType = btn.dataset.hook;
      });
    });

    /* step builder */
    overlay.querySelector('#wf-add-step')?.addEventListener('click', () => {
      const picker = overlay.querySelector('.wf-picker');
      if (picker) picker.classList.toggle('wf-picker--open');
    });
    overlay.querySelector('#wf-picker-close')?.addEventListener('click', () => {
      overlay.querySelector('.wf-picker')?.classList.remove('wf-picker--open');
    });
    overlay.querySelectorAll('[data-pick]').forEach(btn => {
      btn.addEventListener('click', () => {
        syncStepInputs();
        const newIdx = draft.steps.length;
        draft.steps.push({ id: `step_${newIdx + 1}`, type: btn.dataset.pick });
        draft._editingIdx = newIdx;
        overlay.querySelector('.wf-picker')?.classList.remove('wf-picker--open');
        drawStepsList();
        rebindSteps();
        const firstInput = overlay.querySelector('.wf-step-edit .wf-step-edit-input');
        if (firstInput) setTimeout(() => firstInput.focus(), 50);
      });
    });
    rebindSteps();

    /* concurrency */
    overlay.querySelectorAll('[data-conc]').forEach(btn => {
      btn.addEventListener('click', () => {
        overlay.querySelectorAll('[data-conc]').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        draft.concurrency = btn.dataset.conc;
      });
    });

    /* scope dropdown (step 3) */
    bindWfDropdown(overlay, 'scope', (val) => { draft.scope = val; });
  };

  const rebindSteps = () => {
    // Delete buttons
    overlay.querySelectorAll('.wf-step-node-del').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const idx = parseInt(btn.dataset.idx);
        draft.steps.splice(idx, 1);
        if (draft._editingIdx === idx) draft._editingIdx = -1;
        else if (draft._editingIdx > idx) draft._editingIdx--;
        drawStepsList();
        rebindSteps();
      });
    });

    // Click on step row to toggle edit
    overlay.querySelectorAll('.wf-step-node-row').forEach(row => {
      row.addEventListener('click', (e) => {
        if (e.target.closest('.wf-step-node-del')) return;
        const node = row.closest('.wf-step-node');
        const idx = parseInt(node.dataset.stepIdx);
        syncStepInputs();
        draft._editingIdx = draft._editingIdx === idx ? -1 : idx;
        drawStepsList();
        rebindSteps();
        // Focus first input in edit panel
        if (draft._editingIdx >= 0) {
          const firstInput = overlay.querySelector('.wf-step-edit .wf-step-edit-input');
          if (firstInput) setTimeout(() => firstInput.focus(), 50);
        }
      });
    });

    // Bind edit inputs to draft
    overlay.querySelectorAll('.wf-step-edit-input').forEach(input => {
      const handler = () => {
        const idx = parseInt(input.dataset.stepIdx);
        const key = input.dataset.key;
        if (draft.steps[idx]) draft.steps[idx][key] = input.value;
      };
      input.addEventListener('input', handler);
      input.addEventListener('change', handler);
      // Stop click propagation so clicking input doesn't close edit
      input.addEventListener('click', e => e.stopPropagation());
    });
  };

  const syncStepInputs = () => {
    overlay.querySelectorAll('.wf-step-edit-input').forEach(input => {
      const idx = parseInt(input.dataset.stepIdx);
      const key = input.dataset.key;
      if (draft.steps[idx]) draft.steps[idx][key] = input.value;
    });
  };

  const sync = () => {
    const n = overlay.querySelector('#wf-name'); if (n) draft.name = n.value;
    const tv = overlay.querySelector('#wf-trigger-value'); if (tv) draft.triggerValue = tv.value;
    syncStepInputs();
  };

  const drawTriggerSub = () => {
    const sub = overlay.querySelector('#wf-trigger-sub');
    if (!sub) return;
    const cfg = TRIGGER_CONFIG[draft.trigger];

    if (draft.trigger === 'cron') {
      sub.innerHTML = '';
      drawCronPicker(sub, draft);
      return; // drawCronPicker handles its own event binding
    } else if (draft.trigger === 'hook') {
      sub.innerHTML = `
        <div class="wf-sub-label">Type d'événement</div>
        <div class="wf-hook-grid">
          ${HOOK_TYPES.map(h => `
            <button class="wf-hook-opt ${draft.hookType === h.value ? 'active' : ''}" data-hook="${h.value}">
              <span class="wf-hook-name">${h.label}</span>
              <span class="wf-hook-desc">${h.desc}</span>
            </button>
          `).join('')}
        </div>
      `;
    } else if (cfg.fields && cfg.fields.length) {
      sub.innerHTML = cfg.fields.map(f => `
        <div class="wf-sub-label">${f.label}</div>
        <input id="wf-trigger-value" class="wf-input ${f.mono ? 'wf-input--mono' : ''}" placeholder="${f.placeholder}" value="${escapeHtml(draft.triggerValue)}">
      `).join('');
    } else {
      sub.innerHTML = '';
    }

    /* rebind hooks */
    sub.querySelectorAll('[data-hook]').forEach(btn => {
      btn.addEventListener('click', () => {
        sub.querySelectorAll('[data-hook]').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        draft.hookType = btn.dataset.hook;
      });
    });
  };

  const buildStepEditHtml = (s, idx) => {
    const baseType = (s.type || '').split('.')[0];
    const fields = STEP_FIELDS[baseType];
    if (!fields || !fields.length) return '<div class="wf-step-edit-empty">Aucune configuration requise</div>';
    return fields.map(f => {
      const val = s[f.key] || '';
      if (f.type === 'select') {
        return `
          <div class="wf-step-edit-field">
            <label class="wf-step-edit-label">${f.label}</label>
            <select class="wf-input wf-step-edit-input" data-step-idx="${idx}" data-key="${f.key}">
              ${f.options.map(o => `<option value="${o}" ${val === o ? 'selected' : ''}>${o}</option>`).join('')}
            </select>
          </div>`;
      }
      if (f.textarea) {
        return `
          <div class="wf-step-edit-field">
            <label class="wf-step-edit-label">${f.label}</label>
            <textarea class="wf-input wf-step-edit-input ${f.mono ? 'wf-input--mono' : ''}" data-step-idx="${idx}" data-key="${f.key}" placeholder="${f.placeholder || ''}" rows="3">${escapeHtml(val)}</textarea>
          </div>`;
      }
      return `
        <div class="wf-step-edit-field">
          <label class="wf-step-edit-label">${f.label}</label>
          <input class="wf-input wf-step-edit-input ${f.mono ? 'wf-input--mono' : ''}" data-step-idx="${idx}" data-key="${f.key}" placeholder="${f.placeholder || ''}" value="${escapeHtml(val)}">
        </div>`;
    }).join('');
  };

  const drawStepsList = () => {
    const list = overlay.querySelector('#wf-steps-list');
    if (!list) return;
    const countEl = overlay.querySelector('#wf-step-count');
    if (countEl) countEl.textContent = `${draft.steps.length} étape${draft.steps.length !== 1 ? 's' : ''}`;
    if (!draft.steps.length) {
      list.innerHTML = `<div class="wf-steps-empty">${svgEmpty()} <span>Aucun step — ajoutez-en ci-dessous</span></div>`;
      return;
    }
    list.innerHTML = draft.steps.map((s, i) => {
      const info = STEP_TYPES.find(x => x.type === s.type.split('.')[0]) || STEP_TYPES[0];
      const isEditing = draft._editingIdx === i;
      const hasConfig = s.command || s.prompt || s.url || s.title || s.duration || s.expression;
      const summary = s.command || s.prompt || s.url || s.title || s.expression || '';
      const shortSummary = summary.length > 50 ? summary.slice(0, 50) + '…' : summary;
      return `
        ${i > 0 ? '<div class="wf-pipe-connector"><svg width="2" height="20" viewBox="0 0 2 20"><line x1="1" y1="0" x2="1" y2="20" stroke="rgba(255,255,255,.08)" stroke-width="2" stroke-dasharray="3 3"/></svg></div>' : ''}
        <div class="wf-step-node ${isEditing ? 'editing' : ''}" style="--step-delay: ${i * 40}ms" data-color="${info.color}" data-step-idx="${i}">
          <div class="wf-step-node-row">
            <div class="wf-step-node-idx"><span>${i + 1}</span></div>
            <span class="wf-step-node-chip wf-chip wf-chip--${info.color}">${info.icon}</span>
            <div class="wf-step-node-body">
              <span class="wf-step-node-type">${escapeHtml(info.label)}</span>
              <span class="wf-step-node-id">${escapeHtml(s.id)}</span>
              ${!isEditing && shortSummary ? `<span class="wf-step-node-summary">${escapeHtml(shortSummary)}</span>` : ''}
            </div>
            <button class="wf-step-node-del" data-idx="${i}">${svgX(11)}</button>
          </div>
          ${isEditing ? `<div class="wf-step-edit">${buildStepEditHtml(s, i)}</div>` : ''}
        </div>
      `;
    }).join('');
  };

  const draw = () => {
    overlay.innerHTML = `
      <div class="wf-modal">
        <div class="wf-modal-hd">
          <div class="wf-modal-hd-left">
            <span class="wf-modal-title">${wf ? escapeHtml(wf.name) : 'Nouveau workflow'}</span>
          </div>
          <div class="wf-wizard-nav">
            ${STEPS.map((label, i) => {
              const n = i + 1;
              const cls = n === step ? 'cur' : n < step ? 'done' : '';
              return `<span class="wf-wz-node ${cls}"><span class="wf-wz-n">${n < step ? '✓' : n}</span><span class="wf-wz-label">${label}</span></span>${i < STEPS.length - 1 ? '<span class="wf-wz-track"><span class="wf-wz-fill" style="width:${step > n ? 100 : 0}%"></span></span>' : ''}`;
            }).join('')}
          </div>
          <button class="wf-modal-x">${svgX(12)}</button>
        </div>

        <div class="wf-modal-bd">
          ${step === 1 ? `
            <div class="wf-wstep">
              <div class="wf-field">
                <label class="wf-field-lbl">Nom du workflow</label>
                <input id="wf-name" class="wf-input wf-input--lg" placeholder="ex: Daily Code Review" value="${escapeHtml(draft.name)}" autofocus>
              </div>

              <div class="wf-field">
                <label class="wf-field-lbl">Déclencheur</label>
                <div class="wf-trigger-grid">
                  ${Object.entries(TRIGGER_CONFIG).map(([val, cfg]) => `
                    <button class="wf-trig-card wf-trig-card--${cfg.color} ${draft.trigger === val ? 'active' : ''}" data-trigger="${val}">
                      <span class="wf-trig-icon">${cfg.icon}</span>
                      <span class="wf-trig-label">${cfg.label}</span>
                      <span class="wf-trig-desc">${cfg.desc}</span>
                    </button>
                  `).join('')}
                </div>
              </div>

              <div id="wf-trigger-sub" class="wf-trigger-sub"></div>
            </div>
          ` : ''}

          ${step === 2 ? `
            <div class="wf-wstep wf-wstep--pipeline">
              <div class="wf-pipeline-zone">
                <div class="wf-pipeline-hd">
                  <label class="wf-field-lbl">Pipeline</label>
                  <span class="wf-pipeline-count" id="wf-step-count">0 étapes</span>
                </div>
                <div id="wf-steps-list" class="wf-steps-list"></div>
                <button id="wf-add-step" class="wf-add-step-btn">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M12 5v14M5 12h14"/></svg>
                  Ajouter une étape
                </button>
              </div>
              <div class="wf-picker">
                <div class="wf-picker-hd">
                  <span class="wf-picker-title">Choisir un type</span>
                  <button class="wf-picker-close" id="wf-picker-close">${svgX(14)}</button>
                </div>
                <div class="wf-picker-grid">
                  ${STEP_TYPES.map(s => `
                    <button class="wf-pick-card" data-pick="${s.type}" data-color="${s.color}">
                      <span class="wf-pick-card-icon wf-chip wf-chip--${s.color}">${s.icon}</span>
                      <div class="wf-pick-card-txt">
                        <span class="wf-pick-card-label">${s.label}</span>
                        <span class="wf-pick-card-desc">${s.desc}</span>
                      </div>
                    </button>
                  `).join('')}
                </div>
              </div>
            </div>
          ` : ''}

          ${step === 3 ? `
            <div class="wf-wstep">
              <div class="wf-field">
                <label class="wf-field-lbl">Scope</label>
                ${wfDropdown('scope', [
                  { value: 'current', label: 'Projet courant' },
                  { value: 'specific', label: 'Projet spécifique' },
                  { value: 'all', label: 'Tous les projets' },
                ], draft.scope)}
              </div>

              <div class="wf-field">
                <label class="wf-field-lbl">Si relancé pendant l'exécution</label>
                <div class="wf-conc-row">
                  ${[['skip','Ignorer','Ne relance pas'],['queue','Attendre','File d\'attente'],['parallel','Parallèle','Lance en même temps']].map(([v,l,d]) => `
                    <button class="wf-conc-btn ${draft.concurrency === v ? 'active' : ''}" data-conc="${v}">
                      <span class="wf-conc-l">${l}</span>
                      <span class="wf-conc-d">${d}</span>
                    </button>
                  `).join('')}
                </div>
              </div>

              <div class="wf-recap">
                <div class="wf-recap-title">Récapitulatif</div>
                <div class="wf-recap-row"><span>Nom</span><strong>${escapeHtml(draft.name || '—')}</strong></div>
                <div class="wf-recap-row"><span>Trigger</span><strong>${TRIGGER_CONFIG[draft.trigger]?.label || '—'}</strong></div>
                <div class="wf-recap-row"><span>Steps</span><strong>${draft.steps.length} étape${draft.steps.length !== 1 ? 's' : ''}</strong></div>
              </div>
            </div>
          ` : ''}
        </div>

        <div class="wf-modal-ft">
          ${step > 1
            ? `<button class="wf-btn-ghost" id="wf-prev">← Retour</button>`
            : `<button class="wf-btn-ghost" id="wf-prev">Annuler</button>`}
          <span class="wf-step-counter">${step} / ${STEPS.length}</span>
          ${step < STEPS.length
            ? `<button class="wf-btn-primary" id="wf-next">Suivant <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M5 12h14M12 5l7 7-7 7"/></svg></button>`
            : `<button class="wf-btn-primary wf-btn-save" id="wf-save"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/></svg> Enregistrer</button>`}
        </div>
      </div>
    `;

    if (step === 1) drawTriggerSub();
    if (step === 2) drawStepsList();
    rebind();
  };

  document.body.appendChild(overlay);
  draw();
}

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
              const info = STEP_TYPES.find(x => x.type === (s.type || '').split('.')[0]) || STEP_TYPES[0];
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
  overlay.querySelector('#wf-edit').addEventListener('click', () => { overlay.remove(); openBuilder(id); });
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
  await api.trigger(id);
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

/* ─── Helpers ───────────────────────────────────────────────────────────────── */

/** Format ISO date to relative/short string */
function fmtTime(iso) {
  if (!iso) return '—';
  try {
    const d = new Date(iso);
    const now = new Date();
    const diffMs = now - d;
    const diffMin = Math.floor(diffMs / 60000);
    if (diffMin < 1) return "À l'instant";
    if (diffMin < 60) return `Il y a ${diffMin} min`;
    const diffH = Math.floor(diffMin / 60);
    if (diffH < 24) return `Il y a ${diffH}h`;
    const diffD = Math.floor(diffH / 24);
    if (diffD === 1) return `Hier ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
    if (diffD < 7) return `Il y a ${diffD}j`;
    return d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
  } catch { return String(iso); }
}

/** Format duration (seconds number or string) */
function fmtDuration(val) {
  if (val == null) return '…';
  const s = typeof val === 'number' ? val : parseInt(val);
  if (isNaN(s)) return String(val);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  return `${m}m ${s % 60}s`;
}

function statusDot(s) {
  return `<span class="wf-dot wf-dot--${s}"></span>`;
}

function statusLabel(s) {
  return { success: 'Succès', failed: 'Échec', running: 'En cours', pending: 'En attente' }[s] || s;
}

/* ─── SVG icons ─────────────────────────────────────────────────────────────── */

function svgWorkflow(s = 14) { return `<svg width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="3" width="6" height="6" rx="1"/><rect x="16" y="3" width="6" height="6" rx="1"/><rect x="9" y="15" width="6" height="6" rx="1"/><path d="M5 9v3a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V9"/><path d="M12 12v3"/></svg>`; }
function svgAgent() { return `<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8" r="4"/><path d="M6 20v-2a6 6 0 0 1 12 0v2"/></svg>`; }
function svgShell() { return `<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="4 17 10 11 4 5"/><line x1="12" y1="19" x2="20" y2="19"/></svg>`; }
function svgGit() { return `<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="18" cy="18" r="3"/><circle cx="6" cy="6" r="3"/><path d="M6 21V9a9 9 0 0 0 9 9"/></svg>`; }
function svgHttp() { return `<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>`; }
function svgNotify() { return `<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>`; }
function svgWait() { return `<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>`; }
function svgCond() { return `<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>`; }
function svgClock(s = 10) { return `<svg width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>`; }
function svgTimer() { return `<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>`; }
function svgHook(s = 13) { return `<svg width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>`; }
function svgChain(s = 13) { return `<svg width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>`; }
function svgPlay(s = 10) { return `<svg width="${s}" height="${s}" viewBox="0 0 24 24" fill="currentColor" stroke="none"><polygon points="5 3 19 12 5 21 5 3"/></svg>`; }
function svgX(s = 12) { return `<svg width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M18 6L6 18M6 6l12 12"/></svg>`; }
function svgScope() { return `<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>`; }
function svgConc() { return `<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3M3 16v3a2 2 0 0 0 2 2h3m8 0h3a2 2 0 0 0 2-2v-3"/></svg>`; }
function svgEmpty() { return `<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="2" y="3" width="6" height="6" rx="1"/><rect x="16" y="3" width="6" height="6" rx="1"/><rect x="9" y="15" width="6" height="6" rx="1"/><path d="M5 9v3a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V9"/><path d="M12 12v3"/></svg>`; }
function svgRuns() { return `<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M12 20V10"/><path d="M18 20V4"/><path d="M6 20v-4"/></svg>`; }

module.exports = { init, load };
