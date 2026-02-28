import fs from 'fs';
import path from 'path';

/**
 * Watches a project directory for file changes during a cloud session.
 * Uses native fs.watch (recursive) to capture ALL filesystem changes,
 * not just those from Claude SDK tool_use blocks.
 */
export class FileWatcher {
  private watcher: fs.FSWatcher | null = null;
  private changedFiles: Set<string> = new Set();
  private projectPath: string;
  private ignorePatterns: string[];
  private debounceTimers: Map<string, NodeJS.Timeout> = new Map();

  constructor(projectPath: string) {
    this.projectPath = projectPath;
    this.ignorePatterns = [
      'node_modules',
      '.git',
      '.ct-cloud',
      '__pycache__',
      '.next',
      'dist',
      '.cache',
    ];
  }

  start(): void {
    if (this.watcher) return;

    try {
      this.watcher = fs.watch(this.projectPath, { recursive: true }, (eventType, filename) => {
        if (!filename) return;

        // Normalize path separators
        const normalized = filename.replace(/\\/g, '/');

        // Ignore patterns
        if (this.shouldIgnore(normalized)) return;

        // Debounce: same file changed multiple times in quick succession
        const existing = this.debounceTimers.get(normalized);
        if (existing) clearTimeout(existing);

        this.debounceTimers.set(normalized, setTimeout(() => {
          this.debounceTimers.delete(normalized);
          // Verify file actually exists or was deleted (not just a temp event)
          const absPath = path.join(this.projectPath, normalized);
          try {
            fs.accessSync(absPath);
            this.changedFiles.add(normalized);
          } catch {
            // File doesn't exist — it was deleted, still track it
            this.changedFiles.add(normalized);
          }
        }, 100));
      });

      this.watcher.on('error', (err) => {
        console.warn(`[FileWatcher] Error watching ${this.projectPath}: ${err.message}`);
      });
    } catch (err: any) {
      console.warn(`[FileWatcher] Failed to start watcher: ${err.message}`);
    }
  }

  stop(): void {
    if (this.watcher) {
      this.watcher.close();
      this.watcher = null;
    }
    // Flush pending debounce timers
    for (const timer of this.debounceTimers.values()) {
      clearTimeout(timer);
    }
    this.debounceTimers.clear();
  }

  getChangedFiles(): Set<string> {
    return this.changedFiles;
  }

  private shouldIgnore(filePath: string): boolean {
    const parts = filePath.split('/');
    for (const part of parts) {
      if (this.ignorePatterns.includes(part)) return true;
      // Ignore hidden dirs (except .env, .eslintrc, etc.)
      if (part.startsWith('.') && part.length > 1 && !part.startsWith('.env') && !part.startsWith('.eslint') && !part.startsWith('.prettier')) {
        // Allow common config dotfiles but ignore .git, .cache, etc.
        const allowedDotfiles = ['.env', '.eslintrc', '.prettierrc', '.editorconfig', '.npmrc', '.nvmrc', '.babelrc'];
        if (!allowedDotfiles.some(d => part.startsWith(d))) {
          return true;
        }
      }
    }
    return false;
  }
}
