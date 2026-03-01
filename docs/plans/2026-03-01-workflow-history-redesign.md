# Workflow History Redesign

**Date:** 2026-03-01
**Status:** Approved
**Scope:** `src/renderer/ui/panels/WorkflowPanel.js`, `styles/workflow.css`
**Backend changes:** None — renderer only

---

## Objectif

Refonte complète du visuel de l'historique des workflow runs :
1. Layout 2 colonnes persistantes (liste gauche + détail droit)
2. Run cards redessinées avec accent couleur utilisateur
3. Loop steps en accordéon avec itérations visibles
4. Chip Loop dans la liste avec compteur `×N`

---

## Layout global

```
┌────────────────────┬────────────────────────────────────────────┐
│  ~380px fixe       │  flex: 1                                   │
│  scrollable        │  scrollable                                │
│  Liste des runs    │  Détail du run sélectionné                 │
└────────────────────┴────────────────────────────────────────────┘
```

- Le conteneur `.wf-history` passe de `flex-direction: column` à `flex-direction: row`
- La colonne gauche `.wf-runs-list` : `width: 380px`, `flex-shrink: 0`, `border-right: 1px solid rgba(255,255,255,.06)`
- La colonne droite `.wf-run-detail` : `flex: 1`, toujours visible (plus de toggle show/hide)
- État vide (aucun run sélectionné) : placeholder centré dans la colonne droite

---

## Colonne gauche — Run cards

### Structure HTML

```html
<div class="wf-runs-list">
  <div class="wf-runs-list-header">7 runs <button>Effacer</button></div>
  <div class="wf-runs-scroll">
    <div class="wf-run-card wf-run-card--success [wf-run-card--selected]" data-run-id="...">
      <div class="wf-run-card-accent"></div>         <!-- border-left coloré -->
      <div class="wf-run-card-body">
        <div class="wf-run-card-top">
          <span class="wf-run-card-name">Daily Changelog</span>
          <span class="wf-run-card-status">● Succès</span>
        </div>
        <div class="wf-run-card-meta">il y a 10 min · 5m20s · MANUAL</div>
        <div class="wf-run-card-pipeline">
          <!-- chips -->
          <div class="wf-run-pipe-step wf-run-pipe-step--success">
            <span class="wf-chip wf-chip--shell">⚙</span>
            <span class="wf-run-pipe-name">Shell</span>
            <span class="wf-run-pipe-status">✓</span>
          </div>
          <!-- loop chip avec compteur -->
          <div class="wf-run-pipe-step wf-run-pipe-step--success">
            <span class="wf-chip wf-chip--loop">⟳</span>
            <span class="wf-run-pipe-name">Loop</span>
            <span class="wf-run-pipe-loop-count">×17</span>
            <span class="wf-run-pipe-status">✓</span>
          </div>
        </div>
      </div>
    </div>
  </div>
</div>
```

### Style CSS

```css
.wf-run-card {
  display: flex;
  gap: 0;
  cursor: pointer;
  border-radius: 6px;
  margin: 2px 8px;
  border: 1px solid transparent;
  transition: background .12s, border-color .12s;
}

.wf-run-card-accent {
  width: 3px;
  flex-shrink: 0;
  border-radius: 3px 0 0 3px;
  background: var(--accent);
  opacity: .3;
  transition: opacity .12s, width .12s;
}

.wf-run-card--selected .wf-run-card-accent { opacity: 1; width: 4px; }
.wf-run-card--failed .wf-run-card-accent { background: #ef4444; }

.wf-run-card:hover { background: rgba(var(--accent-rgb), .04); }
.wf-run-card--selected {
  background: rgba(var(--accent-rgb), .08);
  border-color: rgba(var(--accent-rgb), .15);
  box-shadow: inset 0 0 0 1px rgba(var(--accent-rgb), .1);
}

.wf-run-card-body { flex: 1; padding: 8px 10px; min-width: 0; }

.wf-run-card-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 2px;
}

.wf-run-card-name {
  font-size: 12px;
  font-weight: 600;
  color: var(--text-primary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.wf-run-card-status {
  font-size: 10px;
  font-weight: 600;
  white-space: nowrap;
  flex-shrink: 0;
}
.wf-run-card--success .wf-run-card-status { color: var(--accent); }
.wf-run-card--failed  .wf-run-card-status { color: #ef4444; }
.wf-run-card--running .wf-run-card-status { color: #3b82f6; }

.wf-run-card-meta {
  font-size: 10px;
  color: var(--text-muted);
  margin-bottom: 6px;
}

/* Loop count badge */
.wf-run-pipe-loop-count {
  font-size: 9px;
  font-family: 'Cascadia Code', monospace;
  color: rgba(var(--accent-rgb), .6);
  font-weight: 600;
  margin-left: 1px;
}
```

