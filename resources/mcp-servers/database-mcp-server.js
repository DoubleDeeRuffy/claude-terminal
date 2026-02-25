#!/usr/bin/env node
'use strict';

/**
 * Database MCP Server for Claude Terminal
 *
 * Standalone MCP stdio server that bridges Claude to databases.
 * Supports SQLite, MySQL, PostgreSQL, and MongoDB.
 *
 * Environment variables:
 *   DB_TYPE             - sqlite | mysql | postgresql | mongodb
 *   DB_PATH             - SQLite file path
 *   DB_HOST, DB_PORT    - Host and port for MySQL/PostgreSQL
 *   DB_NAME             - Database name
 *   DB_USER, DB_PASSWORD - Credentials
 *   DB_CONNECTION_STRING - MongoDB URI
 *   NODE_PATH           - Path to node_modules with database drivers
 */

const readline = require('readline');

const MAX_ROWS = 100;

let connection = null;
let dbType = null;

// -- Logging (stderr only) --------------------------------------------------

function log(...args) {
  process.stderr.write(`[database-mcp] ${args.join(' ')}\n`);
}

// -- JSON-RPC helpers --------------------------------------------------------

function sendResponse(id, result) {
  const message = JSON.stringify({ jsonrpc: '2.0', id, result });
  process.stdout.write(message + '\n');
}

function sendError(id, code, message) {
  const payload = JSON.stringify({ jsonrpc: '2.0', id, error: { code, message } });
  process.stdout.write(payload + '\n');
}

function sendNotification(method, params) {
  const message = JSON.stringify({ jsonrpc: '2.0', method, ...(params ? { params } : {}) });
  process.stdout.write(message + '\n');
}

function toolResult(text) {
  return { content: [{ type: 'text', text }] };
}

function toolError(text) {
  return { content: [{ type: 'text', text }], isError: true };
}

// -- Database drivers --------------------------------------------------------

async function getConnection() {
  if (connection) return connection;

  dbType = (process.env.DB_TYPE || '').toLowerCase();
  if (!dbType) throw new Error('DB_TYPE environment variable is required');

  log(`Connecting to ${dbType} database...`);

  if (dbType === 'sqlite') {
    const Database = require('better-sqlite3');
    const dbPath = process.env.DB_PATH;
    if (!dbPath) throw new Error('DB_PATH is required for SQLite');
    connection = new Database(dbPath, { readonly: false });
    connection.pragma('journal_mode = WAL');
  } else if (dbType === 'mysql') {
    const mysql = require('mysql2/promise');
    connection = await mysql.createConnection({
      host: process.env.DB_HOST || 'localhost',
      port: parseInt(process.env.DB_PORT || '3306', 10),
      database: process.env.DB_NAME,
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
    });
  } else if (dbType === 'postgresql') {
    const { Client } = require('pg');
    connection = new Client({
      host: process.env.DB_HOST || 'localhost',
      port: parseInt(process.env.DB_PORT || '5432', 10),
      database: process.env.DB_NAME,
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
    });
    await connection.connect();
  } else if (dbType === 'mongodb') {
    const { MongoClient } = require('mongodb');
    const uri = process.env.DB_CONNECTION_STRING;
    if (!uri) throw new Error('DB_CONNECTION_STRING is required for MongoDB');
    const client = new MongoClient(uri);
    await client.connect();
    const dbName = process.env.DB_NAME || new URL(uri).pathname.slice(1) || 'test';
    connection = { client, db: client.db(dbName) };
  } else {
    throw new Error(`Unsupported DB_TYPE: ${dbType}`);
  }

  log(`Connected to ${dbType} successfully`);
  return connection;
}

// -- Tool implementations ----------------------------------------------------

async function executeQuery(sql) {
  const conn = await getConnection();
  const trimmedSql = sql.trim();

  if (dbType === 'sqlite') {
    const isSelect = /^(SELECT|PRAGMA|EXPLAIN|WITH)\b/i.test(trimmedSql);
    if (isSelect) {
      const rows = conn.prepare(trimmedSql).all().slice(0, MAX_ROWS);
      return formatRows(rows);
    }
    const info = conn.prepare(trimmedSql).run();
    return `Rows affected: ${info.changes}`;
  }

  if (dbType === 'mysql') {
    const [rows] = await conn.execute(trimmedSql);
    if (Array.isArray(rows)) return formatRows(rows.slice(0, MAX_ROWS));
    return `Rows affected: ${rows.affectedRows}`;
  }

  if (dbType === 'postgresql') {
    const result = await conn.query(trimmedSql);
    if (result.rows) return formatRows(result.rows.slice(0, MAX_ROWS));
    return `Rows affected: ${result.rowCount}`;
  }

  if (dbType === 'mongodb') {
    return 'Use MongoDB find syntax via the query tool. Example: db.collection.find({})';
  }

  return 'Unsupported database type';
}

