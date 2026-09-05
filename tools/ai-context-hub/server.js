import express from 'express';
import cors from 'cors';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { fileURLToPath } from 'url';
import { exec, execSync, spawn } from 'child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
let PROJECT_ROOT = process.env.PROJECT_ROOT 
  ? path.resolve(process.env.PROJECT_ROOT)
  : (process.argv[2] ? path.resolve(process.argv[2]) : path.resolve(__dirname, '../../'));
const PORT = process.env.PORT || 4001;

const app = express();
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS, PUT, DELETE');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');
  res.setHeader('Access-Control-Allow-Private-Network', 'true');
  if (req.method === 'OPTIONS') {
    return res.sendStatus(204);
  }
  next();
});
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// Web Chat Bridge State
let latestExportedContext = null;
let bridgeState = {
  tabUrl: '',
  tabTitle: '',
  lastSeen: 0,
  pendingCommands: [],
  latestAiResponse: null
};

const IGNORED_DIRS = new Set([
  'node_modules',
  'dist',
  'build',
  '.git',
  '.svn',
  '.hg',
  '.vscode',
  '.idea',
  'backups',
  '.backups',
  '.ai-hub',
  'tools',
  '__pycache__',
  '.next',
  '.nuxt',
  'coverage',
  '.cache',
  'venv',
  '.venv',
  'env'
]);

const IGNORED_FILES = new Set([
  'package-lock.json',
  'yarn.lock',
  'pnpm-lock.yaml',
  '.DS_Store',
  'Thumbs.db'
]);

// Helper to scan project tree recursively
function getProjectTree(dir = PROJECT_ROOT, relativePath = '') {
  const items = [];
  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (IGNORED_DIRS.has(entry.name) || IGNORED_FILES.has(entry.name)) continue;

      const fullPath = path.join(dir, entry.name);
      const relPath = relativePath ? `${relativePath}/${entry.name}` : entry.name;

      if (entry.isDirectory()) {
        const children = getProjectTree(fullPath, relPath);
        if (children.length > 0) {
          items.push({
            name: entry.name,
            path: relPath,
            isDir: true,
            children
          });
        }
      } else {
        const stats = fs.statSync(fullPath);
        items.push({
          name: entry.name,
          path: relPath,
          isDir: false,
          sizeBytes: stats.size
        });
      }
    }
  } catch (e) {
    console.error('Scan error:', e);
  }
  return items;
}

// 1. Get Project File Tree
app.get('/api/tree', (req, res) => {
  const tree = getProjectTree();
  res.json({ root: PROJECT_ROOT, projectName: path.basename(PROJECT_ROOT), tree });
});

// Change active folder dynamically
// In-modal directory navigator
app.get('/api/explore-dirs', (req, res) => {
  let targetPath = req.query.path ? path.resolve(req.query.path) : PROJECT_ROOT;

  const drives = [];
  try {
    const stdout = execSync('powershell -NoProfile -Command "Get-PSDrive -PSProvider FileSystem | Select-Object -ExpandProperty Root"', { timeout: 2000 }).toString();
    stdout.split(/\r?\n/).map(d => d.trim()).filter(Boolean).forEach(d => drives.push(d));
  } catch (e) {
    drives.push('C:\\', 'D:\\');
  }

  const home = os.homedir();
  const shortcuts = [
    { name: '🏠 Home', path: home },
    { name: '🖥️ Desktop', path: path.join(home, 'Desktop') },
    { name: '📄 Documents', path: path.join(home, 'Documents') },
    { name: '📥 Downloads', path: path.join(home, 'Downloads') }
  ].filter(s => fs.existsSync(s.path));

  if (!fs.existsSync(targetPath)) {
    targetPath = PROJECT_ROOT;
  }

  const subdirs = [];
  try {
    const entries = fs.readdirSync(targetPath, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      if (entry.name.startsWith('$') || entry.name.startsWith('.')) continue;
      if (entry.name === 'System Volume Information' || entry.name === 'Recovery') continue;
      subdirs.push(entry.name);
    }
  } catch (e) {}

  subdirs.sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));

  const parent = path.dirname(targetPath);
  res.json({
    currentPath: targetPath,
    parentPath: parent !== targetPath ? parent : null,
    drives,
    shortcuts,
    subdirs
  });
});

