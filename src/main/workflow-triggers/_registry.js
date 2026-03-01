'use strict';
const path = require('path');
const fs   = require('fs');

const _triggers = new Map();
let _loaded = false;

function loadRegistry() {
  if (_loaded) return;
  _loaded = true;
  const dir = __dirname;
  for (const file of fs.readdirSync(dir)) {
    if (file.startsWith('_') || !file.endsWith('.trigger.js')) continue;
    try {
      const def = require(path.join(dir, file));
      if (!def.type) { console.warn(`[TriggerRegistry] ${file} missing 'type'`); continue; }
      _triggers.set(def.type, def);
    } catch (e) {
      console.error(`[TriggerRegistry] Failed to load ${file}:`, e.message);
    }
  }
}

function get(type)  { return _triggers.get(type); }
function getAll()   { return [..._triggers.values()]; }
function has(type)  { return _triggers.has(type); }

module.exports = { loadRegistry, get, getAll, has };
