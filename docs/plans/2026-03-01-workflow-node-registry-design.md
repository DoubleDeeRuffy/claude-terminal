# Workflow Node Registry — Design Document

## Objectif

Passer de 6-7 fichiers à modifier pour ajouter un node, à **2 fichiers maximum** :
1. `src/main/workflow-nodes/my-node.node.js` — schema + logique d'exécution
2. `src/main/services/WorkflowRunner.js` — rien à toucher (dispatcher générique)

Tout le reste (panel, canvas, MCP, palette) se branche automatiquement.

---

## Architecture finale

```
src/main/workflow-nodes/           ← UN fichier = UN node (schema + run)
  _registry.js                     ← scan auto + expose la registry
  trigger.node.js
  claude.node.js
  shell.node.js
  git.node.js
  http.node.js
  notify.node.js
  wait.node.js
  condition.node.js
  loop.node.js
  variable.node.js
  get_variable.node.js
  log.node.js
  transform.node.js
  subworkflow.node.js
  switch.node.js
  file.node.js
  db.node.js
  project.node.js
  time.node.js

src/main/workflow-triggers/        ← UN fichier = UN trigger (logique déclenchement)
  _registry.js
  manual.trigger.js
  cron.trigger.js
  hook.trigger.js
  on_workflow.trigger.js

src/renderer/workflow-fields/      ← UN fichier = UN field custom (rendu + binding)
  _registry.js
  agent-picker.field.js
  skill-picker.field.js
  cron-picker.field.js
  variable-autocomplete.field.js
  sql-editor.field.js

src/renderer/workflow-triggers/    ← UN fichier = UN trigger (UI config)
  _registry.js
  manual.trigger.js
  cron.trigger.js
  hook.trigger.js
  on_workflow.trigger.js

src/shared/workflow-schema.js      ← allégé : PIN_TYPES, TYPE_COMPAT, helpers seulement
src/main/services/WorkflowRunner.js ← dispatcher générique ~100 lignes
src/renderer/services/WorkflowGraphEngine.js ← consomme NODE_REGISTRY via IPC/require
src/renderer/ui/panels/WorkflowPanel.js ← renderProperties() générique
resources/mcp-servers/tools/workflow.js ← getNodeSlots() généré depuis registry
```

---

## Format d'un `.node.js`

```js
module.exports = {
  // ── Identité ──────────────────────────────────────────────────────────────
  type:     'workflow/shell',
  title:    'Shell',
  desc:     'Commande bash',
  color:    'blue',       // clé dans PALETTE_COLORS
  width:    220,
  category: 'actions',   // 'triggers' | 'actions' | 'flow' | 'data'
  icon:     'shell',      // clé dans ICONS map (renderer)

  // ── Pins statiques ─────────────────────────────────────────────────────────
  inputs:  [{ name: 'In', type: 'exec' }],
  outputs: [
    { name: 'Done',     type: 'exec'   },
    { name: 'Error',    type: 'exec'   },
    { name: 'stdout',   type: 'string' },
    { name: 'stderr',   type: 'string' },
    { name: 'exitCode', type: 'number' },
  ],

  // ── Propriétés par défaut ──────────────────────────────────────────────────
  props: { command: '' },

  // ── Champs du panel (générés automatiquement) ──────────────────────────────
  fields: [
    { type: 'textarea', key: 'command', label: 'Command', mono: true,
      placeholder: 'echo hello' },
  ],

  // ── Canvas UI (renderer uniquement, optionnel) ────────────────────────────
  badge:     (n) => '$',
  drawExtra: (ctx, n) => { /* affiche la commande en petit */ },

  // ── Dynamic pins (optionnel) ──────────────────────────────────────────────
  // dynamic: 'switch' | 'time' | 'variable'
  // rebuildOutputs(node) { ... }

  // ── Logique d'exécution (main process) ────────────────────────────────────
  async run(config, vars, signal) {
    const { execSync } = require('child_process');
    const cmd = resolveVars(config.command, vars);
    try {
      const stdout = execSync(cmd, { encoding: 'utf8' });
      return { stdout, stderr: '', exitCode: 0 };
    } catch (e) {
      return { stdout: '', stderr: e.message, exitCode: e.status ?? 1 };
    }
  },
};
```

---

## Format d'un `.field.js`

```js
// src/renderer/workflow-fields/agent-picker.field.js
module.exports = {
  type: 'agent-picker',

  // Génère le HTML du field
  render(field, value, node) {
    return `<div class="wf-agent-grid" data-key="${field.key}">...</div>`;
  },

  // Branche les événements après injection dans le DOM
  bind(container, field, node, onChange) {
    container.querySelectorAll('.wf-agent-card').forEach(card => {
      card.addEventListener('click', () => onChange(card.dataset.id));
    });
  },
};
```

Utilisé dans un node :
```js
fields: [
  { type: 'agent-picker', key: 'agentId', label: 'Agent' },
]
```

---

## Format d'un `.trigger.js` (main)