app.post('/api/change-folder', (req, res) => {
  const { folderPath } = req.body;
  if (!folderPath) {
    return res.status(400).json({ error: 'กรุณาระบุที่อยู่โฟลเดอร์' });
  }

  const cleanPath = folderPath.trim().replace(/^["']|["']$/g, '');
  const resolved = path.resolve(cleanPath);
  if (!fs.existsSync(resolved)) {
    return res.status(404).json({ error: `ไม่พบโฟลเดอร์: ${cleanPath}` });
  }

  const stat = fs.statSync(resolved);
  if (!stat.isDirectory()) {
    return res.status(400).json({ error: 'เส้นทางที่ระบุไม่ใช่โฟลเดอร์' });
  }

  PROJECT_ROOT = resolved;
  const tree = getProjectTree();
  res.json({
    success: true,
    root: PROJECT_ROOT,
    projectName: path.basename(PROJECT_ROOT),
    tree
  });
});

// Browse folder via Windows Folder Picker dialog
app.post('/api/browse-folder', (req, res) => {
  const scriptPath = path.join(__dirname, 'browse-folder.ps1');
  const psCmd = `powershell -STA -NoProfile -ExecutionPolicy Bypass -File "${scriptPath}"`;
  
  exec(psCmd, (err, stdout) => {
    if (err || !stdout || !stdout.trim()) {
      return res.json({ canceled: true });
    }
    const selected = stdout.trim();
    if (fs.existsSync(selected) && fs.statSync(selected).isDirectory()) {
      PROJECT_ROOT = selected;
      const tree = getProjectTree();
      return res.json({
        success: true,
        root: PROJECT_ROOT,
        projectName: path.basename(PROJECT_ROOT),
        tree
      });
    }
    res.json({ canceled: true });
  });
});

// Open Extension folder in Windows Explorer
app.post('/api/open-extension-folder', (req, res) => {
  const extDir = path.resolve(__dirname, '../../extension');
  exec(`explorer.exe "${extDir}"`);
  res.json({ success: true, path: extDir });
});

// 2. Read single file content
app.get('/api/file', (req, res) => {
  const relPath = req.query.path;
  if (!relPath) return res.status(400).json({ error: 'path is required' });

  const safePath = path.resolve(PROJECT_ROOT, relPath.replace(/\.\./g, ''));
  if (!safePath.startsWith(PROJECT_ROOT)) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  try {
    if (!fs.existsSync(safePath)) {
      return res.status(404).json({ error: 'File not found' });
    }
    const content = fs.readFileSync(safePath, 'utf8');
    res.json({ path: relPath, content });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 3. Generate combined context for selected files or instructions
app.post('/api/export-context', (req, res) => {
  const { files = [], promptTemplate, customInstructions } = req.body;
  const fileList = Array.isArray(files) ? files : [];

  if (fileList.length === 0 && !customInstructions && !promptTemplate) {
    return res.status(400).json({ error: 'กรุณาระบุคำสั่ง หรือเลือกไฟล์อย่างน้อย 1 ไฟล์' });
  }

  const projectName = path.basename(PROJECT_ROOT);
  let formatted = '';

  const instructionHeader = `[โฟลเดอร์โปรเจกต์ปัจจุบัน: ${projectName}]
คำสั่งจากผู้ใช้:
${customInstructions || promptTemplate || 'ช่วยตรวจสอบหรือจัดการไฟล์ในโปรเจกต์นี้'}

⚠️ คำแนะนำสำคัญสำหรับผู้ช่วย AI (Auto Agent):
1. หากต้องการสร้างหรือแก้ไขไฟล์ในโปรเจกต์นี้ ให้ใส่แท็ก:
[WRITE_FILE: path/to/filename.ext]
\`\`\`ภาษา
เนื้อหาไฟล์ทั้งหมด
\`\`\`
2. หากผู้ใช้สั่งให้ "รันโปรเจกต์" หรือมีคำสั่งที่ต้องสั่งรันใน Terminal:
ให้ตรวจสอบโครงสร้างไฟล์ที่มีอยู่ (เช่น docker-compose.yml, package.json, สคริปต์ .bat) แล้วออกคำสั่งด้วยแท็ก:
[RUN_COMMAND: คำสั่งรัน] (เช่น [RUN_COMMAND: docker compose up -d] หรือ [RUN_COMMAND: start-n8n.bat])
(ระบบจะนำคำสั่งไปรันในเครื่องของผู้ใช้ในโฟลเดอร์นี้โดยตรงทันที)`;

  formatted += `${instructionHeader}\n\n`;

  // Always list all files in this project so the AI knows the directory structure
  const allTree = getProjectTree();
  const manifest = [];
  function gatherPaths(nodes) {
    if (!Array.isArray(nodes)) return;
    for (const n of nodes) {
      if (n.isDir && n.children) gatherPaths(n.children);
      else manifest.push(n.path);
    }
  }
  gatherPaths(allTree);

  if (manifest.length > 0) {
    formatted += `📁 โครงสร้างไฟล์ที่มีอยู่ในโฟลเดอร์นี้ (${manifest.length} ไฟล์):\n`;
    for (const p of manifest.slice(0, 40)) {
      formatted += `- \`${p}\`\n`;
    }
    if (manifest.length > 40) {
      formatted += `... และอีก ${manifest.length - 40} ไฟล์\n`;
    }
    formatted += `\n---\n\n`;
  }

  if (fileList.length > 0) {
    formatted += `📂 เนื้อหาไฟล์ที่แนบส่ง (${fileList.length} ไฟล์):\n`;
    for (const f of fileList) {
      formatted += `- \`${f}\`\n`;
    }
    formatted += `\n---\n\n`;
  }

  let totalChars = 0;
  for (const relPath of fileList) {
    const safePath = path.resolve(PROJECT_ROOT, relPath.replace(/\.\./g, ''));
    if (!safePath.startsWith(PROJECT_ROOT)) continue;

    if (fs.existsSync(safePath) && !fs.statSync(safePath).isDirectory()) {
      try {
        const content = fs.readFileSync(safePath, 'utf8');
        totalChars += content.length;
        const ext = path.extname(relPath).replace('.', '') || 'text';
        formatted += `#### 📄 File: \`${relPath}\`\n\`\`\`${ext}\n${content}\n\`\`\`\n\n`;
      } catch (e) {}
    }
  }

  // Autonomous instructions reminder at end
  formatted += `### 🤖 Direct Workspace Interaction:
คุณสามารถสั่งอ่านไฟล์ด้วย: \`[READ_FILE: path/to/file.ext]\`
สั่งสร้าง/บันทึกไฟล์ด้วย: \`[WRITE_FILE: path/to/file.ext]\` ตามด้วยบล็อกโค้ด
และสั่งรันคำสั่งด้วย: \`[RUN_COMMAND: คำสั่ง]\` เช่น \`[RUN_COMMAND: docker compose up -d]\`
`;

  const estimatedTokens = Math.round((totalChars + formatted.length) / 3.8);

  latestExportedContext = {
    filesCount: fileList.length,
    estimatedTokens,
    markdown: formatted,
    timestamp: Date.now()
  };

  res.json({
    filesCount: fileList.length,
    estimatedTokens,
    markdown: formatted
  });
});

// 3.1 Web Chat Bridge Endpoints
app.get('/api/bridge/latest-context', (req, res) => {
  res.json(latestExportedContext || { markdown: '' });
});

app.post('/api/bridge/ping', (req, res) => {
  const { tabUrl, tabTitle } = req.body;
  bridgeState.lastSeen = Date.now();
  if (tabUrl) bridgeState.tabUrl = tabUrl;
  if (tabTitle) bridgeState.tabTitle = tabTitle;

  const commands = bridgeState.pendingCommands.splice(0);
  res.json({
    success: true,
    projectName: path.basename(PROJECT_ROOT),
    commands,
    hasResponse: !!bridgeState.latestAiResponse
  });
});

app.get('/api/bridge/status', (req, res) => {
  const isConnected = (Date.now() - bridgeState.lastSeen) < 15000;

  // Restore latest response from disk if server was restarted
  if (!bridgeState.latestAiResponse) {
    try {
      const latestFile = path.join(PROJECT_ROOT, '.ai-hub/history/latest_response.md');
      if (fs.existsSync(latestFile)) {
        const text = fs.readFileSync(latestFile, 'utf8');
        const stat = fs.statSync(latestFile);
        if (text && text.trim()) {
          bridgeState.latestAiResponse = {
            text,
            time: stat.mtimeMs
          };
        }
      }
    } catch (e) {}
  }

  res.json({
    connected: isConnected,
    tabUrl: isConnected ? bridgeState.tabUrl : '',
    tabTitle: isConnected ? bridgeState.tabTitle : '',
    hasLatestContext: !!latestExportedContext,
    latestAiResponse: bridgeState.latestAiResponse,
    lastModifiedFile: bridgeState.lastModifiedFile || null
  });
});

app.post('/api/bridge/ai-response', (req, res) => {
  const { text, time } = req.body;
  if (text) {
    const timestamp = time || Date.now();
    bridgeState.latestAiResponse = {
      text,
      time: timestamp
    };

    // Save to disk in .ai-hub/history
    try {
      const historyDir = path.join(PROJECT_ROOT, '.ai-hub/history');
      if (!fs.existsSync(historyDir)) fs.mkdirSync(historyDir, { recursive: true });
      
      // 1. Save latest_response.md
      fs.writeFileSync(path.join(historyDir, 'latest_response.md'), text, 'utf8');

      // 2. Append to chat_history.md
      const logEntry = `\n\n---\n### 🕒 คำตอบบันทึกเมื่อ ${new Date(timestamp).toLocaleString('th-TH')}\n\n${text}\n`;
      fs.appendFileSync(path.join(historyDir, 'chat_history.md'), logEntry, 'utf8');
    } catch (e) {
      console.error('Error saving AI response to history:', e.message);
    }
  }
  res.json({ success: true });
});

app.post('/api/bridge/send', (req, res) => {
  const { text, autoSubmit } = req.body;
  if (!text) return res.status(400).json({ error: 'text is required' });

  bridgeState.pendingCommands.push({
    id: Date.now(),
    type: 'SEND_PROMPT',
    text,
    autoSubmit: autoSubmit !== false
  });

  res.json({ success: true, queued: true });
});

// 4. Write / Update file (Auto Backup & Auto Directory Creation)
app.post('/api/file', (req, res) => {
  const { path: relPath, content } = req.body;
  if (!relPath || content === undefined) {
    return res.status(400).json({ error: 'path and content required' });
  }

  const safePath = path.resolve(PROJECT_ROOT, relPath.replace(/\.\./g, ''));
  if (!safePath.startsWith(PROJECT_ROOT)) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  try {
    // Ensure parent directories exist
    const targetDir = path.dirname(safePath);
    if (!fs.existsSync(targetDir)) {
      fs.mkdirSync(targetDir, { recursive: true });
    }

    // Take automatic backup before modifying existing file
    const backupDir = path.join(PROJECT_ROOT, '.ai-hub/backups');
    if (!fs.existsSync(backupDir)) fs.mkdirSync(backupDir, { recursive: true });
    if (fs.existsSync(safePath)) {
      const backupFile = path.join(backupDir, `${path.basename(safePath)}.${Date.now()}.bak`);
      fs.copyFileSync(safePath, backupFile);
    }
    
    fs.writeFileSync(safePath, content, 'utf8');
    bridgeState.lastModifiedFile = { path: relPath, time: Date.now() };
    res.json({ success: true, path: relPath });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 4.1 Create new file manually
app.post('/api/create-file', (req, res) => {
  const { path: relPath, content = '' } = req.body;
  if (!relPath || !relPath.trim()) {
    return res.status(400).json({ error: 'กรุณาระบุชื่อไฟล์' });
  }

  const safePath = path.resolve(PROJECT_ROOT, relPath.trim().replace(/\.\./g, ''));
  if (!safePath.startsWith(PROJECT_ROOT)) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  try {
    const targetDir = path.dirname(safePath);
    if (!fs.existsSync(targetDir)) {
      fs.mkdirSync(targetDir, { recursive: true });
    }

    if (fs.existsSync(safePath)) {
      return res.status(400).json({ error: 'มีไฟล์ชื่อนี้อยู่แล้ว' });
    }

    fs.writeFileSync(safePath, content, 'utf8');
    res.json({ success: true, path: relPath, tree: getProjectTree() });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 5. Run automated test suite
app.post('/api/run-tests', (req, res) => {
  exec('npm test', { cwd: PROJECT_ROOT }, (error, stdout, stderr) => {
    res.json({
      success: !error,
      output: (stdout || stderr || (error ? error.message : 'No output')).trim()
    });
  });
});

// 5.1 Run terminal command in project folder (with smart 'cd <dir> && ...' parsing)
app.post('/api/run-command', (req, res) => {
  const { command, subDir } = req.body;
  if (!command || !command.trim()) {
    return res.status(400).json({ error: 'กรุณาระบุคำสั่งที่ต้องการรัน' });
  }

  let rawCmd = command.trim();
  let workDir = PROJECT_ROOT;

  // Handle explicit subDir if provided
  if (subDir) {
    const candidate = path.resolve(PROJECT_ROOT, subDir);
    if (candidate.startsWith(PROJECT_ROOT) && fs.existsSync(candidate)) {
      workDir = candidate;
    }
  }

  // Smart detect 'cd <folder> && <actual_command>' or 'cd <folder> ; <actual_command>'
  const cdMatch = rawCmd.match(/^cd\s+([^\s;&]+)\s*(?:&&|;)\s*(.+)$/i);
  if (cdMatch) {
    const targetFolder = cdMatch[1].trim().replace(/^['"`]|['"`]$/g, '');
    const remainingCmd = cdMatch[2].trim();
    const candidate = path.resolve(workDir, targetFolder);
    if (candidate.startsWith(PROJECT_ROOT) && fs.existsSync(candidate)) {
      workDir = candidate;
      rawCmd = remainingCmd;
    }
  }

  console.log(`💻 Executing terminal command in [${workDir}]: ${rawCmd}`);

  // Option to launch in separate Windows Command Prompt window
  if (req.body.openExternal && process.platform === 'win32') {
    const title = path.basename(rawCmd);
    try {
      const p = spawn('cmd.exe', ['/c', 'start', `"${title}"`, 'cmd.exe', '/k', `cd /d "${workDir}" && ${rawCmd}`], {
        cwd: workDir,
        detached: true,
        stdio: 'ignore',
        shell: true
      });
      p.unref();
      return res.json({
        success: true,
        command: rawCmd,
        workDir: path.basename(workDir),
        output: `🚀 เปิดหน้าต่าง Command Prompt ของ Windows ขึ้นมาเพื่อรัน: ${rawCmd} เรียบร้อยแล้ว!\n(คุณสามารถดู log การทำงาน หรือกด Ctrl+C เพื่อหยุดโปรแกรมได้ที่หน้าต่าง Command Prompt นั้นครับ)`
      });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  const shellCmd = process.platform === 'win32' ? 'cmd.exe' : '/bin/bash';
  let execCmd = rawCmd;
  if (process.platform === 'win32' && !execCmd.includes('<') && !execCmd.includes('|')) {
    execCmd = `${execCmd} < nul`;
  }

  exec(execCmd, {
    cwd: workDir,
    shell: shellCmd,
    timeout: 30000,
    maxBuffer: 10 * 1024 * 1024
  }, (error, stdout, stderr) => {
    if (error && (error.killed || error.signal === 'SIGTERM')) {
      return res.json({
        success: false,
        command: rawCmd,
        workDir: path.basename(workDir),
        output: `⚠️ คำสั่งใช้เวลานานเกิน 30 วินาที (มักเกิดกับคำสั่งที่รันเป็น Server หรือดาวน์โหลดไฟล์ใหญ่)\n\n💡 แนะนำ: กดปุ่ม "🪟 เปิดใน CMD แยก" ด้านล่าง เพื่อให้เปิดหน้าต่าง Command Prompt ของ Windows รันโปรเจกต์ได้อย่างต่อเนื่องครับ`
      });
    }

    const out = (stdout || '').trim();
    const errOut = (stderr || '').trim();
    const combined = [out, errOut].filter(Boolean).join('\n') || (error ? error.message : 'คำสั่งเสร็จสิ้นเรียบร้อย');

    res.json({
      success: !error,
      command: rawCmd,
      workDir: path.basename(workDir),
      output: combined
    });
  });
});

// 6. OpenAPI Specification for ChatGPT Custom GPT Actions
app.get('/openapi.json', (req, res) => {
  const host = req.get('host') || `localhost:${PORT}`;
  const protocol = req.protocol || 'http';
  const projectName = path.basename(PROJECT_ROOT);
  
  res.json({
    openapi: '3.0.1',
    info: {
      title: `${projectName} - AI Workspace Bridge`,
      description: 'API for AI Assistants to view, read, edit, and test project files',
      version: '1.0.0'
    },
    servers: [{ url: `${protocol}://${host}` }],
    paths: {
      '/api/tree': {
        get: {
          summary: 'Get all project files',
          operationId: 'getProjectTree',
          responses: { '200': { description: 'Successful file tree' } }
        }
      },
      '/api/file': {
        get: {
          summary: 'Read file content',
          operationId: 'readFile',
          parameters: [{ name: 'path', in: 'query', required: true, schema: { type: 'string' } }],
          responses: { '200': { description: 'File content' } }
        },
        post: {
          summary: 'Write or update a file',
          operationId: 'writeFile',
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    path: { type: 'string' },
                    content: { type: 'string' }
                  }
                }
              }
            }
          },
          responses: { '200': { description: 'File updated successfully' } }
        }
      },
      '/api/run-tests': {
        post: {
          summary: 'Run automated test suite (npm test)',
          operationId: 'runTests',
          responses: { '200': { description: 'Test results' } }
        }
      }
    }
  });
});

app.listen(PORT, () => {
  console.log(`🤖 AI Context Hub Server running at http://localhost:${PORT}`);
  console.log(`📡 OpenAPI Schema ready at http://localhost:${PORT}/openapi.json`);
});
