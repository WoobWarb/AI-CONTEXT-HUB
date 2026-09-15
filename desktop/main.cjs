const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const { spawn } = require('child_process');
const http = require('http');

let mainWindow = null;
let serverProcess = null;
const PORT = process.env.PORT || 4001;

// Function to check if server is responding
function checkServerReady(port, retries = 35, interval = 250) {
  return new Promise((resolve) => {
    let count = 0;
    const check = () => {
      const req = http.get(`http://127.0.0.1:${port}/api/tree`, (res) => {
        if (res.statusCode >= 200 && res.statusCode < 500) {
          resolve(true);
        } else {
          retry();
        }
      });
      req.on('error', () => {
        retry();
      });
    };
    const retry = () => {
      count++;
      if (count < retries) {
        setTimeout(check, interval);
      } else {
        resolve(false);
      }
    };
    check();
  });
}

async function startServerIfNeeded() {
  const isAlreadyRunning = await checkServerReady(PORT, 3, 150);
  if (isAlreadyRunning) {
    console.log(`[Desktop] Express backend is already running on port ${PORT}`);
    return;
  }

  const serverScript = path.join(__dirname, '..', 'tools', 'ai-context-hub', 'server.js');
  const targetDir = process.argv[2] || process.cwd();
  console.log(`[Desktop] Starting Express backend for target: ${targetDir}`);

  serverProcess = spawn(process.execPath, [serverScript, targetDir], {
    cwd: path.join(__dirname, '..'),
    env: { ...process.env, PORT: String(PORT) },
    stdio: 'pipe'
  });

  serverProcess.stdout.on('data', (d) => {
    console.log(`[Server] ${d.toString().trim()}`);
  });
  serverProcess.stderr.on('data', (d) => {
    console.error(`[Server ERR] ${d.toString().trim()}`);
  });

  const ready = await checkServerReady(PORT, 40, 250);
  if (!ready) {
    console.error('[Desktop] Server took too long to start!');
  }
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 920,
    minWidth: 1024,
    minHeight: 680,
    backgroundColor: '#0e0c0a',
    title: 'AI Context Hub - Desktop',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      nodeIntegration: false,
      contextIsolation: true,
      webviewTag: true
    }
  });

  mainWindow.loadURL(`http://localhost:${PORT}`);

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// IPC Handlers
ipcMain.handle('dialog:openDirectory', async () => {
  if (!mainWindow) return null;
  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'เลือกโฟลเดอร์โปรเจกต์ (Select Project Folder)',
    properties: ['openDirectory', 'createDirectory']
  });
  if (!result.canceled && result.filePaths.length > 0) {
    return result.filePaths[0];
  }
  return null;
});

ipcMain.on('window:minimize', () => mainWindow?.minimize());
ipcMain.on('window:maximize', () => {
  if (mainWindow?.isMaximized()) mainWindow.unmaximize();
  else mainWindow?.maximize();
});
ipcMain.on('window:close', () => mainWindow?.close());

app.whenReady().then(async () => {
  await startServerIfNeeded();
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (serverProcess) {
    console.log('[Desktop] Terminating background Express server...');
    serverProcess.kill('SIGTERM');
    serverProcess = null;
  }
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('before-quit', () => {
  if (serverProcess) {
    serverProcess.kill();
    serverProcess = null;
  }
});
