'use strict';

/* Demo data — used when the page runs outside Electron (browser preview).
   The real app pulls the same shape from scripts/scan.ps1. */

window.DEMO_DATA = {
  build: '26300',
  isAdmin: false,
  scannedAt: new Date().toISOString(),
  pages: {
    file: [
      { id: 'verb:1', kind: 'verb', page: 'file', name: '使用 Microsoft 画图进行编辑', keyName: 'Paint', regPath: 'HKEY_CLASSES_ROOT\\*\\shell\\Paint', clsid: null, command: '"C:\\Program Files\\Paint\\mspaint.exe" "%1"', target: 'C:\\Windows\\System32\\mspaint.exe', enabled: true, extended: false, origin: 'win10', source: 'shell-verb', vendor: 'Microsoft Corporation', iconPath: null },
      { id: 'verb:2', kind: 'verb', page: 'file', name: '通过 TRAE 打开', keyName: 'Trae CN', regPath: 'HKEY_CLASSES_ROOT\\*\\shell\\Trae CN', clsid: null, command: '"C:\\Program Files\\Trae\\Trae.exe" "%1"', target: null, enabled: false, extended: false, origin: 'win10', source: 'shell-verb', vendor: 'Trae', iconPath: null },
      { id: 'verb:3', kind: 'verb', page: 'file', name: '添加到压缩文件', keyName: 'WinRAR', regPath: 'HKEY_CLASSES_ROOT\\*\\shell\\WinRAR', clsid: null, command: '"C:\\Program Files\\WinRAR\\WinRAR.exe" a "%1"', target: null, enabled: true, extended: false, origin: 'win10', source: 'shell-verb', vendor: 'win.rar GmbH', iconPath: null },
      { id: 'hnd:1', kind: 'handler', page: 'file', name: 'Microsoft OneDrive Shell Extension', keyName: 'FileSyncEx', regPath: 'HKEY_CLASSES_ROOT\\*\\shellex\\ContextMenuHandlers\\FileSyncEx', clsid: '{CB3D0F55-BC2C-4C1A-85ED-23ED75B5106B}', command: null, target: 'C:\\Program Files\\Microsoft OneDrive\\FileSyncShell64.dll', enabled: true, extended: false, origin: 'win10', source: 'shellex', vendor: 'Microsoft Corporation', iconPath: null },
      { id: 'hnd:2', kind: 'handler', page: 'file', name: 'KWPS Shellext', keyName: 'Open With kwpsshellext', regPath: 'HKEY_CLASSES_ROOT\\*\\shellex\\ContextMenuHandlers\\Open With kwpsshellext', clsid: '{8C1B7B5F-2F51-4E9C-9A2B-0A1C6C1D9E44}', command: null, target: 'C:\\Program Files\\WPS Office\\11.1.0\\office6\\kwpsshellext64.dll', enabled: true, extended: false, origin: 'win10', source: 'shellex', vendor: '珠海金山办公软件有限公司', iconPath: null },
      { id: 'hnd:3', kind: 'handler', page: 'file', name: 'Windows Shell 公用 DLL', keyName: 'Sharing', regPath: 'HKEY_CLASSES_ROOT\\*\\shellex\\ContextMenuHandlers\\Sharing', clsid: '{E61BF828-5E63-4287-BEF1-60B1A4FDE0E3}', command: null, target: 'C:\\Windows\\System32\\shell32.dll', enabled: true, extended: false, origin: 'win10', source: 'shellex', vendor: 'Microsoft Windows', iconPath: null },
      { id: 'hnd:4', kind: 'handler', page: 'file', name: 'qingbangong shellext64', keyName: 'Open With qingshellext', regPath: 'HKEY_CLASSES_ROOT\\*\\shellex\\ContextMenuHandlers\\Open With qingshellext', clsid: '{90AA3A4E-1CBA-4233-B8BB-535773D48449}', command: null, target: 'C:\\Program Files\\Qing\\qshellext64.dll', enabled: false, extended: false, origin: 'win10', source: 'shellex', vendor: '青藤云安全', iconPath: null },
      { id: 'pkg:1', kind: 'packaged', page: 'file', name: 'Paint', keyName: 'EditInPaint', regPath: 'HKEY_CLASSES_ROOT\\PackagedCom\\ClassIndex\\{A3B7F0E0-1111-4A2B-9C3D-5E6F7A8B9C01}', clsid: '{A3B7F0E0-1111-4A2B-9C3D-5E6F7A8B9C01}', command: null, target: 'C:\\Program Files\\WindowsApps\\Microsoft.Paint\\PaintApp\\ExplorerCommand.dll', enabled: true, extended: false, origin: 'win11', source: 'manifest', vendor: 'Microsoft Paint', package: 'Microsoft.Paint_11.2605.81.0_x64__8wekyb3d8bbwe', iconPath: null },
      { id: 'pkg:2', kind: 'packaged', page: 'file', name: 'Open In Notepad', keyName: 'OpenInNotepad', regPath: 'HKEY_CLASSES_ROOT\\PackagedCom\\ClassIndex\\{B4C8E1F2-2222-4B3C-8D4E-6F7A8B9C0D12}', clsid: '{B4C8E1F2-2222-4B3C-8D4E-6F7A8B9C0D12}', command: null, target: 'C:\\Program Files\\WindowsApps\\Microsoft.WindowsNotepad\\Notepad\\ExplorerCommand.dll', enabled: true, extended: false, origin: 'win11', source: 'manifest', vendor: 'Microsoft Notepad', package: 'Microsoft.WindowsNotepad_11.2607.14.0_x64__8wekyb3d8bbwe', iconPath: null },
      { id: 'pkg:3', kind: 'packaged', page: 'file', name: 'Image File', keyName: 'imageFile', regPath: 'HKEY_CLASSES_ROOT\\PackagedCom\\ClassIndex\\{C5D9F203-3333-4C4D-9E5F-7A8B9C0D1E23}', clsid: '{C5D9F203-3333-4C4D-9E5F-7A8B9C0D1E23}', command: null, target: null, enabled: false, extended: false, origin: 'win11', source: 'manifest', vendor: 'PDFShellExt', package: 'wpsappext2_1.0.0.2_neutral__km9wtz8rh8me0', iconPath: null }
    ],
    desktop: [
      { id: 'verb:d1', kind: 'verb', page: 'desktop', name: '在终端中打开', keyName: 'Open TerminalHere', regPath: 'HKEY_CLASSES_ROOT\\Directory\\Background\\shell\\Open TerminalHere', clsid: null, command: 'wt.exe -d "%V"', target: 'C:\\Users\\Administrator\\AppData\\Local\\Microsoft\\WindowsApps\\wt.exe', enabled: true, extended: false, origin: 'win10', source: 'shell-verb', vendor: 'Microsoft Corporation', iconPath: null },
      { id: 'verb:d2', kind: 'verb', page: 'desktop', name: 'cmd', keyName: 'cmd', regPath: 'HKEY_CLASSES_ROOT\\Directory\\Background\\shell\\cmd', clsid: null, command: 'cmd.exe /s /k pushd "%V"', target: 'C:\\Windows\\System32\\cmd.exe', enabled: true, extended: false, origin: 'win10', source: 'shell-verb', vendor: 'Microsoft Windows', iconPath: null },
      { id: 'verb:d3', kind: 'verb', page: 'desktop', name: 'Powershell', keyName: 'Powershell', regPath: 'HKEY_CLASSES_ROOT\\Directory\\Background\\shell\\Powershell', clsid: null, command: 'powershell.exe -noexit -command Set-Location -literalPath \'%V\'', target: 'C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe', enabled: true, extended: false, origin: 'win10', source: 'shell-verb', vendor: 'Microsoft Windows', iconPath: null },
      { id: 'verb:d4', kind: 'verb', page: 'desktop', name: '用 WorkBuddy 打开', keyName: 'WorkBuddy', regPath: 'HKEY_CLASSES_ROOT\\Directory\\Background\\shell\\WorkBuddy', clsid: null, command: '"C:\\Program Files\\WorkBuddy\\WorkBuddy.exe" "%V"', target: null, enabled: true, extended: false, origin: 'win10', source: 'shell-verb', vendor: 'WorkBuddy', iconPath: null },
      { id: 'hnd:d1', kind: 'handler', page: 'desktop', name: 'NVIDIA Display Shell Extension', keyName: 'NvCplDesktopContext', regPath: 'HKEY_CLASSES_ROOT\\Directory\\Background\\shellex\\ContextMenuHandlers\\NvCplDesktopContext', clsid: '{3D1975AF-48C6-4F8A-B2E1-8D2B0D5F1E7A}', command: null, target: 'C:\\Windows\\System32\\nvshell.dll', enabled: true, extended: false, origin: 'win10', source: 'shellex', vendor: 'NVIDIA Corporation', iconPath: null },
      { id: 'hnd:d2', kind: 'handler', page: 'desktop', name: 'wpsdesktop shellext', keyName: 'wpsdesktop shellext', regPath: 'HKEY_CLASSES_ROOT\\Directory\\Background\\shellex\\ContextMenuHandlers\\wpsdesktop shellext', clsid: '{9F2E1A44-3C77-4B1A-8E2C-77D1A2B3C4D5}', command: null, target: 'C:\\Program Files\\WPS Office\\11.1.0\\office6\\wpsdesktop.dll', enabled: true, extended: false, origin: 'win10', source: 'shellex', vendor: '珠海金山办公软件有限公司', iconPath: null },
      { id: 'pkg:d1', kind: 'packaged', page: 'desktop', name: 'Windows Terminal Open Here Shell Extension', keyName: 'OpenTerminalHere', regPath: 'HKEY_CLASSES_ROOT\\PackagedCom\\ClassIndex\\{D6E0A314-4444-4D5E-AF60-8B9C0D1E2F34}', clsid: '{D6E0A314-4444-4D5E-AF60-8B9C0D1E2F34}', command: null, target: 'C:\\Program Files\\WindowsApps\\Microsoft.WindowsTerminal\\Terminal\\ExplorerCommand.dll', enabled: true, extended: false, origin: 'win11', source: 'manifest', vendor: 'Microsoft Windows Terminal', package: 'Microsoft.WindowsTerminal_1.24.11911.0_x64__8wekyb3d8bbwe', iconPath: null }
    ],
    new: [
      { id: 'new:1', kind: 'shellnew', page: 'new', name: '快捷方式', keyName: '.lnk', regPath: 'HKEY_CLASSES_ROOT\\.lnk\\ShellNew', clsid: null, command: null, target: null, enabled: true, extended: false, origin: 'both', source: 'shellnew', vendor: null, ext: '.lnk', iconPath: null },
      { id: 'new:2', kind: 'shellnew', page: 'new', name: '文本文档', keyName: '.txt', regPath: 'HKEY_CLASSES_ROOT\\.txt\\ShellNew', clsid: null, command: null, target: 'C:\\Windows\\System32\\notepad.exe', enabled: true, extended: false, origin: 'both', source: 'shellnew', vendor: null, ext: '.txt', iconPath: null },
      { id: 'new:3', kind: 'shellnew', page: 'new', name: '库文件夹', keyName: '.library-ms', regPath: 'HKEY_CLASSES_ROOT\\.library-ms\\ShellNew', clsid: null, command: null, target: null, enabled: false, extended: false, origin: 'both', source: 'shellnew', vendor: null, ext: '.library-ms', iconPath: null }
    ]
  }
};

window.makeDemoApi = function () {
  const data = JSON.parse(JSON.stringify(window.DEMO_DATA));
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  return {
    demo: true,
    async scan() {
      await sleep(280);
      return { ok: true, data };
    },
    async toggle(item, enable) {
      await sleep(180);
      const all = [...data.pages.file, ...data.pages.desktop, ...data.pages.new];
      const found = all.find((x) => x.id === item.id);
      if (found) found.enabled = enable;
      return { ok: true, enabled: enable };
    },
    async openKey() { return { ok: true }; },
    async openPath() { return { ok: true, error: '预览模式下不可用' }; },
    async restartExplorer() { return { ok: true }; },
    async openBackups() { return { ok: true }; },
    async history() { return { ok: true, data: [] }; },
    async elevate() { return { ok: false, error: '预览模式' }; },
    minimize() { },
    close() { }
  };
};
