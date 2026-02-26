'use strict';

/**
 * Projects Tools Module for Claude Terminal MCP
 *
 * Provides project listing and info tools. Reads from CT_DATA_DIR/projects.json.
 */

const fs = require('fs');
const path = require('path');

// -- Logging ------------------------------------------------------------------

function log(...args) {
  process.stderr.write(`[ct-mcp:projects] ${args.join(' ')}\n`);
}

// -- Data access --------------------------------------------------------------

function getDataDir() {
  return process.env.CT_DATA_DIR || '';
}

function loadProjects() {
  const file = path.join(getDataDir(), 'projects.json');
  try {
    if (fs.existsSync(file)) return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (e) {
    log('Error reading projects.json:', e.message);
  }
  return { projects: [], folders: [], rootOrder: [] };
}

function findProject(nameOrId) {
  const data = loadProjects();
  return data.projects.find(p =>
    p.id === nameOrId ||
    (p.name || '').toLowerCase() === nameOrId.toLowerCase() ||
    path.basename(p.path || '').toLowerCase() === nameOrId.toLowerCase()
  );
}

// -- Tool definitions ---------------------------------------------------------

const tools = [
  {
    name: 'project_list',
    description: 'List all projects configured in Claude Terminal with their type, path, and folder organization.',
    inputSchema: {
      type: 'object',
      properties: {
        filter: { type: 'string', description: 'Optional name filter (case-insensitive substring match)' },
      },
    },
  },
  {
    name: 'project_info',
    description: 'Get detailed info about a specific project: path, type, quick actions, editor, color/icon customization.',
    inputSchema: {
      type: 'object',
      properties: {
        project: { type: 'string', description: 'Project name, folder name, or ID' },
      },
      required: ['project'],
    },
  },
  {
    name: 'project_todos',
    description: 'Scan a project directory for TODO, FIXME, HACK, and XXX comments in source files.',
    inputSchema: {
      type: 'object',
      properties: {
        project: { type: 'string', description: 'Project name or ID' },
        pattern: { type: 'string', description: 'Comment pattern to search for (default: TODO|FIXME|HACK|XXX)' },
      },
      required: ['project'],
    },
  },
  {
    name: 'quickaction_list',
    description: 'List quick actions configured for a project. Quick actions are shell commands (build, test, dev, etc.) that can be run in a terminal.',
    inputSchema: {
      type: 'object',
      properties: {
        project: { type: 'string', description: 'Project name or ID' },
      },
      required: ['project'],
    },
  },
  {
    name: 'quickaction_run',
    description: 'Trigger a quick action on a project. Opens a terminal in Claude Terminal and runs the command. The action executes asynchronously.',
    inputSchema: {
      type: 'object',
      properties: {
        project: { type: 'string', description: 'Project name or ID' },
        action: { type: 'string', description: 'Quick action name or ID' },
      },
      required: ['project', 'action'],
    },
  },
];

// -- TODO scanner -------------------------------------------------------------

const SCAN_EXTENSIONS = new Set([
  '.js', '.ts', '.jsx', '.tsx', '.py', '.lua', '.go', '.rs', '.java',
  '.c', '.cpp', '.h', '.hpp', '.cs', '.rb', '.php', '.swift', '.kt',
  '.sh', '.bash', '.zsh', '.css', '.scss', '.html', '.vue', '.svelte',
]);

const SKIP_DIRS = new Set([
  'node_modules', '.git', 'dist', 'build', 'out', '.next', '__pycache__',
  'vendor', 'target', '.cache', 'coverage', '.vscode', '.idea',
]);

function scanTodos(dir, pattern, results, depth = 0) {
  if (depth > 8 || results.length >= 100) return;
  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (results.length >= 100) break;
      if (entry.isDirectory()) {
        if (!SKIP_DIRS.has(entry.name)) {
          scanTodos(path.join(dir, entry.name), pattern, results, depth + 1);
        }
      } else if (entry.isFile() && SCAN_EXTENSIONS.has(path.extname(entry.name))) {
        try {
          const content = fs.readFileSync(path.join(dir, entry.name), 'utf8');
          const lines = content.split('\n');
          for (let i = 0; i < lines.length; i++) {
            const match = lines[i].match(pattern);
            if (match) {
              const rel = path.relative(dir, path.join(dir, entry.name)).replace(/\\/g, '/');
              const comment = lines[i].trim().slice(0, 120);
              results.push({ file: rel, line: i + 1, text: comment });
              if (results.length >= 100) break;
            }
          }
        } catch (_) {}
      }
    }
  } catch (_) {}
}

// -- Tool handler -------------------------------------------------------------

