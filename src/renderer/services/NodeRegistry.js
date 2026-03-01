// src/renderer/services/NodeRegistry.js
'use strict';

let _registry = null;
let _byType   = new Map();

async function loadNodeRegistry() {
  if (_registry) return _registry;
  const api = window.electron_api?.workflow;
  if (!api?.getNodeRegistry) {
    console.warn('[NodeRegistry] getNodeRegistry not available');
    return [];
  }
  const defs = await api.getNodeRegistry();
  _registry = defs;
  _byType.clear();
  for (const def of defs) {
    // Re-hydrater les showIf (string → function)
    const hydrated = { ...def };
    if (hydrated.fields) {
      hydrated.fields = hydrated.fields.map(f => {
        if (f.showIf && typeof f.showIf === 'string') {
          try {
            // eslint-disable-next-line no-new-func
            const fn = new Function('return (' + f.showIf + ')')();
            f = { ...f, showIf: fn };
          } catch (e) {
            console.warn('[NodeRegistry] Failed to parse showIf for', f.key, e);
          }
        }
        // Re-hydrater les fonctions render/bind des custom fields
        if (f.render && typeof f.render === 'string') {
          try {
            // eslint-disable-next-line no-new-func
            f = { ...f, render: new Function('return (' + f.render + ')')() };
          } catch (e) {
            console.warn('[NodeRegistry] Failed to parse render for', f.key, e);
          }
        }
        if (f.bind && typeof f.bind === 'string') {
          try {
            // eslint-disable-next-line no-new-func
            f = { ...f, bind: new Function('return (' + f.bind + ')')() };
          } catch (e) {
            console.warn('[NodeRegistry] Failed to parse bind for', f.key, e);
          }
        }
        return f;
      });
    }
    _byType.set(def.type, hydrated);
  }
  return _registry;
}

function get(type)   { return _byType.get(type) || null; }
function getAll()    { return _registry || []; }
function has(type)   { return _byType.has(type); }

module.exports = { loadNodeRegistry, get, getAll, has };
