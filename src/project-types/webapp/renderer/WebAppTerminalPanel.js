/**
 * Web App Terminal Panel
 * Dev server console view with info panel + live preview (webview)
 */

const { getWebAppServer, setWebAppPort } = require('./WebAppState');
const { getSetting } = require('../../../renderer/state/settings.state');
const api = window.electron_api;

// Track active poll timer per wrapper (shared between views)
const pollTimers = new WeakMap();

// Store detached webview data per previewView element
const detachedWebviews = new WeakMap();

function clearPollTimer(wrapper) {
  const timer = pollTimers.get(wrapper);
  if (timer) {
    clearInterval(timer);
    pollTimers.delete(wrapper);
  }
}

function startPortPoll(wrapper, projectIndex, onFound) {
  clearPollTimer(wrapper);
  const timer = setInterval(async () => {
    const s = getWebAppServer(projectIndex);
    if (s.status === 'stopped') { clearPollTimer(wrapper); return; }
    let p = s.port;
    if (!p) {
      try { p = await api.webapp.getPort({ projectIndex }); } catch (e) {}
    }
    if (p) {
      setWebAppPort(projectIndex, p);
      clearPollTimer(wrapper);
      onFound(p);
    }
  }, 2000);
  pollTimers.set(wrapper, timer);
}

async function resolvePort(projectIndex) {
  const server = getWebAppServer(projectIndex);
  if (server.port) return server.port;
  if (server.status !== 'running') return null;
  try {
    const p = await api.webapp.getPort({ projectIndex });
    if (p) setWebAppPort(projectIndex, p);
    return p || null;
  } catch (e) { return null; }
}

function isPreviewEnabled() {
  const val = getSetting('webappPreviewEnabled');
  return val !== undefined ? val : true;
}

// ── SVG icons ──────────────────────────────────────────────────────────
const ICON_CONSOLE = `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" width="13" height="13"><rect x="1" y="2" width="14" height="12" rx="2"/><path d="M4.5 6L7 8.5 4.5 11M8.5 11H12" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
const ICON_PREVIEW = `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" width="13" height="13"><rect x="1" y="3" width="14" height="10" rx="2"/><path d="M1 6h14" stroke-linecap="round"/><circle cx="4" cy="4.5" r=".6" fill="currentColor" stroke="none"/><circle cx="6" cy="4.5" r=".6" fill="currentColor" stroke="none"/><circle cx="8" cy="4.5" r=".6" fill="currentColor" stroke="none"/></svg>`;
const ICON_INFO    = `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" width="13" height="13"><circle cx="8" cy="8" r="6.5"/><path d="M8 7.5v4M8 5.5v.5" stroke-linecap="round"/></svg>`;
const ICON_BACK    = `<svg viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.5" width="11" height="11"><path d="M7.5 2.5L4 6l3.5 3.5" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
const ICON_FWD     = `<svg viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.5" width="11" height="11"><path d="M4.5 2.5L8 6 4.5 9.5" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
const ICON_RELOAD  = `<svg viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.5" width="11" height="11"><path d="M10 3.5A5 5 0 103.5 10" stroke-linecap="round"/><path d="M10 1.5v2H8" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
const ICON_OPEN    = `<svg viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.5" width="11" height="11"><path d="M8 2h2v2M10 2L6 6M5 3H2v7h7V7" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
const ICON_INSPECT = `<svg viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.5" width="11" height="11"><path d="M1 1l4.2 10 1.5-3.8L10.5 5.7z" stroke-linecap="round" stroke-linejoin="round"/><path d="M7 7l4 4" stroke-linecap="round"/></svg>`;

