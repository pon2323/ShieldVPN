const { app, BrowserWindow, ipcMain, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const { parseInputToConfig } = require('./lib/configParser');
const { SingBoxRunner } = require('./lib/singbox');

let win;
let runner;
const APP_VERSION = require('./package.json').version;

function createWindow() {
  win = new BrowserWindow({
    width: 1180,
    height: 760,
    minWidth: 980,
    minHeight: 680,
    frame: false,
    transparent: false,
    backgroundColor: '#050816',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  runner = new SingBoxRunner({
    userData: app.getPath('userData'),
    log: (line) => win?.webContents.send('vpn:log', line),
    status: (state) => win?.webContents.send('vpn:state', state)
  });

  win.loadFile(path.join(__dirname, 'renderer', 'index.html'));
}

app.whenReady().then(() => {
  writeSharedState();
  createWindow();
});

app.on('window-all-closed', async () => {
  try { await runner?.stop(); } catch (_) {}
  if (process.platform !== 'darwin') app.quit();
});

ipcMain.handle('window:minimize', () => win?.minimize());
ipcMain.handle('window:close', async () => {
  try { await runner?.stop(); } catch (_) {}
  win?.close();
});
ipcMain.handle('open:external', (_, url) => shell.openExternal(url));

ipcMain.handle('vpn:engineStatus', async () => {
  return runner.engineStatus();
});

ipcMain.handle('vpn:start', async (_, rawKey) => {
  try {
    const prepared = await normalizeInput(rawKey);
    const parsed = await parseInputToConfig(prepared);

    if (parsed.demo) {
      return { ok: false, message: 'Демо-ключ больше не используется для реального VPN. Вставь реальный vless://, vmess://, trojan://, ss:// или subscription URL.' };
    }

    await runner.start(parsed.config);
    return { ok: true, protocol: parsed.protocol, name: parsed.name || 'ShieldVPN Server' };
  } catch (error) {
    return { ok: false, message: error.message || String(error) };
  }
});

ipcMain.handle('vpn:stop', async () => {
  await runner?.stop();
  return { ok: true };
});

async function normalizeInput(raw) {
  const value = String(raw || '').trim();
  if (!value) throw new Error('Вставь VPN-ключ или subscription URL.');

  // Subscription URL: скачиваем список ключей и берём первый поддерживаемый.
  if (/^https?:\/\//i.test(value)) {
    win?.webContents.send('vpn:log', `SUBSCRIPTION: скачиваю ${value}`);
    const res = await fetch(value, { headers: { 'User-Agent': 'ShieldVPN/2.0' } });
    if (!res.ok) throw new Error(`Не удалось скачать subscription: HTTP ${res.status}`);
    const text = await res.text();
    const decoded = tryBase64(text.trim()) || text;
    const lines = decoded.split(/\r?\n/).map(s => s.trim()).filter(Boolean);
    const supported = lines.find(s => /^(vless|vmess|trojan|ss):\/\//i.test(s) || s.trim().startsWith('{'));
    if (!supported) throw new Error('Subscription скачан, но внутри не найден поддерживаемый ключ: vless/vmess/trojan/ss.');
    return supported;
  }

  return value;
}

function tryBase64(text) {
  try {
    const cleaned = text.replace(/\s+/g, '');
    if (!/^[A-Za-z0-9+/=_-]+$/.test(cleaned)) return null;
    const normalized = cleaned.replace(/-/g, '+').replace(/_/g, '/');
    const out = Buffer.from(normalized, 'base64').toString('utf8');
    if (out.includes('://') || out.includes('{')) return out;
    return null;
  } catch (_) {
    return null;
  }
}

function writeSharedState() {
  try {
    const dir = path.join(app.getPath('appData'), 'ShieldVPN');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'state.json'), JSON.stringify({
      version: APP_VERSION,
      exePath: process.execPath,
      updatedAt: new Date().toISOString()
    }, null, 2), 'utf8');
  } catch (_) {}
}
