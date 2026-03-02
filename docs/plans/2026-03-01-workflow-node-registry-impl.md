# Workflow Node Registry — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Refactoriser le système de nodes workflow pour qu'ajouter un node = 2 fichiers max (un `.node.js` + optionnellement WorkflowRunner).

**Architecture:** Chaque node est un fichier `.node.js` autonome dans `src/main/workflow-nodes/` exposant son schema (inputs, outputs, fields, props) ET sa logique `run()`. Une registry centrale charge automatiquement tous ces fichiers. WorkflowPanel, GraphEngine, et le MCP consomment la registry pour générer leur comportement automatiquement.

**Tech Stack:** Node.js (CommonJS), Electron (main + renderer), canvas 2D, IPC

---

## Contexte et fichiers clés

- `src/shared/workflow-schema.js` — actuellement source de vérité partielle (couleurs, PIN_TYPES)
- `src/main/services/WorkflowRunner.js` — dispatcher avec `runShellStep()`, `runGitStep()`, etc.
- `src/renderer/services/WorkflowGraphEngine.js` — NODE_TYPES définitions canvas
- `src/renderer/ui/panels/WorkflowPanel.js` — renderProperties() ~1400 lignes
- `src/renderer/ui/panels/WorkflowHelpers.js` — STEP_TYPES, STEP_FIELDS
- `resources/mcp-servers/tools/workflow.js` — getNodeSlots() 27 switch cases

## Convention `.node.js`

```js
module.exports = {
  // Identité
  type:     'workflow/shell',   // OBLIGATOIRE
  title:    'Shell',
  desc:     'Commande bash',
  color:    'blue',             // clé dans PALETTE_COLORS de workflow-schema.js
  width:    220,
  category: 'actions',          // 'triggers'|'actions'|'flow'|'data'
  icon:     'shell',            // clé dans ICONS (WorkflowHelpers)

  // Pins
  inputs:  [{ name: 'In', type: 'exec' }],
  outputs: [
    { name: 'Done',  type: 'exec'   },
    { name: 'Error', type: 'exec'   },
    { name: 'stdout',type: 'string' },
  ],

  // Props par défaut
  props: { command: '' },

  // Champs panel (générés automatiquement)
  fields: [
    { type: 'textarea', key: 'command', label: 'Command', mono: true },
  ],

  // Canvas UI (optionnel, renderer-only)
  badge:     (n) => '$',
  drawExtra: (ctx, n) => {},
  dynamic:   null, // 'switch'|'time'|'variable' si pins dynamiques
  rebuildOutputs: (engine, node) => {}, // si dynamic != null

  // Logique d'exécution (main process)
  async run(config, vars, signal) {
    return { stdout: '...', stderr: '', exitCode: 0 };
  },
};
```

## Types de fields supportés dans `fields[]`

```js
{ type: 'text',     key, label, placeholder, mono }
{ type: 'textarea', key, label, placeholder, mono, rows }
{ type: 'select',   key, label, options: ['A','B'] }
{ type: 'toggle',   key, label }
{ type: 'hint',     text }
{ type: 'custom',   key, label, render(field, value, node) => html, bind(container, field, node, onChange) }
{ showIf: (props) => boolean }  // sur n'importe quel field
```

---

## Task 1 : Créer la registry principale

**Files:**
- Create: `src/main/workflow-nodes/_registry.js`

**Step 1 : Créer le fichier**

```js
// src/main/workflow-nodes/_registry.js
'use strict';

const fs   = require('fs');
const path = require('path');

const _nodes = new Map();
let _loaded  = false;

function loadRegistry() {
  if (_loaded) return;
  _loaded = true;
  const dir = __dirname;
  for (const file of fs.readdirSync(dir)) {
    if (file.startsWith('_') || !file.endsWith('.node.js')) continue;
    try {
      const def = require(path.join(dir, file));
      if (!def.type) { console.warn(`[NodeRegistry] ${file} missing 'type'`); continue; }
      _nodes.set(def.type, def);
    } catch (e) {
      console.error(`[NodeRegistry] Failed to load ${file}:`, e.message);
    }
  }
}

function get(type)        { return _nodes.get(type) || null; }
function getAll()         { return [..._nodes.values()]; }
function has(type)        { return _nodes.has(type); }
function getTypes()       { return [..._nodes.keys()]; }

module.exports = { loadRegistry, get, getAll, has, getTypes };
```

**Step 2 : Vérifier que le fichier existe**

```bash
ls src/main/workflow-nodes/
```
Attendu : `_registry.js`

**Step 3 : Commit**

```bash
git add src/main/workflow-nodes/_registry.js
git commit -m "feat(workflow): add node registry loader"
```

---

## Task 2 : Migrer shell, git, http vers `.node.js`

Ces 3 nodes sont simples (pas de dynamic pins). On les migre en premier pour valider le pattern.

**Files:**
- Create: `src/main/workflow-nodes/shell.node.js`
- Create: `src/main/workflow-nodes/git.node.js`
- Create: `src/main/workflow-nodes/http.node.js`
- Read: `src/main/services/WorkflowRunner.js` (lignes 150-280) pour copier la logique `run()`

**Step 1 : Créer `shell.node.js`**

