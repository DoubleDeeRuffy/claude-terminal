const { escapeHtml } = require('../../utils');
const WorkflowMarketplace = require('./WorkflowMarketplacePanel');
const { getAgents } = require('../../services/AgentService');
const { getSkills } = require('../../services/SkillService');
const { getGraphService, resetGraphService } = require('../../services/WorkflowGraphService');

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
  { type: 'trigger',   label: 'Trigger',   color: 'success',  icon: svgPlay(11), desc: 'Déclencheur du workflow' },
  { type: 'claude',    label: 'Claude',    color: 'accent',   icon: svgClaude(), desc: 'Prompt, Agent ou Skill' },
  { type: 'shell',     label: 'Shell',     color: 'info',     icon: svgShell(),  desc: 'Commande bash' },
  { type: 'git',       label: 'Git',       color: 'purple',   icon: svgGit(),    desc: 'Opération git' },
  { type: 'http',      label: 'HTTP',      color: 'cyan',     icon: svgHttp(),   desc: 'Requête API' },
  { type: 'notify',    label: 'Notify',    color: 'warning',  icon: svgNotify(), desc: 'Notification' },
  { type: 'wait',      label: 'Wait',      color: 'muted',    icon: svgWait(),   desc: 'Temporisation' },
  { type: 'condition', label: 'Condition', color: 'success',  icon: svgCond(),   desc: 'Branchement' },
];

const GIT_ACTIONS = [
  { value: 'pull',     label: 'Pull',     desc: 'Récupérer les changements distants' },
  { value: 'push',     label: 'Push',     desc: 'Pousser les commits locaux' },
  { value: 'commit',   label: 'Commit',   desc: 'Créer un commit', extra: [{ key: 'message', label: 'Message de commit', placeholder: 'feat: add new feature', mono: true }] },
  { value: 'checkout', label: 'Checkout', desc: 'Changer de branche', extra: [{ key: 'branch', label: 'Branche', placeholder: 'main / develop / feature/...', mono: true }] },
  { value: 'merge',    label: 'Merge',    desc: 'Fusionner une branche', extra: [{ key: 'branch', label: 'Branche source', placeholder: 'feature/my-branch', mono: true }] },
  { value: 'stash',    label: 'Stash',    desc: 'Mettre de côté les changements' },
  { value: 'stash-pop',label: 'Stash Pop',desc: 'Restaurer les changements mis de côté' },
  { value: 'reset',    label: 'Reset',    desc: 'Annuler les changements non commités' },
];

const WAIT_UNITS = [
  { value: 's', label: 'Secondes' },
  { value: 'm', label: 'Minutes' },
  { value: 'h', label: 'Heures' },
];

const CONDITION_VARS = [
  { value: '$ctx.branch',      label: 'Branche actuelle' },
  { value: '$ctx.exitCode',    label: 'Code de sortie' },
  { value: '$ctx.project',     label: 'Nom du projet' },
  { value: '$ctx.prevStatus',  label: 'Statut step précédent' },
  { value: '$env.',            label: 'Variable d\'env', extra: [{ key: 'envVar', label: 'Nom', placeholder: 'NODE_ENV', mono: true }] },
];

const CONDITION_OPS = [
  { value: '==', label: '==' },
  { value: '!=', label: '!=' },
  { value: 'contains', label: 'contient' },
  { value: 'starts_with', label: 'commence par' },
  { value: 'matches', label: 'regex' },
];

