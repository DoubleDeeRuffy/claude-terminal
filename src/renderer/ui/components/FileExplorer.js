/**
 * FileExplorer Component
 * Displays a file tree for the selected project with preview and context menu
 */

const api = window.electron_api;
const { path, fs } = window.electron_nodeModules;
const { escapeHtml } = require('../../utils/dom');
const { formatFileSize } = require('../../utils/format');
const { getFileIcon, CHEVRON_ICON } = require('../../utils/fileIcons');
const { highlight } = require('../../utils/syntaxHighlight');
const { showContextMenu } = require('./ContextMenu');
const { t } = require('../../i18n');

// ========== STATE ==========
let rootPath = null;
let selectedFile = null;
let expandedFolders = new Map(); // path -> { children: [...], loaded: bool }
let callbacks = {
  onOpenInTerminal: null
};
let isVisible = false;
let manuallyHidden = false;
let previewTimeout = null;

// Patterns to ignore
const IGNORE_PATTERNS = new Set([
  'node_modules', '.git', 'dist', 'build', '__pycache__',
  '.next', 'vendor', '.cache', '.idea', '.vscode',
  '.DS_Store', 'Thumbs.db', '.env.local', 'coverage',
  '.nuxt', '.output', '.turbo', '.parcel-cache'
]);

// Binary file extensions
const BINARY_EXTENSIONS = new Set([
  'exe', 'dll', 'so', 'dylib', 'bin', 'obj', 'o', 'a', 'lib',
  'zip', 'tar', 'gz', 'bz2', 'xz', '7z', 'rar',
  'png', 'jpg', 'jpeg', 'gif', 'bmp', 'ico', 'webp', 'tiff', 'tif',
  'mp3', 'wav', 'ogg', 'flac', 'aac', 'wma', 'mp4', 'avi', 'mkv', 'mov', 'wmv',
  'pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx',
  'ttf', 'otf', 'woff', 'woff2', 'eot',
  'sqlite', 'db', 'mdb',
  'class', 'pyc', 'pyo', 'wasm', 'pak', 'dat'
]);

// Image extensions (for inline preview)
const IMAGE_EXTENSIONS = new Set(['png', 'jpg', 'jpeg', 'gif', 'svg', 'webp', 'ico', 'bmp']);

// Max file size for preview (500KB)
const MAX_PREVIEW_SIZE = 500 * 1024;

// Max entries displayed per folder
const MAX_DISPLAY_ENTRIES = 500;

// ========== CALLBACKS ==========
function setCallbacks(cbs) {
  Object.assign(callbacks, cbs);
}

// ========== PATH VALIDATION ==========
function isPathSafe(targetPath) {
  const resolved = path.resolve(targetPath);
  const root = path.resolve(rootPath);
  return resolved.startsWith(root + path.sep) || resolved === root;
}

