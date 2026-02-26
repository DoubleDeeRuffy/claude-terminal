'use strict';

/**
 * Database Tools Module for Claude Terminal MCP
 *
 * Provides database access tools. Reads connection configs from
 * CT_DATA_DIR/databases.json and passwords from CT_DB_PASS_{id} env vars.
 *
 * Supports: SQLite, MySQL, PostgreSQL, MongoDB
 */

const fs = require('fs');
const path = require('path');

const MAX_ROWS = 100;

// -- Logging ------------------------------------------------------------------

function log(...args) {
  process.stderr.write(`[ct-mcp:database] ${args.join(' ')}\n`);
}

// -- Connection pool ----------------------------------------------------------

const connections = new Map(); // id → { client, type }

function getDataDir() {
  return process.env.CT_DATA_DIR || '';
}

function loadConnectionConfigs() {
  const dbFile = path.join(getDataDir(), 'databases.json');
  try {
    if (fs.existsSync(dbFile)) {
      return JSON.parse(fs.readFileSync(dbFile, 'utf8'));
    }
  } catch (e) {
    log('Error reading databases.json:', e.message);
  }
  return [];
}

function getPassword(id) {
  // Env var format: CT_DB_PASS_{id} with dots/hyphens replaced
  const envKey = `CT_DB_PASS_${id}`;
  return process.env[envKey] || '';
}

function findConnection(nameOrId) {
  const configs = loadConnectionConfigs();
  // Match by name (case-insensitive) or by id
  return configs.find(c =>
    c.id === nameOrId ||
    c.name.toLowerCase() === nameOrId.toLowerCase()
  );
}

async function getClient(nameOrId) {
  const config = findConnection(nameOrId);
  if (!config) throw new Error(`Connection "${nameOrId}" not found. Use db_list_connections to see available connections.`);

  // Return cached connection if available
  if (connections.has(config.id)) {
    return { client: connections.get(config.id).client, type: config.type, config };
  }

  // Create new connection
  const password = getPassword(config.id);
  const client = await createClient(config, password);
  connections.set(config.id, { client, type: config.type });
  log(`Connected to ${config.type}: ${config.name}`);
  return { client, type: config.type, config };
}

async function createClient(config, password) {
  const type = config.type;

  if (type === 'sqlite') {
    const Database = require('better-sqlite3');
    if (!config.filePath) throw new Error('SQLite connection missing filePath');
    const db = new Database(config.filePath, { readonly: false });
    db.pragma('journal_mode = WAL');
    return db;
  }

  if (type === 'mysql') {
    const mysql = require('mysql2/promise');
    return await mysql.createConnection({
      host: config.host || 'localhost',
      port: parseInt(config.port || '3306', 10),
      database: config.database,
      user: config.username,
      password,
    });
  }

  if (type === 'postgresql') {
    const { Client } = require('pg');
    const client = new Client({
      host: config.host || 'localhost',
      port: parseInt(config.port || '5432', 10),
      database: config.database,
      user: config.username,
      password,
    });
    await client.connect();
    return client;
  }

  if (type === 'mongodb') {
    const { MongoClient } = require('mongodb');
    const uri = config.connectionString;
    if (!uri) throw new Error('MongoDB connection missing connectionString');
    const mongoClient = new MongoClient(uri);
    await mongoClient.connect();
    const dbName = config.database || new URL(uri).pathname.slice(1) || 'test';
    return { mongoClient, db: mongoClient.db(dbName) };
  }

  throw new Error(`Unsupported database type: ${type}`);
}

// -- Query execution ----------------------------------------------------------

async function executeQuery(client, type, sql) {
  const trimmed = sql.trim();

  if (type === 'sqlite') {
    const isSelect = /^(SELECT|PRAGMA|EXPLAIN|WITH)\b/i.test(trimmed);
    if (isSelect) {
      const rows = client.prepare(trimmed).all().slice(0, MAX_ROWS);
      return formatRows(rows);
    }
    const info = client.prepare(trimmed).run();
    return `Rows affected: ${info.changes}`;
  }

  if (type === 'mysql') {
    const [rows] = await client.execute(trimmed);
    if (Array.isArray(rows)) return formatRows(rows.slice(0, MAX_ROWS));
    return `Rows affected: ${rows.affectedRows}`;
  }

  if (type === 'postgresql') {
    const result = await client.query(trimmed);
    if (result.rows) return formatRows(result.rows.slice(0, MAX_ROWS));
    return `Rows affected: ${result.rowCount}`;
  }

  if (type === 'mongodb') {
    return 'MongoDB: use db_list_tables and db_describe_table. For queries, use the query tool with MongoDB shell syntax.';
  }

  return 'Unsupported database type';
}

