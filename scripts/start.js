'use strict';

/* Launcher: some shells export ELECTRON_RUN_AS_NODE, which turns Electron into plain Node
   and breaks `require('electron')`. Clear it before spawning the real runtime. */

const { spawn } = require('child_process');
const path = require('path');
const electronPath = require('electron');

const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;

const child = spawn(electronPath, [path.join(__dirname, '..')], {
  stdio: 'inherit',
  env
});

child.on('close', (code) => process.exit(code === null ? 0 : code));