function sanitizeFileName(name) {
  return name.replace(/[<>:"/\\|?*\x00-\x1f]/g, '_');
}

// ========== BINARY DETECTION BY CONTENT ==========
function isBinaryBuffer(buffer) {
  const checkLength = Math.min(buffer.length, 8192);
  for (let i = 0; i < checkLength; i++) {
    if (buffer[i] === 0) return true;
  }
  return false;
}

// ========== ROOT PATH ==========
function setRootPath(projectPath) {
  if (rootPath === projectPath) return;
  rootPath = projectPath;
  selectedFile = null;
  expandedFolders.clear();
  if (rootPath && !manuallyHidden) {
    show();
    render();
  }
}

// ========== VISIBILITY ==========
function show() {
  const panel = document.getElementById('file-explorer-panel');
  if (panel) {
    panel.style.display = 'flex';
    isVisible = true;
  }
}

function hide() {
  const panel = document.getElementById('file-explorer-panel');
  if (panel) {
    panel.style.display = 'none';
    isVisible = false;
  }
}

// ========== FILE SYSTEM ==========
function readDirectory(dirPath) {
  try {
    if (!fs.existsSync(dirPath)) return [];

    // Note: don't use { withFileTypes: true } because contextBridge
    // strips methods from Dirent objects. Use statSync instead.
    const names = fs.readdirSync(dirPath);
    const result = [];
    let skipped = 0;

    for (const name of names) {
      if (IGNORE_PATTERNS.has(name)) continue;
      if (name.startsWith('.') && name !== '.env' && name !== '.gitignore') continue;

      if (result.length >= MAX_DISPLAY_ENTRIES) {
        skipped++;
        continue;
      }

      try {
        const fullPath = path.join(dirPath, name);
        const stat = fs.statSync(fullPath);
        result.push({
          name,
          path: fullPath,
          isDirectory: stat.isDirectory()
        });
      } catch (e) {
        // Skip entries we can't stat
      }
    }

    // Sort: directories first, then alphabetical
    result.sort((a, b) => {
      if (a.isDirectory && !b.isDirectory) return -1;
      if (!a.isDirectory && b.isDirectory) return 1;
      return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
    });

    if (skipped > 0) {
      result.push({
        name: `... +${skipped} more items`,
        path: null,
        isDirectory: false,
        isTruncated: true
      });
    }

    return result;
  } catch (e) {
    return [];
  }
}

function getOrLoadFolder(folderPath) {
  let entry = expandedFolders.get(folderPath);
  if (!entry || !entry.loaded) {
    const children = readDirectory(folderPath);
    entry = { children, loaded: true };
    expandedFolders.set(folderPath, entry);
  }
  return entry;
}

function refreshFolder(folderPath) {
  const entry = expandedFolders.get(folderPath);
  if (entry) {
    entry.children = readDirectory(folderPath);
    entry.loaded = true;
  }
}

// ========== RENDER ==========
function render() {
  if (!rootPath) return;

  const treeEl = document.getElementById('file-explorer-tree');
  if (!treeEl) return;

  treeEl.innerHTML = renderTreeNodes(rootPath, 0);
  attachListeners();
}

function renderTreeNodes(dirPath, depth) {
  const entry = getOrLoadFolder(dirPath);
  if (!entry.children.length) {
    if (depth === 0) {
      return `<div class="fe-empty">${t('fileExplorer.emptyFolder') || 'Empty folder'}</div>`;
    }
    return '';
  }

  const parts = [];
  for (const item of entry.children) {
    if (item.isTruncated) {
      parts.push(`<div class="fe-node fe-truncated" style="padding-left: ${8 + depth * 16}px;">
        <span class="fe-node-chevron-spacer"></span>
        <span class="fe-node-name fe-truncated-label">${escapeHtml(item.name)}</span>
      </div>`);
      continue;
    }

    const isExpanded = expandedFolders.has(item.path) && expandedFolders.get(item.path).loaded;
    const isSelected = selectedFile === item.path;

    const indent = depth * 16;
    const icon = getFileIcon(item.name, item.isDirectory, isExpanded);
    const chevron = item.isDirectory
      ? `<span class="fe-node-chevron ${isExpanded ? 'expanded' : ''}">${CHEVRON_ICON}</span>`
      : `<span class="fe-node-chevron-spacer"></span>`;

    parts.push(`<div class="fe-node ${isSelected ? 'selected' : ''} ${item.isDirectory ? 'fe-dir' : 'fe-file'}"
      data-path="${escapeHtml(item.path)}"
      data-name="${escapeHtml(item.name)}"
      data-is-dir="${item.isDirectory}"
      style="padding-left: ${8 + indent}px;">
      ${chevron}
      <span class="fe-node-icon">${icon}</span>
      <span class="fe-node-name" title="${escapeHtml(item.path)}">${escapeHtml(item.name)}</span>
    </div>`);

    if (item.isDirectory && isExpanded) {
      parts.push(renderTreeNodes(item.path, depth + 1));
    }
  }

  return parts.join('');
}

// ========== PREVIEW ==========
function showPreview(filePath) {
  const previewPanel = document.getElementById('file-explorer-preview');
  const previewHeader = document.getElementById('preview-header');
  const previewContent = document.getElementById('preview-content');
  if (!previewPanel || !previewHeader || !previewContent) return;

  const fileName = path.basename(filePath);
  const dotIdx = fileName.lastIndexOf('.');
  const ext = dotIdx !== -1 ? fileName.substring(dotIdx + 1).toLowerCase() : '';

  // Extension-based binary check (fast path for known binary types)
  if (BINARY_EXTENSIONS.has(ext)) {
    if (IMAGE_EXTENSIONS.has(ext)) {
      const fileUrl = 'file:///' + filePath.replace(/\\/g, '/').split('/').map(encodeURIComponent).join('/');
      previewPanel.style.display = 'flex';
      previewHeader.textContent = fileName;
      previewContent.innerHTML = `<img src="${fileUrl}" class="fe-preview-image" alt="${escapeHtml(fileName)}">`;
      return;
    }
    previewPanel.style.display = 'flex';
    previewHeader.textContent = fileName;
    previewContent.innerHTML = `<div class="fe-preview-message">${t('fileExplorer.binaryFile') || 'Binary file - cannot preview'}</div>`;
    return;
  }

  try {
    const stats = fs.statSync(filePath);
    if (stats.size > MAX_PREVIEW_SIZE) {
      previewPanel.style.display = 'flex';
      previewHeader.textContent = `${fileName} (${formatFileSize(stats.size)})`;
      previewContent.innerHTML = `<div class="fe-preview-message">${t('fileExplorer.fileTooLarge') || 'File too large to preview'}</div>`;
      return;
    }

    // Read as buffer first to detect binary content
    const buffer = fs.readFileSync(filePath);
    if (isBinaryBuffer(buffer)) {
      previewPanel.style.display = 'flex';
      previewHeader.textContent = fileName;
      previewContent.innerHTML = `<div class="fe-preview-message">${t('fileExplorer.binaryFile') || 'Binary file - cannot preview'}</div>`;
      return;
    }

    const content = buffer.toString('utf-8');
    const highlighted = highlight(content, ext);

    previewPanel.style.display = 'flex';
    previewHeader.textContent = `${fileName} (${formatFileSize(stats.size)})`;
    previewContent.innerHTML = `<code>${highlighted}</code>`;
  } catch (e) {
    previewPanel.style.display = 'flex';
    previewHeader.textContent = fileName;
    previewContent.innerHTML = `<div class="fe-preview-message">${t('fileExplorer.cannotRead') || 'Cannot read file'}</div>`;
  }
}

function hidePreview() {
  const previewPanel = document.getElementById('file-explorer-preview');
  if (previewPanel) previewPanel.style.display = 'none';
}

// ========== CONTEXT MENU ==========
function showFileContextMenu(e, filePath, isDirectory) {
  e.preventDefault();
  const fileName = path.basename(filePath);
  const relativePath = rootPath ? path.relative(rootPath, filePath) : filePath;

  const items = [];

  if (isDirectory) {
    items.push({
      label: t('fileExplorer.newFile') || 'New file',
      icon: '<svg viewBox="0 0 24 24" fill="currentColor" width="14" height="14"><path d="M14 2H6c-1.1 0-2 .9-2 2v16c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V8l-6-6zm2 14h-3v3h-2v-3H8v-2h3v-3h2v3h3v2zm-3-7V3.5L18.5 9H13z"/></svg>',
      action: () => promptNewFile(filePath)
    });
    items.push({
      label: t('fileExplorer.newFolder') || 'New folder',
      icon: '<svg viewBox="0 0 24 24" fill="currentColor" width="14" height="14"><path d="M20 6h-8l-2-2H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2zm-1 8h-3v3h-2v-3h-3v-2h3V9h2v3h3v2z"/></svg>',
      action: () => promptNewFolder(filePath)
    });
    items.push({ separator: true });
    if (callbacks.onOpenInTerminal) {
      items.push({
        label: t('fileExplorer.openInTerminal') || 'Open in terminal',
        icon: '<svg viewBox="0 0 24 24" fill="currentColor" width="14" height="14"><path d="M20 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.89 2-2V6c0-1.1-.9-2-2-2zm0 14H4V8h16v10z"/></svg>',
        action: () => callbacks.onOpenInTerminal(filePath)
      });
    }
    items.push({
      label: t('fileExplorer.refreshFolder') || 'Refresh',
      icon: '<svg viewBox="0 0 24 24" fill="currentColor" width="14" height="14"><path d="M17.65 6.35C16.2 4.9 14.21 4 12 4c-4.42 0-7.99 3.58-7.99 8s3.57 8 7.99 8c3.73 0 6.84-2.55 7.73-6h-2.08c-.82 2.33-3.04 4-5.65 4-3.31 0-6-2.69-6-6s2.69-6 6-6c1.66 0 3.14.69 4.22 1.78L13 11h7V4l-2.35 2.35z"/></svg>',
      action: () => { refreshFolder(filePath); render(); }
    });
  } else {
    items.push({
      label: t('fileExplorer.openInEditor') || 'Open in editor',
      icon: '<svg viewBox="0 0 24 24" fill="currentColor" width="14" height="14"><path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34c-.39-.39-1.02-.39-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/></svg>',
      action: () => api.dialog.openInEditor({ editor: 'code', path: filePath })
    });
  }

  items.push({ separator: true });

  items.push({
    label: t('fileExplorer.copyPath') || 'Copy absolute path',
    icon: '<svg viewBox="0 0 24 24" fill="currentColor" width="14" height="14"><path d="M16 1H4c-1.1 0-2 .9-2 2v14h2V3h12V1zm3 4H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm0 16H8V7h11v14z"/></svg>',
    action: () => navigator.clipboard.writeText(filePath).catch(() => {})
  });
  items.push({
    label: t('fileExplorer.copyRelativePath') || 'Copy relative path',
    icon: '<svg viewBox="0 0 24 24" fill="currentColor" width="14" height="14"><path d="M16 1H4c-1.1 0-2 .9-2 2v14h2V3h12V1zm3 4H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm0 16H8V7h11v14z"/></svg>',
    action: () => navigator.clipboard.writeText(relativePath).catch(() => {})
  });

  items.push({ separator: true });

  items.push({
    label: t('projects.openInExplorer') || 'Reveal in Explorer',
    icon: '<svg viewBox="0 0 24 24" fill="currentColor" width="14" height="14"><path d="M20 6h-8l-2-2H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2z"/></svg>',
    action: () => api.dialog.openInExplorer(isDirectory ? filePath : path.dirname(filePath))
  });

  items.push({ separator: true });

  items.push({
    label: t('fileExplorer.rename') || 'Rename',
    icon: '<svg viewBox="0 0 24 24" fill="currentColor" width="14" height="14"><path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34c-.39-.39-1.02-.39-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/></svg>',
    action: () => promptRename(filePath, fileName)
  });

  items.push({
    label: t('common.delete') || 'Delete',
    icon: '<svg viewBox="0 0 24 24" fill="currentColor" width="14" height="14"><path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/></svg>',
    danger: true,
    action: () => promptDelete(filePath, fileName, isDirectory)
  });

  showContextMenu({ x: e.clientX, y: e.clientY, items });
}

// ========== FILE OPERATIONS ==========
function promptNewFile(dirPath) {
  const name = prompt(t('fileExplorer.newFilePrompt') || 'File name:');
  if (!name || !name.trim()) return;

  const sanitized = sanitizeFileName(name.trim());
  const fullPath = path.join(dirPath, sanitized);

  if (!isPathSafe(fullPath)) {
    alert('Cannot create files outside the project folder.');
    return;
  }

  try {
    fs.writeFileSync(fullPath, '', 'utf-8');
    refreshFolder(dirPath);
    render();
    selectedFile = fullPath;
    showPreview(fullPath);
  } catch (e) {
    alert(`Error: ${e.message}`);
  }
}

function promptNewFolder(dirPath) {
  const name = prompt(t('fileExplorer.newFolderPrompt') || 'Folder name:');
  if (!name || !name.trim()) return;

  const sanitized = sanitizeFileName(name.trim());
  const fullPath = path.join(dirPath, sanitized);

  if (!isPathSafe(fullPath)) {
    alert('Cannot create folders outside the project folder.');
    return;
  }

  try {
    fs.mkdirSync(fullPath, { recursive: true });
    refreshFolder(dirPath);
    render();
  } catch (e) {
    alert(`Error: ${e.message}`);
  }
}

function promptRename(filePath, currentName) {
  const newName = prompt(t('fileExplorer.renamePrompt') || 'New name:', currentName);
  if (!newName || !newName.trim() || newName.trim() === currentName) return;

  const sanitized = sanitizeFileName(newName.trim());
  const dirPath = path.dirname(filePath);
  const newPath = path.join(dirPath, sanitized);

  if (!isPathSafe(newPath)) {
    alert('Cannot rename outside the project folder.');
    return;
  }

  if (fs.existsSync(newPath)) {
    alert('A file or folder with this name already exists.');
    return;
  }

  try {
    fs.renameSync(filePath, newPath);

    // Update expanded folders if it was a directory
    if (expandedFolders.has(filePath)) {
      const entry = expandedFolders.get(filePath);
      expandedFolders.delete(filePath);
      expandedFolders.set(newPath, entry);
    }

    if (selectedFile === filePath) {
      selectedFile = newPath;
    }

    refreshFolder(dirPath);
    render();
  } catch (e) {
    const userMessage = (e.code === 'EBUSY' || e.code === 'EPERM')
      ? 'File is locked by another process. Close it and try again.'
      : `Error: ${e.message}`;
    alert(userMessage);
  }
}

function promptDelete(filePath, fileName, isDirectory) {
  const msg = isDirectory
    ? `${t('fileExplorer.deleteFolderConfirm') || 'Delete folder and all contents?'}\n\n${fileName}`
    : `${t('fileExplorer.deleteFileConfirm') || 'Delete file?'}\n\n${fileName}`;

  if (!confirm(msg)) return;

  try {
    if (isDirectory) {
      fs.rmSync(filePath, { recursive: true, force: true });
    } else {
      fs.unlinkSync(filePath);
    }

    expandedFolders.delete(filePath);
    if (selectedFile === filePath) {
      selectedFile = null;
      hidePreview();
    }

    const dirPath = path.dirname(filePath);
    refreshFolder(dirPath);
    render();
  } catch (e) {
    alert(`Error: ${e.message}`);
  }
}

// ========== EVENT HANDLING ==========
function attachListeners() {
  const treeEl = document.getElementById('file-explorer-tree');
  if (!treeEl) return;

  // Use event delegation
  treeEl.onclick = (e) => {
    const node = e.target.closest('.fe-node');
    if (!node || node.classList.contains('fe-truncated')) return;

    const nodePath = node.dataset.path;
    const isDir = node.dataset.isDir === 'true';

    if (isDir) {
      toggleFolder(nodePath);
    } else {
      selectFile(nodePath);
    }
  };

  treeEl.ondblclick = (e) => {
    const node = e.target.closest('.fe-node');
    if (!node || node.classList.contains('fe-truncated')) return;

    const nodePath = node.dataset.path;
    const isDir = node.dataset.isDir === 'true';

    if (!isDir) {
      api.dialog.openInEditor({ editor: 'code', path: nodePath });
    }
  };

  treeEl.oncontextmenu = (e) => {
    const node = e.target.closest('.fe-node');
    if (!node || node.classList.contains('fe-truncated')) {
      if (rootPath) {
        showFileContextMenu(e, rootPath, true);
      }
      return;
    }

    const nodePath = node.dataset.path;
    const isDir = node.dataset.isDir === 'true';
    showFileContextMenu(e, nodePath, isDir);
  };

  // Header buttons
  const btnCollapse = document.getElementById('btn-collapse-explorer');
  if (btnCollapse) {
    btnCollapse.onclick = () => {
      expandedFolders.clear();
      selectedFile = null;
      hidePreview();
      render();
    };
  }

  const btnRefresh = document.getElementById('btn-refresh-explorer');
  if (btnRefresh) {
    btnRefresh.onclick = () => {
      expandedFolders.clear();
      render();
    };
  }

  const btnClose = document.getElementById('btn-close-explorer');
  if (btnClose) {
    btnClose.onclick = () => {
      hide();
      manuallyHidden = true;
    };
  }
}

function toggleFolder(folderPath) {
  if (expandedFolders.has(folderPath) && expandedFolders.get(folderPath).loaded) {
    expandedFolders.delete(folderPath);
  } else {
    getOrLoadFolder(folderPath);
  }
  render();
}

function selectFile(filePath) {
  // Update selection visually without full re-render
  const prev = document.querySelector('.fe-node.selected');
  if (prev) prev.classList.remove('selected');

  const next = document.querySelector(`.fe-node[data-path="${CSS.escape(filePath)}"]`);
  if (next) next.classList.add('selected');

  selectedFile = filePath;

  // Debounce preview for fast navigation
  clearTimeout(previewTimeout);
  previewTimeout = setTimeout(() => showPreview(filePath), 150);
}

// ========== RESIZER ==========
function initResizer() {
  const resizer = document.getElementById('file-explorer-resizer');
  const panel = document.getElementById('file-explorer-panel');
  if (!resizer || !panel) return;

  let startX, startWidth;

  resizer.addEventListener('mousedown', (e) => {
    startX = e.clientX;
    startWidth = panel.offsetWidth;
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';

    const onMouseMove = (e) => {
      const newWidth = Math.min(500, Math.max(200, startWidth + (e.clientX - startX)));
      panel.style.width = newWidth + 'px';
    };

    const onMouseUp = () => {
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      localStorage.setItem('file-explorer-width', panel.offsetWidth);
    };

    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
  });

  // Restore saved width
  const savedWidth = localStorage.getItem('file-explorer-width');
  if (savedWidth) {
    panel.style.width = savedWidth + 'px';
  }
}

// ========== INIT ==========
function init() {
  initResizer();
  attachListeners();
}

// ========== EXPORTS ==========
module.exports = {
  setCallbacks,
  setRootPath,
  show,
  hide,
  init
};