// -- Schema operations --------------------------------------------------------

async function listTables(client, type) {
  if (type === 'sqlite') {
    const tables = client.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all();
    const result = [];
    for (const { name } of tables) {
      const columns = client.prepare(`PRAGMA table_info('${name}')`).all();
      const colStr = columns.map(c => c.name).join(', ');
      result.push(`${name}: ${colStr}`);
    }
    return result.join('\n') || 'No tables found';
  }

  if (type === 'mysql') {
    const [tables] = await client.execute('SHOW TABLES');
    const key = Object.keys(tables[0] || {})[0];
    const result = [];
    for (const row of tables) {
      const tableName = row[key];
      const [columns] = await client.execute(`SHOW COLUMNS FROM \`${tableName}\``);
      const colStr = columns.map(c => c.Field).join(', ');
      result.push(`${tableName}: ${colStr}`);
    }
    return result.join('\n') || 'No tables found';
  }

  if (type === 'postgresql') {
    const tablesRes = await client.query(
      "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY table_name"
    );
    const result = [];
    for (const { table_name: tn } of tablesRes.rows) {
      const colRes = await client.query(
        'SELECT column_name FROM information_schema.columns WHERE table_name = $1 ORDER BY ordinal_position',
        [tn]
      );
      const colStr = colRes.rows.map(c => c.column_name).join(', ');
      result.push(`${tn}: ${colStr}`);
    }
    return result.join('\n') || 'No tables found';
  }

  if (type === 'mongodb') {
    const collections = await client.db.listCollections().toArray();
    return collections.map(c => c.name).join('\n') || 'No collections found';
  }

  return 'Unsupported database type';
}

async function describeTable(client, type, tableName) {
  if (type === 'sqlite') {
    const columns = client.prepare(`PRAGMA table_info('${tableName}')`).all();
    if (!columns.length) return `Table '${tableName}' not found`;
    const lines = columns.map(c => {
      const parts = [`${c.name} ${c.type}`];
      if (c.pk) parts.push('PRIMARY KEY');
      if (c.notnull) parts.push('NOT NULL');
      if (c.dflt_value !== null) parts.push(`DEFAULT ${c.dflt_value}`);
      return parts.join(' | ');
    });
    return `Table: ${tableName}\n${'─'.repeat(40)}\n${lines.join('\n')}`;
  }

  if (type === 'mysql') {
    const [columns] = await client.execute(`SHOW FULL COLUMNS FROM \`${tableName}\``);
    if (!columns.length) return `Table '${tableName}' not found`;
    const lines = columns.map(c => {
      const parts = [`${c.Field} ${c.Type}`];
      if (c.Key === 'PRI') parts.push('PRIMARY KEY');
      if (c.Null === 'NO') parts.push('NOT NULL');
      if (c.Default !== null) parts.push(`DEFAULT ${c.Default}`);
      return parts.join(' | ');
    });
    return `Table: ${tableName}\n${'─'.repeat(40)}\n${lines.join('\n')}`;
  }

  if (type === 'postgresql') {
    const result = await client.query(
      `SELECT column_name, data_type, is_nullable, column_default,
              (SELECT EXISTS(
                SELECT 1 FROM information_schema.table_constraints tc
                JOIN information_schema.key_column_usage kcu ON tc.constraint_name = kcu.constraint_name
                WHERE tc.table_name = c.table_name AND kcu.column_name = c.column_name
                AND tc.constraint_type = 'PRIMARY KEY'
              )) as is_pk
       FROM information_schema.columns c
       WHERE table_name = $1 AND table_schema = 'public'
       ORDER BY ordinal_position`,
      [tableName]
    );
    if (!result.rows.length) return `Table '${tableName}' not found`;
    const lines = result.rows.map(c => {
      const parts = [`${c.column_name} ${c.data_type}`];
      if (c.is_pk) parts.push('PRIMARY KEY');
      if (c.is_nullable === 'NO') parts.push('NOT NULL');
      if (c.column_default) parts.push(`DEFAULT ${c.column_default}`);
      return parts.join(' | ');
    });
    return `Table: ${tableName}\n${'─'.repeat(40)}\n${lines.join('\n')}`;
  }

  if (type === 'mongodb') {
    const sample = await client.db.collection(tableName).findOne();
    if (!sample) return `Collection '${tableName}' is empty or does not exist`;
    const fields = Object.entries(sample).map(([key, val]) => `${key}: ${typeof val}`);
    return `Collection: ${tableName} (sample document)\n${'─'.repeat(40)}\n${fields.join('\n')}`;
  }

  return 'Unsupported database type';
}

