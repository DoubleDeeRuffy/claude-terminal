/**
 * WorkflowMarketplacePanel
 * Browse, import and publish community workflows.
 *
 * Tabs:
 *   featured   → curated / verified workflows from the community hub
 *   browse     → all submitted workflows (unverified + verified)
 *   mine       → workflows the user has published
 *
 * API (Cloudflare Worker, set via WORKFLOW_HUB_URL):
 *   GET  /workflows?tab=featured|browse&q=&page=
 *   GET  /workflows/:id
 *   POST /workflows  { yaml, name, description, tags[], author }
 *
 * The Worker is live at https://claude-terminal-hub.claudeterminal.workers.dev
 */

'use strict';

const { escapeHtml } = require('../../utils');

const HUB_URL = 'https://claude-terminal-hub.claudeterminal.workers.dev';

// ─── State ────────────────────────────────────────────────────────────────────

let ctx = null;

const st = {
  tab: 'featured',          // 'featured' | 'browse' | 'mine'
  query: '',
  page: 0,
  items: [],
  mine: [],
  loading: false,
  publishMode: false,
  cache: new Map(),         // tab+query+page → items[]
};

// ─── Init ─────────────────────────────────────────────────────────────────────

function init(context) {
  ctx = context;
}

// ─── Render ───────────────────────────────────────────────────────────────────

function render(container) {
  container.innerHTML = `
    <div class="wfm-root">

      <!-- Header -->
      <div class="wfm-header">
        <div class="wfm-header-left">
          <svg class="wfm-header-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
            <rect x="2" y="3" width="6" height="6" rx="1.5"/>
            <rect x="16" y="3" width="6" height="6" rx="1.5"/>
            <rect x="9" y="15" width="6" height="6" rx="1.5"/>
            <path d="M5 9v3a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V9"/>
            <path d="M12 13v2"/>
          </svg>
          <div>
            <div class="wfm-header-title">Workflow Hub</div>
            <div class="wfm-header-sub">Workflows partagés par la communauté</div>
          </div>
        </div>
        <button class="wfm-publish-btn" id="wfm-publish-open">
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M12 5v14M5 12h14"/></svg>
          Publier un workflow
        </button>
      </div>

      <!-- Tabs + Search row -->
      <div class="wfm-toolbar">
        <div class="wfm-tabs">
          <button class="wfm-tab ${st.tab === 'featured' ? 'active' : ''}" data-wfmtab="featured">
            <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>
            Mis en avant
          </button>
          <button class="wfm-tab ${st.tab === 'browse' ? 'active' : ''}" data-wfmtab="browse">
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
            Explorer
          </button>
          <button class="wfm-tab ${st.tab === 'mine' ? 'active' : ''}" data-wfmtab="mine">
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="8" r="4"/><path d="M6 20v-2a6 6 0 0 1 12 0v2"/></svg>
            Mes publications
          </button>
        </div>

        <div class="wfm-search-wrap" id="wfm-search-wrap" style="${st.tab === 'mine' ? 'display:none' : ''}">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
          <input class="wfm-search" id="wfm-search" placeholder="Rechercher des workflows…" value="${escapeHtml(st.query)}">
        </div>
      </div>

      <!-- Content -->
      <div class="wfm-body" id="wfm-body"></div>

      <!-- Publish drawer (hidden by default) -->
      <div class="wfm-drawer" id="wfm-drawer" style="display:none"></div>

    </div>
  `;

  _bindToolbar(container);
  _loadTab();
}

// ─── Toolbar bindings ─────────────────────────────────────────────────────────

function _bindToolbar(container) {
  container.querySelectorAll('[data-wfmtab]').forEach(btn => {
    btn.addEventListener('click', () => {
      st.tab = btn.dataset.wfmtab;
      st.query = '';
      st.page = 0;
      container.querySelectorAll('[data-wfmtab]').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const searchWrap = document.getElementById('wfm-search-wrap');
      if (searchWrap) searchWrap.style.display = st.tab === 'mine' ? 'none' : '';
      const searchEl = document.getElementById('wfm-search');
      if (searchEl) searchEl.value = '';
      _loadTab();
    });
  });

  const searchEl = document.getElementById('wfm-search');
  if (searchEl) {
    let debounce;
    searchEl.addEventListener('input', () => {
      clearTimeout(debounce);
      debounce = setTimeout(() => {
        st.query = searchEl.value.trim();
        st.page = 0;
        _loadTab();
      }, 280);
    });
  }

  const publishBtn = document.getElementById('wfm-publish-open');
  if (publishBtn) publishBtn.addEventListener('click', _openPublishDrawer);
}