// ── Inspect inject/uninject scripts ──────────────────────────────────
function getInspectInjectScript() {
  const hex = getSetting('accentColor') || '#d97706';
  // Parse hex to r,g,b for rgba usage inside webview
  const r = parseInt(hex.slice(1, 3), 16) || 217;
  const g = parseInt(hex.slice(3, 5), 16) || 119;
  const b = parseInt(hex.slice(5, 7), 16) || 6;
  return `(function() {
  if (window.__CT_INSPECT_ACTIVE__) return;
  window.__CT_INSPECT_ACTIVE__ = true;
  // Kill standalone scroll listener (we have our own)
  if (window.__CT_SCROLL_AC__) { window.__CT_SCROLL_AC__.abort(); delete window.__CT_SCROLL_AC__; window.__CT_SCROLL_ACTIVE__ = false; }
  const ac = new AbortController();
  window.__CT_INSPECT_AC__ = ac;
  const s = ac.signal;
  const _c = '${hex}', _bg = 'rgba(${r},${g},${b},0.08)';

  const overlay = document.createElement('div');
  overlay.id = '__ct_inspect_overlay__';
  Object.assign(overlay.style, {
    position: 'fixed', zIndex: '2147483647', pointerEvents: 'none',
    border: '2px solid ' + _c, borderRadius: '3px',
    background: _bg, transition: 'all 0.08s ease',
    display: 'none', top: '0', left: '0', width: '0', height: '0'
  });
  document.body.appendChild(overlay);

  const label = document.createElement('div');
  label.id = '__ct_inspect_label__';
  Object.assign(label.style, {
    position: 'fixed', zIndex: '2147483647', pointerEvents: 'none',
    background: _c, color: '#fff', fontSize: '10px', fontFamily: 'monospace',
    padding: '2px 6px', borderRadius: '3px', whiteSpace: 'nowrap',
    display: 'none', top: '0', left: '0'
  });
  document.body.appendChild(label);

  // Send scroll position so host can reposition pins
  var scrollThrottle = null;
  window.addEventListener('scroll', function() {
    if (scrollThrottle) return;
    scrollThrottle = setTimeout(function() {
      scrollThrottle = null;
      console.log('__CT_INSPECT_SCROLL__:' + JSON.stringify({ scrollX: window.scrollX, scrollY: window.scrollY }));
    }, 16);
  }, { capture: true, signal: s });

  // Send initial scroll position
  console.log('__CT_INSPECT_SCROLL__:' + JSON.stringify({ scrollX: window.scrollX, scrollY: window.scrollY }));

  let lastEl = null;
  document.addEventListener('mousemove', function(e) {
    const el = document.elementFromPoint(e.clientX, e.clientY);
    if (!el || el === overlay || el === label) return;
    if (el === lastEl) return;
    lastEl = el;
    const r = el.getBoundingClientRect();
    Object.assign(overlay.style, {
      display: 'block', top: r.top + 'px', left: r.left + 'px',
      width: r.width + 'px', height: r.height + 'px'
    });
    const tag = el.tagName.toLowerCase();
    const dim = Math.round(r.width) + 'x' + Math.round(r.height);
    label.textContent = tag + (el.id ? '#' + el.id : '') + ' ' + dim;
    Object.assign(label.style, {
      display: 'block',
      top: Math.max(0, r.top - 20) + 'px',
      left: r.left + 'px'
    });
  }, { signal: s });

  // Block all clicks/navigation while in inspect mode
  function blockEvent(e) { e.preventDefault(); e.stopPropagation(); e.stopImmediatePropagation(); }
  document.addEventListener('click', blockEvent, { capture: true, signal: s });
  document.addEventListener('auxclick', blockEvent, { capture: true, signal: s });
  document.addEventListener('submit', blockEvent, { capture: true, signal: s });
  document.addEventListener('pointerup', blockEvent, { capture: true, signal: s });
  document.addEventListener('mouseup', blockEvent, { capture: true, signal: s });

  document.addEventListener('mousedown', function(e) {
    e.preventDefault();
    e.stopPropagation();
    e.stopImmediatePropagation();
    const el = document.elementFromPoint(e.clientX, e.clientY);
    if (!el || el === overlay || el === label) return;
    const r = el.getBoundingClientRect();
    const selector = (function() {
      if (el.id) return '#' + el.id;
      let s = el.tagName.toLowerCase();
      if (el.className && typeof el.className === 'string') s += '.' + el.className.trim().split(/\\s+/).join('.');
      return s;
    })();
    const data = {
      tagName: el.tagName.toLowerCase(),
      id: el.id || '',
      className: (typeof el.className === 'string' ? el.className : ''),
      selector: selector,
      text: (el.textContent || '').trim().substring(0, 60),
      rect: { x: r.x, y: r.y, width: r.width, height: r.height },
      scroll: { x: window.scrollX, y: window.scrollY }
    };
    console.log('__CT_INSPECT__:' + JSON.stringify(data));
  }, { capture: true, signal: s });

  document.addEventListener('keydown', function(e) {
    if (e.key === 'Escape') {
      console.log('__CT_INSPECT_CANCEL__');
    }
    if (e.key === 'i' || e.key === 'I') {
      if (!e.ctrlKey && !e.altKey && !e.metaKey) {
        console.log('__CT_INSPECT_TOGGLE__');
      }
    }
  }, { signal: s });
})();`;
}

const INSPECT_UNINJECT_SCRIPT = `(function() {
  if (window.__CT_INSPECT_AC__) { window.__CT_INSPECT_AC__.abort(); delete window.__CT_INSPECT_AC__; }
  var o = document.getElementById('__ct_inspect_overlay__'); if (o) o.remove();
  var l = document.getElementById('__ct_inspect_label__'); if (l) l.remove();
  window.__CT_INSPECT_ACTIVE__ = false;
})();`;

// Lightweight scroll-only listener (stays active while pins are displayed)
const SCROLL_LISTEN_SCRIPT = `(function() {
  if (window.__CT_SCROLL_ACTIVE__) return;
  window.__CT_SCROLL_ACTIVE__ = true;
  var ac = new AbortController();
  window.__CT_SCROLL_AC__ = ac;
  var throttle = null;
  window.addEventListener('scroll', function() {
    if (throttle) return;
    throttle = setTimeout(function() {
      throttle = null;
      console.log('__CT_INSPECT_SCROLL__:' + JSON.stringify({ scrollX: window.scrollX, scrollY: window.scrollY }));
    }, 16);
  }, { capture: true, signal: ac.signal });
  console.log('__CT_INSPECT_SCROLL__:' + JSON.stringify({ scrollX: window.scrollX, scrollY: window.scrollY }));
})();`;

const SCROLL_UNLISTEN_SCRIPT = `(function() {
  if (window.__CT_SCROLL_AC__) { window.__CT_SCROLL_AC__.abort(); delete window.__CT_SCROLL_AC__; }
  window.__CT_SCROLL_ACTIVE__ = false;
})();`;

// Lightweight key listener: forwards "I" keydown to host via console.log when inspect is not active
const KEY_LISTEN_SCRIPT = `(function() {
  if (window.__CT_KEY_ACTIVE__) return;
  window.__CT_KEY_ACTIVE__ = true;
  document.addEventListener('keydown', function(e) {
    if (window.__CT_INSPECT_ACTIVE__) return;
    if ((e.key === 'i' || e.key === 'I') && !e.ctrlKey && !e.altKey && !e.metaKey) {
      console.log('__CT_INSPECT_TOGGLE__');
    }
  });
})();`;