---

## Colonne droite — Vue détail

### Header

```html
<div class="wf-run-detail-header">
  <div class="wf-run-detail-title-row">
    <span class="wf-run-detail-name">Daily Changelog</span>
    <div class="wf-run-detail-actions">
      <button class="wf-run-rerun-btn">▶ Re-run</button>
      <span class="wf-run-detail-status-pill">● Succès</span>
    </div>
  </div>
  <div class="wf-run-detail-meta">il y a 10 min · 5m20s · MANUAL</div>
  <div class="wf-run-detail-timeline">
    <!-- segments proportionnels par durée et type de node -->
    <div class="wf-run-timeline-seg wf-run-timeline-seg--shell" style="width: 5%"></div>
    <div class="wf-run-timeline-seg wf-run-timeline-seg--loop"  style="width: 90%"></div>
    <div class="wf-run-timeline-seg wf-run-timeline-seg--notify" style="width: 1%"></div>
  </div>
</div>
```

```css
.wf-run-detail-header {
  padding: 14px 16px 10px;
  border-bottom: 1px solid rgba(255,255,255,.06);
  background: linear-gradient(to bottom, rgba(var(--accent-rgb), .03), transparent);
  flex-shrink: 0;
}

.wf-run-detail-timeline {
  display: flex;
  height: 3px;
  border-radius: 2px;
  overflow: hidden;
  margin-top: 10px;
  gap: 1px;
}

.wf-run-timeline-seg { height: 100%; border-radius: 1px; min-width: 2px; }
.wf-run-timeline-seg--shell    { background: #3b82f6; }
.wf-run-timeline-seg--claude   { background: #8b5cf6; }
.wf-run-timeline-seg--loop     { background: var(--accent); }
.wf-run-timeline-seg--condition { background: #eab308; }
.wf-run-timeline-seg--file     { background: #06b6d4; }
.wf-run-timeline-seg--notify   { background: #f97316; }
.wf-run-timeline-seg--variable { background: #6b7280; }
```

### Steps — step normal (inchangé visuellement, juste ligne connectrice en accent)

```css
/* Ligne connectrice verticale en accent */
.wf-run-step:not(:last-child)::after {
  background: rgba(var(--accent-rgb), .1);
}
.wf-run-step--success:not(:last-child)::after {
  background: rgba(var(--accent-rgb), .15);
}
```

### Steps — Loop en accordéon

```html
<div class="wf-run-step wf-run-step--success wf-run-step--loop" data-step-idx="2">
  <div class="wf-run-step-header">
    <span class="wf-run-step-num">3</span>
    <span class="wf-chip wf-chip--loop">⟳</span>
    <span class="wf-run-step-name">node_5</span>
    <span class="wf-run-step-type">LOOP</span>
    <div class="wf-run-step-timing"><div class="wf-run-step-timing-bar" style="width:90%"></div></div>
    <span class="wf-run-step-dur">5m20s</span>
    <span class="wf-loop-iter-badge">×17</span>
    <span class="wf-run-step-status-icon">✓</span>
    <svg class="wf-run-step-chevron">...</svg>
  </div>

  <!-- Accordéon itérations (visible quand expanded) -->
  <div class="wf-loop-iterations" style="display:none">
    <div class="wf-loop-iter" data-iter-idx="0">
      <div class="wf-loop-iter-header">
        <span class="wf-loop-iter-num">1</span>
        <span class="wf-loop-iter-item">📁 MonProjet · E:/Perso/MonProjet</span>
        <span class="wf-loop-iter-status">✓</span>
        <span class="wf-loop-iter-dur">18s</span>
        <svg class="wf-loop-iter-chevron">...</svg>
      </div>
      <!-- Steps enfants (visibles quand itération dépliée) -->
      <div class="wf-loop-iter-steps" style="display:none">
        <div class="wf-loop-child-step wf-loop-child-step--success">
          <span class="wf-chip wf-chip--shell">⚙</span>
          <span class="wf-loop-child-type">SHELL</span>
          <div class="wf-loop-child-timing"><div style="width:20%"></div></div>
          <span class="wf-loop-child-dur">12s</span>
          <span class="wf-loop-child-status">✓</span>
          <svg class="wf-loop-child-chevron">...</svg>
        </div>
        <!-- output collapsible -->
        <div class="wf-loop-child-output" style="display:none">
          <pre class="wf-run-step-pre">...</pre>
        </div>
      </div>
    </div>
    <!-- ... autres itérations -->
  </div>
</div>
```

