/**
 * WorkflowSchemaCache
 * Lightweight renderer-side cache for database schemas.
 * Fetches via the preload bridge and caches with 2min TTL.
 */

const TTL = 120_000; // 2 minutes

class WorkflowSchemaCache {
  constructor() {
    this._cache = new Map();   // connectionId → { tables, timestamp }
    this._pending = new Map(); // connectionId → Promise<tables>
  }

  /**
   * Get schema for a connection (async, cached).
   * @param {string} connectionId
   * @returns {Promise<Array|null>} tables array or null
   */
  async getSchema(connectionId) {
    if (!connectionId) return null;

    const cached = this._cache.get(connectionId);
    if (cached && (Date.now() - cached.timestamp) < TTL) {
      return cached.tables;
    }

    // Deduplicate concurrent requests
    if (this._pending.has(connectionId)) {
      return this._pending.get(connectionId);
    }

    const promise = this._fetch(connectionId);
    this._pending.set(connectionId, promise);
    try {
      return await promise;
    } finally {
      this._pending.delete(connectionId);
    }
  }

  /**
   * Get columns for a specific table (sync, from cache only).
   * @param {string} connectionId
   * @param {string} tableName
   * @returns {Array|null} columns array or null if not cached
   */
  getColumnsForTable(connectionId, tableName) {
    const cached = this._cache.get(connectionId);
    if (!cached?.tables) return null;
    const table = cached.tables.find(t =>
      t.name.toLowerCase() === tableName.toLowerCase()
    );
    return table?.columns || null;
  }

  /**
   * Invalidate cache for a connection.
   */
  invalidate(connectionId) {
    this._cache.delete(connectionId);
  }

  async _fetch(connectionId) {
    try {
      const api = window.electron_api?.database;
      if (!api) return null;
      const result = await api.getSchema({ id: connectionId });
      if (result?.success && result.tables) {
        this._cache.set(connectionId, { tables: result.tables, timestamp: Date.now() });
        return result.tables;
      }
    } catch (e) {
      console.warn('[SchemaCache] Failed to fetch schema:', e);
    }
    return null;
  }
}

// Singleton
const schemaCache = new WorkflowSchemaCache();

module.exports = { schemaCache };