function getViewSwitcherHtml() {
  const previewEnabled = isPreviewEnabled();
  return `
    <div class="wa-shell">
      <div class="wa-tabbar">
        <div class="wa-tabs">
          <button class="wa-tab active" data-view="console">
            ${ICON_CONSOLE}
            <span>Console</span>
          </button>
          ${previewEnabled ? `
          <button class="wa-tab" data-view="preview">
            ${ICON_PREVIEW}
            <span>Preview</span>
          </button>` : ''}
          <button class="wa-tab" data-view="info">
            ${ICON_INFO}
            <span>Info</span>
          </button>
        </div>
        <div class="wa-tabbar-right">
          <div class="wa-server-status" data-status="stopped">
            <span class="wa-status-pip"></span>
            <span class="wa-status-label"></span>
          </div>
        </div>
      </div>
      <div class="wa-body">
        <div class="webapp-console-view wa-view"></div>
        ${previewEnabled ? `<div class="webapp-preview-view wa-view"></div>` : ''}
        <div class="webapp-info-view wa-view"></div>
      </div>
    </div>
  `;
}

/**
 * Detach the webview from DOM (removes the native surface entirely).
 */
function detachWebview(previewView) {
  if (previewView._inspectHandlers?.isActive()) {
    previewView._inspectHandlers.deactivate();
  }
  const webview = previewView.querySelector('.webapp-preview-webview');
  if (!webview) return;
  try {
    const currentUrl = webview.getURL();
    detachedWebviews.set(previewView, currentUrl);
  } catch (e) {
    detachedWebviews.delete(previewView);
  }
  webview.remove();
}

/**
 * Re-attach the webview to the browser container.
 */
function attachWebview(previewView) {
  const savedUrl = detachedWebviews.get(previewView);
  if (!savedUrl || savedUrl === 'about:blank') return;
  const viewport = previewView.querySelector('.wa-browser-viewport');
  if (!viewport) return;
  const webview = document.createElement('webview');
  webview.className = 'webapp-preview-webview';
  webview.setAttribute('src', savedUrl);
  webview.setAttribute('disableblinkfeatures', 'Auxclick');
  viewport.insertBefore(webview, viewport.firstChild);
  wireWebviewEvents(previewView, webview);
  detachedWebviews.delete(previewView);
}

/**
 * Wire up webview events (navigation, console, etc.)
 */
function wireWebviewEvents(previewView, webview) {
  const addrPath = previewView.querySelector('.wa-addr-path');
  const addrPort = previewView.querySelector('.wa-addr-port');

  webview.addEventListener('did-navigate', (e) => {
    let newPath = '/';
    try {
      const u = new URL(e.url);
      if (addrPort) addrPort.textContent = u.port ? `:${u.port}` : '';
      newPath = u.pathname + u.search;
      if (addrPath) addrPath.textContent = newPath !== '/' ? newPath : '';
    } catch (err) {}
    // Switch pins to the new page
    previewView._inspectHandlers?.switchPage?.(newPath);
    // Re-inject inspect script after navigation if active
    setTimeout(() => {
      try { webview.executeJavaScript(KEY_LISTEN_SCRIPT); } catch (e) {}
      if (previewView._inspectHandlers?.isActive()) {
        try { webview.executeJavaScript(getInspectInjectScript()); } catch (e) {}
      }
    }, 300);
  });
  webview.addEventListener('did-navigate-in-page', (e) => {
    try {
      const u = new URL(e.url);
      const newPath = u.pathname + u.search;
      if (addrPath) addrPath.textContent = newPath !== '/' ? newPath : '';
      // Switch pins for SPA navigation (React, Vue, Next.js, etc.)
      previewView._inspectHandlers?.switchPage?.(newPath);
    } catch (err) {}
  });

  webview.addEventListener('console-message', (e) => {
    // Intercept inspect protocol messages
    if (typeof e.message === 'string') {
      if (e.message.startsWith('__CT_INSPECT__:')) {
        try {
          const data = JSON.parse(e.message.slice('__CT_INSPECT__:'.length));
          previewView._inspectHandlers?.handleCapture(data);
        } catch (err) {}
        return;
      }
      if (e.message.startsWith('__CT_INSPECT_SCROLL__:')) {
        try {
          const scroll = JSON.parse(e.message.slice('__CT_INSPECT_SCROLL__:'.length));
          previewView._inspectHandlers?.handleScroll(scroll);
        } catch (err) {}
        return;
      }
      if (e.message === '__CT_INSPECT_CANCEL__') {
        previewView._inspectHandlers?.handleEscape();
        return;
      }
      if (e.message === '__CT_INSPECT_TOGGLE__') {
        previewView._inspectHandlers?.toggle();
        return;
      }
    }
    if (e.level >= 2) {
      if (!previewView._consoleLogs) previewView._consoleLogs = [];
      previewView._consoleLogs.push({ level: e.level, message: e.message, source: e.sourceId, line: e.line });
      if (previewView._consoleLogs.length > 100) previewView._consoleLogs.shift();
    }
  });
}

