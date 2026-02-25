import { Router, Request, Response } from 'express';
import multer from 'multer';
import path from 'path';
import os from 'os';
import { authenticateApiKey } from '../auth/auth';
import { projectManager } from './ProjectManager';
import { sessionManager } from './SessionManager';
import { config } from '../config';

// Extend Request with user info
interface AuthRequest extends Request {
  userName?: string;
}

// Auth middleware
async function authMiddleware(req: AuthRequest, res: Response, next: Function): Promise<void> {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Missing Authorization header' });
    return;
  }

  const token = authHeader.slice(7);
  const userName = await authenticateApiKey(token);
  if (!userName) {
    res.status(403).json({ error: 'Invalid API key' });
    return;
  }

  req.userName = userName;
  next();
}

// Multer for zip uploads
const upload = multer({
  dest: path.join(os.tmpdir(), 'ct-cloud-uploads'),
  limits: { fileSize: 100 * 1024 * 1024 }, // 100MB
  fileFilter: (_req, file, cb) => {
    if (file.mimetype === 'application/zip' || file.originalname.endsWith('.zip')) {
      cb(null, true);
    } else {
      cb(new Error('Only .zip files are accepted'));
    }
  }
});

export function createCloudRouter(): Router {
  const router = Router();
  router.use(authMiddleware as any);

  // ── Projects ──

  router.get('/projects', async (req: AuthRequest, res: Response) => {
    try {
      const projects = await projectManager.listProjects(req.userName!);
      res.json({ projects });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  router.post('/projects', upload.single('zip'), async (req: AuthRequest, res: Response) => {
    try {
      const name = req.body?.name;
      if (!name) {
        res.status(400).json({ error: 'Missing project name' });
        return;
      }
      if (!req.file) {
        res.status(400).json({ error: 'Missing zip file' });
        return;
      }

      const projectPath = await projectManager.createFromZip(req.userName!, name, req.file.path);
      res.status(201).json({ name, path: projectPath });
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  router.post('/projects/:name/sync', upload.single('zip'), async (req: AuthRequest, res: Response) => {
    try {
      if (!req.file) {
        res.status(400).json({ error: 'Missing zip file' });
        return;
      }
      const name = req.params.name as string;
      await projectManager.syncProject(req.userName!, name, req.file.path);
      res.json({ ok: true });
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  router.delete('/projects/:name', async (req: AuthRequest, res: Response) => {
    try {
      const name = req.params.name as string;
      await projectManager.deleteProject(req.userName!, name);
      res.json({ ok: true });
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  // ── Sessions ──

  if (!config.cloudEnabled) {
    router.all('/sessions*', (_req, res) => {
      res.status(503).json({ error: 'Cloud sessions are disabled (CLOUD_ENABLED=false)' });
    });
    return router;
  }

  router.get('/sessions', async (req: AuthRequest, res: Response) => {
    try {
      const sessions = sessionManager.listUserSessions(req.userName!);
      res.json({ sessions });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  router.post('/sessions', async (req: AuthRequest, res: Response) => {
    try {
      const { projectName, prompt, model, effort } = req.body;
      if (!projectName || !prompt) {
        res.status(400).json({ error: 'Missing projectName or prompt' });
        return;
      }

      const sessionId = await sessionManager.createSession(req.userName!, projectName, prompt, model, effort);
      res.status(201).json({ sessionId });
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  router.post('/sessions/:id/send', async (req: AuthRequest, res: Response) => {
    try {
      const id = req.params.id as string;
      if (!sessionManager.isUserSession(id, req.userName!)) {
        res.status(404).json({ error: 'Session not found' });
        return;
      }
      const { message } = req.body;
      if (!message) {
        res.status(400).json({ error: 'Missing message' });
        return;
      }
      await sessionManager.sendMessage(id, message);
      res.json({ ok: true });
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  router.post('/sessions/:id/interrupt', async (req: AuthRequest, res: Response) => {
    try {
      const id = req.params.id as string;
      if (!sessionManager.isUserSession(id, req.userName!)) {
        res.status(404).json({ error: 'Session not found' });
        return;
      }
      await sessionManager.interruptSession(id);
      res.json({ ok: true });
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  router.delete('/sessions/:id', async (req: AuthRequest, res: Response) => {
    try {
      const id = req.params.id as string;
      if (!sessionManager.isUserSession(id, req.userName!)) {
        res.status(404).json({ error: 'Session not found' });
        return;
      }
      await sessionManager.closeSession(id);
      res.json({ ok: true });
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  return router;
}