async function handle(name, args) {
  const ok = (text) => ({ content: [{ type: 'text', text }] });
  const fail = (text) => ({ content: [{ type: 'text', text }], isError: true });

  try {
    if (name === 'project_list') {
      const data = loadProjects();
      let projects = data.projects || [];

      if (args.filter) {
        const f = args.filter.toLowerCase();
        projects = projects.filter(p =>
          (p.name || '').toLowerCase().includes(f) ||
          (p.path || '').toLowerCase().includes(f) ||
          (p.type || '').toLowerCase().includes(f)
        );
      }

      if (!projects.length) return ok(args.filter ? `No projects matching "${args.filter}"` : 'No projects configured.');

      // Build folder map
      const folderMap = new Map();
      for (const f of (data.folders || [])) {
        folderMap.set(f.id, f.name);
      }

      const lines = projects.map(p => {
        const parts = [`${p.name || path.basename(p.path || '?')}`];
        parts.push(`  Path: ${p.path || '?'}`);
        parts.push(`  Type: ${p.type || 'standalone'}`);
        if (p.folderId && folderMap.has(p.folderId)) {
          parts.push(`  Folder: ${folderMap.get(p.folderId)}`);
        }
        if (p.quickActions && p.quickActions.length) {
          parts.push(`  Quick actions: ${p.quickActions.map(a => a.name).join(', ')}`);
        }
        return parts.join('\n');
      });

      return ok(`Projects (${projects.length}):\n\n${lines.join('\n\n')}`);
    }

    if (name === 'project_info') {
      if (!args.project) return fail('Missing required parameter: project');
      const p = findProject(args.project);
      if (!p) return fail(`Project "${args.project}" not found. Use project_list to see available projects.`);

      const data = loadProjects();
      const folderMap = new Map();
      for (const f of (data.folders || [])) folderMap.set(f.id, f.name);

      let output = `# ${p.name || path.basename(p.path || '?')}\n`;
      output += `ID: ${p.id}\n`;
      output += `Path: ${p.path || '?'}\n`;
      output += `Type: ${p.type || 'standalone'}\n`;
      if (p.folderId && folderMap.has(p.folderId)) output += `Folder: ${folderMap.get(p.folderId)}\n`;
      if (p.color) output += `Color: ${p.color}\n`;
      if (p.icon) output += `Icon: ${p.icon}\n`;
      if (p.preferredEditor) output += `Editor: ${p.preferredEditor}\n`;

      if (p.quickActions && p.quickActions.length) {
        output += `\n## Quick Actions\n`;
        for (const qa of p.quickActions) {
          output += `  ${qa.name}: ${qa.command}\n`;
        }
      }

      // Check if path exists and show basic stats
      if (p.path && fs.existsSync(p.path)) {
        try {
          const entries = fs.readdirSync(p.path);
          const hasGit = entries.includes('.git');
          const hasPkg = entries.includes('package.json');
          output += `\n## Directory\n`;
          output += `  Files: ${entries.length} items\n`;
          output += `  Git: ${hasGit ? 'yes' : 'no'}\n`;
          if (hasPkg) output += `  package.json: yes\n`;
        } catch (_) {}
      }

      return ok(output);
    }

    if (name === 'project_todos') {
      if (!args.project) return fail('Missing required parameter: project');
      const p = findProject(args.project);
      if (!p) return fail(`Project "${args.project}" not found.`);
      if (!p.path || !fs.existsSync(p.path)) return fail(`Project path not found: ${p.path}`);

      const patternStr = args.pattern || 'TODO|FIXME|HACK|XXX';
      const regex = new RegExp(`\\b(${patternStr})\\b`, 'i');
      const results = [];
      scanTodos(p.path, regex, results);

      if (!results.length) return ok(`No ${patternStr} comments found in ${p.name || path.basename(p.path)}.`);

      const lines = results.map(r => `${r.file}:${r.line} — ${r.text}`);
      return ok(`Found ${results.length} comments in ${p.name || path.basename(p.path)}:\n\n${lines.join('\n')}`);
    }

    if (name === 'quickaction_list') {
      if (!args.project) return fail('Missing required parameter: project');
      const p = findProject(args.project);
      if (!p) return fail(`Project "${args.project}" not found. Use project_list to see available projects.`);

      const actions = p.quickActions || [];
      if (!actions.length) return ok(`No quick actions configured for ${p.name || path.basename(p.path || '?')}. Configure them in Claude Terminal.`);

      let output = `Quick actions for ${p.name || path.basename(p.path || '?')} (${actions.length}):\n`;
      output += `${'─'.repeat(40)}\n`;
      for (const a of actions) {
        output += `  ${a.name} [${a.icon || 'play'}]\n    ${a.command}\n`;
      }
      return ok(output);
    }

    if (name === 'quickaction_run') {
      if (!args.project) return fail('Missing required parameter: project');
      if (!args.action) return fail('Missing required parameter: action');

      const p = findProject(args.project);
      if (!p) return fail(`Project "${args.project}" not found.`);

      const actions = p.quickActions || [];
      const action = actions.find(a =>
        a.id === args.action ||
        a.name.toLowerCase() === args.action.toLowerCase()
      );
      if (!action) {
        const available = actions.map(a => a.name).join(', ');
        return fail(`Action "${args.action}" not found. Available: ${available || 'none'}`);
      }

      // Write trigger file for the app to pick up
      const triggerDir = path.join(getDataDir(), 'quickactions', 'triggers');
      if (!fs.existsSync(triggerDir)) fs.mkdirSync(triggerDir, { recursive: true });

      const triggerFile = path.join(triggerDir, `${action.id}_${Date.now()}.json`);
      fs.writeFileSync(triggerFile, JSON.stringify({
        projectId: p.id,
        actionId: action.id,
        actionName: action.name,
        command: action.command,
        source: 'mcp',
        timestamp: new Date().toISOString(),
      }), 'utf8');

      return ok(`Quick action "${action.name}" triggered on ${p.name || path.basename(p.path || '?')}. Command: ${action.command}`);
    }

    return fail(`Unknown project tool: ${name}`);
  } catch (error) {
    log(`Error in ${name}:`, error.message);
    return fail(`Project error: ${error.message}`);
  }
}

// -- Cleanup ------------------------------------------------------------------

async function cleanup() {}

// -- Exports ------------------------------------------------------------------

module.exports = { tools, handle, cleanup };
