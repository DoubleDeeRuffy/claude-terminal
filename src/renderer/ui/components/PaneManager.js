/**
 * PaneManager
 * Manages pane lifecycle and provides container accessors for terminal tabs.
 * Foundation for multi-pane splitview (Phase 31).
 *
 * Initial state: exactly 1 pane ("pane-0").
 * TerminalManager uses getTabsContainer() / getContentContainer() instead of
 * getElementById('terminals-tabs') / getElementById('terminals-container').
 */

// Core state
const panes = new Map(); // paneId -> { el, tabsEl, contentEl, tabs: Set<string>, activeTab: string|null }
let paneOrder = []; // ordered left to right, max 3
let activePaneId = null; // currently focused pane
let nextPaneNum = 0;

/**
 * Called once on app init — reads the existing pane-0 DOM structure.
 */
function initPanes() {
  const paneArea = document.getElementById('split-pane-area');
  if (!paneArea) {
    console.error('[PaneManager] split-pane-area element not found');
    return;
  }
  const paneEl = paneArea.querySelector('.split-pane[data-pane-id="0"]');
  if (!paneEl) {
    console.error('[PaneManager] pane-0 element not found');
    return;
  }
  const tabsEl = paneEl.querySelector('.pane-tabs');
  const contentEl = paneEl.querySelector('.pane-content');

  panes.set('pane-0', { el: paneEl, tabsEl, contentEl, tabs: new Set(), activeTab: null });
  paneOrder = ['pane-0'];
  activePaneId = 'pane-0';
  nextPaneNum = 1;
}

/**
 * Create a new pane — inserts DOM after the specified pane (or at end).
 * Returns the new paneId. Max 3 panes enforced.
 */
function createPane(afterPaneId) {
  if (paneOrder.length >= 3) {
    console.warn('[PaneManager] Max 3 panes reached');
    return null;
  }

  const paneId = `pane-${nextPaneNum++}`;
  const paneArea = document.getElementById('split-pane-area');

  // Create divider
  const divider = document.createElement('div');
  divider.className = 'split-divider';
  divider.dataset.paneId = paneId;

  // Create pane DOM
  const paneEl = document.createElement('div');
  paneEl.className = 'split-pane';
  paneEl.dataset.paneId = String(nextPaneNum - 1);

  const tabsEl = document.createElement('div');
  tabsEl.className = 'pane-tabs';
  tabsEl.setAttribute('role', 'tablist');
  tabsEl.setAttribute('aria-label', 'Terminal tabs');

  const contentEl = document.createElement('div');
  contentEl.className = 'pane-content';
  contentEl.setAttribute('role', 'region');
  contentEl.setAttribute('aria-label', 'Terminals');

  paneEl.appendChild(tabsEl);
  paneEl.appendChild(contentEl);

  // Insert after the specified pane
  const afterIdx = afterPaneId ? paneOrder.indexOf(afterPaneId) : paneOrder.length - 1;
  const afterPane = afterPaneId ? panes.get(afterPaneId) : panes.get(paneOrder[paneOrder.length - 1]);

  if (afterPane && afterPane.el.nextSibling) {
    paneArea.insertBefore(divider, afterPane.el.nextSibling);
    paneArea.insertBefore(paneEl, divider.nextSibling);
  } else {
    paneArea.appendChild(divider);
    paneArea.appendChild(paneEl);
  }

  // Update state
  panes.set(paneId, { el: paneEl, tabsEl, contentEl, tabs: new Set(), activeTab: null });
  paneOrder.splice(afterIdx + 1, 0, paneId);

  return paneId;
}

/**
 * Collapse a pane — removes DOM + preceding divider, removes from Map and paneOrder.
 * Caller (TerminalManager) handles tab reassignment before calling collapse.
 * If the collapsed pane was the active pane, set activePaneId to the first remaining pane.
 */