```js
// src/main/workflow-nodes/shell.node.js
'use strict';

const { execFile } = require('child_process');

function resolveVars(v, vars) {
  // Import inline pour éviter dépendance circulaire
  return require('../services/WorkflowRunner').resolveVars(v, vars);
}

module.exports = {
  type:     'workflow/shell',
  title:    'Shell',
  desc:     'Commande bash',
  color:    'blue',
  width:    220,
  category: 'actions',
  icon:     'shell',

  inputs:  [{ name: 'In', type: 'exec' }],
  outputs: [
    { name: 'Done',     type: 'exec'   },
    { name: 'Error',    type: 'exec'   },
    { name: 'stdout',   type: 'string' },
    { name: 'stderr',   type: 'string' },
    { name: 'exitCode', type: 'number' },
  ],

  props: { command: '' },

  fields: [
    { type: 'textarea', key: 'command', label: 'Commande', mono: true,
      placeholder: 'npm run build' },
  ],

  badge: () => '$',
  drawExtra: (ctx, n) => {
    const MONO = '"Cascadia Code","Fira Code",monospace';
    if (n.properties.command) {
      ctx.fillStyle = '#444';
      ctx.font = `10px ${MONO}`;
      const cmd = n.properties.command.length > 28
        ? n.properties.command.slice(0, 28) + '...'
        : n.properties.command;
      ctx.textAlign = 'left';
      ctx.fillText('$ ' + cmd, 10, n.size[1] - 6);
    }
  },

  async run(config, vars, signal) {
    const { resolveVars: rv } = require('../services/WorkflowRunner');
    const raw = rv(config.command || '', vars);
    if (!raw.trim()) throw new Error('No command specified');

    return new Promise((resolve, reject) => {
      if (signal?.aborted) return reject(new Error('Aborted'));
      const proc = require('child_process').exec(raw,
        { timeout: 60000, encoding: 'utf8' },
        (err, stdout, stderr) => {
          if (signal?.aborted) return reject(new Error('Aborted'));
          resolve({
            stdout: stdout || '',
            stderr: stderr || '',
            exitCode: err ? (err.code ?? 1) : 0,
          });
        }
      );
      signal?.addEventListener('abort', () => proc.kill());
    });
  },
};
```

**Step 2 : Créer `git.node.js`**

```js
// src/main/workflow-nodes/git.node.js
'use strict';

module.exports = {
  type:     'workflow/git',
  title:    'Git',
  desc:     'Opération git',
  color:    'purple',
  width:    200,
  category: 'actions',
  icon:     'git',

  inputs:  [{ name: 'In', type: 'exec' }],
  outputs: [
    { name: 'Done',   type: 'exec'   },
    { name: 'Error',  type: 'exec'   },
    { name: 'output', type: 'string' },
  ],

  props: { action: 'pull', branch: '', message: '' },

  fields: [
    { type: 'select', key: 'action', label: 'Action',
      options: ['pull','push','commit','checkout','merge','stash','stash-pop','reset'] },
    { type: 'text', key: 'branch', label: 'Branche', mono: true,
      placeholder: 'main', showIf: (p) => ['checkout','merge'].includes(p.action) },
    { type: 'text', key: 'message', label: 'Message', mono: true,
      placeholder: 'feat: ...', showIf: (p) => p.action === 'commit' },
  ],

  badge: (n) => (n.properties.action || 'pull').toUpperCase(),

  async run(config, vars, signal) {
    // Déléguer à WorkflowRunner.runGitStep (pour l'instant)
    const { runGitStep } = require('../services/WorkflowRunner');
    return runGitStep(config, vars, signal);
  },
};
```

**Step 3 : Créer `http.node.js`**

```js
// src/main/workflow-nodes/http.node.js
'use strict';

module.exports = {
  type:     'workflow/http',
  title:    'HTTP',
  desc:     'Requête API',
  color:    'cyan',
  width:    220,
  category: 'actions',
  icon:     'http',

  inputs:  [{ name: 'In', type: 'exec' }],
  outputs: [
    { name: 'Done',   type: 'exec'    },
    { name: 'Error',  type: 'exec'    },
    { name: 'body',   type: 'object'  },
    { name: 'status', type: 'number'  },
    { name: 'ok',     type: 'boolean' },
  ],

  props: { method: 'GET', url: '', headers: '', body: '' },

  fields: [
    { type: 'select', key: 'method', label: 'Méthode',
      options: ['GET','POST','PUT','PATCH','DELETE'] },
    { type: 'text',     key: 'url',     label: 'URL', mono: true,
      placeholder: 'https://api.example.com/...' },
    { type: 'textarea', key: 'headers', label: 'Headers', mono: true,
      placeholder: 'Content-Type: application/json',
      showIf: (p) => ['POST','PUT','PATCH'].includes(p.method) },
    { type: 'textarea', key: 'body',    label: 'Body', mono: true,
      placeholder: '{"key":"value"}',
      showIf: (p) => ['POST','PUT','PATCH'].includes(p.method) },
  ],

  badge: (n) => n.properties.method || 'GET',
  badgeColor: (n) => ({
    GET:'#22c55e', POST:'#3b82f6', PUT:'#f59e0b',
    PATCH:'#a78bfa', DELETE:'#ef4444',
  }[n.properties.method] || '#22d3ee'),

  async run(config, vars, signal) {
    const { runHttpStep } = require('../services/WorkflowRunner');
    return runHttpStep(config, vars, signal);
  },
};
```

**Step 4 : Commit**

```bash
git add src/main/workflow-nodes/shell.node.js src/main/workflow-nodes/git.node.js src/main/workflow-nodes/http.node.js
git commit -m "feat(workflow): add shell, git, http node definitions"
```

