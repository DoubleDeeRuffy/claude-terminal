/**
 * RemoteServer
 * WebSocket + HTTP server that serves the mobile PWA and bridges
 * Claude Terminal state/events to connected mobile devices.
 *
 * Auth flow:
 *  1. User enables Remote in settings → server starts
 *  2. A 4-digit PIN is shown in settings (rotates every 2 min or on demand)
 *  3. Mobile opens http://<ip>:<port>, enters PIN → POST /auth { pin }
 *     → server returns a session token (valid for the server lifetime)
 *  4. Mobile connects WS with ?token=<sessionToken>
 *  5. On reconnect, mobile uses stored session token directly
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const { WebSocketServer } = require('ws');
const { app } = require('electron');

const { settingsFile, projectsFile } = require('../utils/paths');

const PIN_TTL_MS = 2 * 60 * 1000; // 2 minutes

// In packaged builds, remote-ui is in extraResources; in dev, relative to project root
function getPwaDir() {
  if (app && app.isPackaged) {
    return path.join(process.resourcesPath, 'remote-ui');
  }
  return path.join(__dirname, '..', '..', '..', 'remote-ui');
}

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js':   'application/javascript; charset=utf-8',
  '.css':  'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png':  'image/png',
  '.ico':  'image/x-icon',
  '.svg':  'image/svg+xml',
  '.webmanifest': 'application/manifest+json',
};

let httpServer = null;
let wss = null;
let mainWindow = null;

// Current PIN state
let _pin = null;       // string '0000'–'9999'
let _pinExpiry = 0;    // timestamp ms
let _pinUsed = false;  // true after one successful auth (PIN stays displayed but can't be reused)

// Valid session tokens → WebSocket (once authenticated via PIN)
// Map<sessionToken, WebSocket | null>
const _sessionTokens = new Set();
const _connectedClients = new Map(); // Map<sessionToken, WebSocket>

// Live time data pushed from renderer
let _timeData = { todayMs: 0 };

// Cache sessionId → projectId mapping to avoid disk reads on every chat-idle
const _sessionProjectMap = new Map();

// ─── Settings ─────────────────────────────────────────────────────────────────

function _loadSettings() {
  try {
    if (fs.existsSync(settingsFile)) {
      return JSON.parse(fs.readFileSync(settingsFile, 'utf8'));
    }
  } catch (e) {}
  return {};
}

// ─── Network Interfaces ───────────────────────────────────────────────────────

function _getLocalIps() {
  const nets = os.networkInterfaces();
  const result = [];
  for (const iface of Object.values(nets)) {
    for (const net of iface) {
      if (net.family !== 'IPv4' || net.internal) continue;
      result.push(net.address);
    }
  }
  return result;
}

function _getNetworkInterfaces() {
  const nets = os.networkInterfaces();
  const result = [];
  for (const [ifaceName, iface] of Object.entries(nets)) {
    for (const net of iface) {
      if (net.family !== 'IPv4' || net.internal) continue;
      result.push({ ifaceName, address: net.address });
    }
  }
  return result;
}

// ─── PIN Management ───────────────────────────────────────────────────────────

function generatePin() {
  _pin = String(Math.floor(Math.random() * 10000)).padStart(4, '0');
  _pinExpiry = Date.now() + PIN_TTL_MS;
  _pinUsed = false;
  console.log(`[Remote] PIN generated: ${_pin} (valid 2 min)`);
  return _pin;
}

function _isPinValid(pin) {
  return _pin !== null && !_pinUsed && pin === _pin && Date.now() < _pinExpiry;
}

function getPin() {
  return { pin: _pin, expiresAt: _pinExpiry, used: _pinUsed };
}

// ─── HTTP Handler ─────────────────────────────────────────────────────────────

function _handleHttpRequest(req, res) {
  // CORS for local dev
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  // POST /auth — exchange PIN for session token
  if (req.method === 'POST' && req.url === '/auth') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      try {
        const { pin } = JSON.parse(body);
        if (!_isPinValid(pin)) {
          console.warn(`[Remote] Auth failed — wrong or expired PIN (got: "${pin}", expected: "${_pin}", expired: ${Date.now() >= _pinExpiry})`);
          res.writeHead(401, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Invalid or expired PIN' }));
          return;
        }
        // Generate a session token and mark PIN as used (keeps displaying until expiry)
        const token = crypto.randomBytes(24).toString('hex');
        _sessionTokens.add(token);
        _pinUsed = true;
        console.log(`[Remote] Auth OK — session token issued, ${_sessionTokens.size} active token(s)`);
        // Immediately generate a fresh PIN for next auth
        generatePin();
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ token }));
      } catch (e) {
        console.warn(`[Remote] Auth error — bad JSON body: ${e.message}`);
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Bad request' }));
      }
    });
    return;
  }

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  // Static file serving for PWA
  const pwaDir = getPwaDir();
  let urlPath = req.url.split('?')[0];
  if (urlPath === '/') urlPath = '/index.html';

  const filePath = path.join(pwaDir, urlPath);

  // Security: prevent path traversal
  if (!filePath.startsWith(pwaDir)) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }

  fs.readFile(filePath, (err, data) => {
    if (err) {
      // SPA fallback → index.html
      console.debug(`[Remote] Static 404 ${urlPath} → SPA fallback`);
      fs.readFile(path.join(pwaDir, 'index.html'), (err2, html) => {
        if (err2) { res.writeHead(404); res.end('Not found'); return; }
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-cache' });
        res.end(html);
      });
      return;
    }
    const ext = path.extname(filePath);
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';
    console.debug(`[Remote] GET ${urlPath} → 200`);
    res.writeHead(200, { 'Content-Type': contentType, 'Cache-Control': 'no-cache' });
    res.end(data);
  });
}

// ─── WebSocket Auth & Message Handling ───────────────────────────────────────

function _handleWsUpgrade(request, socket, head) {
  const urlParams = new URLSearchParams(request.url.replace(/^.*\?/, ''));
  const token = urlParams.get('token');

  if (!token || !_sessionTokens.has(token)) {
    console.warn(`[Remote] WS upgrade rejected — invalid token (token present: ${!!token}, known tokens: ${_sessionTokens.size})`);
    // Accepter le WS puis fermer avec code 4401 pour que le client sache que c'est un token invalide
    // (un rejet HTTP 401 sur upgrade est moins fiable sur iOS Safari)
    wss.handleUpgrade(request, socket, head, (ws) => {
      ws.close(4401, 'Invalid or expired token');
    });
    return;
  }

  wss.handleUpgrade(request, socket, head, (ws) => {
    // Close any existing WS for this token
    const existing = _connectedClients.get(token);
    if (existing) { try { existing.close(); } catch (e) {} }

    _connectedClients.set(token, ws);
    console.log(`[Remote] WS connected — ${_connectedClients.size} client(s) active`);

    ws.on('message', (raw) => _handleClientMessage(ws, token, raw));
    ws.on('close', (code) => {
      _connectedClients.delete(token);
      console.log(`[Remote] WS disconnected (code: ${code}) — ${_connectedClients.size} client(s) remaining`);
    });
    ws.on('error', (e) => {
      _connectedClients.delete(token);
      console.warn(`[Remote] WS error: ${e.message}`);
    });

    // 1. hello immédiat (avec settings pour sync model/effort)
    const settings = _loadSettings();
    _wsSend(ws, 'hello', {
      version: '1.0',
      serverName: 'Claude Terminal',
      chatModel: settings.chatModel || null,
      effortLevel: settings.effortLevel || null,
      accentColor: settings.accentColor || '#d97706',
    });
    // 2. projets + sessions actives en différé (lecture disque)
    setImmediate(() => _sendProjectsAndSessions(ws));
    // 3. Demander au renderer un push frais du time tracking → arrivera via time:update
    if (_isMainWindowReady()) {
      mainWindow.webContents.send('remote:request-time-push');
    }
  });
}

function _sendProjectsAndSessions(ws) {
  try {
    let projects = [];
    let folders = [];
    let rootOrder = [];
    if (fs.existsSync(projectsFile)) {
      const data = JSON.parse(fs.readFileSync(projectsFile, 'utf8'));
      projects = (data.projects || []).map(p => ({
        id: p.id,
        name: p.name,
        path: p.path,
        color: p.color,
        icon: p.icon,
        folderId: p.folderId || null,
      }));
      folders = (data.folders || []).map(f => ({
        id: f.id,
        name: f.name,
        parentId: f.parentId || null,
        children: f.children || [],
        color: f.color,
        icon: f.icon,
      }));
      rootOrder = data.rootOrder || [];
    }

    // Envoyer les projets + hiérarchie via projects:updated
    _wsSend(ws, 'projects:updated', { projects, folders, rootOrder });

    // Envoyer les sessions actives une par une via session:started
    const chatService = require('./ChatService');
    const activeSessions = chatService.getActiveSessions();
    console.log(`[Remote] Sending init data — ${projects.length} project(s), ${activeSessions.length} active session(s)`);
    for (const { sessionId, cwd } of activeSessions) {
      const project = projects.find(p => p.path && cwd && (
        cwd.replace(/\\/g, '/').startsWith(p.path.replace(/\\/g, '/'))
      ));
      const projectId = project?.id || null;
      if (projectId) _sessionProjectMap.set(sessionId, projectId);
      _wsSend(ws, 'session:started', {
        sessionId,
        projectId,
        tabName: project?.name || 'Chat',
      });
    }
  } catch (e) {
    console.warn(`[Remote] Failed to send init data: ${e.message}`);
  }
}

function _handleClientMessage(ws, token, raw) {
  let msg;
  try { msg = JSON.parse(raw); } catch (e) { return; }

  const { type, data } = msg;
  if (type !== 'ping') console.log(`[Remote] ← ${type}`, data ? JSON.stringify(data).slice(0, 120) : '');

  switch (type) {
    case 'ping':
      _wsSend(ws, 'pong', {});
      break;

    case 'chat:send': {
      try {
        const chatService = require('./ChatService');
        const images = Array.isArray(data.images) ? data.images : [];
        const mentions = Array.isArray(data.mentions) ? data.mentions : [];
        // Resolve mentions inline, then send
        const sessionInfo = chatService.getSessionInfo?.(data.sessionId);
        const cwd = sessionInfo?.cwd || null;
        _resolveMentions(mentions, cwd).then(resolvedText => {
          const fullText = resolvedText ? (data.text || '') + resolvedText : (data.text || '');
          chatService.sendMessage(data.sessionId, fullText, images);
        }).catch(() => {
          chatService.sendMessage(data.sessionId, data.text || '', images);
        });
        // Notify renderer so it can display the user message in ChatView
        if (_isMainWindowReady()) {
          mainWindow.webContents.send('remote:user-message', {
            sessionId: data.sessionId,
            text: data.text,
            images: images.map(img => ({
              base64: img.base64,
              mediaType: img.mediaType,
              dataUrl: `data:${img.mediaType};base64,${img.base64}`,
              name: 'image',
            })),
          });
        }
      } catch (err) {
        _wsSend(ws, 'chat-error', { sessionId: data.sessionId, error: err.message });
      }
      break;
    }

    case 'chat:start': {
      // Demander au renderer d'ouvrir un nouveau tab chat (lui qui démarre la session via SDK)
      if (_isMainWindowReady()) {
        const mentions = Array.isArray(data.mentions) ? data.mentions : [];
        _resolveMentions(mentions, data.cwd).then(resolvedText => {
          const prompt = resolvedText ? (data.prompt || '') + resolvedText : (data.prompt || '');
          mainWindow.webContents.send('remote:open-chat-tab', {
            cwd: data.cwd,
            prompt,
            images: Array.isArray(data.images) ? data.images : [],
            sessionId: data.sessionId,
            model: data.model || null,
            effort: data.effort || null,
          });
        }).catch(() => {
          mainWindow.webContents.send('remote:open-chat-tab', {
            cwd: data.cwd,
            prompt: data.prompt || '',
            images: Array.isArray(data.images) ? data.images : [],
            sessionId: data.sessionId,
            model: data.model || null,
            effort: data.effort || null,
          });
        });
      } else {
        _wsSend(ws, 'chat-error', { sessionId: data.sessionId, error: 'App window not available' });
      }
      break;
    }

    case 'chat:interrupt': {
      const chatService = require('./ChatService');
      chatService.interrupt(data.sessionId);
      break;
    }

    case 'chat:permission-response': {
      const chatService = require('./ChatService');
      chatService.resolvePermission(data.requestId, data.result);
      break;
    }

    case 'git:status': {
      const git = require('../utils/git');
      const cwd = data?.cwd;
      if (!cwd) { _wsSend(ws, 'git:status', { error: 'Missing cwd' }); break; }
      git.getGitInfoFull(cwd, { skipFetch: true }).then(info => {
        _wsSend(ws, 'git:status', info);
      }).catch(err => {
        _wsSend(ws, 'git:status', { isGitRepo: false, error: err.message });
      });
      break;
    }

    case 'git:pull': {
      const git = require('../utils/git');
      const cwd = data?.cwd;
      if (!cwd) { _wsSend(ws, 'git:pull', { success: false, error: 'Missing cwd' }); break; }
      git.gitPull(cwd).then(result => {
        _wsSend(ws, 'git:pull', result);
        // Refresh status after pull
        git.getGitInfoFull(cwd, { skipFetch: true }).then(info => _wsSend(ws, 'git:status', info)).catch(() => {});
      }).catch(err => {
        _wsSend(ws, 'git:pull', { success: false, error: err.message });
      });
      break;
    }

    case 'git:push': {
      const git = require('../utils/git');
      const cwd = data?.cwd;
      if (!cwd) { _wsSend(ws, 'git:push', { success: false, error: 'Missing cwd' }); break; }
      git.gitPush(cwd).then(result => {
        _wsSend(ws, 'git:push', result);
        // Refresh status after push
        git.getGitInfoFull(cwd, { skipFetch: true }).then(info => _wsSend(ws, 'git:status', info)).catch(() => {});
      }).catch(err => {
        _wsSend(ws, 'git:push', { success: false, error: err.message });
      });
      break;
    }

    case 'mention:file-list': {
      // Return a list of files for the @file picker
      const cwd = _resolveProjectPath(data?.projectId);
      if (!cwd) { _wsSend(ws, 'mention:file-list', { files: [] }); break; }
      _getProjectFiles(cwd).then(files => {
        _wsSend(ws, 'mention:file-list', { files });
      }).catch(() => {
        _wsSend(ws, 'mention:file-list', { files: [] });
      });
      break;
    }

    case 'settings:update': {
      const chatService = require('./ChatService');
      const { sessionId, model, effort } = data || {};
      const ops = [];
      if (model && sessionId) {
        ops.push(chatService.setModel(sessionId, model).catch(err => {
          _wsSend(ws, 'chat-error', { sessionId, error: `Model change failed: ${err.message}` });
        }));
      }
      if (effort && sessionId) {
        ops.push(chatService.setEffort(sessionId, effort).catch(err => {
          _wsSend(ws, 'chat-error', { sessionId, error: `Effort change failed: ${err.message}` });
        }));
      }
      Promise.all(ops).then(() => {
        _wsSend(ws, 'settings:updated', { sessionId, model, effort });
      });
      break;
    }

    default:
      break;
  }
}

// ─── Mention Resolution ──────────────────────────────────────────────────────

async function _resolveMentions(mentions, cwd) {
  if (!mentions || !mentions.length) return '';
  const blocks = [];

  for (const mention of mentions) {
    let content = '';
    switch (mention.type) {
      case 'file': {
        const filePath = mention.data?.fullPath || (cwd && mention.data?.path ? path.join(cwd, mention.data.path) : null);
        if (!filePath) { content = '[No file path]'; break; }
        try {
          const raw = fs.readFileSync(filePath, 'utf8');
          const lines = raw.split('\n');
          const displayPath = mention.data?.path || path.basename(filePath);
          content = lines.length > 500
            ? `File: ${displayPath} (first 500/${lines.length} lines)\n\n${lines.slice(0, 500).join('\n')}`
            : `File: ${displayPath}\n\n${raw}`;
        } catch (e) {
          content = `[Error reading file: ${mention.data?.path || filePath}]`;
        }
        break;
      }

      case 'git': {
        if (!cwd) { content = '[No project path]'; break; }
        try {
          const git = require('../utils/git');
          const status = await git.getGitStatusDetailed(cwd);
          if (!status?.success || !status.files?.length) { content = '[No git changes]'; break; }
          const diffs = [];
          for (const file of status.files.slice(0, 15)) {
            try {
              const d = await git.getFileDiff(cwd, file.path);
              if (d) diffs.push(`--- ${file.path} ---\n${d}`);
            } catch (e) {}
          }
          content = diffs.length > 0
            ? `Git Changes (${status.files.length} files):\n\n${diffs.join('\n\n')}`
            : `Git Status: ${status.files.length} changed files\n${status.files.map(f => `  ${f.status || '?'} ${f.path}`).join('\n')}`;
        } catch (e) { content = '[Error fetching git info]'; }
        break;
      }

      case 'terminal':
        // Terminal output can't be resolved in main process (it lives in renderer xterm)
        // The renderer will inject terminal context via the SDK conversation
        content = '[Terminal output is available in the active terminal on desktop]';
        break;

      case 'errors':
        content = '[Error output is available in the active terminal on desktop]';
        break;

      case 'todos': {
        if (!cwd) { content = '[No project path]'; break; }
        try {
          const { execFile } = require('child_process');
          const { promisify } = require('util');
          const exec = promisify(execFile);
          const { stdout } = await exec('git', ['grep', '-n', '-E', 'TODO|FIXME|HACK|XXX', '--', '*.js', '*.ts', '*.py', '*.lua', '*.jsx', '*.tsx'], {
            cwd, timeout: 5000, maxBuffer: 1024 * 1024,
          });
          const lines = stdout.split('\n').filter(Boolean).slice(0, 50);
          content = lines.length > 0
            ? `TODO Items (${lines.length}):\n\n${lines.join('\n')}`
            : '[No TODOs found]';
        } catch (e) {
          content = '[No TODOs found or error scanning]';
        }
        break;
      }

      default:
        content = `[Unknown mention: ${mention.type}]`;
    }

    blocks.push(`\n\n---\n@${mention.type}:\n${content}`);
  }

  return blocks.join('');
}

// ─── File Listing Helpers ─────────────────────────────────────────────────────

function _resolveProjectPath(projectId) {
  if (!projectId) return null;
  try {
    if (fs.existsSync(projectsFile)) {
      const data = JSON.parse(fs.readFileSync(projectsFile, 'utf8'));
      const proj = (data.projects || []).find(p => p.id === projectId);
      return proj?.path || null;
    }
  } catch (e) {}
  return null;
}

async function _getProjectFiles(cwd, maxFiles = 500) {
  const { execFile } = require('child_process');
  const { promisify } = require('util');
  const exec = promisify(execFile);
  const files = [];

  try {
    // Try git ls-files first (fast, respects .gitignore)
    const { stdout } = await exec('git', ['ls-files', '--cached', '--others', '--exclude-standard'], {
      cwd,
      timeout: 5000,
      maxBuffer: 2 * 1024 * 1024,
    });
    const lines = stdout.split('\n').filter(Boolean);
    for (const line of lines.slice(0, maxFiles)) {
      files.push({ path: line, fullPath: path.join(cwd, line) });
    }
  } catch (e) {
    // Fallback: simple recursive readdir (1 level)
    try {
      const entries = fs.readdirSync(cwd, { withFileTypes: true });
      for (const entry of entries.slice(0, maxFiles)) {
        if (entry.isFile() && !entry.name.startsWith('.')) {
          files.push({ path: entry.name, fullPath: path.join(cwd, entry.name) });
        }
      }
    } catch (e2) {}
  }
  return files;
}

// ─── Broadcast Helpers ────────────────────────────────────────────────────────

function _isMainWindowReady() {
  return mainWindow && !mainWindow.isDestroyed();
}

function _wsSend(ws, type, data) {
  if (ws.readyState === 1 /* OPEN */) {
    try { ws.send(JSON.stringify({ type, data })); } catch (e) {}
  }
}