function setupViewSwitcher(wrapper, terminalId, projectIndex, project, deps) {
  const { t, getTerminal } = deps;
  const consoleView  = wrapper.querySelector('.webapp-console-view');
  const previewView  = wrapper.querySelector('.webapp-preview-view');
  const infoView     = wrapper.querySelector('.webapp-info-view');
  const statusEl     = wrapper.querySelector('.wa-server-status');
  const statusLabel  = wrapper.querySelector('.wa-status-label');

  const STATUS_LABELS = { stopped: '', starting: 'Starting', running: 'Running' };

  function refreshStatus() {
    const s = getWebAppServer(projectIndex);
    const st = s.status || 'stopped';
    if (statusEl) statusEl.dataset.status = st;
    if (statusLabel) statusLabel.textContent = STATUS_LABELS[st] || '';
  }
  refreshStatus();
  const pipInterval = setInterval(refreshStatus, 2000);
  wrapper._waPipInterval = pipInterval;

  function switchView(view) {
    const panes = [consoleView, previewView, infoView].filter(Boolean);

    wrapper.querySelectorAll('.wa-tab').forEach(b => {
      b.classList.toggle('active', b.dataset.view === view);
    });

    panes.forEach(p => p.classList.remove('wa-view-active'));

    if (view === 'console') {
      consoleView.classList.add('wa-view-active');
      const termData = getTerminal(terminalId);
      if (termData) setTimeout(() => termData.fitAddon.fit(), 50);
    } else if (view === 'preview' && previewView) {
      previewView.classList.add('wa-view-active');
      renderPreviewView(wrapper, projectIndex, project, deps);
    } else if (view === 'info') {
      infoView.classList.add('wa-view-active');
      renderInfoView(wrapper, projectIndex, project, deps);
    }

    // Detach webview when leaving preview tab
    if (view !== 'preview' && previewView) {
      detachWebview(previewView);
    }

    const termData = getTerminal(terminalId);
    if (termData) termData.activeView = view;
  }

  // Watch for terminal tab switches (wrapper gains/loses .active class).
  // When our wrapper becomes inactive, detach the webview.
  const observer = new MutationObserver(() => {
    if (!wrapper.classList.contains('active') && previewView) {
      detachWebview(previewView);
    } else if (wrapper.classList.contains('active') && previewView && previewView.classList.contains('wa-view-active')) {
      if (detachedWebviews.has(previewView)) {
        attachWebview(previewView);
      }
    }
  });
  observer.observe(wrapper, { attributes: true, attributeFilter: ['class'] });
  wrapper._waClassObserver = observer;

  // Initial state: show console
  switchView('console');

  wrapper.querySelectorAll('.wa-tab').forEach(btn => {
    btn.addEventListener('click', () => switchView(btn.dataset.view));
  });
}

