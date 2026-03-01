// src/renderer/services/NodeRegistry.js
'use strict';

let _registry = null;
let _byType   = new Map();

/**
 * Reconstruit une fonction depuis sa représentation string.
 * Gère 3 formes :
 *   - Arrow :    "(a, b) => { ... }"  → return (str)
 *   - Regular :  "function foo(a) {}" → return (str)  [déjà une expression]
 *   - Shorthand: "function foo(a) {}" → idem (déjà normalisé côté main)
 * On utilise un wrapper var pour éviter les ambiguïtés de parsing.
 */
function _hydrateFunction(str) {
  // eslint-disable-next-line no-new-func
  const fn = new Function('var __fn = ' + str.replace(/\r\n/g, '\n') + '; return __fn;')();
  return fn;
}

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
            f = { ...f, render: _hydrateFunction(f.render) };
          } catch (e) {
            console.warn('[NodeRegistry] Failed to parse render for', f.key, e);
          }
        }
        if (f.bind && typeof f.bind === 'string') {
          try {
            // eslint-disable-next-line no-new-func
            f = { ...f, bind: _hydrateFunction(f.bind) };
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