// ─── Load tab content ─────────────────────────────────────────────────────────

async function _loadTab() {
  const body = document.getElementById('wfm-body');
  if (!body) return;

  if (st.tab === 'mine') {
    _renderMine(body);
    return;
  }

  const cacheKey = `${st.tab}:${st.query}:${st.page}`;
  if (st.cache.has(cacheKey)) {
    _renderCards(body, st.cache.get(cacheKey));
    // Refresh in background
    _fetchItems().then(items => {
      if (items) {
        st.cache.set(cacheKey, items);
        if (document.getElementById('wfm-body') === body) _renderCards(body, items);
      }
    });
    return;
  }

  body.innerHTML = _loadingHtml();
  const items = await _fetchItems();
  if (items !== null) {
    st.cache.set(cacheKey, items);
    _renderCards(body, items);
  }
}

async function _fetchItems() {
  // Hub not live yet — use mock data directly
  if (!HUB_URL) return _mockItems(st.tab, st.query);

  try {
    const params = new URLSearchParams({ tab: st.tab, page: st.page });
    if (st.query) params.set('q', st.query);
    const res = await fetch(`${HUB_URL}/workflows?${params}`, { signal: AbortSignal.timeout(5000) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    return data.items || [];
  } catch {
    return _mockItems(st.tab, st.query);
  }
}

// ─── Cards render ─────────────────────────────────────────────────────────────

function _renderCards(body, items) {
  if (!items.length) {
    body.innerHTML = `
      <div class="wfm-empty">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round">
          <rect x="2" y="3" width="6" height="6" rx="1"/><rect x="16" y="3" width="6" height="6" rx="1"/>
          <rect x="9" y="15" width="6" height="6" rx="1"/>
          <path d="M5 9v3a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V9"/><path d="M12 13v2"/>
        </svg>
        <p>${st.query ? `Aucun résultat pour « ${escapeHtml(st.query)} »` : 'Aucun workflow disponible'}</p>
        ${!st.query ? `<span>Soyez le premier à publier !</span>` : ''}
      </div>
    `;
    return;
  }

  body.innerHTML = `<div class="wfm-grid">${items.map(item => _cardHtml(item)).join('')}</div>`;

  body.querySelectorAll('.wfm-card').forEach(card => {
    const id = card.dataset.id;
    const item = items.find(i => i.id === id);
    if (!item) return;

    card.querySelector('.wfm-card-import')?.addEventListener('click', e => {
      e.stopPropagation();
      _importWorkflow(item, card.querySelector('.wfm-card-import'));
    });

    card.querySelector('.wfm-card-body').addEventListener('click', () => _openDetail(item));
  });
}

function _cardHtml(item) {
  const initial = (item.name || '?').charAt(0).toUpperCase();
  const tagColors = { agent: 'accent', shell: 'info', git: 'purple', http: 'cyan', notify: 'warning' };
  const tagsHtml = (item.tags || []).slice(0, 3).map(tag =>
    `<span class="wfm-tag wfm-tag--${tagColors[tag] || 'muted'}">${escapeHtml(tag)}</span>`
  ).join('');

  return `
    <div class="wfm-card" data-id="${escapeHtml(item.id)}">
      ${item.verified ? `<div class="wfm-card-verified-bar"></div>` : ''}
      <div class="wfm-card-body">
        <div class="wfm-card-top">
          <div class="wfm-card-initial">${initial}</div>
          <div class="wfm-card-info">
            <div class="wfm-card-name">
              ${escapeHtml(item.name)}
              ${item.verified ? `<svg class="wfm-verified-icon" viewBox="0 0 24 24" fill="currentColor" title="Vérifié"><path d="M9 12l2 2 4-4m6 2a9 9 0 1 1-18 0 9 9 0 0 1 18 0z"/></svg>` : ''}
            </div>
            <div class="wfm-card-author">par ${escapeHtml(item.author || 'anonyme')}</div>
          </div>
          <div class="wfm-card-stats">
            <span class="wfm-stat" title="Imports">
              <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
              ${_fmt(item.imports || 0)}
            </span>
          </div>
        </div>
        <div class="wfm-card-desc">${escapeHtml(item.description || '')}</div>
        <div class="wfm-card-footer">
          <div class="wfm-tags">${tagsHtml}</div>
          <button class="wfm-card-import">
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
            Importer
          </button>
        </div>
      </div>
    </div>
  `;
}

// ─── Detail overlay ───────────────────────────────────────────────────────────

function _openDetail(item) {
  const overlay = document.createElement('div');
  overlay.className = 'wfm-overlay';

  const tagColors = { agent: 'accent', shell: 'info', git: 'purple', http: 'cyan', notify: 'warning' };
  const tagsHtml = (item.tags || []).map(tag =>
    `<span class="wfm-tag wfm-tag--${tagColors[tag] || 'muted'}">${escapeHtml(tag)}</span>`
  ).join('');

  overlay.innerHTML = `
    <div class="wfm-detail-modal">
      <div class="wfm-detail-hd">
        <div class="wfm-detail-hd-left">
          <div class="wfm-card-initial wfm-card-initial--lg">${(item.name || '?').charAt(0).toUpperCase()}</div>
          <div>
            <div class="wfm-detail-title">
              ${escapeHtml(item.name)}
              ${item.verified ? `<svg class="wfm-verified-icon wfm-verified-icon--lg" viewBox="0 0 24 24" fill="currentColor"><path d="M9 12l2 2 4-4m6 2a9 9 0 1 1-18 0 9 9 0 0 1 18 0z"/></svg>` : ''}
            </div>
            <div class="wfm-detail-author">par <strong>${escapeHtml(item.author || 'anonyme')}</strong></div>
          </div>
        </div>
        <button class="wfm-overlay-close" id="wfm-det-close">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M18 6L6 18M6 6l12 12"/></svg>
        </button>
      </div>

      <div class="wfm-detail-body">
        <div class="wfm-detail-desc">${escapeHtml(item.description || 'Aucune description.')}</div>

        <div class="wfm-detail-meta-row">
          <div class="wfm-detail-stat">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
            <span>${_fmt(item.imports || 0)} imports</span>
          </div>
          ${item.verified ? `
            <div class="wfm-detail-stat wfm-detail-stat--verified">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M9 12l2 2 4-4m6 2a9 9 0 1 1-18 0 9 9 0 0 1 18 0z"/></svg>
              <span>Vérifié</span>
            </div>
          ` : `
            <div class="wfm-detail-stat wfm-detail-stat--unverified">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
              <span>Non vérifié</span>
            </div>
          `}
        </div>

        <div class="wfm-tags" style="margin-bottom:16px">${tagsHtml}</div>

        ${item.yaml ? `
          <div class="wfm-detail-section-title">Aperçu YAML</div>
          <pre class="wfm-yaml-preview"><code>${escapeHtml(item.yaml)}</code></pre>
        ` : ''}
      </div>

      <div class="wfm-detail-actions">
        <button class="wfm-detail-import" id="wfm-det-import">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
          Importer ce workflow
        </button>
        <button class="wfm-detail-cancel" id="wfm-det-cancel">Fermer</button>
      </div>
    </div>
  `;

  document.body.appendChild(overlay);

  overlay.querySelector('#wfm-det-close').addEventListener('click', () => overlay.remove());
  overlay.querySelector('#wfm-det-cancel').addEventListener('click', () => overlay.remove());
  overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });

  overlay.querySelector('#wfm-det-import').addEventListener('click', async () => {
    const btn = overlay.querySelector('#wfm-det-import');
    await _importWorkflow(item, btn);
    overlay.remove();
  });
}

