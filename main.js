const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron');
const path = require('path');
const os = require('os');
const pty = require('node-pty');

let mainWindow;
const terminals = new Map();
let terminalId = 0;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1000,
    minHeight: 600,
    frame: false,
    backgroundColor: '#0d0d0d',
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    }
  });

  mainWindow.loadFile('index.html');

  if (process.argv.includes('--dev')) {
    mainWindow.webContents.openDevTools();
  }

  mainWindow.on('closed', () => {
    // Kill all terminals
    terminals.forEach(term => term.kill());
    terminals.clear();
    mainWindow = null;
  });
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  app.quit();
});

// Window controls
ipcMain.on('window-minimize', () => mainWindow?.minimize());
ipcMain.on('window-maximize', () => {
  if (mainWindow?.isMaximized()) {
    mainWindow.unmaximize();
  } else {
    mainWindow?.maximize();
  }
});
ipcMain.on('window-close', () => mainWindow?.close());

// Folder dialog
ipcMain.handle('select-folder', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openDirectory']
  });
  return result.filePaths[0] || null;
});

// Open in explorer
ipcMain.on('open-in-explorer', (event, folderPath) => {
  shell.openPath(folderPath);
});

// Create terminal
ipcMain.handle('terminal-create', (event, { cwd, runClaude }) => {
  const id = ++terminalId;

  const shellPath = process.platform === 'win32' ? 'powershell.exe' : 'bash';

  const ptyProcess = pty.spawn(shellPath, [], {
    name: 'xterm-256color',
    cols: 120,
    rows: 30,
    cwd: cwd || os.homedir(),
    env: process.env
  });

  terminals.set(id, ptyProcess);

  ptyProcess.onData(data => {
    mainWindow?.webContents.send('terminal-data', { id, data });
  });

  ptyProcess.onExit(() => {
    terminals.delete(id);
    mainWindow?.webContents.send('terminal-exit', { id });
  });

  // Run claude if requested
  if (runClaude) {
    setTimeout(() => {
      ptyProcess.write('claude\r');
    }, 500);
  }

  return id;
});

// Terminal input
ipcMain.on('terminal-input', (event, { id, data }) => {
  const term = terminals.get(id);
  if (term) {
    term.write(data);
  }
});

// Terminal resize
ipcMain.on('terminal-resize', (event, { id, cols, rows }) => {
  const term = terminals.get(id);
  if (term) {
    term.resize(cols, rows);
  }
});

// Kill terminal
ipcMain.on('terminal-kill', (event, { id }) => {
  const term = terminals.get(id);
  if (term) {
    term.kill();
    terminals.delete(id);
  }
});