function _broadcast(type, data) {
  const msg = JSON.stringify({ type, data });
  for (const ws of _connectedClients.values()) {
    if (ws.readyState === 1) {
      try { ws.send(msg); } catch (e) {}
    }
  }
}

function broadcastProjectsUpdate(projects) {
  const light = (projects || []).map(p => ({
    id: p.id, name: p.name, path: p.path, color: p.color, icon: p.icon,
    folderId: p.folderId || null,
  }));
  // Read folders + rootOrder from disk for hierarchy
  let folders = [];
  let rootOrder = [];
  try {
    if (fs.existsSync(projectsFile)) {
      const data = JSON.parse(fs.readFileSync(projectsFile, 'utf8'));
      folders = (data.folders || []).map(f => ({
        id: f.id, name: f.name, parentId: f.parentId || null,
        children: f.children || [], color: f.color, icon: f.icon,
      }));
      rootOrder = data.rootOrder || [];
    }
  } catch (e) {}
  _broadcast('projects:updated', { projects: light, folders, rootOrder });
}

function broadcastSessionStarted({ sessionId, projectId, tabName }) {
  console.log(`[Remote] → broadcast session:started sessionId=${sessionId} projectId=${projectId}`);
  if (projectId) _sessionProjectMap.set(sessionId, projectId);
  _broadcast('session:started', { sessionId, projectId, tabName: tabName || 'Chat' });
}

