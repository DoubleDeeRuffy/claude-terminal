/**
 * Database State Module
 * Manages database connections state
 */

const { State } = require('./State');

const initialState = {
  connections: [],           // [{ id, name, type, host, port, database, projectId?, mcpProvisioned, mcpName }]
  activeConnection: null,    // connection id
  connectionStatuses: {},    // { [id]: 'disconnected'|'connecting'|'connected'|'error' }
  schemas: {},               // { [id]: { tables: [...] } }
  queryResults: {},          // { [id]: { columns, rows, rowCount, duration, error } }
  currentQuery: '',          // SQL text in editor
  detectedDatabases: [],     // Auto-detected configs from project scan
};

const databaseState = new State(initialState);

// ========== Connections ==========

function getDatabaseConnections() {
  return databaseState.get().connections;
}

function getDatabaseConnection(id) {
  return databaseState.get().connections.find(c => c.id === id);
}

function setDatabaseConnections(connections) {
  databaseState.setProp('connections', connections);
}

function addDatabaseConnection(conn) {
  const connections = [...databaseState.get().connections, conn];
  databaseState.setProp('connections', connections);
}

function updateDatabaseConnection(id, updates) {
  const connections = databaseState.get().connections.map(c =>
    c.id === id ? { ...c, ...updates } : c
  );
  databaseState.setProp('connections', connections);
}

function removeDatabaseConnection(id) {
  const state = databaseState.get();
  const connections = state.connections.filter(c => c.id !== id);
  const connectionStatuses = { ...state.connectionStatuses };
  delete connectionStatuses[id];
  const schemas = { ...state.schemas };
  delete schemas[id];
  const queryResults = { ...state.queryResults };
  delete queryResults[id];

  let activeConnection = state.activeConnection;
  if (activeConnection === id) activeConnection = null;

  databaseState.set({ connections, connectionStatuses, schemas, queryResults, activeConnection });
}

// ========== Active Connection ==========

function getActiveConnection() {
  return databaseState.get().activeConnection;
}

function setActiveConnection(id) {
  databaseState.setProp('activeConnection', id);
}

// ========== Connection Status ==========

function getConnectionStatus(id) {
  return databaseState.get().connectionStatuses[id] || 'disconnected';
}

function setConnectionStatus(id, status) {
  const connectionStatuses = { ...databaseState.get().connectionStatuses, [id]: status };
  databaseState.setProp('connectionStatuses', connectionStatuses);
}

// ========== Schema ==========

function getDatabaseSchema(id) {
  return databaseState.get().schemas[id] || null;
}

function setDatabaseSchema(id, schema) {
  const schemas = { ...databaseState.get().schemas, [id]: schema };
  databaseState.setProp('schemas', schemas);
}

// ========== Query ==========

function getQueryResult(id) {
  return databaseState.get().queryResults[id] || null;
}

function setQueryResult(id, result) {
  const queryResults = { ...databaseState.get().queryResults, [id]: result };
  databaseState.setProp('queryResults', queryResults);
}

function getCurrentQuery() {
  return databaseState.get().currentQuery;
}

function setCurrentQuery(sql) {
  databaseState.setProp('currentQuery', sql);
}

// ========== Detection ==========

function getDetectedDatabases() {
  return databaseState.get().detectedDatabases;
}

function setDetectedDatabases(detected) {
  databaseState.setProp('detectedDatabases', detected);
}

module.exports = {
  databaseState,
  getDatabaseConnections,
  getDatabaseConnection,
  setDatabaseConnections,
  addDatabaseConnection,
  updateDatabaseConnection,
  removeDatabaseConnection,
  getActiveConnection,
  setActiveConnection,
  getConnectionStatus,
  setConnectionStatus,
  getDatabaseSchema,
  setDatabaseSchema,
  getQueryResult,
  setQueryResult,
  getCurrentQuery,
  setCurrentQuery,
  getDetectedDatabases,
  setDetectedDatabases
};
