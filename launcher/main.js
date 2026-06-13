const { app, BrowserWindow, ipcMain, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const https = require('https');
const http = require('http');
const crypto = require('crypto');
const { spawn } = require('child_process');

const APP_VERSION = '2.1.0';

// После загрузки на GitHub замени YOUR_GITHUB_LOGIN и YOUR_REPOSITORY_NAME.
// GitHub Pages будет отдавать этот JSON: https://LOGIN.github.io/REPO/updates/version.json
const MANIFEST_URL = process.env.SHIELDVPN_MANIFEST_URL || 'https://YOUR_GITHUB_LOGIN.github.io/YOUR_REPOSITORY_NAME/updates/version.json';
const FALLBACK_CLIENT_URL = process.env.SHIELDVPN_CLIENT_URL || 'https://github.com/YOUR_GITHUB_LOGIN/YOUR_REPOSITORY_NAME/releases/latest/download/ShieldVPNClientSetup.exe';

let win;
let lastManifest = null;
let downloadedPath = null;

function createWindow() {
  win = new BrowserWindow({
    width: 1120,
    height: 740,
    minWidth: 1020,
    minHeight: 700,
    frame: false,
    resizable: true,
    autoHideMenuBar: true,
    backgroundColor: '#050816',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });
  win.loadFile(path.join(__dirname, 'renderer', 'index.html'));
}

app.whenReady().then(createWindow);
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });

ipcMain.handle('window:minimize', () => win?.minimize());
ipcMain.handle('window:close', () => win?.close());
ipcMain.handle('open:external', (_, url) => shell.openExternal(url));
ipcMain.handle('launcher:meta', () => ({ appVersion: APP_VERSION, manifestUrl: MANIFEST_URL }));

ipcMain.handle('launcher:check', async () => {
  try {
    const manifest = await getManifest();
    lastManifest = manifest;
    const installed = getInstalledClient();
    const latestVersion = manifest.latestVersion || '0.0.0';
    const isInstalled = Boolean(installed.path);
    const isLatest = isInstalled && compareVersion(installed.version || '0.0.0', latestVersion) >= 0;

    return {
      ok: true,
      mode: isLatest ? 'latest' : isInstalled ? 'update' : 'install',
      installed,
      manifest,
      title: isLatest ? 'Установлена последняя версия' : isInstalled ? 'Доступно обновление' : 'Клиент ещё не установлен',
      message: isLatest
        ? `ShieldVPN Client ${installed.version || latestVersion} уже установлен. Можно запускать.`
        : isInstalled
          ? `Установлена версия ${installed.version || 'неизвестно'}, доступна ${latestVersion}. Нажми «Обновить».`
          : 'Нажми «Установить», лаунчер скачает актуальный клиент и откроет установщик.'
    };
  } catch (error) {
    return { ok: false, ...friendlyError(error), installed: getInstalledClient() };
  }
});

ipcMain.handle('launcher:downloadInstall', async () => {
  try {
    const manifest = lastManifest || await getManifest();
    lastManifest = manifest;
    const url = manifest.clientUrl || FALLBACK_CLIENT_URL;
    validateConfiguredUrl(url, 'ссылка на клиент');

    const targetDir = path.join(app.getPath('downloads'), 'ShieldVPN');
    fs.mkdirSync(targetDir, { recursive: true });
    downloadedPath = path.join(targetDir, manifest.clientFileName || 'ShieldVPNClientSetup.exe');

    await downloadFile(url, downloadedPath, (progress) => win?.webContents.send('launcher:progress', progress));

    if (manifest.sha256) {
      const actual = sha256File(downloadedPath);
      if (actual.toLowerCase() !== manifest.sha256.toLowerCase()) {
        throw new Error(`CHECKSUM_MISMATCH:${actual}`);
      }
    }

    spawn(downloadedPath, [], { detached: true, stdio: 'ignore' }).unref();
    return { ok: true, path: downloadedPath, message: 'Установщик открыт. Заверши установку, потом нажми «Открыть приложение».' };
  } catch (error) {
    return { ok: false, ...friendlyError(error) };
  }
});

ipcMain.handle('launcher:openClient', async () => {
  const installed = getInstalledClient();
  if (!installed.path) {
    return { ok: false, message: 'Клиент пока не найден. Сначала установи ShieldVPN Client.', details: JSON.stringify(installed.candidates, null, 2) };
  }
  try {
    spawn(installed.path, [], { detached: true, stdio: 'ignore' }).unref();
    app.quit();
    return { ok: true };
  } catch (error) {
    return { ok: false, ...friendlyError(error) };
  }
});

async function getManifest() {
  validateConfiguredUrl(MANIFEST_URL, 'ссылка на manifest');
  const text = await httpGetText(MANIFEST_URL);
  const manifest = JSON.parse(text);
  if (!manifest.clientUrl && !FALLBACK_CLIENT_URL) throw new Error('MANIFEST_NO_CLIENT_URL');
  if (!manifest.latestVersion) manifest.latestVersion = '0.0.0';
  return manifest;
}