```js
// src/main/workflow-triggers/cron.trigger.js
module.exports = {
  type:  'cron',
  label: 'Planifié',

  // Vérifie si le trigger doit se déclencher (polling)
  shouldFire(config, context) {
    return cronMatches(config.triggerValue, new Date());
  },

  // Setup au démarrage du workflow (retourne une fonction teardown)
  setup(config, onFire) {
    const job = scheduleCron(config.triggerValue, onFire);
    return () => job.stop();
  },
};
```

## Format d'un `.trigger.js` (renderer)

```js
// src/renderer/workflow-triggers/cron.trigger.js
module.exports = {
  type: 'cron',

  fields: [
    { type: 'cron-picker', key: 'triggerValue', label: 'Planning' },
  ],
};
```

---

## Types de fields supportés

| type | rendu HTML |
|------|-----------|
| `text` | `<input type="text">` |
| `textarea` | `<textarea>` |
| `select` | dropdown custom `.wf-dropdown` |
| `toggle` | checkbox stylée |
| `hint` | bloc info statique (read-only) |
| `conditional` | groupe affiché si `showIf(props)` retourne true |
| `agent-picker` | grille agents (custom field) |
| `skill-picker` | grille skills (custom field) |
| `cron-picker` | picker cron visuel (custom field) |
| `variable-autocomplete` | input avec autocomplete variables (custom field) |
| `sql-editor` | textarea avec smart SQL hints (custom field) |
| `custom` | escape hatch : `render(field, value, node)` inline |

---

## `_registry.js` (pattern commun)

```js
// Pattern utilisé dans les 4 dossiers registry
const fs   = require('fs');
const path = require('path');
const _map = new Map();

function load() {
  for (const file of fs.readdirSync(__dirname)) {
    if (file.startsWith('_') || !file.endsWith('.node.js')) continue;
    const def = require(path.join(__dirname, file));
    _map.set(def.type, def);
  }
}

function get(type)   { return _map.get(type); }
function getAll()    { return [..._map.values()]; }
function has(type)   { return _map.has(type); }

module.exports = { load, get, getAll, has };
```

---

## WorkflowRunner — dispatcher générique

```js
// Avant : ~600 lignes avec runShellStep(), runGitStep(), etc.
// Après : ~100 lignes

const registry = require('../workflow-nodes/_registry');

async function executeStep(step, vars, signal) {
  const def = registry.get('workflow/' + step.type);
  if (!def?.run) throw new Error(`Unknown node type: ${step.type}`);

  const config = _resolveDataInputs(step, vars);
  return await def.run(config, vars, signal);
}
```

---

## MCP — getNodeSlots() généré

```js
// Avant : 27 switch cases manuels (~200 lignes)
// Après :
function getNodeSlots(type) {
  const def = registry.get(type);
  if (!def) return { inputs: execIn(), outputs: execOut('Done', 'Error') };
  return {
    inputs:  def.inputs.map(i => slot(i.name, i.type === 'exec' ? EXEC : i.type)),
    outputs: def.outputs.map((o, idx) =>
      outSlot(o.name, o.type === 'exec' ? EXEC : o.type, idx)
    ),
  };
}
```

---

## renderProperties() — moteur générique

```js
function renderProperties(node) {
  const def = rendererRegistry.get(node.type); // registry renderer
  if (!def) return '<p>Node inconnu</p>';

  return def.fields.map(field => {
    const value = node.properties[field.key] ?? '';
    if (field.showIf && !field.showIf(node.properties)) return '';

    const fieldRenderer = fieldRegistry.get(field.type)
      ?? builtinFields[field.type];
    if (!fieldRenderer) return '';

    return fieldRenderer.render(field, value, node);
  }).join('');
}
```

---

## Ce qui ne change pas

- Format JSON des workflows sauvegardés → **identique**
- Canvas rendering (WorkflowGraphEngine) → **identique**
- API publique WorkflowRunner → **identique**
- Nodes dynamiques (switch, time, variable) → `rebuildOutputs()` déplacé dans leur `.node.js`
- Styles CSS → **identiques**

---

## Plan de migration

### Phase 1 — Infrastructure (sans casser l'existant)
1. Créer `src/main/workflow-nodes/_registry.js`
2. Créer `src/renderer/workflow-fields/_registry.js`
3. Créer `src/renderer/workflow-triggers/_registry.js`
4. Créer `src/main/workflow-triggers/_registry.js`

### Phase 2 — Migrer les nodes un par un
1. Créer chaque `.node.js` avec schema + `run()` extrait de WorkflowRunner
2. Vérifier que WorkflowRunner dispatch correctement
3. Ne supprimer l'ancien `runXxxStep()` qu'après test

### Phase 3 — Migrer le panel
1. Créer les `workflow-fields/` custom (agent-picker, cron-picker, etc.)
2. Réécrire `renderProperties()` en moteur générique
3. Vérifier visuellement chaque node

### Phase 4 — Migrer le MCP
1. Brancher `getNodeSlots()` sur la registry
2. Supprimer les 27 switch cases

### Phase 5 — Nettoyer
1. Alléger `workflow-schema.js` (supprimer NODE_DATA_OUTPUTS, NODE_DATA_OUT_OFFSET)
2. Supprimer `STEP_TYPES` de WorkflowHelpers (généré depuis registry)
3. Supprimer `NODE_OUTPUTS` de WorkflowHelpers (généré depuis registry)
