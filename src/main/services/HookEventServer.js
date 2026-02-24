/**
 * HookEventServer
 * Listens for hook events from the Claude Terminal hook handler script.
 * Runs a tiny HTTP server on localhost, forwards events to renderer via IPC.
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');

const PORT_DIR = path.join(os.homedir(), '.claude-terminal', 'hooks');
const PORT_FILE = path.join(PORT_DIR, 'port');
const TOKEN_FILE = path.join(PORT_DIR, 'token');

let server = null;
let mainWindow = null;
let authToken = null;

/**
 * Start the hook event server
 * @param {BrowserWindow} win - Main window to send IPC events to
 */
function start(win) {
  mainWindow = win;

  if (server) return;

  // Generate a random token for this session
  authToken = crypto.randomBytes(32).toString('hex');

  const MAX_BODY = 16 * 1024; // 16 KB — hook payloads are typically < 1 KB

  server = http.createServer((req, res) => {
    if (req.method === 'POST' && req.url === '/hook') {
      // Validate bearer token
      const authHeader = req.headers['authorization'] || '';
      if (authHeader !== `Bearer ${authToken}`) {
        res.writeHead(401);
        res.end('unauthorized');
        return;
      }

      let body = '';
      req.setTimeout(5000);
      req.on('data', chunk => {
        body += chunk;
        if (body.length > MAX_BODY) {
          res.writeHead(413);
          res.end('payload too large');
          req.destroy();
        }
      });
      req.on('end', () => {
        res.writeHead(200);
        res.end('ok');

        try {
          const event = JSON.parse(body);
          // Hook event received — forwarded to renderer via IPC
          if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('hook-event', event);
          }
          // Also forward to WorkflowService for hook-triggered workflows
          try {
            require('./WorkflowService').onHookEvent(event);
          } catch (_) { /* WorkflowService optional dependency */ }
        } catch (e) {
          console.warn('[HookEventServer] Malformed payload:', body.substring(0, 200));
        }
      });
    } else {
      res.writeHead(404);
      res.end();
    }
  });

  // Listen on random port, localhost only
  server.listen(0, '127.0.0.1', () => {
    const port = server.address().port;

    // Write port and token files so hook handler scripts can find us
    if (!fs.existsSync(PORT_DIR)) {
      fs.mkdirSync(PORT_DIR, { recursive: true });
    }
    fs.writeFileSync(PORT_FILE, String(port));
    fs.writeFileSync(TOKEN_FILE, authToken);

    console.log(`[HookEventServer] Listening on 127.0.0.1:${port}`);
  });

  server.on('error', (e) => {
    console.error('[HookEventServer] Server error:', e);
  });
}

/**
 * Stop the hook event server and clean up port file
 */
function stop() {
  if (server) {
    server.close();
    server = null;
  }

  // Remove port and token files
  try {
    if (fs.existsSync(PORT_FILE)) fs.unlinkSync(PORT_FILE);
    if (fs.existsSync(TOKEN_FILE)) fs.unlinkSync(TOKEN_FILE);
  } catch (e) {
    // Ignore cleanup errors
  }

  authToken = null;
  mainWindow = null;
}

/**
 * Update the main window reference (e.g. after window recreation)
 * @param {BrowserWindow} win
 */
function setMainWindow(win) {
  mainWindow = win;
}

module.exports = {
  start,
  stop,
  setMainWindow
};