async function renderPreviewView(wrapper, projectIndex, project, deps) {
  const { t } = deps;
  const previewView = wrapper.querySelector('.webapp-preview-view');
  if (!previewView) return;

  const port = await resolvePort(projectIndex);
  const server = getWebAppServer(projectIndex);

  if (!port) {
    if (previewView.dataset.loadedPort) delete previewView.dataset.loadedPort;

    const isStopped = server.status === 'stopped';
    previewView.innerHTML = `
      <div class="wa-empty ${isStopped ? 'is-stopped' : 'is-loading'}">
        <div class="wa-empty-visual">
          ${isStopped
            ? `<svg viewBox="0 0 48 48" fill="none" width="40" height="40"><rect x="3" y="7" width="42" height="30" rx="4" stroke="currentColor" stroke-width="1" opacity=".15"/><path d="M3 14h42" stroke="currentColor" stroke-width="1" opacity=".15"/><rect x="18" y="37" width="12" height="4" rx="1.5" fill="currentColor" opacity=".07"/><path d="M13 43h22" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" opacity=".07"/><circle cx="9" cy="10.5" r="1.2" fill="currentColor" opacity=".18"/><circle cx="14" cy="10.5" r="1.2" fill="currentColor" opacity=".12"/><circle cx="19" cy="10.5" r="1.2" fill="currentColor" opacity=".08"/></svg>`
            : `<svg viewBox="0 0 48 48" fill="none" width="38" height="38" class="wa-spin-slow"><circle cx="24" cy="24" r="19" stroke="currentColor" stroke-width="1" opacity=".07"/><path d="M24 5a19 19 0 0116 9" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" opacity=".5"/><path d="M24 11a13 13 0 0110 6" stroke="currentColor" stroke-width="1" stroke-linecap="round" opacity=".2"/></svg>`
          }
        </div>
        <div class="wa-empty-body">
          <p class="wa-empty-title">${isStopped ? 'No server running' : 'Starting up'}</p>
          <p class="wa-empty-sub">${isStopped ? 'Start the dev server to see a live preview here' : 'Waiting for port detection…'}</p>
        </div>
      </div>
    `;

    if (!isStopped) {
      startPortPoll(wrapper, projectIndex, () => {
        renderPreviewView(wrapper, projectIndex, project, deps);
      });
    }
    return;
  }

  clearPollTimer(wrapper);
  const url = `http://localhost:${port}`;

  // If webview already exists for this port, skip
  const existingWebview = previewView.querySelector('.webapp-preview-webview');
  if (existingWebview && previewView.dataset.loadedPort === String(port)) {
    return;
  }
  // If detached for this port, re-attach
  if (!existingWebview && detachedWebviews.has(previewView) && previewView.dataset.loadedPort === String(port)) {
    attachWebview(previewView);
    return;
  }

  previewView.dataset.loadedPort = String(port);
  previewView.innerHTML = `
    <div class="wa-browser">
      <div class="wa-browser-bar">
        <div class="wa-browser-nav">
          <button class="wa-browser-btn wa-back" title="Back">${ICON_BACK}</button>
          <button class="wa-browser-btn wa-fwd" title="Forward">${ICON_FWD}</button>
          <button class="wa-browser-btn wa-reload" title="Reload">${ICON_RELOAD}</button>
        </div>
        <div class="wa-address-bar">
          <span class="wa-addr-scheme">http://</span><span class="wa-addr-host">localhost</span><span class="wa-addr-port">:${port}</span><span class="wa-addr-path"></span>
        </div>
        <button class="wa-browser-btn wa-inspect" title="${t('webapp.inspect')} (I)">${ICON_INSPECT}<span class="wa-inspect-count"></span></button>
        <button class="wa-send-all">${t('webapp.sendToClaude')}</button>
        <button class="wa-browser-btn wa-open-ext" title="${t('webapp.openBrowser')}">${ICON_OPEN}</button>
      </div>
      <div class="wa-browser-viewport">
        <webview class="webapp-preview-webview" src="${url}" disableblinkfeatures="Auxclick"></webview>
        <div class="wa-pins-overlay"></div>
      </div>
    </div>
  `;

  // Store project & deps on previewView for inspect handlers
  previewView._project = project;
  previewView._deps = deps;

  const webview = previewView.querySelector('.webapp-preview-webview');
  wireWebviewEvents(previewView, webview);

  // Inject key listener immediately (webview may already be loaded)
  try { webview.executeJavaScript(KEY_LISTEN_SCRIPT); } catch (e) {}

  // ── Inspect mode with multi-annotation pins (per-page) ──
  let inspectActive = false;
  // Per-page annotation storage: pathname → { annotations[], scroll }
  const pageAnnotations = new Map();
  let currentPagePath = '/';
  let nextPinId = 1;
  // Track webview scroll position for pin offset calculation
  let currentScroll = { x: 0, y: 0 };

  const inspectBtn = previewView.querySelector('.wa-inspect');
  const badgeEl = previewView.querySelector('.wa-inspect-count');
  const sendAllBtn = previewView.querySelector('.wa-send-all');
  const overlay = previewView.querySelector('.wa-pins-overlay');

  /** Get annotations for the current page */
  function getPageAnns() {
    if (!pageAnnotations.has(currentPagePath)) {
      pageAnnotations.set(currentPagePath, { annotations: [], scroll: { x: 0, y: 0 } });
    }
    return pageAnnotations.get(currentPagePath);
  }

  /** Count total annotations across all pages */
  function getTotalCount() {
    let total = 0;
    for (const page of pageAnnotations.values()) total += page.annotations.length;
    return total;
  }

  /** Get all annotations flattened with their page path */
  function getAllAnnotations() {
    const all = [];
    for (const [path, page] of pageAnnotations) {
      for (const ann of page.annotations) all.push({ ...ann, pagePath: path });
    }
    return all;
  }

  function updateBadge() {
    const count = getTotalCount();
    if (count > 0) {
      badgeEl.textContent = count;
      badgeEl.classList.add('visible');
      sendAllBtn.textContent = `${t('webapp.sendAll').replace('{count}', count)}`;
      sendAllBtn.classList.add('visible');
    } else {
      badgeEl.classList.remove('visible');
      sendAllBtn.classList.remove('visible');
    }
  }

  function closePopover() {
    const pop = overlay.querySelector('.wa-pin-popover');
    if (pop) pop.remove();
  }

  /**
   * Convert document-absolute coords to current viewport-relative coords
   * by subtracting the current webview scroll position.
   */
  function absToViewport(absX, absY) {
    return { x: absX - currentScroll.x, y: absY - currentScroll.y };
  }

  /** Reposition all pins and popover based on current scroll (current page only) */
  function repositionAllPins() {
    const page = getPageAnns();
    for (const ann of page.annotations) {
      const pinEl = overlay.querySelector(`.wa-pin[data-pin-id="${ann.id}"]`);
      if (!pinEl) continue;
      const abs = ann.elementData.absRect;
      const vp = absToViewport(abs.x + abs.width / 2 - 11, abs.y + abs.height / 2 - 11);
      pinEl.style.top = vp.y + 'px';
      pinEl.style.left = vp.x + 'px';
    }
    // Reposition popover if open
    const pop = overlay.querySelector('.wa-pin-popover');
    if (pop && pop._absRect) {
      const popW = 280;
      const popH = pop.offsetHeight || 120;
      const overlayW = overlay.offsetWidth || 400;
      const abs = pop._absRect;
      const vpPos = absToViewport(abs.x, abs.y);
      let top = vpPos.y - popH - 8;
      let left = vpPos.x;
      if (top < 4) top = vpPos.y + abs.height + 8;
      if (left + popW > overlayW - 4) left = overlayW - popW - 4;
      if (left < 4) left = 4;
      pop.style.top = top + 'px';
      pop.style.left = left + 'px';
    }
  }

  function showPopover(elementData, existingAnnotation) {
    closePopover();

    const pop = document.createElement('div');
    pop.className = 'wa-pin-popover';

    pop.innerHTML = `
      <div class="wa-popover-header">
        <span class="wa-popover-selector">${escapeAttr(elementData.selector)}</span>
        <button class="wa-popover-close" title="Close">&times;</button>
      </div>
      <textarea class="wa-popover-input" rows="1" placeholder="${t('webapp.pinPlaceholder')}">${existingAnnotation ? escapeAttr(existingAnnotation.instruction) : ''}</textarea>
      <div class="wa-popover-actions">
        ${existingAnnotation ? `<button class="wa-popover-delete">${t('webapp.deletePin')}</button>` : ''}
        <button class="wa-popover-ok">${existingAnnotation ? 'Update' : 'OK'}</button>
      </div>
    `;

    // Store absRect on popover for repositioning on scroll
    const absRect = elementData.absRect || elementData.rect;
    pop._absRect = absRect;

    // Position above the element using viewport-relative coords
    const overlayW = overlay.offsetWidth || 400;
    const popW = 280;
    const popH = 120; // estimate
    const vpPos = absToViewport(absRect.x, absRect.y);
    let top = vpPos.y - popH - 8;
    let left = vpPos.x;
    if (top < 4) top = vpPos.y + absRect.height + 8;
    if (left + popW > overlayW - 4) left = overlayW - popW - 4;
    if (left < 4) left = 4;
    pop.style.top = top + 'px';
    pop.style.left = left + 'px';

    overlay.appendChild(pop);

    const textarea = pop.querySelector('.wa-popover-input');
    const okBtn = pop.querySelector('.wa-popover-ok');
    const closeBtn = pop.querySelector('.wa-popover-close');
    const delBtn = pop.querySelector('.wa-popover-delete');

    const dismissPopover = () => {
      closePopover();
      const wv = previewView.querySelector('.webapp-preview-webview');
      if (wv && inspectActive) {
        try { wv.executeJavaScript(getInspectInjectScript()); } catch (e) {}
      }
    };

    // Auto-resize
    textarea.addEventListener('input', () => {
      textarea.style.height = 'auto';
      textarea.style.height = Math.min(textarea.scrollHeight, 80) + 'px';
    });

    const confirm = () => {
      const instruction = textarea.value.trim();
      if (!instruction) return;
      closePopover();

      if (existingAnnotation) {
        existingAnnotation.instruction = instruction;
      } else {
        const ann = { id: nextPinId++, elementData, instruction };
        getPageAnns().annotations.push(ann);
        addPin(ann);
        updateBadge();
      }

      const wv = previewView.querySelector('.webapp-preview-webview');
      if (wv && inspectActive) {
        try { wv.executeJavaScript(getInspectInjectScript()); } catch (e) {}
      }
    };

    // Close button → just dismiss popover (no delete)
    closeBtn.onclick = dismissPopover;

    okBtn.onclick = confirm;
    textarea.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        confirm();
      }
      if (e.key === 'Escape') {
        dismissPopover();
      }
    });

    // Delete button → remove the annotation + pin
    if (delBtn) {
      delBtn.onclick = () => {
        closePopover();
        if (existingAnnotation) {
          removePin(existingAnnotation.id);
        }
        const wv = previewView.querySelector('.webapp-preview-webview');
        if (wv && inspectActive) {
          try { wv.executeJavaScript(getInspectInjectScript()); } catch (e) {}
        }
      };
    }

    setTimeout(() => textarea.focus(), 50);
  }

  function addPin(annotation) {
    const abs = annotation.elementData.absRect;
    const pin = document.createElement('div');
    pin.className = 'wa-pin';
    pin.dataset.pinId = annotation.id;
    pin.textContent = annotation.id;
    const vp = absToViewport(abs.x + abs.width / 2 - 11, abs.y + abs.height / 2 - 11);
    pin.style.top = vp.y + 'px';
    pin.style.left = vp.x + 'px';
    pin.onclick = (e) => {
      e.stopPropagation();
      showPopover(annotation.elementData, annotation);
    };
    overlay.appendChild(pin);
  }

  function removePin(annotationId) {
    // Search in all pages
    for (const page of pageAnnotations.values()) {
      const idx = page.annotations.findIndex(a => a.id === annotationId);
      if (idx !== -1) { page.annotations.splice(idx, 1); break; }
    }
    const pinEl = overlay.querySelector(`.wa-pin[data-pin-id="${annotationId}"]`);
    if (pinEl) pinEl.remove();
    updateBadge();
  }

  function clearAllPins() {
    pageAnnotations.clear();
    nextPinId = 1;
    currentScroll = { x: 0, y: 0 };
    overlay.querySelectorAll('.wa-pin, .wa-pin-popover').forEach(el => el.remove());
    updateBadge();
  }

  /** Remove pin DOM elements (keep data in memory) */
  function hidePins() {
    overlay.querySelectorAll('.wa-pin, .wa-pin-popover').forEach(el => el.remove());
  }

  /** Re-create pin DOM elements for the current page from stored data */
  function showPins() {
    // Clear existing pin DOM first to avoid duplicates
    overlay.querySelectorAll('.wa-pin').forEach(el => el.remove());
    const page = pageAnnotations.get(currentPagePath);
    if (!page) return;
    for (const ann of page.annotations) addPin(ann);
  }

  function activateInspect() {
    inspectActive = true;
    inspectBtn.classList.add('active');
    previewView.classList.add('inspect-mode');
    // Show pins of current page
    showPins();
    const wv = previewView.querySelector('.webapp-preview-webview');
    if (wv) {
      try { wv.executeJavaScript(getInspectInjectScript()); } catch (e) {}
    }
  }

  function deactivateInspect() {
    inspectActive = false;
    inspectBtn.classList.remove('active');
    previewView.classList.remove('inspect-mode');
    const wv = previewView.querySelector('.webapp-preview-webview');
    if (wv) {
      try { wv.executeJavaScript(INSPECT_UNINJECT_SCRIPT); } catch (e) {}
      try { wv.executeJavaScript(SCROLL_UNLISTEN_SCRIPT); } catch (e) {}
    }
    closePopover();
    hidePins();
  }

  /** Full cleanup: deactivate + clear all pins */
  function deactivateAndClear() {
    inspectActive = false;
    inspectBtn.classList.remove('active');
    previewView.classList.remove('inspect-mode');
    const wv = previewView.querySelector('.webapp-preview-webview');
    if (wv) {
      try { wv.executeJavaScript(INSPECT_UNINJECT_SCRIPT); } catch (e) {}
      try { wv.executeJavaScript(SCROLL_UNLISTEN_SCRIPT); } catch (e) {}
    }
    closePopover();
    clearAllPins();
  }

  function handleCapture(elementData) {
    // Compute document-absolute rect from viewport rect + scroll at capture time
    const scroll = elementData.scroll || { x: 0, y: 0 };
    elementData.absRect = {
      x: elementData.rect.x + scroll.x,
      y: elementData.rect.y + scroll.y,
      width: elementData.rect.width,
      height: elementData.rect.height
    };

    // Uninject inspect overlay for popover interaction
    // but keep scroll listener active for pin repositioning
    const wv = previewView.querySelector('.webapp-preview-webview');
    if (wv) {
      try { wv.executeJavaScript(INSPECT_UNINJECT_SCRIPT); } catch (e) {}
      try { wv.executeJavaScript(SCROLL_LISTEN_SCRIPT); } catch (e) {}
    }

    showPopover(elementData, null);
  }

  function handleScroll(scroll) {
    currentScroll = { x: scroll.scrollX, y: scroll.scrollY };
    const page = pageAnnotations.get(currentPagePath);
    if (page && page.annotations.length > 0) {
      repositionAllPins();
    }
  }

  function handleEscapeFromWebview() {
    // If popover is open, just close it
    if (overlay.querySelector('.wa-pin-popover')) {
      closePopover();
      const wv = previewView.querySelector('.webapp-preview-webview');
      if (wv && inspectActive) {
        try { wv.executeJavaScript(getInspectInjectScript()); } catch (e) {}
      }
    } else {
      // No popover → deactivate inspect entirely
      deactivateInspect();
    }
  }

  /** Switch visible pins when navigating to a different page */
  function switchToPage(newPath) {
    if (newPath === currentPagePath) return;
    closePopover();

    // Save scroll position for current page
    const oldPage = pageAnnotations.get(currentPagePath);
    if (oldPage) oldPage.scroll = { ...currentScroll };

    // Remove pin DOM of old page
    overlay.querySelectorAll('.wa-pin').forEach(el => el.remove());

    // Switch
    currentPagePath = newPath;
    currentScroll = { x: 0, y: 0 };

    // Restore pins of new page only if inspect is active
    const newPage = pageAnnotations.get(currentPagePath);
    if (newPage && inspectActive) {
      currentScroll = { ...newPage.scroll };
      for (const ann of newPage.annotations) addPin(ann);
    }
  }

  inspectBtn.onclick = () => {
    if (inspectActive) {
      deactivateInspect();
    } else {
      activateInspect();
    }
  };

  sendAllBtn.onclick = () => {
    if (getTotalCount() === 0) return;
    sendAllFeedback(previewView, getAllAnnotations(), deps);
    deactivateAndClear();
  };

  previewView._inspectHandlers = {
    handleCapture,
    deactivate: deactivateAndClear,
    handleEscape: handleEscapeFromWebview,
    handleScroll,
    toggle: () => { inspectActive ? deactivateInspect() : activateInspect(); },
    isActive: () => inspectActive,
    hasPins: () => getTotalCount() > 0,
    switchPage: switchToPage
  };

  // ── Keyboard shortcut: "I" to toggle inspect ──
  const shortcutHandler = (e) => {
    // Only act when preview tab is visible and no input is focused
    if (!previewView.classList.contains('wa-view-active')) return;
    const tag = document.activeElement?.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
    if (e.key === 'i' || e.key === 'I') {
      if (e.ctrlKey || e.altKey || e.metaKey) return;
      e.preventDefault();
      if (inspectActive) {
        deactivateInspect();
      } else {
        activateInspect();
      }
    }
  };
  document.addEventListener('keydown', shortcutHandler);
  // Store for cleanup
  previewView._inspectShortcutHandler = shortcutHandler;

  // ── Browser nav buttons ──
  previewView.querySelector('.wa-reload').onclick = () => {
    const wv = previewView.querySelector('.webapp-preview-webview');
    if (wv) wv.reload();
  };
  previewView.querySelector('.wa-back').onclick = () => {
    const wv = previewView.querySelector('.webapp-preview-webview');
    if (wv && wv.canGoBack()) wv.goBack();
  };
  previewView.querySelector('.wa-fwd').onclick = () => {
    const wv = previewView.querySelector('.webapp-preview-webview');
    if (wv && wv.canGoForward()) wv.goForward();
  };
  previewView.querySelector('.wa-open-ext').onclick = () => {
    const wv = previewView.querySelector('.webapp-preview-webview');
    api.dialog.openExternal(wv ? wv.getURL() : url);
  };
}