const STEP_FIELDS = {
  shell: [
    { key: 'command', label: 'Commande', placeholder: 'npm run build', mono: true },
  ],
  claude: [
    { key: 'mode', label: 'Mode', type: 'claude-mode-tabs' },
    { key: 'prompt', label: 'Prompt', type: 'variable-textarea', showIf: (s) => !s.mode || s.mode === 'prompt' },
    { key: 'agentId', label: 'Agent', type: 'agent-picker', showIf: (s) => s.mode === 'agent' },
    { key: 'skillId', label: 'Skill', type: 'skill-picker', showIf: (s) => s.mode === 'skill' },
    { key: 'prompt', label: 'Instructions additionnelles', placeholder: 'Contexte supplémentaire (optionnel)', textarea: true, showIf: (s) => s.mode === 'agent' || s.mode === 'skill' },
    { key: 'model', label: 'Modèle', type: 'model-select' },
    { key: 'effort', label: 'Effort', type: 'effort-select' },
    { key: 'outputSchema', label: 'Sortie structurée', type: 'structured-output' },
  ],
  agent: 'claude',
  git: [
    { key: 'action', label: 'Action', type: 'action-select', actions: GIT_ACTIONS },
  ],
  http: [
    { key: 'method', label: 'Méthode', type: 'select', options: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'], default: 'GET' },
    { key: 'url', label: 'URL', placeholder: 'https://api.example.com/endpoint', mono: true },
    { key: 'headers', label: 'Headers', placeholder: 'Content-Type: application/json', textarea: true, mono: true, showIf: (s) => ['POST', 'PUT', 'PATCH'].includes(s.method) },
    { key: 'body', label: 'Body', placeholder: '{ "key": "value" }', textarea: true, mono: true, showIf: (s) => ['POST', 'PUT', 'PATCH'].includes(s.method) },
  ],
  notify: [
    { key: 'title', label: 'Titre', placeholder: 'Build terminé' },
    { key: 'message', label: 'Message', placeholder: 'Le build $project est OK', textarea: true },
  ],
  wait: [
    { key: 'duration', label: 'Durée', type: 'duration-picker' },
  ],
  condition: [
    { key: 'condition', label: 'Condition', type: 'condition-builder' },
  ],
};

// Resolve step type with backward compat (agent → claude)
const STEP_TYPE_ALIASES = { agent: 'claude' };
const findStepType = (type) => {
  const resolved = STEP_TYPE_ALIASES[type] || type;
  return STEP_TYPES.find(x => x.type === resolved) || STEP_TYPES[0];
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

  el.innerHTML = `<div class="wf-list">${state.workflows.map(wf => cardHtml(wf)).join('')}</div>`;

  el.querySelectorAll('.wf-card').forEach(card => {
    const id = card.dataset.id;
    card.querySelector('.wf-card-body').addEventListener('click', (e) => {
      // Don't trigger detail when clicking interactive elements
      if (e.target.closest('.wf-card-run') || e.target.closest('.wf-card-edit') || e.target.closest('.wf-switch') || e.target.closest('.wf-card-toggle')) return;
      openDetail(id);
    });
    card.querySelector('.wf-card-run')?.addEventListener('click', e => { e.stopPropagation(); triggerWorkflow(id); });
    card.querySelector('.wf-card-edit')?.addEventListener('click', e => { e.stopPropagation(); openEditor(id); });
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
                  const info = findStepType(sType);
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

/* ─── Node Graph Editor ─────────────────────────────────────────────────── */

function openEditor(workflowId = null) {
  const wf = workflowId ? state.workflows.find(w => w.id === workflowId) : null;
  const editorDraft = {
    name: wf?.name || '',
    scope: wf?.scope || 'current',
    concurrency: wf?.concurrency || 'skip',
    dirty: false,
  };

  // ── Render editor into the panel ──
  const panel = document.getElementById('workflow-panel');
  if (!panel) return;

  const graphService = getGraphService();

  // Store previous panel content for restore
  const prevContent = panel.innerHTML;
  const nodeTypes = STEP_TYPES.filter(st => st.type !== 'trigger');

  // ── Build editor HTML ──
  panel.innerHTML = `
    <div class="wf-editor">
      <div class="wf-editor-toolbar">
        <button class="wf-editor-back" id="wf-ed-back"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M19 12H5"/><path d="M12 19l-7-7 7-7"/></svg> Retour</button>
        <div class="wf-editor-toolbar-sep"></div>
        <input class="wf-editor-name wf-input" id="wf-ed-name" value="${escapeHtml(editorDraft.name)}" placeholder="Nom du workflow…" />
        <span class="wf-editor-dirty" id="wf-ed-dirty" style="display:none" title="Modifications non sauvegardées"></span>
        <div class="wf-editor-toolbar-sep"></div>
        <div class="wf-editor-zoom">
          <button id="wf-ed-zoom-out" title="Zoom out">−</button>
          <span id="wf-ed-zoom-label">100%</span>
          <button id="wf-ed-zoom-in" title="Zoom in">+</button>
          <button id="wf-ed-zoom-reset" title="Reset to 100%">1:1</button>
          <button id="wf-ed-zoom-fit" title="Fit all nodes">Fit</button>
        </div>
        <div class="wf-editor-toolbar-sep"></div>
        <button class="wf-editor-btn wf-editor-btn--run" id="wf-ed-run">${svgPlay(10)} Run</button>
        <button class="wf-editor-btn wf-editor-btn--primary" id="wf-ed-save"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg> Save</button>
      </div>
      <div class="wf-editor-body">
        <div class="wf-editor-palette" id="wf-ed-palette">
          <div class="wf-palette-title">Nodes</div>
          ${nodeTypes.map(st => `
            <div class="wf-palette-item" data-node-type="workflow/${st.type}" data-color="${st.color}" title="Cliquer pour ajouter ${st.label}">
              <span class="wf-palette-icon wf-chip wf-chip--${st.color}">${st.icon}</span>
              <div class="wf-palette-text">
                <span class="wf-palette-label">${st.label}</span>
                <span class="wf-palette-desc">${st.desc}</span>
              </div>
              <svg class="wf-palette-add" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M12 5v14M5 12h14"/></svg>
            </div>
          `).join('')}
          <div class="wf-palette-hint">Cliquer pour ajouter au canvas</div>
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
        <span class="wf-sb-sep"></span>
        <span class="wf-sb-section wf-sb-name" id="wf-ed-sb-name">${escapeHtml(editorDraft.name) || 'Sans titre'}</span>
        <span class="wf-sb-section wf-sb-dirty" id="wf-ed-sb-dirty" style="display:none">Modifié</span>
        <span class="wf-sb-spacer"></span>
        <span class="wf-sb-section" id="wf-ed-zoom-pct">100%</span>
      </div>
    </div>
  `;

  // ── Init LiteGraph canvas ──
  const canvasWrap = panel.querySelector('#wf-ed-canvas-wrap');
  const canvasEl = panel.querySelector('#wf-litegraph-canvas');
  canvasEl.width = canvasWrap.offsetWidth;
  canvasEl.height = canvasWrap.offsetHeight;

  graphService.init(canvasEl);

  // Load or create empty
  if (wf) {
    graphService.loadFromWorkflow(wf);
  } else {
    graphService.createEmpty();
  }

  // ── Status bar updates ──
  const updateStatusBar = () => {
    const count = graphService.getNodeCount();
    const countEl = panel.querySelector('#wf-ed-nodecount');
    const zoomEl = panel.querySelector('#wf-ed-zoom-pct');
    const zoomLabel = panel.querySelector('#wf-ed-zoom-label');
    const sbName = panel.querySelector('#wf-ed-sb-name');
    const sbDirty = panel.querySelector('#wf-ed-sb-dirty');
    const toolbarDirty = panel.querySelector('#wf-ed-dirty');
    if (countEl) countEl.innerHTML = `<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/></svg> ${count} node${count !== 1 ? 's' : ''}`;
    const pct = Math.round(graphService.getZoom() * 100);
    if (zoomEl) zoomEl.textContent = `${pct}%`;
    if (zoomLabel) zoomLabel.textContent = `${pct}%`;
    if (sbName) sbName.textContent = editorDraft.name || 'Sans titre';
    if (sbDirty) sbDirty.style.display = editorDraft.dirty ? '' : 'none';
    if (toolbarDirty) toolbarDirty.style.display = editorDraft.dirty ? '' : 'none';
  };
  updateStatusBar();

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
            <label class="wf-step-edit-label">Scope</label>
            <select class="wf-step-edit-input wf-props-input" data-prop="scope">
              <option value="current" ${editorDraft.scope === 'current' ? 'selected' : ''}>Projet courant</option>
              <option value="specific" ${editorDraft.scope === 'specific' ? 'selected' : ''}>Projet spécifique</option>
              <option value="all" ${editorDraft.scope === 'all' ? 'selected' : ''}>Tous les projets</option>
            </select>
          </div>
          <div class="wf-step-edit-field">
            <label class="wf-step-edit-label">Concurrence</label>
            <select class="wf-step-edit-input wf-props-input" data-prop="concurrency">
              <option value="skip" ${editorDraft.concurrency === 'skip' ? 'selected' : ''}>Skip (ne pas relancer si en cours)</option>
              <option value="queue" ${editorDraft.concurrency === 'queue' ? 'selected' : ''}>Queue (file d'attente)</option>
              <option value="parallel" ${editorDraft.concurrency === 'parallel' ? 'selected' : ''}>Parallel</option>
            </select>
          </div>
        </div>
      `;
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
          <label class="wf-step-edit-label">Type de déclencheur</label>
          <select class="wf-step-edit-input wf-node-prop" data-key="triggerType">
            <option value="manual" ${props.triggerType === 'manual' ? 'selected' : ''}>Manuel</option>
            <option value="cron" ${props.triggerType === 'cron' ? 'selected' : ''}>Cron (planifié)</option>
            <option value="hook" ${props.triggerType === 'hook' ? 'selected' : ''}>Hook Claude</option>
            <option value="on_workflow" ${props.triggerType === 'on_workflow' ? 'selected' : ''}>Après workflow</option>
          </select>
        </div>
        ${props.triggerType === 'cron' ? `
        <div class="wf-step-edit-field">
          <label class="wf-step-edit-label">Expression cron</label>
          <input class="wf-step-edit-input wf-node-prop" data-key="triggerValue" value="${escapeHtml(props.triggerValue || '')}" placeholder="*/5 * * * *" style="font-family:monospace" />
        </div>` : ''}
        ${props.triggerType === 'hook' ? `
        <div class="wf-step-edit-field">
          <label class="wf-step-edit-label">Type de hook</label>
          <select class="wf-step-edit-input wf-node-prop" data-key="hookType">
            ${HOOK_TYPES.map(h => `<option value="${h.value}" ${props.hookType === h.value ? 'selected' : ''}>${h.label}</option>`).join('')}
          </select>
        </div>` : ''}
        ${props.triggerType === 'on_workflow' ? `
        <div class="wf-step-edit-field">
          <label class="wf-step-edit-label">Workflow source</label>
          <input class="wf-step-edit-input wf-node-prop" data-key="triggerValue" value="${escapeHtml(props.triggerValue || '')}" placeholder="Nom du workflow" />
        </div>` : ''}
      `;
    }
    // Claude node properties
    else if (nodeType === 'claude') {
      const mode = props.mode || 'prompt';
      const agents = getAgents() || [];
      const skills = (getSkills() || []).filter(s => s.userInvocable !== false);
      fieldsHtml = `
        <div class="wf-step-edit-field">
          <label class="wf-step-edit-label">Mode</label>
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
          <label class="wf-step-edit-label">Prompt</label>
          <textarea class="wf-step-edit-input wf-node-prop" data-key="prompt" rows="4" placeholder="Votre prompt ici…">${escapeHtml(props.prompt || '')}</textarea>
        </div>` : ''}
        ${mode === 'agent' ? `
        <div class="wf-step-edit-field">
          <label class="wf-step-edit-label">Agent</label>
          <div class="wf-agent-grid">
            ${agents.length ? agents.map(a => `
              <div class="wf-agent-card ${props.agentId === a.id ? 'active' : ''}" data-agent-id="${a.id}">
                <span class="wf-agent-card-name">${escapeHtml(a.name)}</span>
                <span class="wf-agent-card-desc">${escapeHtml(a.description || '')}</span>
              </div>
            `).join('') : '<span class="wf-agent-empty">Aucun agent détecté</span>'}
          </div>
        </div>
        <div class="wf-step-edit-field">
          <label class="wf-step-edit-label">Instructions additionnelles</label>
          <textarea class="wf-step-edit-input wf-node-prop" data-key="prompt" rows="2" placeholder="Instructions optionnelles…">${escapeHtml(props.prompt || '')}</textarea>
        </div>` : ''}
        ${mode === 'skill' ? `
        <div class="wf-step-edit-field">
          <label class="wf-step-edit-label">Skill</label>
          <div class="wf-agent-grid">
            ${skills.length ? skills.map(s => `
              <div class="wf-agent-card ${props.skillId === s.id ? 'active' : ''}" data-skill-id="${s.id}">
                <span class="wf-agent-card-name">${escapeHtml(s.name)}</span>
                <span class="wf-agent-card-desc">${escapeHtml(s.description || '')}</span>
              </div>
            `).join('') : '<span class="wf-agent-empty">Aucun skill détecté</span>'}
          </div>
        </div>
        <div class="wf-step-edit-field">
          <label class="wf-step-edit-label">Instructions additionnelles</label>
          <textarea class="wf-step-edit-input wf-node-prop" data-key="prompt" rows="2" placeholder="Instructions optionnelles…">${escapeHtml(props.prompt || '')}</textarea>
        </div>` : ''}
        <div class="wf-step-edit-field">
          <label class="wf-step-edit-label">Modèle</label>
          <select class="wf-step-edit-input wf-node-prop" data-key="model">
            <option value="" ${!props.model ? 'selected' : ''}>Par défaut</option>
            <option value="sonnet" ${props.model === 'sonnet' ? 'selected' : ''}>Sonnet</option>
            <option value="opus" ${props.model === 'opus' ? 'selected' : ''}>Opus</option>
            <option value="haiku" ${props.model === 'haiku' ? 'selected' : ''}>Haiku</option>
          </select>
        </div>
        <div class="wf-step-edit-field">
          <label class="wf-step-edit-label">Effort</label>
          <select class="wf-step-edit-input wf-node-prop" data-key="effort">
            <option value="" ${!props.effort ? 'selected' : ''}>Par défaut</option>
            <option value="low" ${props.effort === 'low' ? 'selected' : ''}>Low</option>
            <option value="medium" ${props.effort === 'medium' ? 'selected' : ''}>Medium</option>
            <option value="high" ${props.effort === 'high' ? 'selected' : ''}>High</option>
          </select>
        </div>
      `;
    }
    // Shell node
    else if (nodeType === 'shell') {
      fieldsHtml = `
        <div class="wf-step-edit-field">
          <label class="wf-step-edit-label">Commande</label>
          <textarea class="wf-step-edit-input wf-node-prop" data-key="command" rows="3" style="font-family:monospace" placeholder="npm test">${escapeHtml(props.command || '')}</textarea>
        </div>
      `;
    }
    // Git node
    else if (nodeType === 'git') {
      fieldsHtml = `
        <div class="wf-step-edit-field">
          <label class="wf-step-edit-label">Action</label>
          <select class="wf-step-edit-input wf-node-prop" data-key="action">
            ${GIT_ACTIONS.map(a => `<option value="${a.value}" ${props.action === a.value ? 'selected' : ''}>${a.label}</option>`).join('')}
          </select>
        </div>
        ${props.action === 'commit' ? `
        <div class="wf-step-edit-field">
          <label class="wf-step-edit-label">Message</label>
          <input class="wf-step-edit-input wf-node-prop" data-key="message" value="${escapeHtml(props.message || '')}" placeholder="Commit message" />
        </div>` : ''}
        ${props.action === 'checkout' || props.action === 'merge' ? `
        <div class="wf-step-edit-field">
          <label class="wf-step-edit-label">Branche</label>
          <input class="wf-step-edit-input wf-node-prop" data-key="branch" value="${escapeHtml(props.branch || '')}" placeholder="main" />
        </div>` : ''}
      `;
    }
    // HTTP node
    else if (nodeType === 'http') {
      fieldsHtml = `
        <div class="wf-step-edit-field">
          <label class="wf-step-edit-label">Méthode</label>
          <select class="wf-step-edit-input wf-node-prop" data-key="method">
            ${['GET','POST','PUT','PATCH','DELETE'].map(m => `<option value="${m}" ${props.method === m ? 'selected' : ''}>${m}</option>`).join('')}
          </select>
        </div>
        <div class="wf-step-edit-field">
          <label class="wf-step-edit-label">URL</label>
          <input class="wf-step-edit-input wf-node-prop" data-key="url" value="${escapeHtml(props.url || '')}" placeholder="https://api.example.com" style="font-family:monospace" />
        </div>
        ${['POST','PUT','PATCH'].includes(props.method) ? `
        <div class="wf-step-edit-field">
          <label class="wf-step-edit-label">Headers (JSON)</label>
          <textarea class="wf-step-edit-input wf-node-prop" data-key="headers" rows="2" style="font-family:monospace" placeholder='{"Content-Type":"application/json"}'>${escapeHtml(props.headers || '')}</textarea>
        </div>
        <div class="wf-step-edit-field">
          <label class="wf-step-edit-label">Body</label>
          <textarea class="wf-step-edit-input wf-node-prop" data-key="body" rows="3" style="font-family:monospace">${escapeHtml(props.body || '')}</textarea>
        </div>` : ''}
      `;
    }
    // Notify node
    else if (nodeType === 'notify') {
      fieldsHtml = `
        <div class="wf-step-edit-field">
          <label class="wf-step-edit-label">Titre</label>
          <input class="wf-step-edit-input wf-node-prop" data-key="title" value="${escapeHtml(props.title || '')}" placeholder="Notification" />
        </div>
        <div class="wf-step-edit-field">
          <label class="wf-step-edit-label">Message</label>
          <textarea class="wf-step-edit-input wf-node-prop" data-key="message" rows="3">${escapeHtml(props.message || '')}</textarea>
        </div>
      `;
    }
    // Wait node
    else if (nodeType === 'wait') {
      fieldsHtml = `
        <div class="wf-step-edit-field">
          <label class="wf-step-edit-label">Durée</label>
          <input class="wf-step-edit-input wf-node-prop" data-key="duration" value="${escapeHtml(props.duration || '5s')}" placeholder="5s, 1m, 1h" />
        </div>
      `;
    }
    // Condition node
    else if (nodeType === 'condition') {
      fieldsHtml = `
        <div class="wf-step-edit-field">
          <label class="wf-step-edit-label">Variable</label>
          <select class="wf-step-edit-input wf-node-prop" data-key="variable">
            ${CONDITION_VARS.map(v => `<option value="${v.value}" ${props.variable === v.value ? 'selected' : ''}>${v.label}</option>`).join('')}
          </select>
        </div>
        <div class="wf-step-edit-field">
          <label class="wf-step-edit-label">Opérateur</label>
          <select class="wf-step-edit-input wf-node-prop" data-key="operator">
            ${CONDITION_OPS.map(o => `<option value="${o.value}" ${props.operator === o.value ? 'selected' : ''}>${o.label}</option>`).join('')}
          </select>
        </div>
        <div class="wf-step-edit-field">
          <label class="wf-step-edit-label">Valeur</label>
          <input class="wf-step-edit-input wf-node-prop" data-key="value" value="${escapeHtml(props.value || '')}" placeholder="main" />
        </div>
      `;
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
        ${fieldsHtml}
      </div>
    `;

    // ── Bind property inputs ──
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
        // Re-render properties if field affects visibility (trigger type, method, action, mode)
        if (['triggerType', 'method', 'action', 'mode'].includes(key)) {
          renderProperties(node);
        }
      };
      input.addEventListener('input', handler);
      input.addEventListener('change', handler);
    });

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

  // Save
  panel.querySelector('#wf-ed-save').addEventListener('click', async () => {
    const data = graphService.serializeToWorkflow();
    if (!data) return;
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
    };
    const res = await api.save(workflow);
    if (res?.success) {
      editorDraft.dirty = false;
      updateStatusBar();
      await refreshData();
      // Update workflowId if new
      if (!workflowId && res.id) {
        workflowId = res.id;
      }
    }
  });

  // Run
  panel.querySelector('#wf-ed-run').addEventListener('click', () => {
    if (workflowId) triggerWorkflow(workflowId);
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
    if (e.key === 'Delete' || e.key === 'Backspace') {
      // Only delete if not focused on an input
      if (!['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName)) {
        graphService.deleteSelected();
      }
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
function svgClaude(s = 11) { return `<svg width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2a7 7 0 0 0-7 7v1a7 7 0 0 0 14 0V9a7 7 0 0 0-7-7z"/><path d="M8 14s1.5 2 4 2 4-2 4-2"/><path d="M9 9h.01"/><path d="M15 9h.01"/><path d="M8 18v2a2 2 0 0 0 2 2h4a2 2 0 0 0 2-2v-2"/></svg>`; }
function svgPrompt(s = 11) { return `<svg width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>`; }
function svgSkill(s = 11) { return `<svg width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>`; }

module.exports = { init, load };