function broadcastTabRenamed({ sessionId, tabName }) {
  _broadcast('session:tab-renamed', { sessionId, tabName });
}

function setTimeData({ todayMs }) {
  _timeData.todayMs = todayMs || 0;
  _broadcast('time:update', { todayMs: _timeData.todayMs });
}

// ─── Auto-Start / Stop Logic ──────────────────────────────────────────────────

function _syncServerState() {
  const settings = _loadSettings();
  const shouldRun = !!settings.remoteEnabled;

  if (shouldRun && !httpServer) {
    const port = settings.remotePort || 3712;
    start(mainWindow, port);
  } else if (!shouldRun && httpServer) {
    stop();
  }
}

// ─── Lifecycle ────────────────────────────────────────────────────────────────

function start(win, port = 3712) {
  if (httpServer) return;
  mainWindow = win;

  httpServer = http.createServer(_handleHttpRequest);
  wss = new WebSocketServer({
    noServer: true,
    perMessageDeflate: {
      zlibDeflateOptions: { level: 1 },  // fast compression
      threshold: 128,                     // only compress messages > 128 bytes
    },
  });
  httpServer.on('upgrade', _handleWsUpgrade);

  httpServer.listen(port, '0.0.0.0', () => {
    const ips = _getLocalIps();
    console.log(`[Remote] Server started on port ${port}`);
    ips.forEach(ip => console.log(`[Remote]   → http://${ip}:${port}`));
  });

  httpServer.on('error', (e) => {
    console.error(`[Remote] Server error: ${e.message}`);
    httpServer = null;
  });

  // Bridge ChatService events → connected WS clients
  const chatService = require('./ChatService');
  chatService.setRemoteEventCallback((channel, data) => {
    const relayed = ['chat-message', 'chat-idle', 'chat-done', 'chat-error', 'chat-permission-request', 'chat-user-message', 'session:closed'];
    if (relayed.includes(channel)) {
      let enriched = data;
      // Enrich chat-idle with cached projectId (populated at session:started)
      if (channel === 'chat-idle' && data?.sessionId) {
        const cachedProjectId = _sessionProjectMap.get(data.sessionId);
        if (cachedProjectId) {
          enriched = { ...data, projectId: cachedProjectId };
        }
      }
      // Clean up session project cache on session:closed
      if (channel === 'session:closed' && data?.sessionId) {
        _sessionProjectMap.delete(data.sessionId);
      }
      console.log(`[Remote] → broadcast ${channel} sessionId=${data?.sessionId} clients=${_connectedClients.size}`);
      _broadcast(channel, enriched);
    }
  });
}

