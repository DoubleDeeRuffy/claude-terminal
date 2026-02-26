import http from 'http';
import path from 'path';
import express from 'express';
import { config } from './config';
import { store } from './store/store';
import { RelayServer } from './relay/RelayServer';
import { createCloudRouter } from './cloud/CloudAPI';
import { sessionManager } from './cloud/SessionManager';
import { authenticateApiKey } from './auth/auth';
import { WebSocket, WebSocketServer } from 'ws';

let relayServer: RelayServer;

// ── In-memory log buffer for admin TUI ──
const MAX_LOG_ENTRIES = 500;
const logBuffer: Array<{ timestamp: number; level: string; message: string }> = [];

function captureLog(level: string, ...args: any[]): void {
  const message = args.map(a => typeof a === 'string' ? a : JSON.stringify(a)).join(' ');
  logBuffer.push({ timestamp: Date.now(), level, message });
  if (logBuffer.length > MAX_LOG_ENTRIES) logBuffer.shift();
}

// Intercept console.log/warn/error to capture logs
const _origLog = console.log.bind(console);
const _origWarn = console.warn.bind(console);
const _origErr = console.error.bind(console);

console.log = (...args: any[]) => { captureLog('INFO', ...args); _origLog(...args); };
console.warn = (...args: any[]) => { captureLog('WARN', ...args); _origWarn(...args); };
console.error = (...args: any[]) => { captureLog('ERROR', ...args); _origErr(...args); };

export async function startServer(): Promise<void> {
  await store.ensureDataDirs();
  await store.getServerData(); // Init server.json if needed

  const app = express();
  app.use(express.json());

  // Health check
  app.get('/health', (_req, res) => {
    const stats = relayServer.getStats();
    res.json({
      status: 'ok',
      version: require('../package.json').version,
      relay: stats,
      cloud: config.cloudEnabled,
    });
  });

  // ── Admin endpoints (local-only) ──

  app.get('/admin/rooms', (_req, res) => {
    res.json(relayServer.listRooms());
  });

  app.get('/admin/logs', (_req, res) => {
    res.json(logBuffer);
  });

  // Cloud API routes
  app.use('/api', createCloudRouter());

  // Remote UI (PWA static files)
  const remoteUiDir = path.join(__dirname, '..', 'remote-ui');
  app.use(express.static(remoteUiDir));
  // SPA fallback: serve index.html for unknown routes
  app.use((_req, res) => {
    res.sendFile(path.join(remoteUiDir, 'index.html'));
  });

  const server = http.createServer(app);

  // Relay WS server (handles /relay upgrade)
  relayServer = new RelayServer(server);

  // Session stream WS (handles /api/sessions/:id/stream upgrade)
  const sessionWss = new WebSocketServer({ noServer: true });

  server.on('upgrade', (req, socket, head) => {
    const url = new URL(req.url || '/', `http://${req.headers.host}`);

    // /relay is handled by RelayServer
    if (url.pathname === '/relay') return;

    // /api/sessions/:id/stream
    const streamMatch = url.pathname.match(/^\/api\/sessions\/([^/]+)\/stream$/);
    if (streamMatch) {
      const sessionId = streamMatch[1];
      const token = url.searchParams.get('token');

      if (!token) {
        socket.destroy();
        return;
      }

      authenticateApiKey(token).then(userName => {
        if (!userName || !sessionManager.isUserSession(sessionId, userName)) {
          socket.destroy();
          return;
        }

        sessionWss.handleUpgrade(req, socket, head, ws => {
          const ok = sessionManager.addStreamClient(sessionId, ws);
          if (!ok) {
            ws.close(4004, 'Session not found');
          }
        });
      }).catch(() => socket.destroy());
      return;
    }

    // Unknown upgrade path
    socket.destroy();
  });

  server.listen(config.port, config.host, () => {
    console.log('');
    console.log(`  Claude Terminal Cloud v${require('../package.json').version}`);
    console.log(`  Relay:  ws://${config.host}:${config.port}/relay`);
    if (config.cloudEnabled) {
      console.log(`  API:    http://${config.host}:${config.port}/api`);
    }
    console.log(`  Health: http://${config.host}:${config.port}/health`);
    console.log('');
  });
}

// If run directly (not imported by CLI)
if (require.main === module) {
  startServer().catch(err => {
    console.error('Failed to start server:', err.message);
    process.exit(1);
  });
}