async function listTables() {
  const conn = await getConnection();

  if (dbType === 'sqlite') {
    const tables = conn.prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name").all();
    const result = [];
    for (const { name } of tables) {
      const columns = conn.prepare(`PRAGMA table_info('${name}')`).all();
      const colNames = columns.map(c => c.name).join(', ');
      result.push(`${name}: ${colNames}`);
    }
    return result.join('\n') || 'No tables found';
  }

  if (dbType === 'mysql') {
    const [tables] = await conn.execute('SHOW TABLES');
    const key = Object.keys(tables[0] || {})[0];
    const result = [];
    for (const row of tables) {
      const tableName = row[key];
      const [columns] = await conn.execute(`SHOW COLUMNS FROM \`${tableName}\``);
      const colNames = columns.map(c => c.Field).join(', ');
      result.push(`${tableName}: ${colNames}`);
    }
    return result.join('\n') || 'No tables found';
  }

  if (dbType === 'postgresql') {
    const tablesResult = await conn.query(
      "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY table_name"
    );
    const result = [];
    for (const { table_name: tableName } of tablesResult.rows) {
      const colResult = await conn.query(
        'SELECT column_name FROM information_schema.columns WHERE table_name = $1 ORDER BY ordinal_position',
        [tableName]
      );
      const colNames = colResult.rows.map(c => c.column_name).join(', ');
      result.push(`${tableName}: ${colNames}`);
    }
    return result.join('\n') || 'No tables found';
  }

  if (dbType === 'mongodb') {
    const collections = await conn.db.listCollections().toArray();
    return collections.map(c => c.name).join('\n') || 'No collections found';
  }

  return 'Unsupported database type';
}

async function describeTable(tableName) {
  const conn = await getConnection();

  if (dbType === 'sqlite') {
    const columns = conn.prepare(`PRAGMA table_info('${tableName}')`).all();
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

  if (dbType === 'mysql') {
    const [columns] = await conn.execute(`SHOW FULL COLUMNS FROM \`${tableName}\``);
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

  if (dbType === 'postgresql') {
    const result = await conn.query(
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

  if (dbType === 'mongodb') {
    const sample = await conn.db.collection(tableName).findOne();
    if (!sample) return `Collection '${tableName}' is empty or does not exist`;
    const fields = Object.entries(sample).map(([key, val]) => `${key}: ${typeof val}`);
    return `Collection: ${tableName} (sample document)\n${'─'.repeat(40)}\n${fields.join('\n')}`;
  }

  return 'Unsupported database type';
}

// -- Formatting helpers ------------------------------------------------------

function formatRows(rows) {
  if (!rows || rows.length === 0) return 'No results';
  const columns = Object.keys(rows[0]);
  const header = columns.join(' | ');
  const separator = columns.map(c => '─'.repeat(Math.max(c.length, 3))).join('─┼─');
  const dataLines = rows.map(row => columns.map(c => String(row[c] ?? 'NULL')).join(' | '));
  const truncated = rows.length >= MAX_ROWS ? `\n(Results limited to ${MAX_ROWS} rows)` : '';
  return `${header}\n${separator}\n${dataLines.join('\n')}${truncated}`;
}

// -- MCP protocol handlers ---------------------------------------------------

const TOOLS = [
  {
    name: 'query',
    description: 'Execute a SQL query against the connected database. For MongoDB, returns a hint to use find syntax. Results are limited to 100 rows.',
    inputSchema: {
      type: 'object',
      properties: { sql: { type: 'string', description: 'The SQL query to execute' } },
      required: ['sql'],
    },
  },
  {
    name: 'list_tables',
    description: 'List all tables (or MongoDB collections) with their column names.',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'describe_table',
    description: 'Get detailed schema information about a specific table or collection, including column types, primary keys, nullability, and defaults.',
    inputSchema: {
      type: 'object',
      properties: { table: { type: 'string', description: 'The table or collection name' } },
      required: ['table'],
    },
  },
];

async function handleMessage(message) {
  const { id, method, params } = message;

  if (method === 'initialize') {
    sendResponse(id, {
      protocolVersion: '2024-11-05',
      capabilities: { tools: {} },
      serverInfo: { name: 'claude-terminal-database', version: '1.0.0' },
    });
    sendNotification('notifications/initialized');
    log('Server initialized');
    return;
  }

  if (method === 'tools/list') {
    sendResponse(id, { tools: TOOLS });
    return;
  }

  if (method === 'tools/call') {
    const toolName = params?.name;
    const args = params?.arguments || {};

    try {
      let resultText;
      if (toolName === 'query') {
        if (!args.sql) throw new Error('Missing required parameter: sql');
        resultText = await executeQuery(args.sql);
      } else if (toolName === 'list_tables') {
        resultText = await listTables();
      } else if (toolName === 'describe_table') {
        if (!args.table) throw new Error('Missing required parameter: table');
        resultText = await describeTable(args.table);
      } else {
        sendResponse(id, toolError(`Unknown tool: ${toolName}`));
        return;
      }
      sendResponse(id, toolResult(resultText));
    } catch (error) {
      log(`Tool error (${toolName}):`, error.message);
      sendResponse(id, toolError(`Error: ${error.message}`));
    }
    return;
  }

  // Ignore notifications and unknown methods
  if (!id) return;
  sendError(id, -32601, `Method not found: ${method}`);
}

// -- Main loop ---------------------------------------------------------------

const rl = readline.createInterface({ input: process.stdin, terminal: false });

rl.on('line', (line) => {
  const trimmed = line.trim();
  if (!trimmed) return;

  try {
    const message = JSON.parse(trimmed);
    handleMessage(message).catch((error) => {
      log('Unhandled error:', error.message);
      if (message.id) sendError(message.id, -32603, `Internal error: ${error.message}`);
    });
  } catch (parseError) {
    log('Failed to parse message:', parseError.message);
  }
});

rl.on('close', () => {
  log('stdin closed, shutting down');
  process.exit(0);
});

process.on('SIGINT', () => {
  log('Received SIGINT, shutting down');
  process.exit(0);
});

process.on('SIGTERM', () => {
  log('Received SIGTERM, shutting down');
  process.exit(0);
});

log('Database MCP server started, waiting for messages...');