function getInstalledClient() {
  const statePath = path.join(app.getPath('appData'), 'ShieldVPN', 'state.json');
  let state = {};
  try { state = JSON.parse(fs.readFileSync(statePath, 'utf8')); } catch (_) {}

  const candidates = [
    state.exePath,
    path.join(app.getPath('home'), 'AppData', 'Local', 'Programs', 'ShieldVPN Client', 'ShieldVPN Client.exe'),
    path.join(process.env.LOCALAPPDATA || '', 'Programs', 'ShieldVPN Client', 'ShieldVPN Client.exe'),
    path.join(process.env.PROGRAMFILES || '', 'ShieldVPN Client', 'ShieldVPN Client.exe'),
    path.join(process.env['PROGRAMFILES(X86)'] || '', 'ShieldVPN Client', 'ShieldVPN Client.exe')
  ].filter(Boolean);

  const found = candidates.find(p => fs.existsSync(p));
  return {
    path: found || null,
    version: state.version || null,
    statePath,
    candidates
  };
}

function validateConfiguredUrl(url, label) {
  if (!url || /YOUR_GITHUB_LOGIN|YOUR_REPOSITORY_NAME|your-domain/i.test(url)) {
    throw new Error(`NOT_CONFIGURED:${label}`);
  }
}

function httpGetText(url) {
  return new Promise((resolve, reject) => {
    const proto = url.startsWith('https') ? https : http;
    const req = proto.get(url, { headers: { 'User-Agent': 'ShieldVPN-Launcher/2.1' } }, (res) => {
      if ([301,302,307,308].includes(res.statusCode)) return httpGetText(res.headers.location).then(resolve).catch(reject);
      if (res.statusCode !== 200) return reject(new Error(`HTTP_${res.statusCode}:${url}`));
      let data = '';
      res.setEncoding('utf8');
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve(data));
    });
    req.setTimeout(20000, () => req.destroy(new Error('TIMEOUT')));
    req.on('error', reject);
  });
}

function downloadFile(url, destination, onProgress) {
  return new Promise((resolve, reject) => {
    const proto = url.startsWith('https') ? https : http;
    const req = proto.get(url, { headers: { 'User-Agent': 'ShieldVPN-Launcher/2.1' } }, (response) => {
      if ([301, 302, 307, 308].includes(response.statusCode)) {
        return downloadFile(response.headers.location, destination, onProgress).then(resolve).catch(reject);
      }
      if (response.statusCode !== 200) return reject(new Error(`HTTP_${response.statusCode}:${url}`));

      const total = Number(response.headers['content-length'] || 0);
      let loaded = 0;
      const file = fs.createWriteStream(destination);
      response.on('data', chunk => {
        loaded += chunk.length;
        const percent = total ? Math.round((loaded / total) * 100) : 0;
        onProgress({ loaded, total, percent });
      });
      response.pipe(file);
      file.on('finish', () => file.close(resolve));
      file.on('error', reject);
    });
    req.setTimeout(60000, () => req.destroy(new Error('TIMEOUT')));
    req.on('error', reject);
  });
}

function sha256File(filePath) {
  const hash = crypto.createHash('sha256');
  hash.update(fs.readFileSync(filePath));
  return hash.digest('hex');
}

function compareVersion(a, b) {
  const pa = String(a).split('.').map(n => parseInt(n, 10) || 0);
  const pb = String(b).split('.').map(n => parseInt(n, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    if ((pa[i] || 0) > (pb[i] || 0)) return 1;
    if ((pa[i] || 0) < (pb[i] || 0)) return -1;
  }
  return 0;
}

function friendlyError(error) {
  const raw = error?.message || String(error);
  if (raw.startsWith('NOT_CONFIGURED')) return {
    title: 'Лаунчер ещё не настроен',
    message: 'Нужно заменить YOUR_GITHUB_LOGIN и YOUR_REPOSITORY_NAME на твой GitHub-логин и название репозитория. После этого пересобери лаунчер.',
    details: raw
  };
  if (raw.includes('HTTP_404')) return {
    title: 'Файл обновления не найден',
    message: 'На сервере нет нужного файла. Проверь, что ShieldVPNClientSetup.exe загружен в GitHub Releases, а ссылка в version.json правильная.',
    details: raw
  };
  if (raw.includes('HTTP_403')) return {
    title: 'Доступ к файлу закрыт',
    message: 'GitHub или сервер запретил скачивание. Проверь, что репозиторий/Release публичные.',
    details: raw
  };
  if (raw.includes('ENOTFOUND') || raw.includes('ECONNREFUSED') || raw.includes('TIMEOUT')) return {
    title: 'Нет соединения с сервером обновлений',
    message: 'Проверь интернет и ссылку на manifest/version.json. Для локального теста сайт должен быть запущен через сервер.',
    details: raw
  };
  if (raw.startsWith('CHECKSUM_MISMATCH')) return {
    title: 'Проверка файла не прошла',
    message: 'Скачанный установщик отличается от ожидаемого. Обнови sha256 в version.json или перезалей файл.',
    details: raw
  };
  return { title: 'Не удалось выполнить действие', message: 'Произошла ошибка. Открой технические детали ниже и пришли их разработчику.', details: raw };
}
