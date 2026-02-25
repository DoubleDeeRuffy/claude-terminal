import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { config } from '../config';

export interface UserProject {
  name: string;
  createdAt: number;
  lastActivity: number | null;
}

export interface UserSession {
  id: string;
  projectName: string;
  status: 'idle' | 'running' | 'error';
  model: string;
  createdAt: number;
  lastActivity: number;
}

export interface UserData {
  id: string;
  name: string;
  apiKey: string;
  createdAt: number;
  projects: UserProject[];
  sessions: UserSession[];
}

export interface ServerData {
  roomSecret: string;
  createdAt: number;
}

async function writeAtomic(filePath: string, data: string): Promise<void> {
  const tmpPath = filePath + '.tmp.' + crypto.randomBytes(4).toString('hex');
  await fs.promises.writeFile(tmpPath, data, 'utf-8');
  await fs.promises.rename(tmpPath, filePath);
}

async function readJson<T>(filePath: string): Promise<T | null> {
  try {
    const raw = await fs.promises.readFile(filePath, 'utf-8');
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

class Store {
  private serverJsonPath(): string {
    return path.join(config.dataDir, 'server.json');
  }

  private userDir(name: string): string {
    return path.join(config.usersDir, name);
  }

  private userJsonPath(name: string): string {
    return path.join(this.userDir(name), 'user.json');
  }

  private userProjectsDir(name: string): string {
    return path.join(this.userDir(name), 'projects');
  }

  async ensureDataDirs(): Promise<void> {
    await fs.promises.mkdir(config.dataDir, { recursive: true });
    await fs.promises.mkdir(config.usersDir, { recursive: true });
  }

  // ── Server ──

  async getServerData(): Promise<ServerData> {
    const data = await readJson<ServerData>(this.serverJsonPath());
    if (data) return data;
    const newData: ServerData = {
      roomSecret: crypto.randomBytes(32).toString('hex'),
      createdAt: Date.now(),
    };
    await this.ensureDataDirs();
    await writeAtomic(this.serverJsonPath(), JSON.stringify(newData, null, 2));
    return newData;
  }

  // ── Users ──

  async listUsers(): Promise<string[]> {
    try {
      const entries = await fs.promises.readdir(config.usersDir, { withFileTypes: true });
      return entries.filter(e => e.isDirectory()).map(e => e.name);
    } catch {
      return [];
    }
  }

  async getUser(name: string): Promise<UserData | null> {
    return readJson<UserData>(this.userJsonPath(name));
  }

  async createUser(name: string, apiKey: string): Promise<UserData> {
    const userDir = this.userDir(name);
    await fs.promises.mkdir(userDir, { recursive: true });
    await fs.promises.mkdir(this.userProjectsDir(name), { recursive: true });

    const userData: UserData = {
      id: crypto.randomUUID(),
      name,
      apiKey,
      createdAt: Date.now(),
      projects: [],
      sessions: [],
    };
    await writeAtomic(this.userJsonPath(name), JSON.stringify(userData, null, 2));
    return userData;
  }

  async saveUser(name: string, data: UserData): Promise<void> {
    await writeAtomic(this.userJsonPath(name), JSON.stringify(data, null, 2));
  }

  async deleteUser(name: string): Promise<void> {
    const userDir = this.userDir(name);
    await fs.promises.rm(userDir, { recursive: true, force: true });
  }

  async userExists(name: string): Promise<boolean> {
    try {
      await fs.promises.access(this.userJsonPath(name));
      return true;
    } catch {
      return false;
    }
  }

  // ── Projects ──

  getProjectPath(userName: string, projectName: string): string {
    return path.join(this.userProjectsDir(userName), projectName);
  }

  async listProjectDirs(userName: string): Promise<string[]> {
    try {
      const entries = await fs.promises.readdir(this.userProjectsDir(userName), { withFileTypes: true });
      return entries.filter(e => e.isDirectory()).map(e => e.name);
    } catch {
      return [];
    }
  }

  async createProjectDir(userName: string, projectName: string): Promise<string> {
    const projectPath = this.getProjectPath(userName, projectName);
    await fs.promises.mkdir(projectPath, { recursive: true });
    return projectPath;
  }

  async deleteProjectDir(userName: string, projectName: string): Promise<void> {
    const projectPath = this.getProjectPath(userName, projectName);
    await fs.promises.rm(projectPath, { recursive: true, force: true });
  }
}

export const store = new Store();
