/**
 * Zip Project Utility
 * Creates a zip archive of a project directory, respecting .gitignore rules.
 */

const path = require('path');
const fs = require('fs');
const { execSync } = require('child_process');

// Directories always excluded from zip
const EXCLUDE_DIRS = new Set([
  'node_modules', '.git', 'build', 'dist', '.next', '__pycache__',
  '.venv', 'venv', '.cache', 'coverage', '.tsbuildinfo', '.ct-cloud',
  '.turbo', '.parcel-cache', '.svelte-kit', '.nuxt', '.output',
]);

/**
 * Get list of project files to include in zip.
 * Uses git ls-files if available, falls back to recursive walk.
 * @param {string} projectPath
 * @param {object} [options]
 * @param {boolean} [options.includeGit] - Include .git directory (for cloud sync)
 */
function getProjectFiles(projectPath, options = {}) {
  let files = [];

  try {
    // Try git ls-files (respects .gitignore automatically)
    const output = execSync(
      'git ls-files --cached --others --exclude-standard',
      { cwd: projectPath, encoding: 'utf-8', timeout: 15000, maxBuffer: 10 * 1024 * 1024 }
    );
    files = output.trim().split('\n').filter(Boolean);
    if (files.length === 0) files = walkDir(projectPath, projectPath);
  } catch {
    // Not a git repo or git not available — fall back to walk
    files = walkDir(projectPath, projectPath);
  }

  // Include .git directory contents for cloud sync (enables push/pull)
  if (options.includeGit) {
    const gitDir = path.join(projectPath, '.git');
    if (fs.existsSync(gitDir) && fs.statSync(gitDir).isDirectory()) {
      const gitFiles = walkGitDir(gitDir, projectPath);
      files.push(...gitFiles);
    }
  }

  return files;
}

/**
 * Recursive directory walk with exclusions.
 */
function walkDir(dir, rootDir) {
  const files = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });

  for (const entry of entries) {
    if (entry.name.startsWith('.') && EXCLUDE_DIRS.has(entry.name)) continue;
    if (EXCLUDE_DIRS.has(entry.name)) continue;

    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...walkDir(fullPath, rootDir));
    } else if (entry.isFile()) {
      files.push(path.relative(rootDir, fullPath));
    }
  }

  return files;
}

/**
 * Walk .git directory (no exclusions, only skip huge pack files > 50MB).
 */
function walkGitDir(dir, rootDir) {
  const files = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...walkGitDir(fullPath, rootDir));
    } else if (entry.isFile()) {
      // Skip pack files larger than 50MB to keep upload reasonable
      try {
        const stat = fs.statSync(fullPath);
        if (stat.size > 50 * 1024 * 1024) continue;
      } catch { continue; }
      files.push(path.relative(rootDir, fullPath));
    }
  }

  return files;
}

/**
 * Create a zip archive of a project.
 * @param {string} projectPath - Absolute path to the project
 * @param {string} zipPath - Absolute path for the output zip
 * @param {function} [onProgress] - Progress callback ({ phase, percent })
 * @param {object} [options]
 * @param {boolean} [options.includeGit] - Include .git directory (for cloud sync)
 * @returns {Promise<string>} Path to the created zip
 */
async function zipProject(projectPath, zipPath, onProgress, options = {}) {
  const archiver = require('archiver');

  if (onProgress) onProgress({ phase: 'scanning', percent: 0 });

  const files = getProjectFiles(projectPath, options);
  if (files.length === 0) throw new Error('No files found in project');

  if (onProgress) onProgress({ phase: 'compressing', percent: 10 });

  return new Promise((resolve, reject) => {
    const output = fs.createWriteStream(zipPath);
    const archive = archiver('zip', { zlib: { level: 6 } });

    let processed = 0;
    archive.on('entry', () => {
      processed++;
      if (onProgress) {
        const percent = 10 + Math.round((processed / files.length) * 80);
        onProgress({ phase: 'compressing', percent });
      }
    });

    output.on('close', () => resolve(zipPath));
    archive.on('error', reject);
    archive.pipe(output);

    for (const file of files) {
      const absPath = path.join(projectPath, file);
      // Use forward slashes in zip for cross-platform compat
      archive.file(absPath, { name: file.replace(/\\/g, '/') });
    }

    archive.finalize();
  });
}

module.exports = { zipProject, getProjectFiles };
