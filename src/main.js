'use strict';

const { app, BrowserWindow, ipcMain, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const reg = require('./registry');
const store = require('./store');

let win = null;
const iconCache = new Map();
let scanning = false;

/* Set CTXMENU_DEBUG=1 to get a boot trace in %TEMP%\ctxmenu-boot.log */
const DEBUG = !!process.env.CTXMENU_DEBUG;
if (DEBUG) {
  try { fs.unlinkSync(require('os').tmpdir() + '\\ctxmenu-boot.log'); } catch (_) { }
}
function dbg(msg) {
  if (!DEBUG) return;
  try {
    fs.appendFileSync(
      require('os').tmpdir() + '\\ctxmenu-boot.log',
      `${new Date().toISOString()} ${msg}\n`,
      'utf8'
    );
  } catch (_) { }
}
if (DEBUG) {
  dbg(`boot packaged=${app.isPackaged} execPath=${process.execPath} resources=${process.resourcesPath}`);
  process.on('uncaughtException', (err) => dbg('uncaught: ' + (err && err.stack)));
  process.on('unhandledRejection', (err) => dbg('unhandledRejection: ' + (err && err.stack)));
}

function createWindow() {
  win = new BrowserWindow({
    width: 1000,
    height: 740,
    minWidth: 880,
    minHeight: 600,
    frame: false,
    show: false,
    backgroundColor: '#FFFFFF',
    title: '右键菜单管理',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  win.loadFile(path.join(__dirname, 'renderer', 'index.html'))
    .then(() => dbg('loadFile ok'))
    .catch((err) => dbg('loadFile failed: ' + (err && err.message)));

  win.webContents.on('did-fail-load', (_e, code, desc, url) => dbg(`did-fail-load ${code} ${desc} ${url}`));
  win.webContents.on('render-process-gone', (_e, details) => dbg('render-process-gone ' + JSON.stringify(details)));
  win.webContents.on('console-message', (...args) => {
    const d = args[1];
    const msg = typeof d === 'object' && d && d.message ? d.message : args[2];
    dbg('renderer: ' + msg);
  });
  win.once('ready-to-show', () => win.show());
  win.on('closed', () => { win = null; });

  const shotArg = process.argv.find((a) => a.startsWith('--shot='));
  if (shotArg) {
    win.webContents.once('did-finish-load', async () => {
      const waitArg = process.argv.find((a) => a.startsWith('--wait='));
      const initialWait = waitArg ? Number(waitArg.slice('--wait='.length)) || 4000 : 4000;
      await new Promise((r) => setTimeout(r, initialWait));
      const execs = process.argv.filter((a) => a.startsWith('--exec='));
      for (const raw of execs) {
        const code = raw.slice('--exec='.length);
        try {
          await win.webContents.executeJavaScript(code, true);
          await new Promise((r) => setTimeout(r, 900));
        } catch (err) {
          console.error('exec failed', code, err);
        }
      }
      try {
        const img = await win.webContents.capturePage();
        fs.writeFileSync(shotArg.slice('--shot='.length), img.toPNG());
      } catch (err) {
        console.error('capture failed', err);
      }
      app.quit();
    });
  }
}

app.whenReady().then(() => {
  dbg('whenReady');
  store.init(app.getPath('userData'));
  dbg('store ready at ' + app.getPath('userData'));
  createWindow();
  dbg('window created');
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
}).catch((err) => dbg('whenReady failed: ' + (err && err.stack)));

app.on('window-all-closed', () => {
  dbg('window-all-closed');
  app.quit();
});
app.on('quit', () => dbg('quit'));

// ---------- icons ----------
async function iconFor(filePath) {
  if (!filePath) return null;
  const key = String(filePath).toLowerCase();
  if (iconCache.has(key)) return iconCache.get(key);
  let url = null;
  try {
    if (fs.existsSync(filePath)) {
      const img = await app.getFileIcon(filePath, { size: 'normal' });
      if (img && !img.isEmpty()) url = img.toDataURL();
    }
  } catch (_) { }
  iconCache.set(key, url);
  return url;
}

async function attachIcons(items) {
  const seen = new Map();
  for (const item of items) {
    const p = item.iconPath || item.target;
    if (!p) continue;
    const key = String(p).toLowerCase();
    if (!seen.has(key)) seen.set(key, await iconFor(p));
    item.iconData = seen.get(key);
  }
}

function stamp() {
  return new Date().toISOString().replace(/[:.]/g, '-');
}

// ---------- ipc ----------
ipcMain.handle('scan', async () => {
  if (scanning) return { ok: false, error: '正在扫描中，请稍候。' };
  scanning = true;
  try {
    const res = await reg.scan(app.getPath('userData'));
    if (!res.ok) return res;
    const data = res.data;
    data.pages = data.pages || {};
    for (const key of ['file', 'desktop', 'new']) {
      if (!Array.isArray(data.pages[key])) data.pages[key] = [];
    }

    // re-attach entries we removed by hand (ShellNew has no hide flag)
    const hidden = store.hiddenShellNew();
    for (const ext of Object.keys(hidden)) {
      const rec = hidden[ext];
      if (!rec) continue;
      if (data.pages.new.some((i) => i.ext === ext)) continue;
      data.pages.new.push({
        id: rec.id,
        page: 'new',
        kind: 'shellnew',
        name: rec.name,
        keyName: rec.keyName || ext,
        regPath: rec.regPath,
        clsid: null,
        command: rec.command || null,
        target: rec.target || null,
        iconPath: rec.iconPath || null,
        enabled: false,
        extended: false,
        origin: 'both',
        source: 'shellnew',
        vendor: null,
        ext,
        backup: rec.backup,
        detached: true
      });
    }

    await attachIcons([...data.pages.file, ...data.pages.desktop, ...data.pages.new]);
    data.history = store.history().slice(0, 30);
    return { ok: true, data };
  } catch (err) {
    return { ok: false, error: String(err && err.message) };
  } finally {
    scanning = false;
  }
});

ipcMain.handle('toggle', async (_e, { item, enable }) => {
  if (!item || !item.kind) return { ok: false, error: '参数错误。' };
  try {
    const res = await reg.setEnabled(item, enable, store.backupDir, stamp());
    if (!res.ok) {
      store.log({ action: 'toggle', id: item.id, name: item.name, ok: false, error: res.error });
      return res;
    }

    if (item.kind === 'shellnew') {
      if (enable) {
        store.forgetHiddenNew(item.ext);
      } else if (res.backup) {
        store.rememberHiddenNew(item.ext, {
          id: item.id,
          name: item.name,
          keyName: item.keyName,
          regPath: item.regPath,
          command: item.command,
          target: item.target,
          iconPath: item.iconPath,
          backup: res.backup,
          at: new Date().toISOString()
        });
      }
    }

    store.log({ action: 'toggle', id: item.id, name: item.name, enable, ok: true });
    return { ok: true, enabled: enable };
  } catch (err) {
    return { ok: false, error: String(err && err.message) };
  }
});

ipcMain.handle('openKey', async (_e, regPath) => {
  if (!regPath) return { ok: false };
  return reg.openRegedit(regPath);
});

ipcMain.handle('openPath', async (_e, filePath) => {
  if (!filePath) return { ok: false, error: '没有关联的文件路径。' };
  if (!fs.existsSync(filePath)) return { ok: false, error: '文件已不存在。' };
  shell.showItemInFolder(filePath);
  return { ok: true };
});

ipcMain.handle('restartExplorer', async () => reg.restartExplorer());

ipcMain.handle('openBackups', async () => {
  shell.openPath(store.backupDir);
  return { ok: true };
});

ipcMain.handle('history', async () => ({ ok: true, data: store.history().slice(0, 60) }));

ipcMain.handle('elevate', async () => {
  // In portable builds process.execPath points at the temp extraction dir,
  // so relaunch the original exe the user double-clicked.
  const portable = process.env.PORTABLE_EXECUTABLE_FILE;
  const exe = portable || process.execPath;
  const appPath = app.getAppPath();
  const needsAppArg = !portable && process.defaultApp;
  const argList = needsAppArg ? ` -ArgumentList '"${appPath}"'` : '';
  const cmd = `Start-Process -FilePath "${exe}"${argList} -Verb RunAs`;
  const res = await reg.run('powershell.exe', ['-NoProfile', '-Command', cmd]);
  if (res.code === 0) {
    setTimeout(() => app.quit(), 400);
    return { ok: true };
  }
  return { ok: false, error: '提权请求被取消或失败。' };
});

ipcMain.on('win:minimize', () => { if (win) win.minimize(); });
ipcMain.on('win:close', () => { if (win) win.close(); });