// ─── Import ───────────────────────────────────────────────────────────────────

async function _importWorkflow(item, btn) {
  if (!ctx?.api?.workflow) {
    _toast('API workflow non disponible', 'error');
    return;
  }

  const originalText = btn.innerHTML;
  btn.disabled = true;
  btn.innerHTML = `<span class="wfm-spinner"></span> Import…`;

  try {
    // Build a minimal workflow object from the hub item
    const workflow = _hubItemToWorkflow(item);
    const result = await ctx.api.workflow.save({ workflow });

    if (!result?.success) throw new Error(result?.error || 'Échec de l\'import');

    btn.innerHTML = `<svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor"><path d="M9 12l2 2 4-4m6 2a9 9 0 1 1-18 0 9 9 0 0 1 18 0z"/></svg> Importé !`;
    btn.style.background = 'rgba(34,197,94,0.12)';
    btn.style.color = 'var(--success)';
    btn.style.borderColor = 'rgba(34,197,94,0.25)';

    _toast(`« ${item.name} » importé avec succès`, 'success');

    // Increment import counter in background (fire-and-forget, when hub is live)
    if (HUB_URL) fetch(`${HUB_URL}/workflows/${item.id}/import`, { method: 'POST' }).catch(() => {});
  } catch (e) {
    btn.disabled = false;
    btn.innerHTML = originalText;
    _toast(`Erreur : ${e.message}`, 'error');
  }
}

