import './style.css';

import { S, assetCache } from './state.ts';
import type { AssetMeta } from './state.ts';
import { EL } from './dom.ts';
import { on } from './events.ts';
import { ENV_BADGES } from './config.ts';
import { showToast, setViewerPanel } from './utils.ts';
import { loadFileTree } from './tree.ts';
import { loadFilterView } from './filter.ts';
import { showSearchResults } from './search.ts';
import { openAsset, initAudioAttach } from './asset.ts';
import { openModal, closeModal, initModal } from './modal.ts';
import { PlatformBridge } from './platform/Bridge.ts';

// ==================== Platform Bridge ====================

const bridge = new PlatformBridge();

// ==================== 事件总线 Wiring ====================

on('asset-select', (asset: AssetMeta) => openAsset(asset));
on('modal-open', (asset: AssetMeta, cosKey: string) => openModal(asset, cosKey));
on('refresh', () => {
  if (!EL.searchResults().classList.contains('hidden')) {
    showSearchResults(S.search, S.page);
  } else if (!EL.filterView().classList.contains('hidden')) {
    loadFilterView(S.activeType!, S.page);
  } else {
    assetCache.data = null;
    assetCache.ts = 0;
    loadFileTree(true);
  }
});

// ==================== 环境切换 ====================

function initEnvDropdown(): void {
  const btn  = EL.envBtn();
  const drop = EL.envDropdown();
  const arr  = EL.envArrow();

  btn.addEventListener('click', (e: Event) => {
    e.stopPropagation();
    const open = !drop.classList.contains('hidden');
    drop.classList.toggle('hidden', open);
    arr.classList.toggle('open', !open);
  });

  drop.querySelectorAll('.env-option').forEach(opt => {
    opt.addEventListener('click', () => {
      const el = opt as HTMLElement;
      S.env = el.dataset.env as typeof S.env;
      const badge = ENV_BADGES[S.env] || S.env.toUpperCase();
      EL.envBadge().textContent = badge;
      EL.envBadge().className   = `env-badge ${badge}`;
      EL.envLabel().textContent = el.textContent!.replace(el.querySelector('small')?.textContent || '', '').trim()
                                  + ' ' + (el.querySelector('small')?.textContent || '');
      drop.querySelectorAll('.env-option').forEach(o => o.classList.toggle('active', o === el));
      drop.classList.add('hidden');
      arr.classList.remove('open');
      assetCache.data = null;
      assetCache.ts = 0;
      bridge.sendStateChange({ env: S.env });
      if (S.viewMode === 'filemanager') loadFileTree();
      else loadFilterView(S.activeType!);
    });
  });

  document.addEventListener('click', () => {
    drop.classList.add('hidden');
    arr.classList.remove('open');
  });
}

// ==================== Tab 切换 ====================

function initTabs(): void {
  EL.tabsBar().addEventListener('click', (e: Event) => {
    const btn = (e.target as HTMLElement).closest('.tab-btn') as HTMLElement | null;
    if (!btn) return;
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');

    const typeRaw = btn.dataset.type;
    if (typeRaw === '') {
      S.viewMode   = 'filemanager';
      S.activeType = null;
      S.search     = '';
      (EL.searchInput() as HTMLInputElement).value = '';
      EL.leftPanel().classList.remove('hidden');
      EL.fileTreeView().classList.remove('hidden');
      EL.panelTitle().textContent = '文件管理器';
      EL.assetVersionTabs().classList.add('hidden');
      setViewerPanel('viewerPlaceholder');
      if (!S.fileTree) loadFileTree();
    } else {
      S.viewMode   = 'filter';
      S.activeType = parseInt(typeRaw!);
      S.search     = '';
      S.page       = 1;
      (EL.searchInput() as HTMLInputElement).value = '';
      EL.leftPanel().classList.add('hidden');
      setViewerPanel('filterView');
      loadFilterView(S.activeType, 1);
    }
  });
}

// ==================== 搜索 ====================

function initSearch(): void {
  const run = () => {
    const searchText = (EL.searchInput() as HTMLInputElement).value.trim();
    if (!searchText) {
      showToast('请输入搜索关键词', 'warning');
      return;
    }
    S.search = searchText;
    S.page = 1;
    showSearchResults(searchText);
  };
  const btn = document.getElementById('searchBtn');
  if (btn) btn.addEventListener('click', run);
  EL.searchInput().addEventListener('keydown', (e: Event) => {
    if ((e as KeyboardEvent).key === 'Enter') run();
  });

  EL.closeSearchBtn().addEventListener('click', () => {
    EL.leftPanel().classList.remove('hidden');
    setViewerPanel(null);
    EL.placeholder().classList.remove('hidden');
    (EL.searchInput() as HTMLInputElement).value = '';
    S.search = '';
  });
}

// ==================== 刷新 ====================

function initRefresh(): void {
  EL.refreshBtn().addEventListener('click', () => {
    const btn = EL.refreshBtn();
    btn.classList.add('spin');
    (btn as HTMLButtonElement).disabled = true;

    assetCache.data = null;
    assetCache.ts = 0;
    S.fileTree = null;
    showToast('缓存已清除，正在重新加载...', 'success');

    const done = () => {
      btn.classList.remove('spin');
      (btn as HTMLButtonElement).disabled = false;
    };

    if (S.viewMode === 'filemanager') {
      loadFileTree(true).then(done);
    } else if (S.activeType) {
      loadFilterView(S.activeType, 1).then(done);
    } else {
      done();
    }
  });
}

// ==================== Platform Bridge Wiring ====================

bridge.onMessage((msg) => {
  switch (msg.type) {
    case 'setEnv':
      if (msg.env) {
        S.env = msg.env as typeof S.env;
        assetCache.data = null;
        assetCache.ts = 0;
        if (S.viewMode === 'filemanager') loadFileTree();
        else loadFilterView(S.activeType!);
        bridge.sendStateChange({ env: S.env });
      }
      break;
    case 'refresh':
      assetCache.data = null;
      assetCache.ts = 0;
      loadFileTree(true);
      break;
    case 'search':
      if (msg.query) {
        S.search = msg.query;
        showSearchResults(msg.query);
      }
      break;
  }
});

// ==================== 初始化 ====================

function init(): void {
  // wb-bgm 锁定 Local 环境，不暴露环境切换。
  S.env = 'local';
  initEnvDropdown();
  initTabs();
  initSearch();
  initRefresh();
  initModal();
  initAudioAttach();
  loadFileTree().then(() => {
    bridge.sendReady();
    bridge.sendStateChange({ status: 'idle', env: S.env });
  });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
