'use strict';

const fs = require('fs');
const path = require('path');

let stateFile = null;
let backupDir = null;
let cache = null;

function init(userDataDir) {
  const dir = path.join(userDataDir, 'data');
  fs.mkdirSync(dir, { recursive: true });
  stateFile = path.join(dir, 'state.json');
  backupDir = path.join(dir, 'backups');
  fs.mkdirSync(backupDir, { recursive: true });
  load();
}

function load() {
  try {
    cache = JSON.parse(fs.readFileSync(stateFile, 'utf8'));
  } catch (_) {
    cache = null;
  }
  if (!cache || typeof cache !== 'object') cache = {};
  if (!cache.shellNewHidden) cache.shellNewHidden = {};
  if (!Array.isArray(cache.history)) cache.history = [];
}

function save() {
  try {
    fs.writeFileSync(stateFile, JSON.stringify(cache, null, 2), 'utf8');
  } catch (_) { }
}

function hiddenShellNew() {
  return cache.shellNewHidden;
}

function rememberHiddenNew(ext, payload) {
  cache.shellNewHidden[ext] = payload;
  save();
}

function forgetHiddenNew(ext) {
  delete cache.shellNewHidden[ext];
  save();
}

function log(entry) {
  cache.history.unshift({ at: new Date().toISOString(), ...entry });
  cache.history = cache.history.slice(0, 200);
  save();
}

function history() {
  return cache.history;
}

module.exports = {
  init, hiddenShellNew, rememberHiddenNew, forgetHiddenNew,
  log, history,
  get backupDir() { return backupDir; },
  get stateFile() { return stateFile; }
};