async function renderInfoView(wrapper, projectIndex, project, deps) {
  const { t } = deps;
  const server = getWebAppServer(projectIndex);
  const infoView = wrapper.querySelector('.webapp-info-view');
  if (!infoView) return;

  const port = await resolvePort(projectIndex);
  const url = port ? `http://localhost:${port}` : null;

  const STATUS = {
    stopped:  { cls: 'stopped',  label: 'Stopped',  desc: 'Dev server is not running' },
    starting: { cls: 'starting', label: 'Starting', desc: 'Launching dev server…'     },
    running:  { cls: 'running',  label: 'Running',  desc: url || 'Server active'       },
  };
  const st = STATUS[server.status] || STATUS.stopped;

  const framework = project.framework || project.webFramework || null;
  const devCmd    = project.devCommand || 'auto';
  const projectName = project.name || 'Web App';

  const ICON_STATUS_RUNNING = `<svg viewBox="0 0 20 20" fill="none" width="18" height="18"><circle cx="10" cy="10" r="9" stroke="currentColor" stroke-width="1.2" opacity=".25"/><circle cx="10" cy="10" r="4" fill="currentColor"/></svg>`;
  const ICON_STATUS_STOPPED = `<svg viewBox="0 0 20 20" fill="none" width="18" height="18"><circle cx="10" cy="10" r="9" stroke="currentColor" stroke-width="1.2" opacity=".25"/><rect x="7.5" y="7.5" width="5" height="5" rx="1" fill="currentColor" opacity=".5"/></svg>`;
  const ICON_GLOBE = `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.3" width="13" height="13"><circle cx="8" cy="8" r="6.5"/><path d="M8 1.5C6 4 5 6 5 8s1 4 3 6.5M8 1.5C10 4 11 6 11 8s-1 4-3 6.5M1.5 8h13" stroke-linecap="round"/></svg>`;
  const ICON_TERMINAL = `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.3" width="13" height="13"><rect x="1.5" y="2.5" width="13" height="11" rx="2"/><path d="M4.5 6L7 8.5 4.5 11M8.5 11H12" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
  const ICON_PORT = `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.3" width="13" height="13"><path d="M8 2v12M4 5h8M3 9h10" stroke-linecap="round"/><rect x="5" y="7" width="6" height="4" rx="1"/></svg>`;

  infoView.innerHTML = `
    <div class="wa-info">

      <div class="wa-info-hero ${st.cls}">
        <div class="wa-info-hero-bg"></div>
        <div class="wa-info-hero-content">
          <div class="wa-info-hero-icon">${server.status === 'running' ? ICON_STATUS_RUNNING : ICON_STATUS_STOPPED}</div>
          <div class="wa-info-hero-text">
            <div class="wa-info-hero-label">${st.label}</div>
            <div class="wa-info-hero-sub">${st.desc}</div>
          </div>
          ${url ? `<button class="wa-info-cta webapp-open-url" data-url="${url}">${ICON_OPEN}<span>Open</span></button>` : ''}
        </div>
      </div>

      <div class="wa-info-grid">
        <div class="wa-info-tile">
          <div class="wa-info-tile-icon">${ICON_PORT}</div>
          <div class="wa-info-tile-body">
            <div class="wa-info-tile-label">Port</div>
            <div class="wa-info-tile-val wa-mono">${port ? port : '—'}</div>
          </div>
        </div>
        <div class="wa-info-tile">
          <div class="wa-info-tile-icon">${ICON_TERMINAL}</div>
          <div class="wa-info-tile-body">
            <div class="wa-info-tile-label">Command</div>
            <div class="wa-info-tile-val wa-mono">${devCmd}</div>
          </div>
        </div>
        ${framework ? `
        <div class="wa-info-tile">
          <div class="wa-info-tile-icon">${ICON_GLOBE}</div>
          <div class="wa-info-tile-body">
            <div class="wa-info-tile-label">Framework</div>
            <div class="wa-info-tile-val">${framework}</div>
          </div>
        </div>` : ''}
        ${url ? `
        <div class="wa-info-tile wa-info-tile-link webapp-open-url" data-url="${url}" role="button" tabindex="0">
          <div class="wa-info-tile-icon">${ICON_GLOBE}</div>
          <div class="wa-info-tile-body">
            <div class="wa-info-tile-label">Local URL</div>
            <div class="wa-info-tile-val wa-mono">${url}</div>
          </div>
          <div class="wa-info-tile-arrow">${ICON_OPEN}</div>
        </div>` : ''}
      </div>

    </div>
  `;

  infoView.querySelectorAll('.webapp-open-url').forEach(el => {
    el.style.cursor = 'pointer';
    el.onclick = () => {
      const u = el.dataset.url;
      if (u) api.dialog.openExternal(u);
    };
  });

  if (!port && server.status === 'running') {
    startPortPoll(wrapper, projectIndex, () => {
      renderInfoView(wrapper, projectIndex, project, deps);
    });
  }
}