// -- Formatting ---------------------------------------------------------------

function formatRows(rows) {
  if (!rows || rows.length === 0) return 'No results';
  const columns = Object.keys(rows[0]);
  const header = columns.join(' | ');
  const separator = columns.map(c => '─'.repeat(Math.max(c.length, 3))).join('─┼─');
  const dataLines = rows.map(row => columns.map(c => String(row[c] ?? 'NULL')).join(' | '));
  const truncated = rows.length >= MAX_ROWS ? `\n(Limited to ${MAX_ROWS} rows)` : '';
  return `${header}\n${separator}\n${dataLines.join('\n')}${truncated}`;
}

// -- Tool definitions ---------------------------------------------------------

const tools = [
  {
    name: 'db_list_connections',
    description: 'List all database connections configured in Claude Terminal. Returns connection name, type (sqlite/mysql/postgresql/mongodb), and connection details. Call this first to discover available databases.',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'db_list_tables',
    description: 'List all tables (or MongoDB collections) in a database connection, with their column names.',
    inputSchema: {
      type: 'object',
      properties: {
        connection: { type: 'string', description: 'Connection name or ID (from db_list_connections)' },
      },
      required: ['connection'],
    },
  },
  {
    name: 'db_describe_table',
    description: 'Get detailed schema for a specific table: column names, types, primary keys, nullability, and defaults.',
    inputSchema: {
      type: 'object',
      properties: {
        connection: { type: 'string', description: 'Connection name or ID' },
        table: { type: 'string', description: 'Table or collection name' },
      },
      required: ['connection', 'table'],
    },
  },
  {
    name: 'db_query',
    description: 'Execute a SQL query against a database connection. Supports SELECT, INSERT, UPDATE, DELETE. Results limited to 100 rows for SELECT queries.',
    inputSchema: {
      type: 'object',
      properties: {
        connection: { type: 'string', description: 'Connection name or ID' },
        sql: { type: 'string', description: 'SQL query to execute' },
      },
      required: ['connection', 'sql'],
    },
  },
];

// -- Tool handler -------------------------------------------------------------

async function handle(name, args) {
  const ok = (text) => ({ content: [{ type: 'text', text }] });
  const fail = (text) => ({ content: [{ type: 'text', text }], isError: true });

  try {
    if (name === 'db_list_connections') {
      const configs = loadConnectionConfigs();
      if (!configs.length) return ok('No database connections configured. Add connections in Claude Terminal > Database panel.');

      const lines = configs.map(c => {
        const parts = [`${c.name} (${c.type})`];
        if (c.type === 'sqlite') parts.push(`— ${c.filePath}`);
        else if (c.type === 'mongodb') parts.push(`— ${c.connectionString ? c.connectionString.replace(/\/\/[^:]+:[^@]+@/, '//***:***@') : 'no URI'}`);
        else parts.push(`— ${c.host || 'localhost'}:${c.port || '?'}/${c.database || '?'}`);
        return parts.join(' ');
      });

      return ok(`Available connections:\n\n${lines.join('\n')}`);
    }

    if (name === 'db_list_tables') {
      if (!args.connection) return fail('Missing required parameter: connection');
      const { client, type } = await getClient(args.connection);
      const result = await listTables(client, type);
      return ok(result);
    }

    if (name === 'db_describe_table') {
      if (!args.connection) return fail('Missing required parameter: connection');
      if (!args.table) return fail('Missing required parameter: table');
      const { client, type } = await getClient(args.connection);
      const result = await describeTable(client, type, args.table);
      return ok(result);
    }

    if (name === 'db_query') {
      if (!args.connection) return fail('Missing required parameter: connection');
      if (!args.sql) return fail('Missing required parameter: sql');
      const { client, type } = await getClient(args.connection);
      const result = await executeQuery(client, type, args.sql);
      return ok(result);
    }

    return fail(`Unknown database tool: ${name}`);
  } catch (error) {
    log(`Error in ${name}:`, error.message);
    return fail(`Database error: ${error.message}`);
  }
}

// -- Cleanup ------------------------------------------------------------------

async function cleanup() {
  for (const [id, { client, type }] of connections) {
    try {
      if (type === 'sqlite') client.close();
      else if (type === 'mysql') await client.end();
      else if (type === 'postgresql') await client.end();
      else if (type === 'mongodb') await client.mongoClient.close();
      log(`Closed connection: ${id}`);
    } catch (e) {
      log(`Error closing ${id}: ${e.message}`);
    }
  }
  connections.clear();
}

// -- Exports ------------------------------------------------------------------

module.exports = { tools, handle, cleanup };