function _hubItemToWorkflow(item) {
  // If the hub provides a full workflow JSON, use it
  if (item.workflowJson) return { ...item.workflowJson, id: `wf_${Date.now()}` };

  // Otherwise build a minimal scaffold from the hub metadata
  return {
    id: `wf_${Date.now()}`,
    name: item.name,
    enabled: false,
    trigger: { type: 'manual' },
    scope: 'current',
    concurrency: 'skip',
    steps: (item.tags || []).slice(0, 3).map((tag, i) => ({
      id: `step_${i + 1}`,
      type: tag,
    })),
    _importedFrom: item.id,
  };
}

// ─── Publish drawer ───────────────────────────────────────────────────────────

async function _openPublishDrawer() {
  const drawer = document.getElementById('wfm-drawer');
  if (!drawer) return;

  // Load real workflows from the app
  let workflows = [];
  try {
    const result = await ctx?.api?.workflow?.list?.();
    workflows = result?.workflows || [];
  } catch { workflows = []; }

  // Store workflows map for use in _submitPublish
  drawer._workflows = workflows;

  drawer.style.display = 'block';
  drawer.innerHTML = `
    <div class="wfm-drawer-inner">
      <div class="wfm-drawer-hd">
        <span class="wfm-drawer-title">Publier un workflow</span>
        <button class="wfm-overlay-close" id="wfm-drawer-close">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M18 6L6 18M6 6l12 12"/></svg>
        </button>
      </div>

      <div class="wfm-drawer-body">
        <div class="wfm-pub-notice">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
          Votre workflow sera soumis en <strong>non vérifié</strong> et visible de tous. La vérification est effectuée manuellement.
        </div>

        <div class="wfm-pub-field">
          <label class="wfm-pub-label">Workflow à publier</label>
          <select class="wfm-pub-select" id="wfm-pub-wf">
            <option value="">— Choisir un workflow —</option>
            ${workflows.length
              ? workflows.map(w => `<option value="${escapeHtml(w.id)}">${escapeHtml(w.name || w.id)}</option>`).join('')
              : `<option disabled>Aucun workflow trouvé</option>`
            }
          </select>
        </div>

        <div class="wfm-pub-field">
          <label class="wfm-pub-label">Description <span class="wfm-pub-hint">(affiché dans le hub)</span></label>
          <textarea class="wfm-pub-textarea" id="wfm-pub-desc" rows="3" placeholder="Ce workflow fait X, Y, Z…"></textarea>
        </div>

        <div class="wfm-pub-field">
          <label class="wfm-pub-label">Tags <span class="wfm-pub-hint">(séparés par virgule)</span></label>
          <input class="wfm-pub-input" id="wfm-pub-tags" placeholder="agent, git, deploy">
        </div>

        <div class="wfm-pub-field">
          <label class="wfm-pub-label">Auteur <span class="wfm-pub-hint">(affiché publiquement)</span></label>
          <input class="wfm-pub-input" id="wfm-pub-author" placeholder="votre-pseudo">
        </div>
      </div>

      <div class="wfm-drawer-ft">
        <button class="wfm-btn-ghost" id="wfm-pub-cancel">Annuler</button>
        <button class="wfm-publish-submit" id="wfm-pub-submit">
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
          Soumettre
        </button>
      </div>
    </div>
  `;

  drawer.querySelector('#wfm-drawer-close').addEventListener('click', () => {
    drawer.style.display = 'none';
  });
  drawer.querySelector('#wfm-pub-cancel').addEventListener('click', () => {
    drawer.style.display = 'none';
  });
  drawer.querySelector('#wfm-pub-submit').addEventListener('click', () => _submitPublish(drawer));
}

async function _submitPublish(drawer) {
  const wfId   = drawer.querySelector('#wfm-pub-wf')?.value;
  const desc   = drawer.querySelector('#wfm-pub-desc')?.value?.trim();
  const tags   = (drawer.querySelector('#wfm-pub-tags')?.value || '').split(',').map(t => t.trim()).filter(Boolean);
  const author = drawer.querySelector('#wfm-pub-author')?.value?.trim() || 'anonyme';

  if (!wfId) {
    _toast('Choisissez un workflow', 'error');
    return;
  }
  if (!desc) {
    _toast('Ajoutez une description', 'error');
    return;
  }

  // Find the full workflow object
  const workflows = drawer._workflows || [];
  const wf = workflows.find(w => w.id === wfId);
  const wfName = wf?.name || wfId;

  const btn = drawer.querySelector('#wfm-pub-submit');
  btn.disabled = true;
  btn.innerHTML = `<span class="wfm-spinner"></span> Envoi…`;

  st.mine.push({ id: `pending_${Date.now()}`, name: wfName, description: desc, tags, author, verified: false, imports: 0, pending: true });
  drawer.style.display = 'none';

  if (HUB_URL) {
    try {
      await fetch(`${HUB_URL}/workflows`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: wfName, description: desc, tags, author, workflowJson: wf || null }),
        signal: AbortSignal.timeout(8000),
      });
      _toast('Workflow soumis ! Il sera visible après vérification.', 'success');
    } catch {
      _toast('Soumis localement — sera envoyé quand le hub sera en ligne.', 'success');
    }
  } else {
    _toast('Workflow enregistré ! Le hub communautaire arrive bientôt.', 'success');
  }
}

