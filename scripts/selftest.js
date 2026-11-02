'use strict';

/* Self test for the registry write path.
   Runs entirely against a throwaway key under HKCU — it never touches a real context menu entry. */

const reg = require('../src/registry');
const os = require('os');
const fs = require('fs');
const path = require('path');

const KEY = 'HKEY_CURRENT_USER\\Software\\CtxMenuMgrSelfTest';
const SUB = KEY + '\\ShellNew';
const backupDir = path.join(os.tmpdir(), 'ctxmenu-selftest');
fs.mkdirSync(backupDir, { recursive: true });

let pass = 0;
let fail = 0;

function check(label, ok, extra) {
  if (ok) { pass++; console.log(`  PASS  ${label}`); }
  else { fail++; console.log(`  FAIL  ${label}${extra ? '  -> ' + extra : ''}`); }
}

async function snap(key) {
  const r = await reg.call('snapshot', { path: key });
  return r;
}

function hasValue(snapshot, name) {
  if (!snapshot || !snapshot.ok) return false;
  return (snapshot.payload.values || []).some((v) => v.name === name);
}

(async () => {
  console.log('registry write path self-test');
  console.log('  target:', KEY, '\n');

  await reg.call('deletekey', { path: KEY });
  await reg.call('set', { path: KEY, name: 'Marker', data: 'x', kind: 'String' });
  await reg.call('set', { path: SUB, name: 'NullFile', data: '', kind: 'String' });
  check('scratch keys created', (await snap(KEY)).ok && (await snap(SUB)).ok);

  // 1. verb-style hide / show
  const verbItem = { kind: 'verb', regPath: KEY, keyName: 'selftest', name: 'selftest' };
  let r = await reg.setEnabled(verbItem, false, backupDir, 'T1');
  check('hide verb writes LegacyDisable', r.ok && hasValue(await snap(KEY), 'LegacyDisable'), r.error);

  r = await reg.setEnabled(verbItem, true, backupDir, 'T1');
  check('show verb removes LegacyDisable', r.ok && !hasValue(await snap(KEY), 'LegacyDisable'), r.error);

  // 2. shellnew-style hide (snapshot + detach)
  const newItem = { kind: 'shellnew', regPath: SUB, keyName: '.selftest', name: 'selftest new', ext: '.selftest' };
  r = await reg.setEnabled(newItem, false, backupDir, 'T2');
  const backupFile = r.backup;
  check('shellnew hide writes a json backup', !!backupFile && fs.existsSync(backupFile), r.error);
  check('shellnew hide removes the key', !(await snap(SUB)).ok, r.error);

  // 3. restore from backup
  newItem.backup = backupFile;
  r = await reg.setEnabled(newItem, true, backupDir, 'T2');
  check('shellnew restore re-creates the key', r.ok && (await snap(SUB)).ok, r.error);
  check('restored key keeps NullFile value', hasValue(await snap(SUB), 'NullFile'), '');

  // 4. error handling on a missing key
  r = await reg.setEnabled({ kind: 'shellnew', regPath: KEY + '\\__missing__', keyName: 'x', name: 'x' }, false, backupDir, 'T3');
  check('missing key returns a friendly error', r.ok === false && typeof r.error === 'string', JSON.stringify(r));

  // 5. unknown clsid path returns a structured result instead of throwing
  r = await reg.setEnabled({ kind: 'handler', clsid: null, regPath: KEY, name: 'x' }, true, backupDir, 'T4');
  check('handler without clsid is rejected', r.ok === false, JSON.stringify(r));

  await reg.call('deletekey', { path: KEY });
  check('temp key cleaned up', !(await snap(KEY)).ok);

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