---

## Task 3 : Migrer les nodes restants (notify, wait, file, db, project, time, log, transform, subworkflow, condition, loop, variable, get_variable, switch, trigger, claude)

Même pattern que Task 2. Pour chaque node, créer `src/main/workflow-nodes/<type>.node.js` avec :
- `type`, `title`, `desc`, `color`, `width`, `category`, `icon`
- `inputs`, `outputs` (copiés depuis `NODE_TYPES` dans GraphEngine.js)
- `props` (copiés depuis `NODE_TYPES`)
- `fields` (convertis depuis `STEP_FIELDS` dans WorkflowHelpers.js + `renderProperties()` dans WorkflowPanel.js)
- `badge`, `drawExtra` (optionnels, copiés depuis `NODE_TYPES`)
- `async run()` (délègue à WorkflowRunner pour l'instant)

**Files:**
- Create: `src/main/workflow-nodes/notify.node.js`
- Create: `src/main/workflow-nodes/wait.node.js`
- Create: `src/main/workflow-nodes/file.node.js`
- Create: `src/main/workflow-nodes/db.node.js`
- Create: `src/main/workflow-nodes/project.node.js`
- Create: `src/main/workflow-nodes/time.node.js`
- Create: `src/main/workflow-nodes/log.node.js`
- Create: `src/main/workflow-nodes/transform.node.js`
- Create: `src/main/workflow-nodes/subworkflow.node.js`
- Create: `src/main/workflow-nodes/condition.node.js`
- Create: `src/main/workflow-nodes/loop.node.js`
- Create: `src/main/workflow-nodes/variable.node.js`
- Create: `src/main/workflow-nodes/get_variable.node.js`
- Create: `src/main/workflow-nodes/switch.node.js`
- Create: `src/main/workflow-nodes/trigger.node.js`
- Create: `src/main/workflow-nodes/claude.node.js`

**Notes importantes :**
- `variable.node.js` et `switch.node.js` et `time.node.js` ont `dynamic: true` et une méthode `rebuildOutputs(engine, node)` (copie de `_rebuildVariablePins`, `_rebuildSwitchOutputs`, `_rebuildTimeOutputs` depuis GraphEngine.js)
- `claude.node.js` a les fields les plus complexes : `agent-picker`, `skill-picker`, `model-select` → utiliser `type: 'custom'` pour ces fields dans un premier temps
- `trigger.node.js` a `removable: false`

**Exemple pour `variable.node.js` (avec dynamic):**

```js
module.exports = {
  type:     'workflow/variable',
  title:    'Set Variable',
  desc:     'Lire/écrire une variable',
  color:    'purple',
  width:    200,
  category: 'data',
  icon:     'variable',
  dynamic:  'variable',

  inputs:  [{ name: 'In', type: 'exec' }, { name: 'value', type: 'any' }],
  outputs: [{ name: 'Done', type: 'exec' }, { name: 'value', type: 'any' }],
  props:   { action: 'set', name: '', value: '' },

  fields: [
    { type: 'select', key: 'action', label: 'Action',
      options: ['set','get','increment','append'] },
    { type: 'text', key: 'name', label: 'Nom de la variable', mono: true,
      placeholder: 'myVar' },
    { type: 'text', key: 'value', label: 'Valeur', mono: true,
      showIf: (p) => p.action === 'set' || p.action === 'append' },
  ],

  badge: (n) => (n.properties.action || 'set').toUpperCase(),
  getTitle: (n) => {
    const a = n.properties.action || 'set';
    const nm = n.properties.name;
    if (a === 'get') return nm ? `Get ${nm}` : 'Get Variable';
    if (a === 'set') return nm ? `Set ${nm}` : 'Set Variable';
    if (a === 'increment') return nm ? `++ ${nm}` : 'Increment';
    if (a === 'append') return nm ? `Append ${nm}` : 'Append';
    return 'Variable';
  },

  // Appelé par GraphEngine quand action change
  rebuildOutputs(engine, node) {
    engine._rebuildVariablePins(node);
  },

  async run(config, vars, signal) {
    const { runVariableStep } = require('../services/WorkflowRunner');
    return runVariableStep(config, vars, signal);
  },
};
```

**Step 1 : Créer tous les `.node.js` restants** (un par un)

**Step 2 : Vérifier que tous les fichiers sont créés**

```bash
ls src/main/workflow-nodes/*.node.js | wc -l
```
Attendu : 19 fichiers

**Step 3 : Commit**

```bash
git add src/main/workflow-nodes/
git commit -m "feat(workflow): migrate all node definitions to .node.js files"
```

---

## Task 4 : Exposer la registry au renderer via IPC

Le renderer n'a pas accès direct à `require()` des fichiers main. Il faut exposer la registry via IPC.

**Files:**
- Modify: `src/main/ipc/workflow.ipc.js`
- Modify: `src/main/preload.js`

**Step 1 : Ajouter un handler IPC dans `workflow.ipc.js`**

Chercher la ligne avec `registerWorkflowHandlers` et ajouter :

```js
// Dans registerWorkflowHandlers()
ipcMain.handle('workflow:get-node-registry', () => {
  const registry = require('../workflow-nodes/_registry');
  registry.loadRegistry();
  // Sérialiser : on ne peut pas envoyer des fonctions via IPC
  return registry.getAll().map(def => ({
    type:     def.type,
    title:    def.title,
    desc:     def.desc,
    color:    def.color,
    width:    def.width,
    category: def.category,
    icon:     def.icon,
    inputs:   def.inputs,
    outputs:  def.outputs,
    props:    def.props,
    fields:   def.fields ? def.fields.map(f => ({
      ...f,
      // showIf est une fonction → sérialiser en string, re-eval côté renderer
      showIf: f.showIf ? f.showIf.toString() : undefined,
    })) : [],
    dynamic:  def.dynamic || null,
    removable: def.removable !== false,
    resizable: def.resizable !== false,
  }));
});
```

**Step 2 : Exposer dans preload.js**

Trouver la section `workflow:` dans preload.js et ajouter :

```js
getNodeRegistry: () => ipcRenderer.invoke('workflow:get-node-registry'),
```

**Step 3 : Créer `src/renderer/services/NodeRegistry.js`**

```js
// src/renderer/services/NodeRegistry.js
'use strict';

let _registry = null;
let _byType   = new Map();

async function loadNodeRegistry() {
  if (_registry) return _registry;
  const api = window.electron_api?.workflow;
  const defs = await api.getNodeRegistry();
  _registry = defs;
  _byType.clear();
  for (const def of defs) {
    // Re-hydrater les showIf (string → function)
    const hydrated = { ...def };
    if (hydrated.fields) {
      hydrated.fields = hydrated.fields.map(f => {
        if (f.showIf && typeof f.showIf === 'string') {
          try { f = { ...f, showIf: eval(`(${f.showIf})`) }; } catch {}
        }
        return f;
      });
    }
    _byType.set(def.type, hydrated);
  }
  return _registry;
}

function get(type)  { return _byType.get(type) || null; }
function getAll()   { return _registry || []; }
function has(type)  { return _byType.has(type); }

module.exports = { loadNodeRegistry, get, getAll, has };
```

**Step 4 : Commit**

```bash
git add src/main/ipc/workflow.ipc.js src/main/preload.js src/renderer/services/NodeRegistry.js
git commit -m "feat(workflow): expose node registry via IPC to renderer"
```

---

## Task 5 : Brancher GraphEngine sur la registry

Remplacer `NODE_TYPES` hardcodé dans `WorkflowGraphEngine.js` par la registry.

**Files:**
- Modify: `src/renderer/services/WorkflowGraphEngine.js`

**Step 1 : Importer NodeRegistry au lieu de NODE_TYPES**

En haut du fichier, après les imports existants :

```js
const nodeRegistry = require('./NodeRegistry');
```

**Step 2 : Remplacer `addNode()` pour lire depuis la registry**

Trouver `addNode(typeName, pos)` (~ligne 513) et remplacer :

```js
addNode(typeName, pos) {
  // Chercher d'abord dans la registry dynamique, fallback sur NODE_TYPES legacy
  const def = nodeRegistry.get(typeName) || NODE_TYPES[typeName];
  if (!def) return null;
  // ... reste identique
}
```

**Step 3 : Remplacer les rebuild dans addNode**

Dans `addNode()`, remplacer le bloc `if (def.dynamic === 'switch')` :

```js
// Dynamic rebuild : déléguer au node def si disponible
if (def.dynamic && def.rebuildOutputs) {
  def.rebuildOutputs(this, node);
} else if (def.dynamic === 'switch') {
  this._rebuildSwitchOutputs(node);
} else if (def.dynamic === 'time') {
  this._rebuildTimeOutputs(node);
}
```

**Step 4 : Initialiser la registry au démarrage de GraphEngine**

Dans le constructeur de `WorkflowGraphEngine`, ajouter :

```js
// Charger la registry (async, non-bloquant)
nodeRegistry.loadNodeRegistry().catch(e =>
  console.warn('[GraphEngine] Registry load failed:', e)
);
```

**Step 5 : Vérifier que tous les nodes s'affichent toujours dans le canvas**

Lancer `npm run build:renderer && npm start` et ouvrir un workflow existant.
Attendu : tous les nodes s'affichent correctement.

**Step 6 : Commit**

```bash
git add src/renderer/services/WorkflowGraphEngine.js
git commit -m "feat(workflow): branch GraphEngine onto node registry"
```

---

## Task 6 : Créer la registry des fields custom (renderer)

**Files:**
- Create: `src/renderer/workflow-fields/_registry.js`
- Create: `src/renderer/workflow-fields/agent-picker.field.js`
- Create: `src/renderer/workflow-fields/skill-picker.field.js`
- Create: `src/renderer/workflow-fields/cron-picker.field.js`
- Create: `src/renderer/workflow-fields/variable-autocomplete.field.js`
- Create: `src/renderer/workflow-fields/sql-editor.field.js`

**Step 1 : Créer `_registry.js`**

```js
// src/renderer/workflow-fields/_registry.js
'use strict';

const _fields = new Map();

function register(def) {
  if (!def.type) throw new Error('Field def missing type');
  _fields.set(def.type, def);
}

function get(type)  { return _fields.get(type) || null; }
function getAll()   { return [..._fields.values()]; }

// Chargement automatique de tous les .field.js dans ce dossier
// (appelé manuellement au init, pas via fs car renderer)
function loadBuiltins() {
  const builtins = [
    require('./agent-picker.field'),
    require('./skill-picker.field'),
    require('./cron-picker.field'),
    require('./variable-autocomplete.field'),
    require('./sql-editor.field'),
  ];
  for (const f of builtins) register(f);
}

module.exports = { register, get, getAll, loadBuiltins };
```

**Step 2 : Créer `agent-picker.field.js`**

Extraire la logique d'affichage des agents de `renderProperties()` dans WorkflowPanel.js (chercher `wf-agent-grid` ou `agentId`).

```js
// src/renderer/workflow-fields/agent-picker.field.js
'use strict';

const { getAgents } = require('../services/AgentService');
const { escapeHtml } = require('../utils');

module.exports = {
  type: 'agent-picker',

  render(field, value, node) {
    const agents = getAgents() || [];
    const cards = agents.map(a => `
      <div class="wf-agent-card ${value === a.id ? 'selected' : ''}"
           data-id="${escapeHtml(a.id)}" title="${escapeHtml(a.name)}">
        <span class="wf-agent-card-name">${escapeHtml(a.name)}</span>
      </div>
    `).join('');
    return `
      <div class="wf-field-group">
        <label class="wf-field-label">${escapeHtml(field.label || 'Agent')}</label>
        <div class="wf-agent-grid" data-key="${field.key}">${cards}</div>
      </div>`;
  },

  bind(container, field, node, onChange) {
    container.querySelectorAll(`.wf-agent-grid[data-key="${field.key}"] .wf-agent-card`)
      .forEach(card => card.addEventListener('click', () => {
        container.querySelectorAll('.wf-agent-card').forEach(c => c.classList.remove('selected'));
        card.classList.add('selected');
        onChange(card.dataset.id);
      }));
  },
};
```

**Step 3 : Créer `skill-picker.field.js`** (même pattern que agent-picker)

**Step 4 : Créer `cron-picker.field.js`**

Extraire `drawCronPicker` de WorkflowHelpers.js :

```js
// src/renderer/workflow-fields/cron-picker.field.js
'use strict';

const { drawCronPicker, parseCronToMode, buildCronFromMode } = require('../ui/panels/WorkflowHelpers');

module.exports = {
  type: 'cron-picker',

  render(field, value, node) {
    return `
      <div class="wf-field-group">
        <label class="wf-field-label">${field.label || 'Planning'}</label>
        <div class="wf-cron-picker" data-key="${field.key}" data-value="${value || ''}"></div>
      </div>`;
  },

  bind(container, field, node, onChange) {
    const el = container.querySelector(`.wf-cron-picker[data-key="${field.key}"]`);
    if (el) drawCronPicker(el, el.dataset.value || '', onChange);
  },
};
```

**Step 5 : Créer les autres fields** (`variable-autocomplete.field.js`, `sql-editor.field.js`) en extrayant la logique correspondante de WorkflowHelpers.js

**Step 6 : Commit**

```bash
git add src/renderer/workflow-fields/
git commit -m "feat(workflow): add custom field renderers registry"
```

---

## Task 7 : Réécrire renderProperties() en moteur générique

C'est la tâche la plus importante. On remplace les 1400 lignes de HTML en dur par un moteur qui parcourt `node.fields[]`.

**Files:**
- Modify: `src/renderer/ui/panels/WorkflowPanel.js`

**Step 1 : Ajouter le moteur générique en haut de renderProperties**

Trouver `function renderProperties(node)` dans WorkflowPanel.js et le remplacer par :

```js
// ── Built-in field renderers ────────────────────────────────────────────────
const builtinFieldRenderers = {
  text(field, value) {
    return `
      <div class="wf-field-group">
        <label class="wf-field-label">${escapeHtml(field.label || field.key)}</label>
        <input class="wf-step-edit-input wf-node-prop ${field.mono ? 'mono' : ''}"
               data-key="${field.key}" value="${escapeHtml(String(value ?? ''))}"
               placeholder="${escapeHtml(field.placeholder || '')}" />
      </div>`;
  },

  textarea(field, value) {
    const rows = field.rows || 3;
    return `
      <div class="wf-field-group">
        <label class="wf-field-label">${escapeHtml(field.label || field.key)}</label>
        <textarea class="wf-step-edit-input wf-node-prop ${field.mono ? 'mono' : ''}"
                  data-key="${field.key}" rows="${rows}"
                  placeholder="${escapeHtml(field.placeholder || '')}">${escapeHtml(String(value ?? ''))}</textarea>
      </div>`;
  },

  select(field, value) {
    const options = (field.options || []).map(o =>
      `<option value="${escapeHtml(o)}" ${o === value ? 'selected' : ''}>${escapeHtml(o)}</option>`
    ).join('');
    return `
      <div class="wf-field-group">
        <label class="wf-field-label">${escapeHtml(field.label || field.key)}</label>
        <select class="wf-step-edit-input wf-node-prop" data-key="${field.key}">${options}</select>
      </div>`;
  },

  toggle(field, value) {
    return `
      <div class="wf-field-group wf-field-group--inline">
        <label class="wf-field-label">${escapeHtml(field.label || field.key)}</label>
        <input type="checkbox" class="wf-node-prop" data-key="${field.key}"
               ${value ? 'checked' : ''} />
      </div>`;
  },

  hint(field) {
    return `<div class="wf-field-hint">${field.text || ''}</div>`;
  },
};

function renderNodeFields(node, def) {
  if (!def?.fields?.length) return '';
  const props = node.properties || {};
  const { loadBuiltins, get: getFieldRenderer } = require('../../workflow-fields/_registry');
  loadBuiltins();

  return def.fields.map(field => {
    // Évaluer showIf
    if (field.showIf && !field.showIf(props)) return '';

    const value = props[field.key] ?? '';

    // Custom field renderer (ex: agent-picker)
    const customRenderer = getFieldRenderer(field.type);
    if (customRenderer) return customRenderer.render(field, value, node);

    // Built-in renderer
    const builtinRenderer = builtinFieldRenderers[field.type];
    if (builtinRenderer) return builtinRenderer(field, value);

    // Fallback : text
    return builtinFieldRenderers.text(field, value);
  }).join('');
}

function renderProperties(node) {
  if (!node) {
    // ... (garder l'existant pour les settings workflow)
    return renderWorkflowSettings();
  }

  const { get: getNodeDef } = require('../../services/NodeRegistry');
  const def = getNodeDef(node.type);

  // Si def trouvé dans registry → rendu générique
  if (def) {
    const fieldsHtml = renderNodeFields(node, def);
    return `
      <div class="wf-properties-header">
        <span class="wf-node-type-label">${escapeHtml(def.title)}</span>
        <span class="wf-node-desc">${escapeHtml(def.desc || '')}</span>
      </div>
      <div class="wf-properties-fields">${fieldsHtml}</div>
    `;
  }

  // Fallback : ancien rendu manuel (à supprimer progressivement)
  return renderPropertiesLegacy(node);
}
```

**Step 2 : Renommer l'ancienne fonction en `renderPropertiesLegacy`**

```js
// Renommer l'ancienne fonction pour garder le fallback
function renderPropertiesLegacy(node) {
  // ... ancien code inchangé ...
}
```

**Step 3 : Bind des fields génériques**

Dans la fonction qui gère les événements du panel (chercher `wf-node-prop` dans WorkflowPanel.js), ajouter le binding pour les fields custom après l'injection HTML :

```js
function bindPropertiesFields(container, node) {
  const { get: getNodeDef } = require('../../services/NodeRegistry');
  const { loadBuiltins, get: getFieldRenderer } = require('../../workflow-fields/_registry');
  const def = getNodeDef(node.type);
  if (!def?.fields) return;

  loadBuiltins();
  const props = node.properties || {};

  for (const field of def.fields) {
    if (field.showIf && !field.showIf(props)) continue;
    const customRenderer = getFieldRenderer(field.type);
    if (customRenderer?.bind) {
      customRenderer.bind(container, field, node, (val) => {
        node.properties[field.key] = val;
        // trigger rebuild si nécessaire
        if (field.key === 'action' && def.dynamic && def.rebuildOutputs) {
          def.rebuildOutputs(getGraphService(), node);
        }
        getGraphService()._markDirty();
        getGraphService()._notifyChanged();
      });
    }
  }
}
```

**Step 4 : Tester visuellement les nodes simples (shell, http, notify)**

```bash
npm run build:renderer && npm start
```

Ouvrir un workflow → cliquer sur un node Shell → vérifier que le panel affiche les champs.

**Step 5 : Commit**

```bash
git add src/renderer/ui/panels/WorkflowPanel.js
git commit -m "feat(workflow): add generic renderProperties() engine with registry"
```

---

## Task 8 : Brancher le MCP sur la registry

**Files:**
- Modify: `resources/mcp-servers/tools/workflow.js`

**Step 1 : Importer la registry dans workflow.js**

En haut du fichier, après les requires existants :

```js
const nodeRegistryPath = path.join(__dirname, '../../src/main/workflow-nodes/_registry');
let _nodeRegistry = null;
function getNodeRegistry() {
  if (_nodeRegistry) return _nodeRegistry;
  try {
    const r = require(nodeRegistryPath);
    r.loadRegistry();
    _nodeRegistry = r;
  } catch (e) {
    console.warn('[MCP] Could not load node registry:', e.message);
  }
  return _nodeRegistry;
}
```

**Step 2 : Remplacer `getNodeSlots()` par une version générée**

```js
function getNodeSlots(type) {
  const registry = getNodeRegistry();
  if (registry) {
    const def = registry.get(type);
    if (def) {
      return {
        inputs: def.inputs.map(i => slot(i.name, i.type === 'exec' ? EXEC : i.type)),
        outputs: def.outputs.map((o, idx) =>
          outSlot(o.name, o.type === 'exec' ? EXEC : o.type, idx)
        ),
      };
    }
  }
  // Fallback legacy (à supprimer après validation)
  return getNodeSlotsLegacy(type);
}

// Renommer l'ancienne fonction
function getNodeSlotsLegacy(type) {
  switch (type) {
    // ... ancien switch inchangé ...
  }
}
```

**Step 3 : Vérifier que le MCP fonctionne toujours**

```bash
node resources/mcp-servers/tools/workflow.js
```
Attendu : pas d'erreur

**Step 4 : Commit**

```bash
git add resources/mcp-servers/tools/workflow.js
git commit -m "feat(workflow): generate MCP getNodeSlots from node registry"
```

---

## Task 9 : Brancher WorkflowRunner sur la registry

**Files:**
- Modify: `src/main/services/WorkflowRunner.js`

**Step 1 : Charger la registry au démarrage**

En haut de WorkflowRunner.js, après les requires existants :

```js
const nodeRegistry = require('../workflow-nodes/_registry');
nodeRegistry.loadRegistry();
```

**Step 2 : Modifier `executeStep()` (ou la fonction dispatch principale)**

Chercher dans WorkflowRunner.js la fonction qui dispatche selon `step.type` (probablement un grand `if/else if` ou `switch`). Ajouter avant le dispatch legacy :

```js
async function executeStep(step, vars, signal) {
  const type = 'workflow/' + (step.type || '');
  const def  = nodeRegistry.get(type);

  if (def?.run) {
    const config = _resolveDataInputs ? _resolveDataInputs(step, vars) : step;
    return await def.run(config, vars, signal);
  }

  // Fallback legacy dispatch
  return await legacyDispatch(step, vars, signal);
}
```

**Step 3 : Exporter `resolveVars` pour les `.node.js` qui en ont besoin**

Trouver `function resolveVars` (~ligne 40) et ajouter à la fin du fichier :

```js
// Export pour les node definitions
module.exports.resolveVars = resolveVars;
```

**Step 4 : Tester un run**

```bash
npm start
```
Créer un workflow simple (Trigger → Shell → Notify), lancer le run.
Attendu : run réussi.

**Step 5 : Commit**

```bash
git add src/main/services/WorkflowRunner.js
git commit -m "feat(workflow): branch WorkflowRunner onto node registry"
```

---

## Task 10 : Créer les registries de triggers

**Files:**
- Create: `src/main/workflow-triggers/_registry.js`
- Create: `src/main/workflow-triggers/manual.trigger.js`
- Create: `src/main/workflow-triggers/cron.trigger.js`
- Create: `src/main/workflow-triggers/hook.trigger.js`
- Create: `src/main/workflow-triggers/on_workflow.trigger.js`
- Create: `src/renderer/workflow-triggers/_registry.js`
- Create: `src/renderer/workflow-triggers/manual.trigger.js`
- Create: `src/renderer/workflow-triggers/cron.trigger.js`
- Create: `src/renderer/workflow-triggers/hook.trigger.js`
- Create: `src/renderer/workflow-triggers/on_workflow.trigger.js`

**Step 1 : Créer `src/main/workflow-triggers/_registry.js`**

```js
'use strict';
const fs   = require('fs');
const path = require('path');
const _map = new Map();
let _loaded = false;

function loadRegistry() {
  if (_loaded) return; _loaded = true;
  for (const file of fs.readdirSync(__dirname)) {
    if (file.startsWith('_') || !file.endsWith('.trigger.js')) continue;
    const def = require(path.join(__dirname, file));
    _map.set(def.type, def);
  }
}
function get(type)  { return _map.get(type) || null; }
function getAll()   { return [..._map.values()]; }
module.exports = { loadRegistry, get, getAll };
```

**Step 2 : Créer les 4 triggers main**

```js
// manual.trigger.js
module.exports = {
  type: 'manual',
  label: 'Manuel',
  shouldFire: () => false, // déclenché via UI seulement
  setup: (config, onFire) => () => {}, // teardown no-op
};

// cron.trigger.js
module.exports = {
  type: 'cron',
  label: 'Planifié',
  shouldFire(config) {
    // TODO: implémenter le matching cron
    return false;
  },
  setup(config, onFire) {
    // TODO: scheduler cron
    return () => {};
  },
};

// hook.trigger.js
module.exports = {
  type: 'hook',
  label: 'Hook Claude',
  shouldFire(config, context) {
    return context?.hookType === config.hookType;
  },
  setup: (config, onFire) => () => {},
};

// on_workflow.trigger.js
module.exports = {
  type: 'on_workflow',
  label: 'Fin de workflow',
  shouldFire(config, context) {
    return context?.completedWorkflow === config.triggerValue;
  },
  setup: (config, onFire) => () => {},
};
```

**Step 3 : Créer `src/renderer/workflow-triggers/_registry.js`** (même pattern)

**Step 4 : Créer les 4 triggers renderer**

```js
// manual.trigger.js (renderer)
module.exports = {
  type: 'manual',
  fields: [], // aucun champ
};

// cron.trigger.js (renderer)
module.exports = {
  type: 'cron',
  fields: [
    { type: 'cron-picker', key: 'triggerValue', label: 'Planning' },
  ],
};

// hook.trigger.js (renderer)
module.exports = {
  type: 'hook',
  fields: [
    { type: 'select', key: 'hookType', label: 'Type de hook',
      options: ['PreToolUse','PostToolUse','Stop','SubagentStop','PreCompact','PostCompact',
                'Notification','SessionStart','SessionStop'] },
  ],
};

// on_workflow.trigger.js (renderer)
module.exports = {
  type: 'on_workflow',
  fields: [
    { type: 'text', key: 'triggerValue', label: 'Nom du workflow source' },
  ],
};
```

**Step 5 : Brancher le renderer trigger dans `renderProperties()` pour le node trigger**

Dans `trigger.node.js`, modifier les fields pour être dynamiques selon `triggerType` :

```js
fields: [
  { type: 'select', key: 'triggerType', label: 'Type',
    options: ['manual','cron','hook','on_workflow'] },
  // Les champs suivants viennent du renderer trigger
  { type: 'custom', key: '_triggerConfig',
    render(field, value, node) {
      const { get } = require('../../renderer/workflow-triggers/_registry');
      const triggerDef = get(node.properties.triggerType || 'manual');
      if (!triggerDef?.fields?.length) return '';
      // Rendre les fields du trigger
      return triggerDef.fields.map(f => {
        const val = node.properties[f.key] ?? '';
        return `...`; // utiliser builtinFieldRenderers
      }).join('');
    },
  },
],
```

**Step 6 : Commit**

```bash
git add src/main/workflow-triggers/ src/renderer/workflow-triggers/
git commit -m "feat(workflow): add trigger registries (main + renderer)"
```

---

## Task 11 : Nettoyer et supprimer le code legacy

Une fois que tous les nodes fonctionnent via la registry :

**Files:**
- Modify: `src/shared/workflow-schema.js` — supprimer `NODE_DATA_OUTPUTS`, `NODE_DATA_OUT_OFFSET` (redondants avec les `.node.js`)
- Modify: `src/renderer/ui/panels/WorkflowHelpers.js` — supprimer `STEP_TYPES`, `STEP_FIELDS`, `NODE_OUTPUTS` (générés depuis registry)
- Modify: `src/renderer/services/WorkflowGraphEngine.js` — supprimer `NODE_TYPES` objet (remplacé par registry)
- Modify: `src/renderer/ui/panels/WorkflowPanel.js` — supprimer `renderPropertiesLegacy()`
- Modify: `resources/mcp-servers/tools/workflow.js` — supprimer `getNodeSlotsLegacy()`
- Modify: `src/main/services/WorkflowRunner.js` — supprimer `runShellStep()`, `runGitStep()`, etc. (remplacés par `.node.js`)

**Step 1 : Pour chaque suppression, vérifier d'abord que rien ne l'importe encore**

```bash
grep -r "NODE_DATA_OUTPUTS" src/ resources/
grep -r "STEP_TYPES" src/
grep -r "runShellStep" src/
```
Attendu : 0 occurrences (sinon, migrer ces usages d'abord)

**Step 2 : Supprimer progressivement, un fichier à la fois**

**Step 3 : Rebuild et vérification finale**

```bash
npm run build:renderer && npm start
```

Tester manuellement :
- Créer un nouveau workflow → tous les nodes apparaissent dans la palette
- Ajouter chaque type de node → propriétés s'affichent correctement
- Lancer un run complet (Trigger → Shell → Claude → Notify)

**Step 4 : Commit final**

```bash
git add -A
git commit -m "refactor(workflow): remove legacy node definitions, registry is now source of truth"
```

---

## Task 12 : Vérification finale et test d'ajout d'un nouveau node

**Objectif :** Valider que l'architecture fonctionne en ajoutant un nouveau node "Webhook" en 1 seul fichier.

**Step 1 : Créer `src/main/workflow-nodes/webhook.node.js`**

```js
module.exports = {
  type:     'workflow/webhook',
  title:    'Webhook',
  desc:     'Recevoir un webhook HTTP',
  color:    'cyan',
  width:    200,
  category: 'triggers',
  icon:     'http',

  inputs:  [],
  outputs: [
    { name: 'Received', type: 'exec'   },
    { name: 'body',     type: 'object' },
    { name: 'headers',  type: 'object' },
  ],

  props: { port: '3001', path: '/webhook' },

  fields: [
    { type: 'text', key: 'port', label: 'Port', placeholder: '3001' },
    { type: 'text', key: 'path', label: 'Path', mono: true, placeholder: '/webhook' },
  ],

  async run(config, vars, signal) {
    // TODO: implémenter le listener HTTP
    return { body: {}, headers: {} };
  },
};
```

**Step 2 : Relancer l'app sans aucune autre modification**

```bash
npm run build:renderer && npm start
```

**Step 3 : Vérifier**

- Ouvrir la palette de nodes → "Webhook" apparaît dans la catégorie "triggers"
- Ajouter le node → inputs/outputs corrects
- Cliquer dessus → propriétés Port et Path s'affichent

Attendu : tout fonctionne sans avoir touché à WorkflowPanel, GraphEngine, MCP ou WorkflowRunner.

**Step 4 : Supprimer le webhook (c'était juste un test)**

```bash
rm src/main/workflow-nodes/webhook.node.js
git add -A
git commit -m "test(workflow): verify single-file node creation works end-to-end"
```

---

## Récapitulatif des fichiers créés/modifiés

### Nouveaux fichiers
```
src/main/workflow-nodes/_registry.js
src/main/workflow-nodes/*.node.js (19 fichiers)
src/main/workflow-triggers/_registry.js
src/main/workflow-triggers/*.trigger.js (4 fichiers)
src/renderer/services/NodeRegistry.js
src/renderer/workflow-fields/_registry.js
src/renderer/workflow-fields/*.field.js (5 fichiers)
src/renderer/workflow-triggers/_registry.js
src/renderer/workflow-triggers/*.trigger.js (4 fichiers)
```

### Fichiers modifiés
```
src/main/ipc/workflow.ipc.js          — +1 handler IPC
src/main/preload.js                   — +1 méthode
src/main/services/WorkflowRunner.js   — dispatcher générique, export resolveVars
src/renderer/services/WorkflowGraphEngine.js — addNode() sur registry
src/renderer/ui/panels/WorkflowPanel.js     — renderProperties() générique
src/renderer/ui/panels/WorkflowHelpers.js   — supprimer STEP_TYPES/STEP_FIELDS
src/shared/workflow-schema.js               — allégé
resources/mcp-servers/tools/workflow.js     — getNodeSlots() généré
```

### Fichiers supprimés (après migration)
Aucun — tout est gardé en fallback legacy jusqu'à validation complète, puis supprimé en Task 11.
