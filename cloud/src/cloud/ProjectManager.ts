import fs from 'fs';
import path from 'path';
import extractZip from 'extract-zip';
import { store, UserData } from '../store/store';
import { config } from '../config';

export class ProjectManager {

  async listProjects(userName: string): Promise<Array<{ name: string; createdAt: number | null; lastActivity: number | null }>> {
    const dirs = await store.listProjectDirs(userName);
    const user = await store.getUser(userName);
    return dirs.map(name => {
      const meta = user?.projects.find(p => p.name === name);
      return {
        name,
        createdAt: meta?.createdAt || null,
        lastActivity: meta?.lastActivity || null,
      };
    });
  }

  async createFromZip(userName: string, projectName: string, zipPath: string): Promise<string> {
    this.validateProjectName(projectName);
    await this.checkProjectLimit(userName);

    const projectPath = await store.createProjectDir(userName, projectName);

    try {
      await extractZip(zipPath, { dir: projectPath });
    } catch (err: any) {
      await store.deleteProjectDir(userName, projectName);
      throw new Error(`Failed to extract zip: ${err.message}`);
    } finally {
      // Clean up uploaded zip
      await fs.promises.unlink(zipPath).catch(() => {});
    }

    // Update user.json
    const user = await store.getUser(userName);
    if (user) {
      const existing = user.projects.findIndex(p => p.name === projectName);
      const entry = { name: projectName, createdAt: Date.now(), lastActivity: null };
      if (existing >= 0) {
        user.projects[existing] = entry;
      } else {
        user.projects.push(entry);
      }
      await store.saveUser(userName, user);
    }

    return projectPath;
  }

  async syncProject(userName: string, projectName: string, zipPath: string): Promise<void> {
    const projectPath = store.getProjectPath(userName, projectName);
    const exists = await this.projectExists(userName, projectName);
    if (!exists) throw new Error(`Project "${projectName}" does not exist`);

    // Clear existing files but keep .git if present
    const entries = await fs.promises.readdir(projectPath);
    for (const entry of entries) {
      if (entry === '.git') continue;
      await fs.promises.rm(path.join(projectPath, entry), { recursive: true, force: true });
    }

    try {
      await extractZip(zipPath, { dir: projectPath });
    } finally {
      await fs.promises.unlink(zipPath).catch(() => {});
    }

    // Update lastActivity
    await this.touchProject(userName, projectName);
  }

  async deleteProject(userName: string, projectName: string): Promise<void> {
    await store.deleteProjectDir(userName, projectName);
    const user = await store.getUser(userName);
    if (user) {
      user.projects = user.projects.filter(p => p.name !== projectName);
      await store.saveUser(userName, user);
    }
  }

  async projectExists(userName: string, projectName: string): Promise<boolean> {
    const projectPath = store.getProjectPath(userName, projectName);
    try {
      await fs.promises.access(projectPath);
      return true;
    } catch {
      return false;
    }
  }

  async touchProject(userName: string, projectName: string): Promise<void> {
    const user = await store.getUser(userName);
    if (!user) return;
    const project = user.projects.find(p => p.name === projectName);
    if (project) {
      project.lastActivity = Date.now();
      await store.saveUser(userName, user);
    }
  }

  private validateProjectName(name: string): void {
    if (!name || !/^[a-zA-Z0-9_.-]+$/.test(name)) {
      throw new Error('Project name must be alphanumeric (a-z, 0-9, _, ., -)');
    }
    if (name.startsWith('.') || name.includes('..')) {
      throw new Error('Project name cannot start with dot or contain ".."');
    }
  }

  private async checkProjectLimit(userName: string): Promise<void> {
    const dirs = await store.listProjectDirs(userName);
    if (dirs.length >= config.maxProjectsPerUser) {
      throw new Error(`Project limit reached (${config.maxProjectsPerUser})`);
    }
  }
}

export const projectManager = new ProjectManager();
