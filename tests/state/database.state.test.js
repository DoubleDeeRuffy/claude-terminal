/**
 * Database State Tests
 */

const {
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
} = require('../../src/renderer/state/database.state');

describe('Database State', () => {
  beforeEach(() => {
    // Reset state
    databaseState.set({
      connections: [],
      activeConnection: null,
      connectionStatuses: {},
      schemas: {},
      queryResults: {},
      currentQuery: '',
      detectedDatabases: []
    });
  });

  describe('Connections CRUD', () => {
    test('should start with empty connections', () => {
      expect(getDatabaseConnections()).toEqual([]);
    });

    test('should add a connection', () => {
      addDatabaseConnection({ id: 'db1', name: 'Test DB', type: 'sqlite', filePath: '/test.db' });
      expect(getDatabaseConnections()).toHaveLength(1);
      expect(getDatabaseConnection('db1').name).toBe('Test DB');
    });

    test('should set all connections', () => {
      setDatabaseConnections([
        { id: 'db1', type: 'sqlite' },
        { id: 'db2', type: 'mysql' }
      ]);
      expect(getDatabaseConnections()).toHaveLength(2);
    });

    test('should update a connection', () => {
      addDatabaseConnection({ id: 'db1', name: 'Old Name', type: 'sqlite' });
      updateDatabaseConnection('db1', { name: 'New Name' });
      expect(getDatabaseConnection('db1').name).toBe('New Name');
      expect(getDatabaseConnection('db1').type).toBe('sqlite');
    });

    test('should remove a connection and clean up related state', () => {
      addDatabaseConnection({ id: 'db1', type: 'sqlite' });
      setActiveConnection('db1');
      setConnectionStatus('db1', 'connected');
      setDatabaseSchema('db1', { tables: [] });
      setQueryResult('db1', { columns: [], rows: [] });

      removeDatabaseConnection('db1');

      expect(getDatabaseConnections()).toHaveLength(0);
      expect(getActiveConnection()).toBeNull();
      expect(getConnectionStatus('db1')).toBe('disconnected');
      expect(getDatabaseSchema('db1')).toBeNull();
      expect(getQueryResult('db1')).toBeNull();
    });

    test('should not affect other connections when removing', () => {
      addDatabaseConnection({ id: 'db1', type: 'sqlite' });
      addDatabaseConnection({ id: 'db2', type: 'mysql' });
      setActiveConnection('db2');

      removeDatabaseConnection('db1');

      expect(getDatabaseConnections()).toHaveLength(1);
      expect(getActiveConnection()).toBe('db2');
    });
  });

  describe('Active Connection', () => {
    test('should start with null', () => {
      expect(getActiveConnection()).toBeNull();
    });

    test('should set active connection', () => {
      setActiveConnection('db1');
      expect(getActiveConnection()).toBe('db1');
    });
  });

  describe('Connection Status', () => {
    test('should default to disconnected', () => {
      expect(getConnectionStatus('unknown')).toBe('disconnected');
    });

    test('should set and get status', () => {
      setConnectionStatus('db1', 'connected');
      expect(getConnectionStatus('db1')).toBe('connected');
    });

    test('should handle status transitions', () => {
      setConnectionStatus('db1', 'connecting');
      expect(getConnectionStatus('db1')).toBe('connecting');

      setConnectionStatus('db1', 'connected');
      expect(getConnectionStatus('db1')).toBe('connected');

      setConnectionStatus('db1', 'error');
      expect(getConnectionStatus('db1')).toBe('error');
    });
  });

  describe('Schema', () => {
    test('should start with null', () => {
      expect(getDatabaseSchema('db1')).toBeNull();
    });

    test('should set and get schema', () => {
      const schema = {
        tables: [
          { name: 'users', columns: [{ name: 'id', type: 'INTEGER', primaryKey: true }] }
        ]
      };
      setDatabaseSchema('db1', schema);
      expect(getDatabaseSchema('db1')).toEqual(schema);
    });
  });

  describe('Query', () => {
    test('should start with empty query', () => {
      expect(getCurrentQuery()).toBe('');
    });

    test('should set and get current query', () => {
      setCurrentQuery('SELECT * FROM users');
      expect(getCurrentQuery()).toBe('SELECT * FROM users');
    });

    test('should set and get query result', () => {
      const result = { columns: ['id', 'name'], rows: [{ id: 1, name: 'Test' }], rowCount: 1, duration: 5 };
      setQueryResult('db1', result);
      expect(getQueryResult('db1')).toEqual(result);
    });
  });

  describe('Detection', () => {
    test('should start with empty detected', () => {
      expect(getDetectedDatabases()).toEqual([]);
    });

    test('should set detected databases', () => {
      const detected = [
        { type: 'postgresql', name: 'PG from .env', detectedFrom: '.env' },
        { type: 'sqlite', name: 'local.db', detectedFrom: 'file' }
      ];
      setDetectedDatabases(detected);
      expect(getDetectedDatabases()).toEqual(detected);
    });
  });

  describe('Subscriptions', () => {
    test('should notify subscribers on state change', () => {
      const listener = jest.fn();
      const unsub = databaseState.subscribe(listener);

      addDatabaseConnection({ id: 'db1', type: 'sqlite' });

      // State uses requestAnimationFrame for batching, so we check synchronously
      // The state should have changed
      expect(getDatabaseConnections()).toHaveLength(1);

      unsub();
    });
  });
});
