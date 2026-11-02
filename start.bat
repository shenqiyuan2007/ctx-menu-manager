@echo off
setlocal
cd /d "%~dp0"

if not exist "node_modules\electron\dist\electron.exe" (
  echo Electron runtime not found.
  echo Run "npm install" in this folder first.
  pause
  exit /b 1
)

if not exist "package.json" (
  echo package.json not found next to this script.
  pause
  exit /b 1
)

rem clear this, otherwise electron degrades into plain node
set ELECTRON_RUN_AS_NODE=

rem "." is intentional: %~dp0 already ends with a backslash, and "%~dp0" would
rem escape the closing quote and hand electron a path with a stray quote in it.
start "" "node_modules\electron\dist\electron.exe" .