function stop() {
  try {
    const chatService = require('./ChatService');
    chatService.setRemoteEventCallback(null);
  } catch (e) {}

  for (const ws of _connectedClients.values()) {
    try { ws.close(); } catch (e) {}
  }
  _connectedClients.clear();
  _sessionTokens.clear();
  _sessionProjectMap.clear();
  _pin = null;

  if (wss) { wss.close(); wss = null; }
  if (httpServer) { httpServer.close(); httpServer = null; }

  console.log('[Remote] Server stopped');
}

function setMainWindow(win) {
  mainWindow = win;
  _syncServerState();
}

// ─── Public API ───────────────────────────────────────────────────────────────

function getServerInfo() {
  const settings = _loadSettings();
  const port = settings.remotePort || 3712;
  const ifaces = _getNetworkInterfaces();
  const ips = ifaces.map(i => i.address);
  const selectedIp = settings.remoteSelectedIp || ips[0] || 'localhost';
  return {
    running: !!httpServer,
    port,
    localIps: ips,
    networkInterfaces: ifaces,
    selectedIp,
    address: httpServer ? `http://${selectedIp}:${port}` : null,
    connectedCount: _connectedClients.size,
  };
}

module.exports = {
  start,
  stop,
  setMainWindow,
  getPin,
  generatePin,
  getServerInfo,
  broadcastProjectsUpdate,
  broadcastSessionStarted,
  broadcastTabRenamed,
  setTimeData,
  _syncServerState,
};