function collapsePane(paneId) {
  if (paneOrder.length <= 1) {
    console.warn('[PaneManager] Cannot collapse last pane');
    return false;
  }

  const pane = panes.get(paneId);
  if (!pane) return false;

  const paneArea = document.getElementById('split-pane-area');

  // Remove preceding divider (if any)
  const divider = paneArea.querySelector(`.split-divider[data-pane-id="${paneId}"]`);
  if (divider) divider.remove();

  // Remove pane DOM
  pane.el.remove();

  // Update state
  panes.delete(paneId);
  paneOrder = paneOrder.filter(id => id !== paneId);

  if (activePaneId === paneId) {
    activePaneId = paneOrder[0] || null;
  }

  return true;
}

/**
 * Register a tab (termId) to a pane.
 */
function registerTab(termId, paneId) {
  const pane = panes.get(paneId);
  if (!pane) {
    console.warn(`[PaneManager] Cannot register tab ${termId} — pane ${paneId} not found`);
    return;
  }
  pane.tabs.add(termId);
}

/**
 * Unregister a tab — returns true if pane is now empty.
 */
function unregisterTab(termId) {
  for (const [paneId, pane] of panes) {
    if (pane.tabs.has(termId)) {
      pane.tabs.delete(termId);
      if (pane.activeTab === termId) {
        pane.activeTab = null;
      }
      return pane.tabs.size === 0;
    }
  }
  return false;
}

/**
 * Get the pane a tab belongs to — returns paneId or null.
 */
function getPaneForTab(termId) {
  for (const [paneId, pane] of panes) {
    if (pane.tabs.has(termId)) {
      return paneId;
    }
  }
  return null;
}

/**
 * Move a tab between panes (DOM + state).
 */
function moveTabToPane(termId, targetPaneId) {
  const sourcePaneId = getPaneForTab(termId);
  if (!sourcePaneId || sourcePaneId === targetPaneId) return;

  const sourcePane = panes.get(sourcePaneId);
  const targetPane = panes.get(targetPaneId);
  if (!sourcePane || !targetPane) return;

  // Move tab DOM element
  const tabEl = document.querySelector(`.terminal-tab[data-id="${termId}"]`);
  if (tabEl) {
    targetPane.tabsEl.appendChild(tabEl);
  }

  // Move wrapper DOM element
  const wrapperEl = document.querySelector(`.terminal-wrapper[data-id="${termId}"]`);
  if (wrapperEl) {
    targetPane.contentEl.appendChild(wrapperEl);
  }

  // Update state
  sourcePane.tabs.delete(termId);
  if (sourcePane.activeTab === termId) {
    sourcePane.activeTab = null;
  }
  targetPane.tabs.add(termId);
}

// ─── Container accessors — THE KEY API for TerminalManager ───

/**
 * Get the tabs container element for a pane.
 * If no paneId specified, returns the active pane's tabs container.
 */
function getTabsContainer(paneId) {
  return panes.get(paneId || activePaneId)?.tabsEl || null;
}

/**
 * Get the content container element for a pane.
 * If no paneId specified, returns the active pane's content container.
 */
function getContentContainer(paneId) {
  return panes.get(paneId || activePaneId)?.contentEl || null;
}

/**
 * Get default pane for new tabs (the active pane).
 */
function getDefaultPaneId() {
  return activePaneId || paneOrder[0];
}

function getActivePaneId() {
  return activePaneId;
}

function setActivePaneId(paneId) {
  if (panes.has(paneId)) {
    activePaneId = paneId;
  }
}

function getPaneOrder() {
  return [...paneOrder];
}

function getPanes() {
  return panes;
}

function getPaneCount() {
  return paneOrder.length;
}

module.exports = {
  initPanes,
  createPane,
  collapsePane,
  registerTab,
  unregisterTab,
  getPaneForTab,
  moveTabToPane,
  getTabsContainer,
  getContentContainer,
  getDefaultPaneId,
  getActivePaneId,
  setActivePaneId,
  getPaneOrder,
  getPanes,
  getPaneCount,
};
