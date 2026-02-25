/**
 * Database Service
 * Manages database connections, queries, schema, detection and MCP provisioning
 * Supports: SQLite, MySQL, PostgreSQL, MongoDB
 */

const path = require('path');
const fs = require('fs');
const { app } = require('electron');
const { dataDir } = require('../utils/paths');

const DATABASES_FILE = path.join(dataDir, 'databases.json');
const KEYTAR_SERVICE = 'claude-terminal-db';

class DatabaseService {
  constructor() {
    this.connections = new Map(); // id -> { config, client, status }
  }

  /**
   * Test a database connection without persisting it
   * @param {Object} config - { type, host, port, database, username, password, filePath, connectionString }
   * @returns {Object} { success, error? }
   */
  async testConnection(config) {
    let client = null;
    try {
      client = await this._createClient(config);
      await this._ping(config.type, client);
      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    } finally {
      if (client) {
        await this._closeClient(config.type, client).catch(() => {});
      }
    }
  }

  /**
   * Open a persistent connection
   * @param {string} id - Connection ID
   * @param {Object} config - Connection config
   * @returns {Object} { success, error? }
   */
  async connect(id, config) {
    try {
      if (this.connections.has(id)) {
        await this.disconnect(id);
      }
      const client = await this._createClient(config);
      await this._ping(config.type, client);
      this.connections.set(id, { config, client, status: 'connected' });
      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  /**
   * Close a connection
   * @param {string} id
   * @returns {Object} { success }
   */
  async disconnect(id) {
    const conn = this.connections.get(id);
    if (conn) {
      await this._closeClient(conn.config.type, conn.client).catch(() => {});
      this.connections.delete(id);
    }
    return { success: true };
  }

  /**
   * Close all connections (for app quit)
   */
  async disconnectAll() {
    const promises = [];
    for (const [id] of this.connections) {
      promises.push(this.disconnect(id));
    }
    await Promise.allSettled(promises);
  }

  /**
   * Get schema for a connected database
   * @param {string} id - Connection ID
   * @returns {Object} { success, tables?, error? }
   */
  async getSchema(id) {
    const conn = this.connections.get(id);
    if (!conn) return { success: false, error: 'Not connected' };

    try {
      const tables = await this._getSchemaForType(conn.config.type, conn.client, conn.config);
      return { success: true, tables };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  /**
   * Execute a query
   * @param {string} id - Connection ID
   * @param {string} sql - SQL query or MongoDB command
   * @param {number} limit - Max rows (default 100)
   * @returns {Object} { success, columns?, rows?, rowCount?, duration?, error? }
   */
  async executeQuery(id, sql, limit = 100) {
    const conn = this.connections.get(id);
    if (!conn) return { success: false, error: 'Not connected' };

    const start = Date.now();
    try {
      const result = await this._executeForType(conn.config.type, conn.client, sql, limit, conn.config);
      result.duration = Date.now() - start;
      result.success = true;
      return result;
    } catch (error) {
      return { success: false, error: error.message, duration: Date.now() - start };
    }
  }

  /**
   * Detect databases in a project directory
   * @param {string} projectPath
   * @returns {Array} detected connection configs
   */
  async detectDatabases(projectPath) {
    const detected = [];

    // 1. Check .env file
    try {
      const envPath = path.join(projectPath, '.env');
      if (fs.existsSync(envPath)) {
        const envContent = fs.readFileSync(envPath, 'utf8');
        const envDetected = this._parseEnvForDatabases(envContent);
        detected.push(...envDetected);
      }
    } catch (e) { /* ignore */ }

    // 2. Check docker-compose.yml
    try {
      for (const name of ['docker-compose.yml', 'docker-compose.yaml']) {
        const composePath = path.join(projectPath, name);
        if (fs.existsSync(composePath)) {
          const content = fs.readFileSync(composePath, 'utf8');
          const composeDetected = this._parseDockerCompose(content);
          detected.push(...composeDetected);
          break;
        }
      }
    } catch (e) { /* ignore */ }

    // 3. Check for SQLite files
    try {
      const sqliteFiles = this._findSqliteFiles(projectPath, 2);
      for (const filePath of sqliteFiles) {
        detected.push({
          type: 'sqlite',
          name: `SQLite - ${path.basename(filePath)}`,
          filePath,
          detectedFrom: 'file'
        });
      }
    } catch (e) { /* ignore */ }

    // 4. Check prisma/schema.prisma
    try {
      const prismaPath = path.join(projectPath, 'prisma', 'schema.prisma');
      if (fs.existsSync(prismaPath)) {
        const content = fs.readFileSync(prismaPath, 'utf8');
        const prismaDetected = this._parsePrismaSchema(content);
        if (prismaDetected) detected.push(prismaDetected);
      }
    } catch (e) { /* ignore */ }

    return detected;
  }

  // ==================== Persistence ====================

  /**
   * Save connections config to disk (without passwords)
   * @param {Array} connections
   */
  async saveConnections(connections) {
    const dir = path.dirname(DATABASES_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

    // Strip passwords before saving
    const safe = connections.map(c => {
      const { password, ...rest } = c;
      return rest;
    });

    const tmpFile = DATABASES_FILE + '.tmp';
    fs.writeFileSync(tmpFile, JSON.stringify(safe, null, 2), 'utf8');
    fs.renameSync(tmpFile, DATABASES_FILE);
  }

  /**
   * Load connections config from disk
   * @returns {Array}
   */
  async loadConnections() {
    try {
      if (fs.existsSync(DATABASES_FILE)) {
        return JSON.parse(fs.readFileSync(DATABASES_FILE, 'utf8'));
      }
    } catch (e) {
      console.error('[Database] Error loading connections:', e);
    }
    return [];
  }

  // ==================== Credential Storage ====================

  /**
   * Store password in OS keychain
   * @param {string} id - Connection ID
   * @param {string} password
   */
  async setCredential(id, password) {
    try {
      const keytar = require('keytar');
      await keytar.setPassword(KEYTAR_SERVICE, `db-${id}`, password);
      return { success: true };
    } catch (e) {
      console.error('[Database] Failed to store credential:', e);
      return { success: false, error: e.message };
    }
  }

  /**
   * Retrieve password from OS keychain
   * @param {string} id - Connection ID
   * @returns {Object} { success, password? }
   */
  async getCredential(id) {
    try {
      const keytar = require('keytar');
      const password = await keytar.getPassword(KEYTAR_SERVICE, `db-${id}`);
      return { success: true, password };
    } catch (e) {
      return { success: false, error: e.message };
    }
  }

  /**
   * Delete credential from OS keychain
   * @param {string} id
   */
  async deleteCredential(id) {
    try {
      const keytar = require('keytar');
      await keytar.deletePassword(KEYTAR_SERVICE, `db-${id}`);
    } catch (e) { /* ignore */ }
  }

  // ==================== MCP Provisioning ====================

  /**
   * Write MCP server config to project's .claude/settings.local.json
   * @param {string} projectPath
   * @param {Object} config - DB connection config
   * @returns {Object} { success, mcpName? }
   */
  async provisionMcpServer(projectPath, config) {
    try {
      const mcpName = `claude-terminal-db-${config.name || config.id}`.replace(/[^a-zA-Z0-9-_]/g, '-');
      const settingsDir = path.join(projectPath, '.claude');
      const settingsFile = path.join(settingsDir, 'settings.local.json');

      // Ensure .claude directory exists
      if (!fs.existsSync(settingsDir)) {
        fs.mkdirSync(settingsDir, { recursive: true });
      }

      // Read existing settings
      let settings = {};
      if (fs.existsSync(settingsFile)) {
        try {
          settings = JSON.parse(fs.readFileSync(settingsFile, 'utf8'));
        } catch (e) { /* start fresh */ }
      }

      if (!settings.mcpServers) settings.mcpServers = {};

      // Determine MCP server script path
      const mcpServerScript = this._getMcpServerPath();

      // Build env vars for the MCP server
      const env = { DB_TYPE: config.type };
      if (config.type === 'sqlite') {
        env.DB_PATH = config.filePath;
      } else if (config.type === 'mongodb' && config.connectionString) {
        env.DB_CONNECTION_STRING = config.connectionString;
      } else {
        if (config.host) env.DB_HOST = config.host;
        if (config.port) env.DB_PORT = String(config.port);
        if (config.database) env.DB_NAME = config.database;
        if (config.username) env.DB_USER = config.username;
        if (config.password) env.DB_PASSWORD = config.password;
      }

      // Add NODE_PATH so the MCP server can find our bundled drivers
      env.NODE_PATH = this._getNodeModulesPath();

      settings.mcpServers[mcpName] = {
        command: 'node',
        args: [mcpServerScript],
        env
      };

      // Atomic write
      const tmpFile = settingsFile + '.tmp';
      fs.writeFileSync(tmpFile, JSON.stringify(settings, null, 2), 'utf8');
      fs.renameSync(tmpFile, settingsFile);

      return { success: true, mcpName };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  /**
   * Remove MCP server config from project's .claude/settings.local.json
   * @param {string} projectPath
   * @param {string} mcpName
   * @returns {Object} { success }
   */
  async deprovisionMcpServer(projectPath, mcpName) {
    try {
      const settingsFile = path.join(projectPath, '.claude', 'settings.local.json');
      if (!fs.existsSync(settingsFile)) return { success: true };

      const settings = JSON.parse(fs.readFileSync(settingsFile, 'utf8'));
      if (settings.mcpServers && settings.mcpServers[mcpName]) {
        delete settings.mcpServers[mcpName];
        const tmpFile = settingsFile + '.tmp';
        fs.writeFileSync(tmpFile, JSON.stringify(settings, null, 2), 'utf8');
        fs.renameSync(tmpFile, settingsFile);
      }

      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  // ==================== Private: Client Creation ====================

  async _createClient(config) {
    switch (config.type) {
      case 'sqlite': return this._createSqliteClient(config);
      case 'mysql': return this._createMysqlClient(config);
      case 'postgresql': return this._createPgClient(config);
      case 'mongodb': return this._createMongoClient(config);
      default: throw new Error(`Unsupported database type: ${config.type}`);
    }
  }

  _createSqliteClient(config) {
    const Database = require('better-sqlite3');
    const dbPath = config.filePath;
    if (!dbPath || !fs.existsSync(dbPath)) {
      throw new Error(`SQLite file not found: ${dbPath}`);
    }
    return new Database(dbPath, { readonly: false });
  }

  async _createMysqlClient(config) {
    const mysql = require('mysql2/promise');
    return mysql.createConnection({
      host: config.host || 'localhost',
      port: config.port || 3306,
      user: config.username,
      password: config.password,
      database: config.database,
      connectTimeout: 10000
    });
  }

  async _createPgClient(config) {
    const { Client } = require('pg');
    const client = new Client({
      host: config.host || 'localhost',
      port: config.port || 5432,
      user: config.username,
      password: config.password,
      database: config.database,
      connectionTimeoutMillis: 10000
    });
    await client.connect();
    return client;
  }

  async _createMongoClient(config) {
    const { MongoClient } = require('mongodb');
    const uri = config.connectionString ||
      `mongodb://${config.username ? `${config.username}:${config.password}@` : ''}${config.host || 'localhost'}:${config.port || 27017}/${config.database || ''}`;
    const client = new MongoClient(uri, { connectTimeoutMS: 10000, serverSelectionTimeoutMS: 10000 });
    await client.connect();
    return client;
  }

  // ==================== Private: Ping ====================

  async _ping(type, client) {
    switch (type) {
      case 'sqlite':
        client.prepare('SELECT 1').get();
        break;
      case 'mysql':
        await client.ping();
        break;
      case 'postgresql':
        await client.query('SELECT 1');
        break;
      case 'mongodb':
        await client.db('admin').command({ ping: 1 });
        break;
    }
  }

  // ==================== Private: Close ====================

  async _closeClient(type, client) {
    if (!client) return;
    switch (type) {
      case 'sqlite':
        client.close();
        break;
      case 'mysql':
        await client.end();
        break;
      case 'postgresql':
        await client.end();
        break;
      case 'mongodb':
        await client.close();
        break;
    }
  }

  // ==================== Private: Schema ====================

  async _getSchemaForType(type, client, config) {
    switch (type) {
      case 'sqlite': return this._getSqliteSchema(client);
      case 'mysql': return this._getMysqlSchema(client);
      case 'postgresql': return this._getPgSchema(client);
      case 'mongodb': return this._getMongoSchema(client, config);
      default: return [];
    }
  }

  _getSqliteSchema(db) {
    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all();
    return tables.map(t => {
      const columns = db.prepare(`PRAGMA table_info("${t.name}")`).all();
      return {
        name: t.name,
        columns: columns.map(c => ({
          name: c.name,
          type: c.type || 'TEXT',
          nullable: !c.notnull,
          primaryKey: !!c.pk,
          defaultValue: c.dflt_value
        }))
      };
    });
  }

  async _getMysqlSchema(client) {
    const [tables] = await client.query('SHOW TABLES');
    const key = Object.keys(tables[0] || {})[0];
    const result = [];
    for (const row of tables) {
      const tableName = row[key];
      const [columns] = await client.query(`SHOW COLUMNS FROM \`${tableName}\``);
      result.push({
        name: tableName,
        columns: columns.map(c => ({
          name: c.Field,
          type: c.Type,
          nullable: c.Null === 'YES',
          primaryKey: c.Key === 'PRI',
          defaultValue: c.Default
        }))
      });
    }
    return result;
  }

  async _getPgSchema(client) {
    const { rows: tables } = await client.query(
      "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY table_name"
    );
    const result = [];
    for (const t of tables) {
      const { rows: columns } = await client.query(
        `SELECT column_name, data_type, is_nullable, column_default
         FROM information_schema.columns WHERE table_name = $1 ORDER BY ordinal_position`,
        [t.table_name]
      );
      // Get primary key columns
      const { rows: pkCols } = await client.query(
        `SELECT a.attname FROM pg_index i
         JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = ANY(i.indkey)
         WHERE i.indrelid = $1::regclass AND i.indisprimary`,
        [t.table_name]
      );
      const pkNames = new Set(pkCols.map(p => p.attname));
      result.push({
        name: t.table_name,
        columns: columns.map(c => ({
          name: c.column_name,
          type: c.data_type,
          nullable: c.is_nullable === 'YES',
          primaryKey: pkNames.has(c.column_name),
          defaultValue: c.column_default
        }))
      });
    }
    return result;
  }

  async _getMongoSchema(client, config) {
    const dbName = config.database || 'test';
    const db = client.db(dbName);
    const collections = await db.listCollections().toArray();
    const result = [];
    for (const col of collections) {
      // Sample documents to infer fields
      const docs = await db.collection(col.name).find().limit(100).toArray();
      const fieldMap = new Map();
      for (const doc of docs) {
        for (const [key, value] of Object.entries(doc)) {
          const type = value === null ? 'null' : Array.isArray(value) ? 'array' : typeof value;
          if (!fieldMap.has(key)) fieldMap.set(key, new Set());
          fieldMap.get(key).add(type);
        }
      }
      result.push({
        name: col.name,
        columns: Array.from(fieldMap.entries()).map(([name, types]) => ({
          name,
          type: Array.from(types).join(' | '),
          nullable: types.has('null'),
          primaryKey: name === '_id'
        }))
      });
    }
    return result;
  }

  // ==================== Private: Execute Query ====================

  async _executeForType(type, client, sql, limit, config) {
    switch (type) {
      case 'sqlite': return this._executeSqlite(client, sql, limit);
      case 'mysql': return this._executeMysql(client, sql, limit);
      case 'postgresql': return this._executePg(client, sql, limit);
      case 'mongodb': return this._executeMongo(client, sql, limit, config);
      default: throw new Error(`Unsupported type: ${type}`);
    }
  }

  _executeSqlite(db, sql, limit) {
    const trimmed = sql.trim();
    const isSelect = /^SELECT|^PRAGMA|^EXPLAIN|^WITH/i.test(trimmed);
    if (isSelect) {
      const rows = db.prepare(trimmed).all();
      const limited = rows.slice(0, limit);
      const columns = limited.length > 0 ? Object.keys(limited[0]) : [];
      return { columns, rows: limited, rowCount: rows.length };
    } else {
      const info = db.prepare(trimmed).run();
      return { columns: ['changes', 'lastInsertRowid'], rows: [{ changes: info.changes, lastInsertRowid: info.lastInsertRowid }], rowCount: 1 };
    }
  }

  async _executeMysql(client, sql, limit) {
    const [rows, fields] = await client.query(sql);
    if (Array.isArray(rows)) {
      const limited = rows.slice(0, limit);
      const columns = fields ? fields.map(f => f.name) : (limited.length > 0 ? Object.keys(limited[0]) : []);
      return { columns, rows: limited, rowCount: rows.length };
    }
    return { columns: ['affectedRows', 'insertId'], rows: [{ affectedRows: rows.affectedRows, insertId: rows.insertId }], rowCount: 1 };
  }

  async _executePg(client, sql, limit) {
    const result = await client.query(sql);
    if (result.rows) {
      const limited = result.rows.slice(0, limit);
      const columns = result.fields ? result.fields.map(f => f.name) : (limited.length > 0 ? Object.keys(limited[0]) : []);
      return { columns, rows: limited, rowCount: result.rowCount };
    }
    return { columns: ['rowCount'], rows: [{ rowCount: result.rowCount }], rowCount: result.rowCount };
  }

  async _executeMongo(client, sql, limit, config) {
    // Simple MongoDB command parser: db.collection.find({...})
    const dbName = config.database || 'test';
    const db = client.db(dbName);

    const findMatch = sql.match(/^db\.(\w+)\.find\((.*)\)$/s);
    const countMatch = sql.match(/^db\.(\w+)\.countDocuments\((.*)\)$/s);
    const aggregateMatch = sql.match(/^db\.(\w+)\.aggregate\((.*)\)$/s);

    if (findMatch) {
      const collection = findMatch[1];
      const filter = findMatch[2].trim() ? JSON.parse(findMatch[2]) : {};
      const docs = await db.collection(collection).find(filter).limit(limit).toArray();
      const columns = docs.length > 0 ? Object.keys(docs[0]) : [];
      return { columns, rows: docs.map(d => this._serializeMongoDoc(d)), rowCount: docs.length };
    } else if (countMatch) {
      const collection = countMatch[1];
      const filter = countMatch[2].trim() ? JSON.parse(countMatch[2]) : {};
      const count = await db.collection(collection).countDocuments(filter);
      return { columns: ['count'], rows: [{ count }], rowCount: 1 };
    } else if (aggregateMatch) {
      const collection = aggregateMatch[1];
      const pipeline = JSON.parse(aggregateMatch[2]);
      const docs = await db.collection(collection).aggregate(pipeline).limit(limit).toArray();
      const columns = docs.length > 0 ? Object.keys(docs[0]) : [];
      return { columns, rows: docs.map(d => this._serializeMongoDoc(d)), rowCount: docs.length };
    }

    throw new Error('Unsupported MongoDB command. Use: db.collection.find({...}), db.collection.countDocuments({...}), or db.collection.aggregate([...])');
  }

  _serializeMongoDoc(doc) {
    const result = {};
    for (const [key, value] of Object.entries(doc)) {
      if (value && typeof value === 'object' && value.constructor && value.constructor.name === 'ObjectId') {
        result[key] = value.toString();
      } else if (value instanceof Date) {
        result[key] = value.toISOString();
      } else if (typeof value === 'object' && value !== null) {
        result[key] = JSON.stringify(value);
      } else {
        result[key] = value;
      }
    }
    return result;
  }

  // ==================== Private: Detection Parsers ====================

  _parseEnvForDatabases(content) {
    const detected = [];
    const lines = content.split('\n');

    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed.startsWith('#') || !trimmed.includes('=')) continue;

      const eqIndex = trimmed.indexOf('=');
      const key = trimmed.substring(0, eqIndex).trim();
      let value = trimmed.substring(eqIndex + 1).trim();
      // Remove quotes
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }

      if (key === 'DATABASE_URL' && value) {
        const parsed = this._parseDatabaseUrl(value);
        if (parsed) detected.push({ ...parsed, detectedFrom: '.env (DATABASE_URL)' });
      } else if ((key === 'MONGO_URI' || key === 'MONGODB_URI' || key === 'MONGO_URL') && value) {
        detected.push({
          type: 'mongodb',
          name: `MongoDB - ${key}`,
          connectionString: value,
          detectedFrom: `.env (${key})`
        });
      }
    }

    return detected;
  }

  _parseDatabaseUrl(url) {
    try {
      // postgresql://user:pass@host:port/db
      // mysql://user:pass@host:port/db
      // mongodb://user:pass@host:port/db
      const match = url.match(/^(postgres(?:ql)?|mysql|mongodb(?:\+srv)?):\/\/(?:([^:]+):([^@]+)@)?([^:/]+)(?::(\d+))?\/(.+?)(?:\?.*)?$/);
      if (!match) return null;

      let type = match[1];
      if (type.startsWith('postgres')) type = 'postgresql';
      if (type.startsWith('mongodb')) type = 'mongodb';

      if (type === 'mongodb') {
        return {
          type: 'mongodb',
          name: `MongoDB - ${match[6] || 'default'}`,
          connectionString: url
        };
      }

      return {
        type,
        name: `${type.charAt(0).toUpperCase() + type.slice(1)} - ${match[6]}`,
        host: match[4],
        port: match[5] ? parseInt(match[5]) : (type === 'mysql' ? 3306 : 5432),
        database: match[6],
        username: match[2] || '',
        password: match[3] || ''
      };
    } catch (e) {
      return null;
    }
  }

  _parseDockerCompose(content) {
    const detected = [];

    // Simple regex-based parsing (no YAML dependency)
    const imageMatches = content.matchAll(/image:\s*['"]?(\S+?)['"]?\s*$/gm);
    for (const match of imageMatches) {
      const image = match[1].toLowerCase();
      if (image.includes('postgres')) {
        detected.push({
          type: 'postgresql',
          name: 'PostgreSQL (Docker)',
          host: 'localhost',
          port: 5432,
          database: 'postgres',
          username: 'postgres',
          detectedFrom: 'docker-compose'
        });
      } else if (image.includes('mysql') || image.includes('mariadb')) {
        detected.push({
          type: 'mysql',
          name: 'MySQL (Docker)',
          host: 'localhost',
          port: 3306,
          database: 'mysql',
          username: 'root',
          detectedFrom: 'docker-compose'
        });
      } else if (image.includes('mongo')) {
        detected.push({
          type: 'mongodb',
          name: 'MongoDB (Docker)',
          connectionString: 'mongodb://localhost:27017',
          detectedFrom: 'docker-compose'
        });
      }
    }

    return detected;
  }

  _findSqliteFiles(dir, maxDepth, currentDepth = 0) {
    if (currentDepth >= maxDepth) return [];
    const results = [];
    try {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.name.startsWith('.') || entry.name === 'node_modules') continue;
        const fullPath = path.join(dir, entry.name);
        if (entry.isFile() && /\.(db|sqlite|sqlite3)$/i.test(entry.name)) {
          results.push(fullPath);
        } else if (entry.isDirectory() && currentDepth < maxDepth - 1) {
          results.push(...this._findSqliteFiles(fullPath, maxDepth, currentDepth + 1));
        }
      }
    } catch (e) { /* ignore permission errors */ }
    return results;
  }

  _parsePrismaSchema(content) {
    const providerMatch = content.match(/provider\s*=\s*"(\w+)"/);
    if (!providerMatch) return null;

    const provider = providerMatch[1];
    const typeMap = {
      sqlite: 'sqlite',
      postgresql: 'postgresql',
      mysql: 'mysql',
      mongodb: 'mongodb'
    };
    const type = typeMap[provider];
    if (!type) return null;

    return {
      type,
      name: `${provider.charAt(0).toUpperCase() + provider.slice(1)} (Prisma)`,
      detectedFrom: 'prisma/schema.prisma',
      ...(type === 'sqlite' ? {} : { host: 'localhost' })
    };
  }

  // ==================== Private: Path helpers ====================

  _getMcpServerPath() {
    if (app.isPackaged) {
      return path.join(process.resourcesPath, 'mcp-servers', 'database-mcp-server.js');
    }
    return path.join(__dirname, '..', '..', '..', 'resources', 'mcp-servers', 'database-mcp-server.js');
  }

  _getNodeModulesPath() {
    if (app.isPackaged) {
      // In production, native modules are in asar.unpacked
      return path.join(process.resourcesPath, 'app.asar.unpacked', 'node_modules');
    }
    return path.join(__dirname, '..', '..', '..', 'node_modules');
  }
}

// Singleton
const databaseService = new DatabaseService();

module.exports = databaseService;
