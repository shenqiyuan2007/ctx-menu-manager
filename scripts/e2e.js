'use strict';

/* End-to-end round trip: create a real (per-user) shell verb, let the scanner find it,
   hide it, verify the scanner reads it back as disabled, then restore and clean up.
   Nothing that belongs to the system or to installed software is touched. */

const reg = require('../src/registry');
const os = require('os');
const fs = require('fs');
const path = require('path');

const ROOT = 'HKEY_CURRENT_USER\\Software\\Classes\\*\\shell\\__CtxMenuSelfTest__';
const CMD = ROOT + '\\command';
const LABEL = 'CtxMenu 自检项';
const cacheDir = path.join(os.tmpdir(), 'ctxmenu-e2e-cache');
const backupDir = path.join(os.tmpdir(), 'ctxmenu-e2e');
fs.mkdirSync(cacheDir, { recursive: true });
fs.mkdirSync(backupDir, { recursive: true });

let failed = 0;
function check(label, ok, extra) {
  if (!ok) failed++;
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}${!ok && extra ? '  -> ' + extra : ''}`);
}

async function findItem() {
  const res = await reg.scan(cacheDir);
  if (!res.ok) throw new Error(res.error);
  return [...res.data.pages.file, ...res.data.pages.desktop]
    .find((i) => i.keyName === '__CtxMenuSelfTest__');
}

(async () => {
  console.log('end-to-end toggle test (per-user shell verb)\n');
  await reg.call('deletekey', { path: ROOT });
  await reg.call('set', { path: ROOT, name: '', data: LABEL, kind: 'String' });
  await reg.call('set', { path: CMD, name: '', data: 'notepad.exe', kind: 'String' });

  let item = await findItem();
  check('scanner finds the created verb', !!item, 'not listed');
  if (!item) { await reg.call('deletekey', { path: ROOT }); process.exit(1); }

  console.log(`  found: ${item.name}  enabled=${item.enabled}`);
  check('starts as enabled', item.enabled === true);

  const stamp = new Date().toISOString().replace(/[:.]/g, '-');

  let r = await reg.setEnabled(item, false, backupDir, stamp);
  check('disable returns ok', r.ok, r.error);
  let after = await findItem();
  check('scanner reads it back as disabled', !!(after && after.enabled === false));

  r = await reg.setEnabled({ ...item, enabled: false }, true, backupDir, stamp);
  check('enable returns ok', r.ok, r.error);
  after = await findItem();
  check('scanner reads it back as enabled', !!(after && after.enabled === true));

  await reg.call('deletekey', { path: ROOT });
  check('test verb removed', !(await findItem()));

  console.log(failed ? '\n1 check failed' : '\nall checks passed');
  process.exit(failed ? 1 : 0);
})();