// ── Send All Feedback ──────────────────────────────────────────────

function sendAllFeedback(previewView, annotations, deps) {
  const { createTerminal, setActiveTerminal, findChatTab } = deps;
  const project = previewView._project;
  if (!project || annotations.length === 0) return;

  // Group annotations by page path
  const byPage = new Map();
  for (const ann of annotations) {
    const path = ann.pagePath || '/';
    if (!byPage.has(path)) byPage.set(path, []);
    byPage.get(path).push(ann);
  }

  let prompt;
  const multiPage = byPage.size > 1;

  if (annotations.length === 1) {
    const ann = annotations[0];
    const ed = ann.elementData;
    const pageHint = multiPage ? ` (page: ${ann.pagePath})` : '';
    prompt = `The user selected an element in their web app preview and wants a change:\n\n"${ann.instruction}"\n\nElement: \`${ed.selector}\` (<${ed.tagName}>${ed.className ? `, classes: \`${ed.className}\`` : ''})${pageHint}\n\nFind this element in the project source code and make the requested change directly.`;
  } else {
    let num = 1;
    const sections = [];
    for (const [path, anns] of byPage) {
      const lines = anns.map(ann => {
        const ed = ann.elementData;
        const tag = `<${ed.tagName}>`;
        const classes = ed.className ? `, classes: \`${ed.className}\`` : '';
        return `${num++}. \`${ed.selector}\` (${tag}${classes}): "${ann.instruction}"`;
      });
      if (multiPage) {
        sections.push(`Page \`${path}\`:\n${lines.join('\n')}`);
      } else {
        sections.push(lines.join('\n'));
      }
    }
    prompt = `The user annotated ${annotations.length} elements in their web app preview. Make all these changes:\n\n${sections.join('\n\n')}\n\nFind each element in the project source code and make the requested changes.`;
  }

  const VISUAL_TAB_PREFIX = '\ud83c\udfaf Visual';
  const existing = findChatTab(project.path, VISUAL_TAB_PREFIX);

  if (existing) {
    const { id, termData } = existing;
    if (termData.chatView) {
      termData.chatView.sendMessage(prompt);
      setActiveTerminal(id);
      return;
    }
  }

  // Respect user's defaultTerminalMode and skipPermissions settings
  createTerminal(project, {
    skipPermissions: getSetting('skipPermissions') || false,
    initialPrompt: prompt,
    name: '\ud83c\udfaf Visual Feedback'
  });
}

function escapeAttr(str) {
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function cleanup(wrapper) {
  clearPollTimer(wrapper);
  if (wrapper._waPipInterval) clearInterval(wrapper._waPipInterval);
  if (wrapper._waClassObserver) {
    wrapper._waClassObserver.disconnect();
    delete wrapper._waClassObserver;
  }
  const previewView = wrapper.querySelector('.webapp-preview-view');
  if (previewView) {
    if (previewView._inspectShortcutHandler) {
      document.removeEventListener('keydown', previewView._inspectShortcutHandler);
      delete previewView._inspectShortcutHandler;
    }
    const webview = previewView.querySelector('.webapp-preview-webview');
    if (webview) webview.remove();
    detachedWebviews.delete(previewView);
    delete previewView.dataset.loadedPort;
  }
}

module.exports = {
  getViewSwitcherHtml,
  setupViewSwitcher,
  renderPreviewView,
  renderInfoView,
  cleanup
};
