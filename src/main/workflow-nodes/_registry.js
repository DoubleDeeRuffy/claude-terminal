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

function get(type)   { return _nodes.get(type) || null; }
function getAll()    { return [..._nodes.values()]; }
function has(type)   { return _nodes.has(type); }
function getTypes()  { return [..._nodes.keys()]; }

module.exports = { loadRegistry, get, getAll, has, getTypes };