```css
.wf-loop-iter-badge {
  font-size: 10px;
  font-family: 'Cascadia Code', monospace;
  color: rgba(var(--accent-rgb), .7);
  font-weight: 600;
  margin-right: 4px;
}

.wf-loop-iterations {
  margin: 0 16px 8px 42px;
  border-left: 1px solid rgba(var(--accent-rgb), .2);
  border-radius: 0 0 0 4px;
  overflow: hidden;
  animation: wf-expand-in .2s ease-out;
}

.wf-loop-iter {
  border-bottom: 1px solid rgba(255,255,255,.03);
}

.wf-loop-iter-header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 10px;
  cursor: pointer;
  background: rgba(var(--accent-rgb), .02);
  transition: background .1s;
}
.wf-loop-iter-header:hover { background: rgba(var(--accent-rgb), .06); }

.wf-loop-iter-num {
  font-size: 9px;
  color: var(--text-muted);
  width: 16px;
  text-align: right;
  flex-shrink: 0;
  font-variant-numeric: tabular-nums;
}

.wf-loop-iter-item {
  font-size: 11px;
  color: var(--text-secondary);
  flex: 1;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.wf-loop-iter-dur { font-size: 10px; color: var(--text-muted); font-family: monospace; }
.wf-loop-iter-status { font-size: 11px; }
.wf-loop-iter--success .wf-loop-iter-status { color: var(--accent); }
.wf-loop-iter--failed  .wf-loop-iter-status { color: #ef4444; }

/* Steps enfants dans itération */
.wf-loop-iter-steps {
  padding: 4px 0 4px 16px;
  background: rgba(0,0,0,.15);
  animation: wf-expand-in .15s ease-out;
}

.wf-loop-child-step {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 5px 10px;
  cursor: pointer;
  border-radius: 4px;
  transition: background .1s;
}
.wf-loop-child-step:hover { background: rgba(255,255,255,.02); }

.wf-loop-child-type {
  font-size: 9px;
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: .3px;
  font-weight: 500;
}

.wf-loop-child-timing {
  flex: 1;
  height: 2px;
  background: rgba(255,255,255,.06);
  border-radius: 1px;
  overflow: hidden;
}
.wf-loop-child-timing > div { height: 100%; background: rgba(var(--accent-rgb), .3); }
.wf-loop-child-step--success .wf-loop-child-timing > div { background: rgba(var(--accent-rgb), .4); }

.wf-loop-child-dur    { font-size: 9px; color: var(--text-muted); font-family: monospace; }
.wf-loop-child-status { font-size: 11px; flex-shrink: 0; }
.wf-loop-child-step--success .wf-loop-child-status { color: var(--accent); }
.wf-loop-child-step--failed  .wf-loop-child-status { color: #ef4444; }
.wf-loop-child-step--skipped { opacity: .35; }

.wf-loop-child-output {
  padding: 4px 10px 6px 28px;
  animation: wf-expand-in .15s ease-out;
}
```

---

## État vide (aucun run sélectionné)

```html
<div class="wf-run-detail-empty">
  <span class="wf-run-detail-empty-icon">⟳</span>
  <span class="wf-run-detail-empty-text">Sélectionne un run pour voir le détail</span>
</div>
```

---

## Variable CSS requise

L'accent couleur est déjà disponible via `--accent`. Il faut ajouter `--accent-rgb` (valeur RGB sans `rgb()`) pour les `rgba()` :

```js
// Dans SettingsService.js, applyAccentColor() — ajouter :
const hex = accentColor.replace('#', '');
const r = parseInt(hex.slice(0,2), 16);
const g = parseInt(hex.slice(2,4), 16);
const b = parseInt(hex.slice(4,6), 16);
document.documentElement.style.setProperty('--accent-rgb', `${r},${g},${b}`);
```

---

## Fichiers à modifier

| Fichier | Changement |
|---------|-----------|
| `src/renderer/ui/panels/WorkflowPanel.js` | Refonte `renderRunHistory()` + `renderRunDetail()` + `buildRunRow()`, ajout logique accordéon loop |
| `styles/workflow.css` | Nouvelles classes `.wf-run-card-*`, `.wf-loop-iter-*`, `.wf-loop-child-*`, `.wf-run-detail-timeline`, layout 2 colonnes |
| `src/renderer/services/SettingsService.js` | Ajout `--accent-rgb` dans `applyAccentColor()` |

---

## Ce qui ne change PAS

- Format des données (run, steps, loop output) — aucun changement backend
- Les autres panels (Workflows, Hub)
- Le comportement live (step updates IPC) — juste adapter `_updateStepInDetail()` pour le nouveau HTML
