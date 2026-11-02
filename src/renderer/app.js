'use strict';

(function () {
  const api = window.api || window.makeDemoApi();
  const isDemo = !window.api;

  const TAB_META = {
    file: { scope: '文件右键菜单', short: '文件右键' },
    desktop: { scope: '桌面右键菜单', short: '桌面右键' },
    new: { scope: '新建菜单', short: '新建菜单' }
  };

  const TYPE_OPTIONS = [
    { key: 'all', label: '全部' },
    { key: 'win11', label: 'Win11 一级菜单' },
    { key: 'win10', label: 'Win10 经典菜单' }
  ];

  const STATUS_OPTIONS = [
    { key: 'all', label: '全部' },
    { key: 'on', label: '已开启' },
    { key: 'off', label: '未开启' }
  ];

  const state = {
    tab: 'file',
    data: null,
    loading: true,
    error: null,
    admin: true,
    openId: null,
    filters: {
      file: { type: 'all', status: 'all' },
      desktop: { type: 'all', status: 'all' },
      new: { status: 'all' }
    }
  };

  const $ = (sel, root) => (root || document).querySelector(sel);
  const collator = new Intl.Collator('zh-Hans-CN', { sensitivity: 'base' });

  const rowsEl = $('#rows');
  const drawerEl = $('#drawer');
  const scrimEl = $('#scrim');
  const popEl = $('#popover');

  boot();

  function boot() {
    $('#osBadge').textContent = '检测中…';
    bindChrome();
    bindTabs();
    bindFilters();
    bindFooter();
    bindDrawer();
    if (isDemo) $('#osBadge').textContent = '预览模式';
    refresh();
  }

  /* ---------------- data ---------------- */

  async function refresh() {
    state.loading = true;
    state.error = null;
    render();
    let res;
    try {
      res = await api.scan();
    } catch (err) {
      res = { ok: false, error: String(err && err.message) };
    }
    state.loading = false;
    if (!res || !res.ok) {
      state.error = (res && res.error) || '读取注册表失败。';
      render();
      return;
    }
    state.data = res.data;
    state.admin = !!res.data.isAdmin;
    if (res.data.build) $('#osBadge').textContent = `Windows 11 · ${res.data.build}`;
    $('#warnbar').hidden = state.admin;
    render();
  }

  function currentItems() {
    if (!state.data) return [];
    return state.data.pages[state.tab] || [];
  }

  function matches(item) {
    const f = state.filters[state.tab];
    if (state.tab !== 'new' && f.type !== 'all') {
      if (f.type === 'win11' && item.origin !== 'win11') return false;
      if (f.type === 'win10' && item.origin === 'win11') return false;
    }
    if (f.status === 'on' && !item.enabled) return false;
    if (f.status === 'off' && item.enabled) return false;
    return true;
  }

  function visibleItems() {
    return currentItems()
      .filter(matches)
      .slice()
      .sort((a, b) => {
        if (a.origin !== b.origin) return a.origin === 'win11' ? -1 : 1;
        return collator.compare(a.name || '', b.name || '');
      });
  }

  /* ---------------- render ---------------- */

  function render() {
    renderHero();
    renderParity();
    renderRows();
    renderStatus();
    syncFunnels();
  }

  function renderHero() {
    const items = currentItems();
    const on = items.filter((i) => i.enabled).length;
    $('#heroCount').textContent = state.loading && !state.data ? '—' : String(on);
    $('#heroScope').textContent = TAB_META[state.tab].scope;
    $('#sbScope').textContent = TAB_META[state.tab].short;
  }

  function renderParity() {
    const note = $('#parityNote');
    if (state.loading && !state.data) {
      note.textContent = '';
      return;
    }
    if (state.tab === 'new') {
      note.textContent = '新建菜单不区分系统版本';
      return;
    }
    const items = currentItems();
    const w11 = items.filter((i) => i.origin === 'win11').length;
    const w10 = items.length - w11;
    note.textContent = `Win11 一级 ${w11} 项 · 经典 ${w10} 项`;
  }

  function renderStatus() {
    if (state.loading && !state.data) {
      $('#sbCount').textContent = '正在读取…';
      return;
    }
    const items = currentItems();
    const on = items.filter((i) => i.enabled).length;
    $('#sbCount').textContent = `共 ${items.length} 项 · 已开启 ${on}`;
  }

  function renderRows() {
    rowsEl.textContent = '';

    if (state.loading && !state.data) {
      rowsEl.appendChild(placeholder('正在读取注册表…', true));
      return;
    }

    if (state.error) {
      const box = placeholder(state.error, false, '读取失败');
      const retry = document.createElement('button');
      retry.className = 'btn';
      retry.textContent = '重试';
      retry.style.marginTop = '10px';
      retry.addEventListener('click', refresh);
      box.appendChild(retry);
      rowsEl.appendChild(box);
      return;
    }

    const list = visibleItems();
    if (!list.length) {
      const f = state.filters[state.tab];
      const filtered = f.status !== 'all' || (state.tab !== 'new' && f.type !== 'all');
      rowsEl.appendChild(placeholder(filtered ? '没有符合筛选条件的菜单项' : '这个位置还没有菜单项', false));
      return;
    }

    const frag = document.createDocumentFragment();
    for (const item of list) frag.appendChild(buildRow(item));
    rowsEl.appendChild(frag);
  }

  function buildRow(item) {
    const row = document.createElement('div');
    row.className = 'row' + (state.openId === item.id ? ' is-open' : '');
    row.dataset.id = item.id;

    const cellName = document.createElement('div');
    cellName.className = 'cell-name';

    if (item.iconData) {
      const img = document.createElement('img');
      img.className = 'ico';
      img.src = item.iconData;
      img.alt = '';
      cellName.appendChild(img);
    } else {
      cellName.appendChild(letterAvatar(item.name));
    }

    const nm = document.createElement('span');
    nm.className = 'nm';
    nm.textContent = item.name || item.keyName || '(未命名)';
    nm.title = item.name || '';
    cellName.appendChild(nm);

    const chip = document.createElement('span');
    if (item.origin === 'win11') {
      chip.className = 'chip';
      chip.textContent = 'Win11 一级';
    } else if (item.origin === 'both') {
      chip.className = 'chip gray';
      chip.textContent = '通用';
    } else {
      chip.className = 'chip gray';
      chip.textContent = 'Win10 经典';
    }
    cellName.appendChild(chip);

    if (item.vendor && item.vendor !== item.name) {
      const vd = document.createElement('span');
      vd.className = 'vendor';
      vd.textContent = item.vendor;
      vd.title = item.vendor;
      cellName.appendChild(vd);
    }

    const cellStatus = document.createElement('div');
    cellStatus.className = 'cell-status';
    cellStatus.appendChild(buildSwitch(item));

    row.appendChild(cellName);
    row.appendChild(cellStatus);

    row.addEventListener('click', () => openDrawer(item));
    return row;
  }

  function buildSwitch(item) {
    const btn = document.createElement('button');
    btn.className = 'switch' + (item.enabled ? ' on' : '');
    btn.setAttribute('role', 'switch');
    btn.setAttribute('aria-checked', String(!!item.enabled));
    btn.title = item.enabled ? '点击关闭' : '点击开启';
    btn.addEventListener('click', (ev) => {
      ev.stopPropagation();
      toggleItem(item, btn);
    });
    return btn;
  }

  function letterAvatar(name) {
    const box = document.createElement('div');
    box.className = 'ico-fallback';
    const text = String(name || '?').trim();
    box.textContent = text.slice(0, 1).toUpperCase();
    let hash = 0;
    for (let i = 0; i < text.length; i++) hash = (hash * 31 + text.charCodeAt(i)) % 360;
    box.style.background = `hsl(${205 + (hash % 30)}, 62%, ${46 + (hash % 12)}%)`;
    return box;
  }

  function placeholder(text, spinning, title) {
    const box = document.createElement('div');
    box.className = 'placeholder';
    if (spinning) {
      const sp = document.createElement('div');
      sp.className = 'spinner';
      box.appendChild(sp);
    }
    if (title) {
      const t = document.createElement('div');
      t.className = 'big';
      t.textContent = title;
      box.appendChild(t);
    }
    const p = document.createElement('div');
    p.textContent = text;
    box.appendChild(p);
    return box;
  }

  /* ---------------- toggle ---------------- */

  async function toggleItem(item, btn) {
    const next = !item.enabled;

    if (item.kind === 'shellnew' && !next) {
      const ok = await confirmDialog({
        title: `关闭「${item.name}」新建菜单项`,
        text: '新建菜单没有系统级的隐藏开关。本工具会先把该注册表项导出为 .reg 备份，再移除它；随时可以在这里重新开启，或从备份目录恢复。',
        okText: '备份并关闭'
      });
      if (!ok) return;
    }

    btn.classList.add('busy');
    let res;
    try {
      res = await api.toggle(item, next);
    } catch (err) {
      res = { ok: false, error: String(err && err.message) };
    }
    btn.classList.remove('busy');

    if (!res || !res.ok) {
      if (res && res.needsAdmin) {
        const go = await confirmDialog({
          title: '需要管理员权限',
          text: '修改系统右键菜单要写入 HKLM，普通权限会被系统拒绝。是否以管理员身份重启本工具？重启后重新操作一次即可。',
          okText: '立即重启'
        });
        if (go) {
          const up = await api.elevate();
          if (up && !up.ok) toast((up && up.error) || '提权失败', 'err');
        }
        return;
      }
      toast((res && res.error) || '操作失败。', 'err');
      render();
      return;
    }

    item.enabled = next;
    toast(next ? `已开启：${item.name}` : `已关闭：${item.name}`, next ? 'ok' : '');
    render();
    if (!next) {
      setTimeout(() => toast('资源管理器有缓存，若菜单未消失请点右下角「重启资源管理器」', ''), 700);
    }
  }

  /* ---------------- drawer ---------------- */

  function bindDrawer() {
    $('#dwClose').addEventListener('click', closeDrawer);
    scrimEl.addEventListener('click', closeDrawer);
    document.addEventListener('keydown', (ev) => {
      if (ev.key === 'Escape') {
        closeDrawer();
        hidePopover();
      }
    });
  }

  function openDrawer(item) {
    state.openId = item.id;

    const iconBox = $('#dwIcon');
    iconBox.textContent = '';
    if (item.iconData) {
      const img = document.createElement('img');
      img.src = item.iconData;
      img.alt = '';
      iconBox.appendChild(img);
    } else {
      iconBox.appendChild(letterAvatar(item.name));
    }

    $('#dwName').textContent = item.name || item.keyName || '(未命名)';

    const sub = $('#dwSub');
    sub.textContent = '';
    const chip = document.createElement('span');
    if (item.origin === 'win11') {
      chip.className = 'chip';
      chip.textContent = 'Win11 一级菜单';
    } else if (item.origin === 'both') {
      chip.className = 'chip gray';
      chip.textContent = '全系统通用';
    } else {
      chip.className = 'chip gray';
      chip.textContent = 'Win10 经典菜单';
    }
    sub.appendChild(chip);
    const st = document.createElement('span');
    st.textContent = item.enabled ? '已开启' : '未开启';
    sub.appendChild(st);

    const body = $('#dwBody');
    body.textContent = '';
    const kindLabel = {
      verb: 'Shell 动词（静态菜单项）',
      handler: 'Shell 扩展（COM 处理程序）',
      packaged: 'Packaged COM（包清单声明）',
      shellnew: 'ShellNew（新建菜单）'
    }[item.kind] || item.kind;

    addField(body, '项目类型', kindLabel);
    addField(body, '注册表路径', item.regPath);
    if (item.clsid) addField(body, 'CLSID', item.clsid);
    if (item.target) addField(body, '关联文件', item.target);
    if (item.command) addField(body, '执行命令', item.command);
    if (item.package) addField(body, '来源包', item.package);
    if (item.vendor) addField(body, '发布者', item.vendor);
    if (item.extended) addField(body, '显示条件', '按住 Shift 右键时才显示');

    const foot = $('#dwFoot');
    foot.textContent = '';
    foot.appendChild(actionBtn('打开注册表位置', () => api.openKey(item.regPath)));
    if (item.target) {
      foot.appendChild(actionBtn('打开文件位置', async () => {
        const r = await api.openPath(item.target);
        if (r && !r.ok) toast((r && r.error) || '打不开该路径', 'err');
      }));
    }
    foot.appendChild(actionBtn('复制注册表路径', async () => {
      try {
        await navigator.clipboard.writeText(item.regPath);
        toast('已复制', 'ok');
      } catch (_) {
        toast('复制失败', 'err');
      }
    }));

    drawerEl.classList.add('show');
    drawerEl.setAttribute('aria-hidden', 'false');
    scrimEl.hidden = false;
    requestAnimationFrame(() => scrimEl.classList.add('show'));
    render();
  }

  function closeDrawer() {
    state.openId = null;
    drawerEl.classList.remove('show');
    drawerEl.setAttribute('aria-hidden', 'true');
    scrimEl.classList.remove('show');
    setTimeout(() => {
      if (!scrimEl.classList.contains('show')) scrimEl.hidden = true;
    }, 200);
    render();
  }

  function addField(parent, key, value) {
    const box = document.createElement('div');
    box.className = 'field';
    const k = document.createElement('div');
    k.className = 'k';
    k.textContent = key;
    const v = document.createElement('div');
    v.className = 'v';
    v.textContent = value;
    box.appendChild(k);
    box.appendChild(v);
    parent.appendChild(box);
  }

  function actionBtn(label, handler) {
    const b = document.createElement('button');
    b.className = 'btn ghost';
    b.style.borderColor = '#e3e8f0';
    b.textContent = label;
    b.addEventListener('click', handler);
    return b;
  }

  /* ---------------- filters ---------------- */

  function bindFilters() {
    $('#funnelType').addEventListener('click', (ev) => {
      ev.stopPropagation();
      openFilterPopover(ev.currentTarget, 'type');
    });
    $('#funnelStatus').addEventListener('click', (ev) => {
      ev.stopPropagation();
      openFilterPopover(ev.currentTarget, 'status');
    });
    document.addEventListener('click', (ev) => {
      if (!popEl.hidden && !popEl.contains(ev.target)) hidePopover();
    });
    window.addEventListener('resize', hidePopover);
  }

  function syncFunnels() {
    const f = state.filters[state.tab];
    const typeBtn = $('#funnelType');
    const statusBtn = $('#funnelStatus');
    typeBtn.classList.toggle('is-active', state.tab !== 'new' && f.type !== 'all');
    statusBtn.classList.toggle('is-active', f.status !== 'all');
    typeBtn.style.display = state.tab === 'new' ? 'none' : '';
  }

  function openFilterPopover(anchor, which) {
    if (!popEl.hidden && popEl.dataset.which === which) {
      hidePopover();
      return;
    }
    const f = state.filters[state.tab];
    const options = which === 'type' ? TYPE_OPTIONS : STATUS_OPTIONS;
    const counts = filterCounts(which);

    popEl.textContent = '';
    popEl.dataset.which = which;

    const title = document.createElement('div');
    title.className = 'pop-title';
    title.textContent = which === 'type' ? '菜单类型' : '状态';
    popEl.appendChild(title);

    for (const opt of options) {
      const row = document.createElement('div');
      row.className = 'opt' + (f[which] === opt.key ? ' is-on' : '');
      const radio = document.createElement('span');
      radio.className = 'radio';
      const label = document.createElement('span');
      label.textContent = opt.label;
      const count = document.createElement('span');
      count.className = 'count';
      count.textContent = counts[opt.key] != null ? String(counts[opt.key]) : '';
      row.appendChild(radio);
      row.appendChild(label);
      row.appendChild(count);
      row.addEventListener('click', () => {
        state.filters[state.tab][which] = opt.key;
        hidePopover();
        render();
      });
      popEl.appendChild(row);
    }

    popEl.hidden = false;
    const rect = anchor.getBoundingClientRect();
    const width = 190;
    let left = rect.left - 8;
    if (left + width > window.innerWidth - 12) left = window.innerWidth - width - 12;
    popEl.style.left = `${Math.max(12, left)}px`;
    popEl.style.top = `${rect.bottom + 6}px`;
  }

  function filterCounts(which) {
    const items = currentItems();
    if (which === 'type') {
      const w11 = items.filter((i) => i.origin === 'win11').length;
      return { all: items.length, win11: w11, win10: items.length - w11 };
    }
    const on = items.filter((i) => i.enabled).length;
    return { all: items.length, on, off: items.length - on };
  }

  function hidePopover() {
    popEl.hidden = true;
    popEl.dataset.which = '';
  }

  /* ---------------- chrome ---------------- */

  function bindChrome() {
    $('#btnMin').addEventListener('click', () => api.minimize());
    $('#btnClose').addEventListener('click', () => api.close());
    $('#btnRefresh').addEventListener('click', refresh);
    $('#btnElevate').addEventListener('click', async () => {
      const res = await api.elevate();
      if (res && !res.ok) toast((res && res.error) || '提权失败', 'err');
    });
  }

  function bindTabs() {
    document.querySelectorAll('.tab').forEach((tab) => {
      tab.addEventListener('click', () => {
        document.querySelectorAll('.tab').forEach((t) => t.classList.toggle('is-active', t === tab));
        state.tab = tab.dataset.tab;
        state.openId = null;
        closeDrawerIfOpen();
        hidePopover();
        render();
      });
    });
  }

  function closeDrawerIfOpen() {
    if (drawerEl.classList.contains('show')) closeDrawer();
  }

  function bindFooter() {
    $('#btnExplorer').addEventListener('click', async () => {
      const ok = await confirmDialog({
        title: '重启资源管理器',
        text: '桌面和任务栏会短暂消失后恢复，这是正常现象。修改过菜单项后如果看不到变化，执行一次即可生效。',
        okText: '立即重启'
      });
      if (!ok) return;
      await api.restartExplorer();
      toast('资源管理器已重启', 'ok');
    });

    $('#btnBackups').addEventListener('click', () => api.openBackups());

    $('#btnHistory').addEventListener('click', async () => {
      const res = await api.history();
      const list = (res && res.data) || [];
      if (!list.length) {
        toast('还没有操作记录');
        return;
      }
      const text = list.slice(0, 12).map((h) => {
        const time = new Date(h.at).toLocaleTimeString('zh-CN', { hour12: false });
        if (h.ok === false) return `${time}  失败  ${h.name || ''}  ${h.error || ''}`;
        return `${time}  ${h.enable ? '开启' : '关闭'}  ${h.name || ''}`;
      }).join('\n');
      await confirmDialog({ title: '最近的操作记录', text, okText: '知道了', hideCancel: true });
    });
  }

  /* ---------------- misc ui ---------------- */

  function toast(text, kind) {
    const box = document.getElementById('toasts');
    const el = document.createElement('div');
    el.className = 'toast' + (kind ? ` ${kind}` : '');
    el.textContent = text;
    box.appendChild(el);
    setTimeout(() => {
      el.style.transition = 'opacity .2s';
      el.style.opacity = '0';
      setTimeout(() => el.remove(), 220);
    }, kind === 'err' ? 4200 : 2600);
  }

  function confirmDialog(opts) {
    return new Promise((resolve) => {
      const mask = $('#modalMask');
      $('#modalTitle').textContent = opts.title || '';
      $('#modalText').textContent = opts.text || '';
      $('#modalOk').textContent = opts.okText || '确定';
      $('#modalCancel').hidden = !!opts.hideCancel;
      mask.hidden = false;

      const done = (val) => {
        mask.hidden = true;
        $('#modalOk').removeEventListener('click', onOk);
        $('#modalCancel').removeEventListener('click', onCancel);
        mask.removeEventListener('click', onMask);
        resolve(val);
      };
      const onOk = () => done(true);
      const onCancel = () => done(false);
      const onMask = (ev) => { if (ev.target === mask) done(false); };

      $('#modalOk').addEventListener('click', onOk);
      $('#modalCancel').addEventListener('click', onCancel);
      mask.addEventListener('click', onMask);
    });
  }
})();
