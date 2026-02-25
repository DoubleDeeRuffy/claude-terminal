import { v4 as uuid } from 'uuid';
import { WebSocket } from 'ws';
import { store, UserSession } from '../store/store';
import { config } from '../config';
import { projectManager } from './ProjectManager';

interface ActiveSession {
  id: string;
  userName: string;
  projectName: string;
  abortController: AbortController;
  messageQueue: ReturnType<typeof createMessageQueue>;
  streamClients: Set<WebSocket>;
  status: 'running' | 'idle' | 'error';
}

function createMessageQueue(onIdle?: () => void) {
  const queue: any[] = [];
  let waitResolve: ((val: any) => void) | null = null;
  let done = false;
  let pullCount = 0;

  const iterable = {
    [Symbol.asyncIterator]() {
      return {
        next() {
          pullCount++;
          if (pullCount > 1 && onIdle) onIdle();
          if (queue.length > 0) {
            return Promise.resolve({ value: queue.shift(), done: false });
          }
          if (done) {
            return Promise.resolve({ value: undefined, done: true });
          }
          return new Promise<any>(resolve => { waitResolve = resolve; });
        },
        return() {
          done = true;
          return Promise.resolve({ value: undefined, done: true });
        }
      };
    }
  };

  return {
    push(message: any) {
      if (waitResolve) {
        const resolve = waitResolve;
        waitResolve = null;
        resolve({ value: message, done: false });
      } else {
        queue.push(message);
      }
    },
    close() {
      done = true;
      if (waitResolve) {
        const resolve = waitResolve;
        waitResolve = null;
        resolve({ value: undefined, done: true });
      }
    },
    iterable
  };
}

export class SessionManager {
  private sessions: Map<string, ActiveSession> = new Map();
  private sdk: any = null;

  private async loadSDK() {
    if (!this.sdk) {
      this.sdk = await import('@anthropic-ai/claude-agent-sdk');
    }
    return this.sdk;
  }

  private getSdkCliPath(): string {
    return require.resolve('@anthropic-ai/claude-agent-sdk/cli.js');
  }

  async createSession(userName: string, projectName: string, prompt: string, model?: string, effort?: string): Promise<string> {
    // Check project exists
    const exists = await projectManager.projectExists(userName, projectName);
    if (!exists) throw new Error(`Project "${projectName}" does not exist`);

    // Check session limit
    const running = Array.from(this.sessions.values()).filter(s => s.status === 'running');
    if (running.length >= config.maxSessions) {
      throw new Error(`Max concurrent sessions reached (${config.maxSessions})`);
    }

    const sdk = await this.loadSDK();
    const sessionId = uuid();
    const cwd = store.getProjectPath(userName, projectName);

    const messageQueue = createMessageQueue(() => {
      this.broadcastToStream(sessionId, { type: 'idle', sessionId });
    });

    // Push initial prompt
    messageQueue.push({
      type: 'user',
      message: { role: 'user', content: prompt },
      parent_tool_use_id: null,
      session_id: sessionId,
    });

    const abortController = new AbortController();

    const activeSession: ActiveSession = {
      id: sessionId,
      userName,
      projectName,
      abortController,
      messageQueue,
      streamClients: new Set(),
      status: 'running',
    };
    this.sessions.set(sessionId, activeSession);

    // Update user.json
    await this.persistSessionMeta(userName, sessionId, projectName, 'running', model);

    // Start SDK query in background
    const options: any = {
      cwd,
      abortController,
      maxTurns: 100,
      includePartialMessages: true,
      permissionMode: 'bypassPermissions',
      pathToClaudeCodeExecutable: this.getSdkCliPath(),
      systemPrompt: { type: 'preset', preset: 'claude_code' },
      stderr: (data: string) => { console.error(`[Session ${sessionId}] ${data}`); },
    };

    if (model) options.model = model;
    if (effort) options.effort = effort;

    const queryStream = sdk.query({
      prompt: messageQueue.iterable,
      options,
    });

    this.processStream(sessionId, queryStream);

    // Touch project activity
    await projectManager.touchProject(userName, projectName);

    return sessionId;
  }

  async sendMessage(sessionId: string, message: string): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session) throw new Error(`Session ${sessionId} not found`);

    session.messageQueue.push({
      type: 'user',
      message: { role: 'user', content: message },
      parent_tool_use_id: null,
      session_id: sessionId,
    });
  }

  async interruptSession(sessionId: string): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session) throw new Error(`Session ${sessionId} not found`);
    session.abortController.abort();
  }

  async closeSession(sessionId: string): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session) return;

    session.abortController.abort();
    session.messageQueue.close();

    // Close all WS stream clients
    for (const ws of session.streamClients) {
      ws.close(1000, 'Session closed');
    }

    this.sessions.delete(sessionId);

    // Update user.json
    const user = await store.getUser(session.userName);
    if (user) {
      user.sessions = user.sessions.filter(s => s.id !== sessionId);
      await store.saveUser(session.userName, user);
    }
  }

  addStreamClient(sessionId: string, ws: WebSocket): boolean {
    const session = this.sessions.get(sessionId);
    if (!session) return false;
    session.streamClients.add(ws);
    ws.on('close', () => session.streamClients.delete(ws));
    return true;
  }

  listUserSessions(userName: string): Array<{ id: string; projectName: string; status: string }> {
    const result: Array<{ id: string; projectName: string; status: string }> = [];
    for (const [, session] of this.sessions) {
      if (session.userName === userName) {
        result.push({ id: session.id, projectName: session.projectName, status: session.status });
      }
    }
    return result;
  }

  isUserSession(sessionId: string, userName: string): boolean {
    const session = this.sessions.get(sessionId);
    return session?.userName === userName;
  }

  private async processStream(sessionId: string, queryStream: AsyncIterable<any>): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session) return;

    try {
      for await (const event of queryStream) {
        if (!this.sessions.has(sessionId)) break;
        this.broadcastToStream(sessionId, { type: 'event', sessionId, event });
      }
      if (session) session.status = 'idle';
      this.broadcastToStream(sessionId, { type: 'done', sessionId });
    } catch (err: any) {
      if (session) session.status = 'error';
      this.broadcastToStream(sessionId, { type: 'error', sessionId, error: err.message });
    }

    // Update meta
    if (session) {
      await this.persistSessionMeta(session.userName, sessionId, session.projectName, session.status);
    }
  }

  private broadcastToStream(sessionId: string, data: any): void {
    const session = this.sessions.get(sessionId);
    if (!session) return;
    const msg = JSON.stringify(data);
    for (const ws of session.streamClients) {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(msg);
      }
    }
  }

  private async persistSessionMeta(userName: string, sessionId: string, projectName: string, status: string, model?: string): Promise<void> {
    const user = await store.getUser(userName);
    if (!user) return;

    const existing = user.sessions.findIndex(s => s.id === sessionId);
    const entry: UserSession = {
      id: sessionId,
      projectName,
      status: status as 'idle' | 'running' | 'error',
      model: model || 'claude-sonnet-4-6',
      createdAt: existing >= 0 ? user.sessions[existing].createdAt : Date.now(),
      lastActivity: Date.now(),
    };

    if (existing >= 0) {
      user.sessions[existing] = entry;
    } else {
      user.sessions.push(entry);
    }
    await store.saveUser(userName, user);
  }
}

export const sessionManager = new SessionManager();