// ─── Mine tab ─────────────────────────────────────────────────────────────────

function _renderMine(body) {
  if (!st.mine.length) {
    body.innerHTML = `
      <div class="wfm-empty">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round">
          <line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/>
        </svg>
        <p>Vous n'avez encore rien publié</p>
        <span>Partagez vos workflows avec la communauté !</span>
      </div>
    `;
    return;
  }

  body.innerHTML = `<div class="wfm-grid">${st.mine.map(item => _cardHtml(item)).join('')}</div>`;
}

// ─── Toast ────────────────────────────────────────────────────────────────────

function _toast(msg, type = 'info') {
  const t = document.createElement('div');
  t.className = `wfm-toast wfm-toast--${type}`;
  t.textContent = msg;
  document.body.appendChild(t);
  requestAnimationFrame(() => t.classList.add('wfm-toast--in'));
  setTimeout(() => { t.classList.remove('wfm-toast--in'); setTimeout(() => t.remove(), 300); }, 3000);
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function _fmt(n) {
  if (!n) return '0';
  if (n >= 1000) return (n / 1000).toFixed(1).replace(/\.0$/, '') + 'k';
  return String(n);
}

function _loadingHtml() {
  return `<div class="wfm-loading"><span class="wfm-spinner"></span> Chargement…</div>`;
}

function _mockWorkflowNames() {
  return ['Daily Code Review', 'Auto Test on Hook', 'Changelog + Discord'];
}

// ─── Mock data (fallback when hub is offline) ─────────────────────────────────

function _mockItems(tab, query) {
  const all = [
    {
      id: 'hub_1', name: 'Daily Code Review', author: 'yanis', verified: true, imports: 1420,
      description: 'Revue de code quotidienne par Claude. Lance une analyse complète à 8h, corrige les issues détectées, teste et pousse si les tests passent.',
      tags: ['agent', 'git', 'shell'],
      yaml: `name: Daily Code Review\ntrigger:\n  type: cron\n  value: "0 8 * * *"\nsteps:\n  - id: review\n    type: agent\n    prompt: Review my code…\n  - id: push\n    type: git\n    condition: "$review.ok == true"`,
    },
    {
      id: 'hub_2', name: 'Auto Test on Commit', author: 'mehdi_dev', verified: true, imports: 892,
      description: 'Déclenché après chaque outil Git. Lance les tests automatiquement et notifie en cas d\'échec.',
      tags: ['shell', 'notify'],
    },
    {
      id: 'hub_3', name: 'Deploy + Notify Discord', author: 'sarah_builds', verified: false, imports: 341,
      description: 'Pipeline de déploiement complet avec notification Discord. Configure les URLs dans les variables.',
      tags: ['shell', 'http', 'notify'],
    },
    {
      id: 'hub_4', name: 'PR Summary Agent', author: 'thomas_vc', verified: true, imports: 607,
      description: 'Génère un résumé de PR via Claude et le poste comme commentaire GitHub via l\'API.',
      tags: ['agent', 'http'],
    },
    {
      id: 'hub_5', name: 'Security Audit Weekly', author: 'sec_team', verified: false, imports: 183,
      description: 'Audit de sécurité hebdomadaire : dépendances vulnérables, secrets exposés, permissions.',
      tags: ['agent', 'shell'],
    },
    {
      id: 'hub_6', name: 'Changelog Auto-Writer', author: 'devops_bro', verified: false, imports: 228,
      description: 'Génère le CHANGELOG.md depuis les commits Git via Claude. S\'enchaîne après Daily Code Review.',
      tags: ['agent', 'git'],
    },
  ];

  const filtered = query
    ? all.filter(i => i.name.toLowerCase().includes(query.toLowerCase()) || i.description.toLowerCase().includes(query.toLowerCase()))
    : all;

  if (tab === 'featured') return filtered.filter(i => i.verified);
  return filtered;
}

module.exports = { init, render };
