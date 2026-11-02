'use strict';

const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');

const SCAN_PS1 = path.join(__dirname, '..', 'scripts', 'scan.ps1');
const WRITE_PS1 = path.join(__dirname, '..', 'scripts', 'regwrite.ps1');

const BLOCKED_KEY = 'HKEY_LOCAL_MACHINE\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Shell Extensions\\Blocked';

const PS_BASE = ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass'];

function run(file, args, timeout = 30000) {
  return new Promise((resolve) => {
    let child;
    try {
      child = spawn(file, args, { windowsHide: true });
    } catch (err) {
      resolve({ code: -1, stdout: '', stderr: String(err && err.message) });
      return;
    }
    let stdout = '';
    let stderr = '';
    const timer = setTimeout(() => {
      try { child.kill(); } catch (_) { }
      resolve({ code: -1, stdout, stderr: stderr + '\n[timeout]' });
    }, timeout);

    child.stdout.on('data', (d) => { stdout += d.toString('utf8'); });
    child.stderr.on('data', (d) => { stderr += d.toString('utf8'); });
    child.on('error', (err) => {
      clearTimeout(timer);
      resolve({ code: -1, stdout, stderr: stderr + String(err && err.message) });
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      resolve({ code, stdout, stderr });
    });
  });
}

function tmpFile(tag) {
  return path.join(os.tmpdir(), `ctxmenu-${tag}-${process.pid}-${Date.now()}-${Math.floor(Math.random() * 1e4)}.json`);
}

function explain(res) {
  if (res.code === 'denied') return '没有权限修改。请以管理员身份重启本工具后再试。';
  return res.error || '操作失败。';
}

function fail(res) {
  return { ok: false, error: explain(res), needsAdmin: res.code === 'denied' };
}

/* ---------------- registry write bridge ---------------- */

async function call(action, opts) {
  const out = tmpFile(action);
  const args = [...PS_BASE, '-File', WRITE_PS1, '-Action', action, '-Path', opts.path, '-OutFile', out];
  if (opts.name !== undefined) args.push('-Name', String(opts.name));
  if (opts.data !== undefined) args.push('-Data', String(opts.data));
  if (opts.kind) args.push('-Kind', opts.kind);
  if (opts.file) args.push('-File', opts.file);

  const res = await run('powershell.exe', args, 20000);
  try {
    const raw = fs.readFileSync(out, 'utf8').replace(/^\uFEFF/, '');
    return JSON.parse(raw);
  } catch (_) {
    const detail = (res.stderr || '').trim().split(/\r?\n/).pop() || `exit ${res.code}`;
    return { ok: false, code: 'failed', error: `注册表操作没有返回结果（${detail}）` };
  } finally {
    try { fs.unlinkSync(out); } catch (_) { }
  }
}

async function psCommand(script) {
  const res = await run('powershell.exe', [...PS_BASE, '-Command', script], 20000);
  return res;
}

/* ---------------- scan ---------------- */

async function scan(cacheDir) {
  const out = tmpFile('scan');
  try {
    const res = await run('powershell.exe', [
      ...PS_BASE, '-File', SCAN_PS1, '-OutFile', out, '-CacheDir', cacheDir
    ], 60000);

    if (!fs.existsSync(out)) {
      const detail = (res.stderr || '').trim().split(/\r?\n/).pop() || `exit ${res.code}`;
      return { ok: false, error: `读取注册表失败：${detail}` };
    }
    const raw = fs.readFileSync(out, 'utf8').replace(/^\uFEFF/, '');
    return { ok: true, data: JSON.parse(raw) };
  } catch (err) {
    return { ok: false, error: String(err && err.message) };
  } finally {
    try { fs.unlinkSync(out); } catch (_) { }
  }
}

/* ---------------- toggle ---------------- */

function safeName(item) {
  return String(item.keyName || item.id || 'item').replace(/[^\w.-]/g, '_').slice(0, 48);
}

async function setEnabled(item, enable, backupDir, stamp) {
  if (item.kind === 'verb') {
    if (enable) {
      const r = await call('delvalue', { path: item.regPath, name: 'LegacyDisable' });
      return r.ok ? { ok: true } : fail(r);
    }
    const r = await call('set', { path: item.regPath, name: 'LegacyDisable', data: '', kind: 'String' });
    return r.ok ? { ok: true } : fail(r);
  }

  if (item.kind === 'handler' || item.kind === 'packaged') {
    if (!item.clsid) return { ok: false, error: '该项目没有关联的 CLSID，无法切换。' };
    if (enable) {
      const r = await call('delvalue', { path: BLOCKED_KEY, name: item.clsid });
      return r.ok ? { ok: true } : fail(r);
    }
    const r = await call('set', { path: BLOCKED_KEY, name: item.clsid, data: '', kind: 'String' });
    return r.ok ? { ok: true } : fail(r);
  }

  if (item.kind === 'shellnew') {
    if (enable) {
      if (!item.backup || !fs.existsSync(item.backup)) {
        return { ok: false, error: '找不到该项目的备份文件，无法还原。' };
      }
      const r = await call('restore', { path: item.regPath, file: item.backup });
      return r.ok ? { ok: true } : fail(r);
    }
    const snap = await call('snapshot', { path: item.regPath });
    if (!snap.ok) return fail(snap);

    const file = path.join(backupDir, `${stamp}-${safeName(item)}.json`);
    try {
      fs.writeFileSync(file, JSON.stringify(snap.payload, null, 2), 'utf8');
    } catch (err) {
      return { ok: false, error: `写备份文件失败：${err.message}` };
    }

    const del = await call('deletekey', { path: item.regPath });
    if (!del.ok) return fail(del);
    return { ok: true, backup: file };
  }

  return { ok: false, error: '未知的项目类型。' };
}

/* ---------------- system helpers ---------------- */

async function restartExplorer() {
  await psCommand("Stop-Process -Name explorer -Force -ErrorAction SilentlyContinue; Start-Sleep -Milliseconds 1200; Start-Process explorer.exe");
  return { ok: true };
}

async function openRegedit(regPath) {
  const lastKey = `Computer\\${regPath}`;
  await call('set', {
    path: 'HKEY_CURRENT_USER\\Software\\Microsoft\\Windows\\CurrentVersion\\Applets\\Regedit',
    name: 'LastKey',
    data: lastKey,
    kind: 'String'
  });
  await psCommand("Stop-Process -Name regedit -Force -ErrorAction SilentlyContinue; Start-Sleep -Milliseconds 300; Start-Process regedit.exe");
  return { ok: true };
}

module.exports = {
  scan, setEnabled, restartExplorer, openRegedit, run, psCommand, call,
  BLOCKED_KEY
};
