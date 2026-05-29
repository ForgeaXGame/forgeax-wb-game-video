// @source wb-character/src/pipelines/spine/editor/SpineEditor.ts
import { createDefaultState, TAB_META } from './StudioState';
import type { StudioState, StudioTab, TabId } from './StudioState';
import { CharacterDesignTab } from './CharacterDesignTab';
import { ExplosionTab } from './ExplosionTab';
import { AutoBindTab } from './AutoBindTab';
import { AnimWorkshopTab } from './AnimWorkshopTab';
import { GameUploadTab } from './GameUploadTab';
import { studioSave, studioLoad, studioDelete, EDITOR_STATE_KEY } from './StudioStorage';
import { parseSpineJson, computeWorldTransforms, applyIKConstraints } from './SpineDataParser';

const CSS_ID = 'spine-editor-css';

export class SpineEditor {
  private root!: HTMLDivElement;
  private visible = false;
  private state: StudioState;
  private tabs: StudioTab[] = [];
  private actBtns: Map<TabId, HTMLButtonElement> = new Map();
  private saveTimer: ReturnType<typeof setTimeout> | null = null;
  private ready = false;

  private sidePanelEl!: HTMLDivElement;
  private sidePanelBody!: HTMLDivElement;
  private sideHeaderEl!: HTMLDivElement;
  private wsToolbarEl!: HTMLDivElement;
  private wsCenterEl!: HTMLDivElement;
  private wsBottomEl!: HTMLDivElement;
  private rightPanelEl!: HTMLDivElement;
  private gameMountEl!: HTMLDivElement;
  private resizeObserver: ResizeObserver | null = null;
  private currentTabId: TabId = 'design';

  constructor() {
    injectCSS();
    this.state = createDefaultState();
    this.build();
    this.asyncRestore();
    window.addEventListener('vag-studio-close', () => this.hide());
    window.addEventListener('beforeunload', () => this.autoSave());
    window.addEventListener('vag-studio-save', () => this.scheduleAutoSave());
  }

  private async asyncRestore(): Promise<void> {
    try {
      const saved = await studioLoad<any>(EDITOR_STATE_KEY);
      if (saved) {
        if (saved.profession) this.state.profession = saved.profession;
        if (saved.characterImage) this.state.characterImage = saved.characterImage;
        if (saved.explosionImage) this.state.explosionImage = saved.explosionImage;
        if (saved.activeTab) this.state.activeTab = saved.activeTab === 'game' ? 'design' : saved.activeTab;
        if (saved.partRegions) this.state.partRegions = saved.partRegions;
        if (saved.bindingJson) {
          this.state.bindingJson = saved.bindingJson;
          try {
            const skel = parseSpineJson(saved.bindingJson);
            computeWorldTransforms(skel.bones, skel.boneOrder);
            if (skel.ik.length > 0) applyIKConstraints(skel.bones, skel.boneOrder, skel.ik);
            this.state.bindingSkeleton = skel;
          } catch (e) {
            console.warn('[Studio] Failed to rebuild skeleton from saved JSON:', e);
          }
        }
        if (saved.attachmentImages) {
          this.state.attachmentImages = new Map(Object.entries(saved.attachmentImages));
        }
        if (saved.animations) {
          this.state.animations = new Map(Object.entries(saved.animations));
        }
        if (saved.exportPath) this.state.exportPath = saved.exportPath;
        console.log('[Studio] Restored editor state from IndexedDB');
      }
    } catch (e) {
      console.warn('[Studio] Failed to restore state:', e);
    }
    this.ready = true;
  }

  get isOpen(): boolean { return this.visible; }

  toggle(): void {
    if (this.visible) this.hide();
    else this.show();
  }

  show(): void {
    this.visible = true;
    this.root.style.display = 'flex';

    if (this.ready) {
      this.switchTab(this.state.activeTab);
    } else {
      const poll = setInterval(() => {
        if (this.ready) {
          clearInterval(poll);
          this.switchTab(this.state.activeTab);
        }
      }, 50);
    }
  }

  hide(): void {
    this.visible = false;
    this.root.style.display = 'none';
    this.tabs.forEach(t => t.deactivate());
    window.dispatchEvent(new Event('resize'));
    this.autoSave();
  }

  private build(): void {
    this.root = document.createElement('div');
    this.root.className = 'se-root';
    this.root.style.display = 'none';
    document.body.appendChild(this.root);

    const stopProp = (e: Event) => e.stopPropagation();
    for (const evt of ['mousedown', 'mouseup', 'click', 'pointerdown', 'pointerup', 'keydown', 'keyup', 'contextmenu'] as const) {
      this.root.addEventListener(evt, stopProp);
    }

    const topBar = this.buildTopBar();
    this.root.appendChild(topBar);

    const main = document.createElement('div');
    main.className = 'se-main';
    this.root.appendChild(main);

    /* ── Activity bar ── */
    const actBar = document.createElement('div');
    actBar.className = 'se-activity-bar';
    main.appendChild(actBar);

    for (const meta of TAB_META) {
      const btn = document.createElement('button');
      btn.className = 'se-act-btn';
      btn.innerHTML = `<span>${meta.icon}</span><span class="se-act-label">${meta.label}</span>`;
      btn.addEventListener('click', () => this.switchTab(meta.id));
      actBar.appendChild(btn);
      this.actBtns.set(meta.id, btn);
    }

    /* ── Side panel ── */
    this.sidePanelEl = document.createElement('div');
    this.sidePanelEl.className = 'se-side-panel';
    main.appendChild(this.sidePanelEl);

    this.sideHeaderEl = document.createElement('div');
    this.sideHeaderEl.className = 'se-side-header';
    this.sidePanelEl.appendChild(this.sideHeaderEl);

    this.sidePanelBody = document.createElement('div');
    this.sidePanelBody.className = 'se-side-body';
    this.sidePanelEl.appendChild(this.sidePanelBody);

    /* ── Workspace ── */
    const workspace = document.createElement('div');
    workspace.className = 'se-workspace';
    main.appendChild(workspace);

    this.wsToolbarEl = document.createElement('div');
    this.wsToolbarEl.className = 'se-ws-toolbar';
    workspace.appendChild(this.wsToolbarEl);

    this.wsCenterEl = document.createElement('div');
    this.wsCenterEl.className = 'se-ws-center';
    workspace.appendChild(this.wsCenterEl);

    this.wsBottomEl = document.createElement('div');
    this.wsBottomEl.className = 'se-ws-bottom';
    workspace.appendChild(this.wsBottomEl);

    this.gameMountEl = document.createElement('div');
    this.gameMountEl.id = 'se-game-mount';
    this.wsCenterEl.appendChild(this.gameMountEl);

    /* ── Right panel ── */
    this.rightPanelEl = document.createElement('div');
    this.rightPanelEl.className = 'se-right-panel';
    main.appendChild(this.rightPanelEl);

    /* ── Create tabs ── */
    const dummyParent = document.createElement('div');
    dummyParent.style.display = 'none';
    document.body.appendChild(dummyParent);

    const onStateChange = () => this.onStateChange();

    const animTab = new AnimWorkshopTab(dummyParent, onStateChange);
    const uploadTab = new GameUploadTab(dummyParent, onStateChange);
    uploadTab.setAnimWorkshopRef(animTab);

    this.tabs = [
      new CharacterDesignTab(dummyParent, onStateChange),
      new ExplosionTab(dummyParent, onStateChange),
      new AutoBindTab(dummyParent, onStateChange),
      animTab,
      uploadTab,
    ];

    /* ── ResizeObserver ── */
    this.resizeObserver = new ResizeObserver(() => {
      requestAnimationFrame(() => window.dispatchEvent(new Event('resize')));
    });
    this.resizeObserver.observe(this.wsCenterEl);
  }

  private buildTopBar(): HTMLDivElement {
    const bar = document.createElement('div');
    bar.className = 'se-topbar';

    const title = document.createElement('span');
    title.className = 'se-topbar-title';
    title.textContent = '角色创建工作室';
    bar.appendChild(title);

    const steps = document.createElement('div');
    steps.className = 'se-topbar-steps';

    for (let i = 0; i < TAB_META.length; i++) {
      const meta = TAB_META[i];
      const step = document.createElement('span');
      step.className = 'se-step';
      step.dataset.tabId = meta.id;
      step.innerHTML = `${meta.icon} ${meta.label}`;
      step.addEventListener('click', () => this.switchTab(meta.id));
      steps.appendChild(step);

      if (i < TAB_META.length - 1) {
        const arrow = document.createElement('span');
        arrow.className = 'se-step-arrow';
        arrow.textContent = '›';
        steps.appendChild(arrow);
      }
    }

    bar.appendChild(steps);

    const actions = document.createElement('div');
    actions.className = 'se-topbar-actions';

    const resetBtn = document.createElement('button');
    resetBtn.className = 'studio-topbar-btn';
    resetBtn.textContent = '🗑️ 重置';
    resetBtn.title = '清除所有数据重新开始';
    resetBtn.addEventListener('click', () => {
      if (confirm('确定要清除所有数据并重新开始？')) this.resetAll();
    });
    actions.appendChild(resetBtn);

    const closeBtn = document.createElement('button');
    closeBtn.className = 'studio-close-btn';
    closeBtn.innerHTML = '&times;';
    closeBtn.addEventListener('click', () => this.hide());
    actions.appendChild(closeBtn);

    bar.appendChild(actions);
    return bar;
  }

  private switchTab(id: TabId): void {
    this.state.activeTab = id;
    this.currentTabId = id;

    this.tabs.forEach(t => t.deactivate());

    this.sidePanelBody.innerHTML = '';
    this.wsToolbarEl.innerHTML = '';
    this.wsBottomEl.innerHTML = '';
    this.rightPanelEl.innerHTML = '';
    Array.from(this.wsCenterEl.children).forEach(child => {
      if (child !== this.gameMountEl) child.remove();
    });

    const activeIdx = TAB_META.findIndex(m => m.id === id);

    this.actBtns.forEach((btn, tabId) => {
      const idx = TAB_META.findIndex(m => m.id === tabId);
      btn.classList.toggle('active', tabId === id);
      btn.classList.toggle('completed', idx < activeIdx);
    });

    this.root.querySelectorAll('.se-step').forEach(el => {
      const stepEl = el as HTMLElement;
      const stepId = stepEl.dataset.tabId as TabId;
      const idx = TAB_META.findIndex(m => m.id === stepId);
      stepEl.classList.toggle('active', stepId === id);
      stepEl.classList.toggle('completed', idx < activeIdx);
    });

    this.sidePanelEl.style.display = '';

    const tab = this.tabs.find(t => t.id === id);
    if (tab) {
      tab.activate(this.state);

      this.sideHeaderEl.textContent = TAB_META.find(m => m.id === id)?.label ?? '';
      this.sidePanelBody.appendChild(tab.sidePanel);

      if (tab.centerToolbar) {
        this.wsToolbarEl.appendChild(tab.centerToolbar);
      }

      if (tab.centerView) {
        this.gameMountEl.style.display = 'none';
        this.wsCenterEl.appendChild(tab.centerView);
      } else {
        this.gameMountEl.style.display = '';
      }

      if (tab.bottomPanel) {
        this.wsBottomEl.appendChild(tab.bottomPanel);
      }

      if (tab.rightPanel) {
        this.rightPanelEl.style.display = '';
        this.rightPanelEl.appendChild(tab.rightPanel);
      } else {
        this.rightPanelEl.style.display = 'none';
      }
    }

    window.dispatchEvent(new Event('resize'));
  }

  private onStateChange(): void {
    this.switchTab(this.state.activeTab);
    this.scheduleAutoSave();
  }

  private resetAll(): void {
    localStorage.removeItem('studio-session');
    localStorage.removeItem('se-editor-session');
    studioDelete(EDITOR_STATE_KEY).catch(() => {});
    this.state = createDefaultState();
    this.tabs.forEach(t => t.deactivate());
    this.switchTab('design');
  }

  private scheduleAutoSave(): void {
    if (this.saveTimer) clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(() => this.autoSave(), 1500);
  }

  private autoSave(): void {
    const s = this.state;
    const session: any = {
      profession: s.profession,
      characterImage: s.characterImage,
      explosionImage: s.explosionImage,
      activeTab: s.activeTab,
      partRegions: s.partRegions,
      bindingJson: s.bindingJson,
      exportPath: s.exportPath,
      timestamp: Date.now(),
    };
    if (s.attachmentImages.size > 0) {
      session.attachmentImages = Object.fromEntries(s.attachmentImages);
    }
    if (s.animations.size > 0) {
      session.animations = Object.fromEntries(s.animations);
    }
    studioSave(EDITOR_STATE_KEY, session).catch(e => {
      console.warn('Studio auto-save failed:', e);
    });
  }

  dispose(): void {
    this.resizeObserver?.disconnect();
    this.tabs.forEach(t => t.dispose());
    this.root.remove();
  }
}

export function injectCSS(): void {
  const existing = document.getElementById(CSS_ID);
  if (existing) existing.remove();
  const s = document.createElement('style');
  s.id = CSS_ID;
  s.textContent = STUDIO_CSS;
  document.head.appendChild(s);
}

const STUDIO_CSS = `
/* ═══════════════════ Root ═══════════════════ */
.se-root {
  position: fixed; top: 0; left: 0; width: 100%; height: 100%;
  z-index: 300; display: flex; flex-direction: column;
  font-family: 'Rajdhani','Segoe UI',sans-serif; color: #ddd;
  background: rgba(18,15,10,0.99);
}

/* ═══════════════════ Top Bar ═══════════════════ */
.se-topbar {
  display: flex; align-items: center; gap: 8px;
  padding: 0 12px; height: 40px;
  background: linear-gradient(180deg, rgba(35,30,20,0.99), rgba(28,24,16,0.99));
  border-bottom: 1px solid rgba(232,196,138,0.25);
  flex-shrink: 0;
}
.se-topbar-title {
  font-family: 'Orbitron',monospace; font-size: 13px; font-weight: 700;
  color: #e8c48a; letter-spacing: 2px; white-space: nowrap;
}
.se-topbar-steps {
  display: flex; align-items: center; gap: 2px; margin: 0 auto;
}
.se-step {
  padding: 3px 10px; font-size: 11px; font-weight: 600;
  color: rgba(200,180,140,0.35); border-radius: 3px;
  transition: all 0.2s; display: flex; align-items: center; gap: 4px;
  cursor: pointer; user-select: none;
}
.se-step:hover { color: rgba(200,180,140,0.6); }
.se-step.active { color: #e8c48a; background: rgba(232,196,138,0.1); }
.se-step.completed { color: rgba(100,255,100,0.5); }
.se-step-arrow { color: rgba(232,196,138,0.15); font-size: 14px; }
.se-topbar-actions { display: flex; gap: 6px; align-items: center; }

.studio-topbar-btn {
  padding: 4px 12px; font-size: 11px; font-weight: 600;
  background: rgba(255,100,100,0.06); border: 1px solid rgba(255,100,100,0.2);
  color: #ff8888; border-radius: 4px; cursor: pointer;
  font-family: inherit; transition: background 0.15s;
}
.studio-topbar-btn:hover { background: rgba(255,100,100,0.15); }
.studio-close-btn {
  cursor: pointer; font-size: 24px; color: rgba(220,190,150,0.5);
  background: none; border: none; transition: color 0.15s;
  line-height: 1;
}
.studio-close-btn:hover { color: #ffe0a0; }

/* ═══════════════════ Main area ═══════════════════ */
.se-main {
  flex: 1; display: flex; overflow: hidden;
}

/* ═══════════════════ Activity bar ═══════════════════ */
.se-activity-bar {
  width: 48px; flex-shrink: 0; display: flex; flex-direction: column;
  background: rgba(22,18,12,0.98);
  border-right: 1px solid rgba(232,196,138,0.12);
  padding: 4px 0; gap: 2px; align-items: center;
}
.se-act-btn {
  width: 40px; height: 40px; display: flex; flex-direction: column;
  align-items: center; justify-content: center; gap: 1px;
  border: none; border-radius: 6px; cursor: pointer;
  background: transparent; color: rgba(200,180,140,0.4);
  font-size: 16px; transition: all 0.15s; position: relative;
  border-left: 2px solid transparent;
}
.se-act-btn:hover { color: rgba(232,196,138,0.8); background: rgba(232,196,138,0.06); }
.se-act-btn.active {
  color: #e8c48a; background: rgba(232,196,138,0.1);
  border-left-color: #e8c48a;
}
.se-act-btn.completed { color: rgba(100,255,100,0.5); }
.se-act-label {
  font-size: 8px; font-weight: 600; letter-spacing: 0.5px;
  line-height: 1; margin-top: 1px;
}

/* ═══════════════════ Side panel ═══════════════════ */
.se-side-panel {
  width: 280px; flex-shrink: 0; display: flex; flex-direction: column;
  background: rgba(25,20,14,0.95);
  border-right: 1px solid rgba(232,196,138,0.12);
  overflow: hidden;
}
.se-side-header {
  padding: 8px 12px; font-size: 12px; font-weight: 700;
  color: #e8c48a; letter-spacing: 1px;
  border-bottom: 1px solid rgba(232,196,138,0.1);
  flex-shrink: 0;
}
.se-side-body { flex: 1; overflow-y: auto; overflow-x: hidden; }
.se-side-body > * { width: 100%; box-sizing: border-box; }

/* ═══════════════════ Workspace ═══════════════════ */
.se-workspace { flex: 1; display: flex; flex-direction: column; overflow: hidden; }
.se-ws-toolbar {
  display: flex; align-items: center; gap: 8px;
  padding: 4px 10px; background: rgba(28,24,16,0.98);
  border-bottom: 1px solid rgba(232,196,138,0.12);
  flex-shrink: 0; min-height: 32px;
}
.se-ws-toolbar:empty { display: none; }
.se-ws-center {
  flex: 1; position: relative; overflow: hidden;
  display: flex; align-items: stretch;
}
.se-ws-center > * { flex: 1; min-width: 0; min-height: 0; }
.se-ws-bottom {
  flex-shrink: 0; overflow: hidden;
  border-top: 1px solid rgba(232,196,138,0.12);
}
.se-ws-bottom:empty { display: none; }

/* ═══════════════════ Game canvas mount ═══════════════════ */
#se-game-mount {
  width: 100%; height: 100%;
}
#se-game-mount canvas { display: block; width: 100%; height: 100%; }

/* ═══════════════════ Right panel ═══════════════════ */
.se-right-panel {
  width: 280px; flex-shrink: 0; display: flex; flex-direction: column;
  background: rgba(25,20,14,0.95);
  border-left: 1px solid rgba(232,196,138,0.12);
  overflow-y: auto; overflow-x: hidden;
}
.se-right-panel > * { width: 100%; box-sizing: border-box; }

/* ═══════════════════ Tab 1: Character Design ═══════════════════ */
.sd-section { margin-bottom: 24px; }
.sd-section-title {
  font-size: 14px; font-weight: 700; color: #e8c48a;
  letter-spacing: 1px; margin-bottom: 12px;
  padding-bottom: 6px; border-bottom: 1px solid rgba(232,196,138,0.12);
}
.sd-prof-grid { display: flex; gap: 12px; }
.sd-prof-card {
  flex: 1; padding: 16px; border-radius: 10px; cursor: pointer;
  background: rgba(232,196,138,0.04); border: 2px solid rgba(232,196,138,0.1);
  text-align: center; transition: all 0.2s;
}
.sd-prof-card:hover {
  background: rgba(232,196,138,0.1); border-color: rgba(232,196,138,0.3);
}
.sd-prof-card.active {
  background: rgba(232,196,138,0.12); border-color: #e8c48a;
  box-shadow: 0 0 20px rgba(232,196,138,0.15);
}
.sd-prof-icon { font-size: 36px; margin-bottom: 8px; }
.sd-prof-name { font-size: 16px; font-weight: 700; color: #e8c48a; margin-bottom: 4px; }
.sd-prof-desc { font-size: 12px; color: rgba(220,200,170,0.5); }

.sd-method-tabs { display: flex; gap: 4px; margin-bottom: 12px; }
.sd-method-tab {
  flex: 1; padding: 8px; font-size: 12px; font-weight: 600;
  background: rgba(232,196,138,0.05); border: 1px solid rgba(232,196,138,0.12);
  color: rgba(220,200,170,0.5); border-radius: 6px; cursor: pointer;
  font-family: inherit; transition: all 0.15s;
}
.sd-method-tab:hover { background: rgba(232,196,138,0.1); color: rgba(220,200,170,0.7); }
.sd-method-tab.active {
  background: rgba(232,196,138,0.12); border-color: rgba(232,196,138,0.35);
  color: #e8c48a;
}
.sd-method-panel { padding-top: 8px; }

.sd-prompt {
  width: 100%; min-height: 80px; padding: 10px; font-size: 13px;
  background: rgba(0,0,0,0.3); border: 1px solid rgba(232,196,138,0.2);
  color: #ddd; border-radius: 6px; font-family: inherit; resize: vertical;
  box-sizing: border-box; margin-bottom: 8px;
}
.sd-prompt::placeholder { color: rgba(200,180,140,0.35); }
.sd-prompt:focus { border-color: rgba(232,196,138,0.4); outline: none; }

.sd-gen-btn {
  width: 100%; padding: 10px; font-size: 14px; font-weight: 700;
  background: linear-gradient(135deg, rgba(100,180,255,0.15), rgba(60,120,200,0.15));
  border: 1px solid rgba(100,180,255,0.4); color: #88bbff;
  border-radius: 6px; cursor: pointer; font-family: inherit; transition: all 0.15s;
  position: relative; overflow: hidden;
}
.sd-gen-btn:hover:not(:disabled) { background: rgba(100,180,255,0.25); transform: translateY(-1px); }
.sd-gen-btn:active:not(:disabled) { transform: scale(0.97); }
.sd-gen-btn:disabled { opacity: 0.4; cursor: not-allowed; }
.sd-gen-btn.btn-loading { pointer-events: none; opacity: 0.7; }
.sd-gen-btn.btn-loading::after {
  content: ''; position: absolute; inset: 0;
  background: linear-gradient(90deg, transparent, rgba(100,180,255,0.15), transparent);
  animation: btn-shimmer 1.5s infinite;
}
@keyframes btn-shimmer { 0% { transform: translateX(-100%); } 100% { transform: translateX(100%); } }

.sd-upload-zone {
  padding: 32px; border: 2px dashed rgba(232,196,138,0.2);
  border-radius: 10px; text-align: center; cursor: pointer;
  transition: all 0.2s; margin-bottom: 12px;
}
.sd-upload-zone:hover, .sd-upload-zone.dragover {
  border-color: rgba(232,196,138,0.5); background: rgba(232,196,138,0.05);
}
.sd-upload-hint { font-size: 14px; color: rgba(220,200,170,0.6); margin-bottom: 4px; }
.sd-upload-sub { font-size: 11px; color: rgba(200,180,140,0.35); }

.sd-preview-title {
  font-size: 14px; font-weight: 700; color: #e8c48a; margin-bottom: 8px;
}
.sd-preview {
  flex: 1; display: flex; align-items: center; justify-content: center;
  background: rgba(0,0,0,0.3); border-radius: 10px; border: 1px solid rgba(232,196,138,0.1);
  overflow: hidden;
}
.sd-preview-img {
  max-width: 100%; max-height: 100%; object-fit: contain;
}
.sd-preview-empty {
  display: flex; flex-direction: column; align-items: center; gap: 8px;
  color: rgba(200,180,140,0.3); font-size: 13px;
}
.sd-preview-empty-icon { font-size: 48px; }
.sd-preview-actions { display: flex; gap: 8px; }
.sd-action-btn {
  flex: 1; padding: 10px; font-size: 13px; font-weight: 600;
  background: rgba(232,196,138,0.08); border: 1px solid rgba(232,196,138,0.25);
  color: #e8c48a; border-radius: 6px; cursor: pointer;
  font-family: inherit; transition: all 0.15s;
}
.sd-action-btn:hover:not(:disabled) { background: rgba(232,196,138,0.18); transform: translateY(-1px); }
.sd-action-btn:active:not(:disabled) { transform: scale(0.97); }
.sd-action-btn:disabled { opacity: 0.4; cursor: not-allowed; }
.sd-action-primary {
  background: linear-gradient(135deg, rgba(100,255,100,0.12), rgba(60,200,80,0.12));
  border-color: rgba(100,255,100,0.4); color: #88ff88;
}
.sd-action-primary:hover { background: rgba(100,255,100,0.22); }

/* Unified bottom-right next-step button */
.studio-next-float {
  position: absolute; bottom: 16px; right: 16px; z-index: 20;
}
.studio-next-btn {
  padding: 10px 28px; font-size: 14px; font-weight: 600;
  letter-spacing: 2px; border: 1px solid rgba(100,255,100,0.4);
  background: linear-gradient(135deg, rgba(60,200,80,0.18), rgba(100,255,100,0.12));
  color: #88ff88; border-radius: 6px; cursor: pointer;
  transition: all 0.2s; font-family: inherit;
  box-shadow: 0 2px 12px rgba(0,0,0,0.3);
}
.studio-next-btn:hover:not(:disabled) {
  background: linear-gradient(135deg, rgba(60,200,80,0.32), rgba(100,255,100,0.22));
  border-color: rgba(100,255,100,0.7); box-shadow: 0 4px 20px rgba(100,255,100,0.15);
  transform: translateY(-1px);
}
.studio-next-btn:disabled { opacity: 0.35; cursor: not-allowed; }

/* ═══════════════════ Tab 2: Explosion ═══════════════════ */
.expl-sidebar-scroll {
  flex: 1; overflow-y: auto; padding: 12px; display: flex; flex-direction: column; gap: 8px;
}
.expl-previews {
  flex: 1; display: flex; align-items: stretch; gap: 0; padding: 16px; min-height: 0;
}
.expl-preview-panel {
  flex: 1; display: flex; flex-direction: column; gap: 8px;
}
.expl-source-box, .expl-result-box {
  flex: 1; display: flex; align-items: center; justify-content: center;
  flex-direction: column;
  background: rgba(0,0,0,0.3); border-radius: 10px; border: 1px solid rgba(232,196,138,0.1);
  overflow: hidden; position: relative; transition: all 0.2s;
}
.expl-source-box.drag-over, .expl-result-box.drag-over {
  background: rgba(232,196,138,0.1);
  border-color: rgba(232,196,138,0.5);
  box-shadow: 0 0 16px rgba(232,196,138,0.2) inset;
}
.expl-preview-img { max-width: 100%; max-height: 100%; object-fit: contain; }
.expl-arrow-col {
  display: flex; flex-direction: column; align-items: center; justify-content: center;
  width: 60px; flex-shrink: 0;
}
.expl-arrow { font-size: 32px; color: rgba(232,196,138,0.3); }
.expl-arrow-label { font-size: 10px; color: rgba(200,180,140,0.3); white-space: nowrap; }
.expl-upload-row { display: flex; gap: 8px; }
.expl-info-col {
  display: none;
}
.expl-tmpl-preview {
  background: rgba(0,0,0,0.3); border-radius: 6px; overflow: hidden;
  border: 1px solid rgba(232,196,138,0.1); max-height: 240px;
}
.expl-tmpl-img { display: block; width: 100%; height: auto; object-fit: contain; image-rendering: pixelated; }
.expl-tmpl-info { font-size: 11px; color: rgba(200,180,140,0.5); margin-top: 4px; }
.expl-tmpl-info code { color: #e8c48a; }
.expl-tmpl-warn { color: rgba(255,180,80,0.7); font-weight: 600; }
.expl-parts-list { display: flex; flex-direction: column; gap: 2px; max-height: 200px; overflow-y: auto; }
.expl-part-item {
  display: flex; align-items: center; gap: 6px;
  padding: 3px 6px; font-size: 11px; border-radius: 3px;
  background: rgba(232,196,138,0.02);
}
.expl-part-dot {
  width: 6px; height: 6px; border-radius: 50%;
  background: rgba(232,196,138,0.3); flex-shrink: 0;
}
.expl-part-name { flex: 1; color: rgba(220,200,170,0.7); }
.expl-part-size { font-size: 9px; color: rgba(200,180,140,0.35); font-family: 'Orbitron',monospace; }
.expl-divider { height: 1px; background: rgba(232,196,138,0.1); margin: 4px 0; }
.expl-steps-info { display: flex; flex-direction: column; gap: 4px; }
.expl-step-item {
  display: flex; align-items: center; gap: 8px; font-size: 11px;
  color: rgba(200,180,140,0.6); padding: 3px 0;
}
.expl-step-num {
  display: inline-flex; align-items: center; justify-content: center;
  width: 18px; height: 18px; border-radius: 50%; font-size: 10px; font-weight: 700;
  background: rgba(232,196,138,0.15); color: #e8c48a; flex-shrink: 0;
}
.expl-btn-step {
  display: inline-flex; align-items: center; justify-content: center;
  width: 16px; height: 16px; border-radius: 50%; font-size: 9px; font-weight: 700;
  background: rgba(232,196,138,0.2); color: #e8c48a; margin-right: 4px;
}
.expl-actions { display: flex; flex-direction: column; gap: 8px; }
.expl-scale-info {
  font-size: 10px; color: rgba(200,180,140,0.45); padding: 0 4px;
  font-family: 'Orbitron',monospace; min-height: 14px;
}
.expl-rmbg-options {
  display: flex; flex-direction: column; gap: 6px; padding: 8px;
  background: rgba(0,0,0,0.3); border-radius: 6px; margin-top: 4px;
  border: 1px solid rgba(232,196,138,0.1);
}
.expl-rmbg-title { font-size: 11px; color: rgba(200,180,140,0.6); font-weight: 600; }
.expl-rmbg-hint { font-size: 10px; color: rgba(200,180,140,0.3); line-height: 1.4; }
/* ── Annotate layout ── */
.expl-annotate-layout {
  display: flex; width: 100%; height: 100%;
}
.expl-annotate-sidebar {
  width: 240px; flex-shrink: 0; display: flex; flex-direction: column; gap: 6px;
  padding: 8px; overflow-y: auto;
  border-right: 1px solid rgba(232,196,138,0.15); background: rgba(25,20,14,0.95);
}
.expl-mode-row { display: flex; gap: 4px; margin-bottom: 4px; }
.expl-mode-btn {
  flex: 1; padding: 5px 0; font-size: 11px; font-weight: 600;
  background: rgba(232,196,138,0.06); border: 1px solid rgba(232,196,138,0.12);
  color: rgba(200,180,140,0.5); border-radius: 4px; cursor: pointer;
  font-family: inherit; transition: all 0.15s;
}
.expl-mode-btn:hover { background: rgba(232,196,138,0.12); color: #e8c48a; }
.expl-mode-btn.active {
  background: rgba(232,196,138,0.2); border-color: rgba(232,196,138,0.5);
  color: #e8c48a;
}
.expl-annotate-list {
  display: flex; flex-direction: column; gap: 2px; flex: 1; overflow-y: auto;
}
.expl-annot-item {
  display: flex; align-items: center; gap: 5px; padding: 4px 6px;
  border-radius: 4px; cursor: pointer; transition: all 0.12s;
  border: 1px solid transparent;
}
.expl-annot-item:hover { background: rgba(232,196,138,0.06); }
.expl-annot-item.annot-active {
  background: rgba(232,196,138,0.12); border-color: rgba(232,196,138,0.4);
}
.expl-annot-item.annot-swap {
  background: rgba(255,224,102,0.1); border-color: #ffe066;
}
.expl-annot-item.annot-empty { opacity: 0.45; }
.expl-annot-dot {
  width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0;
}
.expl-annot-name { flex: 1; font-size: 11px; color: rgba(220,200,170,0.8); font-weight: 600; }
.expl-annot-size { font-size: 9px; color: rgba(200,180,140,0.4); font-family: 'Orbitron',monospace; }
.expl-annot-btn {
  font-size: 10px; padding: 1px 5px; border-radius: 3px;
  background: rgba(232,196,138,0.08); border: 1px solid rgba(232,196,138,0.15);
  color: rgba(220,200,170,0.5); cursor: pointer; font-family: inherit;
  transition: all 0.12s;
}
.expl-annot-btn:hover { background: rgba(232,196,138,0.2); color: #e8c48a; }
.expl-annot-btn.swap-target {
  background: rgba(255,224,102,0.15); border-color: #ffe066; color: #ffe066;
}
.expl-annot-cancel { text-align: center; padding: 4px 0; }
.expl-annotate-actions { padding-top: 4px; border-top: 1px solid rgba(232,196,138,0.1); }
.expl-annotate-canvas-wrap {
  flex: 1; position: relative; overflow: hidden; background: #1a1a1a;
}
.expl-annotate-canvas {
  position: absolute; top: 0; left: 0; width: 100%; height: 100%;
}

/* ── Final crop grid ── */
.expl-crop-grid {
  display: flex; flex-wrap: wrap; gap: 8px; padding: 10px;
  justify-content: center; align-content: flex-start;
  overflow-y: auto; max-height: 100%;
}
.expl-crop-item {
  display: flex; flex-direction: column; align-items: center; gap: 2px;
  padding: 6px; background: rgba(0,0,0,0.3); border-radius: 6px;
  border: 1px solid rgba(232,196,138,0.08);
  min-width: 60px;
}
.expl-crop-thumb { max-width: 60px; max-height: 60px; object-fit: contain; image-rendering: pixelated; }
.expl-crop-label { font-size: 10px; font-weight: 600; }
.expl-crop-btn {
  font-size: 10px; padding: 3px 8px; border-radius: 3px;
  background: rgba(232,196,138,0.08); border: 1px solid rgba(232,196,138,0.15);
  color: rgba(220,200,170,0.6); cursor: pointer; font-family: inherit;
  transition: all 0.15s;
}
.expl-crop-btn:hover { background: rgba(232,196,138,0.18); color: #e8c48a; }

/* Toast */
.sd-toast {
  position: fixed; bottom: 40px; left: 50%; transform: translateX(-50%) translateY(80px);
  background: rgba(10,8,5,0.95); color: #e8c48a; padding: 14px 32px; border-radius: 10px;
  font-size: 15px; font-weight: 600; pointer-events: none; opacity: 0; transition: all 0.35s;
  z-index: 10000; border: 1px solid rgba(232,196,138,0.35);
  box-shadow: 0 8px 32px rgba(0,0,0,0.6), 0 0 20px rgba(232,196,138,0.1);
  letter-spacing: 0.5px; max-width: 500px; text-align: center;
}
.sd-toast.show { opacity: 1; transform: translateX(-50%) translateY(0); }
.sd-preview-tip { font-size: 11px; color: rgba(200,180,140,0.25); margin-top: 4px; }
.sd-gen-row { display: flex; gap: 8px; }
.sd-gen-hint { font-size: 10px; color: rgba(200,180,140,0.3); margin-top: 4px; line-height: 1.4; }
.sd-state-bar {
  display: flex; gap: 16px; padding: 8px 0;
  font-size: 12px; color: rgba(200,180,140,0.5);
}
.sd-state-bar b { color: #e8c48a; }

/* ═══════════════════ Tab 3: AutoBind (Rigging Editor) ═══════════════════ */
.ab-auto-sidebar {
  flex: 1; display: flex; flex-direction: column; overflow-y: auto;
}
.ab-mode-bar {
  display: flex; gap: 4px;
  padding: 8px 10px; background: rgba(28,24,16,0.98);
  border-bottom: 1px solid rgba(232,196,138,0.15); flex-shrink: 0;
}
.ab-mode-btn {
  flex: 1; padding: 5px 10px; font-size: 11px; font-weight: 600;
  background: rgba(232,196,138,0.06); border: 1px solid rgba(232,196,138,0.15);
  color: rgba(220,200,170,0.5); border-radius: 4px; cursor: pointer;
  font-family: inherit; transition: all 0.15s;
}
.ab-mode-btn.active {
  background: rgba(232,196,138,0.15); border-color: rgba(232,196,138,0.4);
  color: #e8c48a;
}

.ab-toolbar {
  display: flex; align-items: center; gap: 8px;
  padding: 6px 12px; background: rgba(28,24,16,0.98);
  border-bottom: 1px solid rgba(232,196,138,0.15); flex-shrink: 0;
}
.ab-toolbar-sep { width: 1px; height: 16px; background: rgba(232,196,138,0.15); }
.ab-toolbar-hint { font-size: 10px; color: rgba(200,180,140,0.35); }
.ab-status { font-size: 11px; color: rgba(200,180,140,0.5); font-family: 'Orbitron',monospace; }

.ab-preview-wrap {
  flex: 1; position: relative; overflow: hidden;
  display: flex; align-items: center; justify-content: center;
}
.ab-preview-canvas { display: block; width: 100%; height: 100%; }
.ab-edit-mode-bar {
  position: absolute; bottom: 12px; left: 50%; transform: translateX(-50%);
  display: flex; gap: 2px; z-index: 10;
  background: rgba(20,16,10,0.85); border: 1px solid rgba(232,196,138,0.25);
  border-radius: 6px; padding: 3px; backdrop-filter: blur(6px);
}
.ab-edit-mode-btn {
  padding: 5px 14px; font-size: 12px; font-weight: 600;
  border: none; border-radius: 4px; cursor: pointer;
  background: transparent; color: rgba(200,180,140,0.5);
  transition: all 0.15s; white-space: nowrap;
}
.ab-edit-mode-btn:hover { color: rgba(232,196,138,0.8); background: rgba(232,196,138,0.08); }
.ab-edit-mode-btn.active {
  background: rgba(232,196,138,0.18); color: #e8c48a;
  box-shadow: 0 0 8px rgba(232,196,138,0.15);
}
.ab-preview-empty {
  position: absolute; display: flex; flex-direction: column; align-items: center; gap: 8px;
  color: rgba(200,180,140,0.3); font-size: 13px; pointer-events: none;
}
.ab-preview-empty-icon { font-size: 48px; }
.ab-preview-empty-sub { font-size: 11px; color: rgba(200,180,140,0.2); }

.ab-sidebar-section {
  padding: 10px; border-bottom: 1px solid rgba(232,196,138,0.08);
}
.ab-sidebar-title {
  font-size: 11px; font-weight: 700; color: rgba(232,196,138,0.6);
  letter-spacing: 1px; margin-bottom: 8px; display: flex; align-items: center; gap: 6px;
}
.ab-part-count { font-size: 10px; color: rgba(200,180,140,0.3); font-family: 'Orbitron',monospace; }
.ab-sidebar-actions { display: flex; flex-direction: column; gap: 6px; }
.ab-sidebar-btn {
  width: 100%; padding: 7px 10px; font-size: 12px; font-weight: 600;
  background: rgba(232,196,138,0.08); border: 1px solid rgba(232,196,138,0.25);
  color: #e8c48a; border-radius: 4px; cursor: pointer;
  font-family: inherit; transition: all 0.15s;
}
.ab-sidebar-btn:hover:not(:disabled) { background: rgba(232,196,138,0.18); }
.ab-sidebar-btn:disabled { opacity: 0.35; cursor: not-allowed; }
.ab-btn-primary {
  background: linear-gradient(135deg, rgba(100,180,255,0.15), rgba(60,120,200,0.15));
  border-color: rgba(100,180,255,0.4); color: #88bbff;
}
.ab-btn-primary:hover:not(:disabled) { background: rgba(100,180,255,0.25); }
.ab-btn-success {
  background: linear-gradient(135deg, rgba(100,255,100,0.12), rgba(60,200,80,0.12));
  border-color: rgba(100,255,100,0.4); color: #88ff88;
}
.ab-btn-success:hover:not(:disabled) { background: rgba(100,255,100,0.22); }
.ab-btn-sm { padding: 4px 8px; font-size: 10px; flex: 1; }
.ab-bottom-actions { margin-top: auto; border-top: 1px solid rgba(232,196,138,0.1); border-bottom: none; }

.ab-parts-list { display: flex; flex-direction: column; gap: 2px; max-height: 320px; overflow-y: auto; }
.ab-part-row {
  display: flex; align-items: center; gap: 6px;
  padding: 5px 8px; border-radius: 4px; cursor: pointer;
  border: 1px solid transparent; transition: all 0.12s;
}
.ab-part-row:hover { background: rgba(232,196,138,0.06); }
.ab-part-row.selected {
  background: rgba(232,196,138,0.12); border-color: rgba(232,196,138,0.3);
}
.ab-part-row.swap-source {
  background: rgba(255,220,100,0.12); border-color: rgba(255,220,100,0.4);
}
.ab-part-row.empty { opacity: 0.35; }
.ab-part-dot { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; }
.ab-part-label { font-size: 11px; color: #ddd; flex: 1; }
.ab-part-adj-info {
  font-size: 9px; color: rgba(200,180,140,0.35);
  font-family: 'Orbitron',monospace; flex-shrink: 0;
}
.ab-part-btns { display: flex; gap: 3px; flex-shrink: 0; }
.ab-part-action {
  padding: 2px 6px; font-size: 10px; border-radius: 3px; cursor: pointer;
  border: 1px solid rgba(200,200,200,0.15); background: rgba(255,255,255,0.04);
  color: #999; font-family: inherit; transition: all 0.12s;
}
.ab-part-action:hover { background: rgba(255,255,255,0.12); color: #ddd; }
.ab-part-action.swap-target {
  border-color: rgba(255,220,100,0.5); color: #ffcc44;
  background: rgba(255,220,100,0.1); animation: ab-swap-pulse 0.8s infinite alternate;
}
@keyframes ab-swap-pulse {
  from { box-shadow: 0 0 0 rgba(255,220,100,0); }
  to { box-shadow: 0 0 6px rgba(255,220,100,0.3); }
}

.ab-advanced-section { border-bottom: none; }
.ab-advanced-toggle {
  font-size: 11px; font-weight: 600; color: rgba(200,180,140,0.5);
  cursor: pointer; display: flex; align-items: center; gap: 6px;
  padding: 4px 0; transition: color 0.15s;
}
.ab-advanced-toggle:hover { color: rgba(232,196,138,0.8); }
.ab-advanced-arrow { font-size: 8px; transition: transform 0.2s; }
.ab-advanced-panel {
  display: flex; flex-direction: column; gap: 6px;
  padding: 8px 0 0; margin-top: 6px;
}
.ab-adv-row {
  display: flex; align-items: center; gap: 8px; font-size: 11px; color: rgba(220,200,170,0.7);
}
.ab-adv-row label { width: 50px; flex-shrink: 0; }
.ab-adv-input {
  flex: 1; padding: 3px 6px; font-size: 11px;
  background: rgba(0,0,0,0.3); border: 1px solid rgba(232,196,138,0.2);
  color: #ddd; border-radius: 3px; font-family: 'Orbitron',monospace;
  box-sizing: border-box;
}
.ab-adv-input:focus { border-color: rgba(232,196,138,0.4); outline: none; }
.ab-adv-actions { display: flex; gap: 6px; margin-top: 4px; }

.ab-layer-hint {
  font-size: 10px; font-weight: 400; color: rgba(200,180,140,0.35); margin-left: 4px;
}
.ab-layer-list {
  display: flex; flex-direction: column; gap: 1px;
  max-height: 240px; overflow-y: auto;
}
.ab-layer-row {
  display: flex; align-items: center; gap: 6px;
  padding: 5px 8px; border-radius: 3px; cursor: pointer;
  background: rgba(40,34,24,0.5); transition: background 0.15s;
  font-size: 11px; color: rgba(220,200,170,0.8);
}
.ab-layer-row:hover { background: rgba(60,50,35,0.7); }
.ab-layer-row.selected { background: rgba(232,196,138,0.15); color: #e8c48a; }
.ab-layer-dot {
  width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0;
}
.ab-layer-name { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.ab-layer-idx {
  font-size: 9px; font-family: 'Orbitron',monospace;
  color: rgba(200,180,140,0.35); min-width: 16px; text-align: right;
}
.ab-layer-btns { display: flex; gap: 2px; flex-shrink: 0; }
.ab-layer-btn {
  width: 20px; height: 18px; border: none; border-radius: 2px;
  background: rgba(232,196,138,0.1); color: rgba(232,196,138,0.5);
  font-size: 8px; cursor: pointer; display: flex; align-items: center; justify-content: center;
  transition: all 0.15s; padding: 0;
}
.ab-layer-btn:hover:not(:disabled) { background: rgba(232,196,138,0.25); color: #e8c48a; }
.ab-layer-btn:disabled { opacity: 0.25; cursor: default; }

.ab-manual-panel { flex: 1; position: relative; overflow: hidden; }

/* ═══════════════════ Tab 4: AnimWorkshop ═══════════════════ */
.aw-side { display: flex; flex-direction: column; height: 100%; overflow: hidden; }
.aw-side-right { display: flex; flex-direction: column; overflow-y: auto; padding: 0; }
.aw-toolbar {
  display: flex; align-items: center; gap: 8px;
  padding: 6px 12px; background: rgba(28,24,16,0.98);
  border-bottom: 1px solid rgba(232,196,138,0.15); flex-shrink: 0;
}
.aw-info {
  margin-left: auto; font-size: 11px;
  color: rgba(200,185,160,0.5); font-family: 'Orbitron',monospace;
}
.aw-canvas { flex: 1; cursor: crosshair; display: block; min-height: 0; }
.aw-tl-resize-handle {
  height: 4px; cursor: ns-resize; flex-shrink: 0;
  background: rgba(232,196,138,0.08);
  border-top: 1px solid rgba(232,196,138,0.15);
  transition: background 0.15s;
}
.aw-tl-resize-handle:hover, .aw-tl-resize-handle.dragging { background: rgba(232,196,138,0.25); }
.aw-timeline-area { flex-shrink: 0; height: 220px; background: rgba(22,18,12,0.97); overflow: hidden; }

/* Anim source bar in left sidebar */
.aw-anim-source-bar {
  padding: 10px 12px; border-bottom: 1px solid rgba(232,196,138,0.1);
}
.aw-source-title {
  font-size: 11px; color: rgba(200,180,140,0.5); text-transform: uppercase;
  letter-spacing: 1px; margin-bottom: 8px;
}
.aw-source-btns { display: flex; gap: 6px; }
.aw-source-btn {
  flex: 1; padding: 6px 4px; font-size: 11px; font-weight: 500;
  background: rgba(232,196,138,0.06); border: 1px solid rgba(232,196,138,0.15);
  color: rgba(220,200,170,0.7); border-radius: 4px; cursor: pointer;
  transition: all 0.15s; font-family: inherit; text-align: center;
}
.aw-source-btn:hover { background: rgba(232,196,138,0.15); color: #e8c48a; }
.aw-source-ai { border-color: rgba(100,200,255,0.25); color: rgba(100,200,255,0.7); }
.aw-source-ai:hover { background: rgba(100,200,255,0.12); color: #8df; }
.aw-source-active { background: rgba(100,200,255,0.15) !important; border-color: rgba(100,200,255,0.4) !important; color: #8df !important; }

/* Anim list */
.aw-anim-list-area { flex: 1; overflow-y: auto; padding: 4px 0; }
.aw-anim-empty {
  padding: 24px 16px; text-align: center;
  font-size: 12px; color: rgba(200,180,140,0.35);
}
.aw-anim-item {
  display: flex; align-items: center; gap: 6px;
  padding: 7px 12px; cursor: pointer;
  border-left: 3px solid transparent;
  transition: all 0.12s;
}
.aw-anim-item:hover { background: rgba(232,196,138,0.06); }
.aw-anim-item.active {
  background: rgba(232,196,138,0.1); border-left-color: #e8c48a;
}
.aw-anim-item-info { flex: 1; min-width: 0; }
.aw-anim-item-name {
  font-size: 12px; color: rgba(220,200,170,0.85);
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis; display: block;
}
.aw-anim-item-dur { font-size: 10px; color: rgba(200,180,140,0.4); }
.aw-anim-item-actions { display: flex; gap: 4px; opacity: 0; transition: opacity 0.15s; }
.aw-anim-item:hover .aw-anim-item-actions { opacity: 1; }
.aw-anim-act-btn {
  width: 22px; height: 22px; border: none; border-radius: 3px;
  background: rgba(232,196,138,0.1); color: rgba(220,200,170,0.6);
  font-size: 10px; cursor: pointer; display: flex; align-items: center; justify-content: center;
}
.aw-anim-act-btn:hover { background: rgba(232,196,138,0.25); color: #e8c48a; }
.aw-anim-act-del:hover { background: rgba(255,80,80,0.2); color: #f88; }

/* Import dialog overlay */
.aw-import-overlay {
  position: absolute; inset: 0; z-index: 100;
  background: rgba(0,0,0,0.6); display: flex; align-items: center; justify-content: center;
}
.aw-import-dialog {
  background: rgba(30,25,18,0.98); border: 1px solid rgba(232,196,138,0.2);
  border-radius: 10px; padding: 20px; width: 380px; max-height: 500px;
  display: flex; flex-direction: column; gap: 12px;
  box-shadow: 0 12px 40px rgba(0,0,0,0.5);
}
.aw-import-title { font-size: 16px; font-weight: 600; color: #e8c48a; }
.aw-import-hint { font-size: 12px; color: rgba(200,180,140,0.5); }
.aw-import-list {
  max-height: 280px; overflow-y: auto; display: flex; flex-direction: column; gap: 4px;
}
.aw-import-item {
  display: flex; align-items: center; gap: 8px;
  padding: 6px 10px; border-radius: 4px; cursor: pointer;
  font-size: 13px; color: rgba(220,200,170,0.8);
  background: rgba(232,196,138,0.04);
}
.aw-import-item:hover { background: rgba(232,196,138,0.1); }
.aw-import-item input[type="checkbox"] { accent-color: #e8c48a; }
.aw-import-actions { display: flex; gap: 8px; align-items: center; }
.aw-import-btn {
  padding: 6px 14px; font-size: 12px; border: 1px solid rgba(232,196,138,0.2);
  background: rgba(232,196,138,0.06); color: rgba(220,200,170,0.7);
  border-radius: 4px; cursor: pointer; font-family: inherit;
}
.aw-import-btn:hover { background: rgba(232,196,138,0.15); color: #e8c48a; }
.aw-import-confirm {
  background: linear-gradient(135deg, rgba(100,255,100,0.12), rgba(60,200,80,0.12));
  border-color: rgba(100,255,100,0.3); color: #88ff88;
}
.aw-import-confirm:hover { background: rgba(100,255,100,0.22); }
.aw-import-cancel { border-color: rgba(255,100,100,0.2); color: rgba(255,150,150,0.6); }
.aw-import-cancel:hover { background: rgba(255,80,80,0.12); }

/* ═══════════════════ Tab 5: Upload ═══════════════════ */
.gu-header { text-align: center; }
.gu-title { font-size: 24px; font-weight: 700; color: #e8c48a; margin-bottom: 4px; }
.gu-subtitle { font-size: 13px; color: rgba(200,180,140,0.5); }
.gu-checklist { display: flex; flex-direction: column; gap: 8px; }
.gu-check-item {
  display: flex; align-items: center; gap: 10px;
  padding: 10px 14px; border-radius: 8px;
  background: rgba(232,196,138,0.03); border: 1px solid rgba(232,196,138,0.08);
  font-size: 13px;
}
.gu-check-item.done { border-color: rgba(100,255,100,0.2); }
.gu-check-icon { font-size: 16px; }
.gu-check-text { flex: 1; color: rgba(220,200,170,0.7); }
.gu-check-status { font-size: 11px; color: rgba(200,180,140,0.4); }
.gu-check-item.done .gu-check-status { color: rgba(100,255,100,0.6); }
.gu-export-section { margin-top: 8px; }
.gu-config { display: flex; flex-direction: column; gap: 8px; }
.gu-config-row {
  display: flex; align-items: center; gap: 12px; font-size: 13px;
  color: rgba(220,200,170,0.7);
}
.gu-config-row span { width: 80px; flex-shrink: 0; }
.gu-input {
  flex: 1; padding: 6px 10px; font-size: 12px;
  background: rgba(0,0,0,0.3); border: 1px solid rgba(232,196,138,0.2);
  color: #ddd; border-radius: 4px; font-family: inherit; box-sizing: border-box;
}
.gu-actions { display: flex; gap: 12px; flex-wrap: wrap; }
.gu-actions .sd-gen-btn, .gu-actions .sd-action-btn { flex: 1; min-width: 150px; }
.gu-check-detail {
  font-size: 11px; color: rgba(200,180,140,0.5); margin-left: auto;
  font-family: 'Orbitron',monospace;
}
.gu-log {
  max-height: 120px; overflow-y: auto; padding: 8px;
  background: rgba(0,0,0,0.25); border-radius: 6px;
  font-family: monospace; font-size: 11px; color: rgba(200,190,170,0.4);
}
.gu-log-line { padding: 2px 0; }

/* ═══════════════════ Shared component styles (from old editor) ═══════════════════ */

/* Toolbar buttons */
.se-tb-btn {
  padding: 4px 14px; font-size: 12px; font-weight: 600;
  background: rgba(232,196,138,0.12); border: 1px solid rgba(232,196,138,0.35);
  color: #e8c48a; border-radius: 4px; cursor: pointer;
  font-family: inherit; transition: background 0.15s;
}
.se-tb-btn:hover { background: rgba(232,196,138,0.25); }
.se-mode-btn.active { background: rgba(232,196,138,0.3); color: #fff; }
.se-tb-ai-btn { color: #88ff88; border-color: rgba(100,255,100,0.35); background: rgba(100,255,100,0.08); }
.se-tb-ai-btn:hover { background: rgba(100,255,100,0.2); }
.se-tb-sep { color: rgba(200,180,140,0.25); }
.se-tb-check { font-size: 12px; color: rgba(220,200,170,0.7); cursor: pointer; display: flex; align-items: center; gap: 3px; }
.se-tb-check input { accent-color: #e8c48a; }
.se-tb-undo, .se-tb-redo { font-size: 16px; padding: 2px 8px; min-width: 28px; }
.se-tb-zoom-btn { font-size: 16px; padding: 2px 8px; min-width: 28px; }
.se-tb-zoom-label {
  font-family: 'Orbitron', monospace; font-size: 11px; color: rgba(232,196,138,0.7);
  min-width: 48px; text-align: center; display: inline-block;
}
.se-tb-save-btn { color: #ffbb44; border-color: rgba(255,187,68,0.35); background: rgba(255,187,68,0.08); }
.se-tb-save-btn:hover { background: rgba(255,187,68,0.2); }

/* Left panel structure */
.se-left-tabs {
  display: flex; flex-shrink: 0;
  border-bottom: 1px solid rgba(232,196,138,0.15);
  background: rgba(28,24,16,0.98);
}
.se-left-tab {
  flex: 1; padding: 8px 4px; font-size: 12px; font-weight: 700;
  background: none; border: none; border-bottom: 2px solid transparent;
  color: rgba(200,180,140,0.5); cursor: pointer; font-family: inherit;
  transition: all 0.15s; white-space: nowrap;
}
.se-left-tab:hover { color: rgba(232,196,138,0.8); background: rgba(232,196,138,0.04); }
.se-left-tab.active { color: #e8c48a; border-bottom-color: #e8c48a; background: rgba(232,196,138,0.08); }
.se-left-tab-content { flex: 1; overflow-y: auto; }

/* Right panel */

/* Canvas */
.se-canvas { width: 100%; height: 100%; cursor: crosshair; display: block; }

/* Panel headers */
.se-panel-header {
  font-family: 'Orbitron',monospace; font-size: 11px; font-weight: 700;
  color: #e8c48a; letter-spacing: 2px; padding: 10px 12px;
  border-bottom: 1px solid rgba(232,196,138,0.15); text-transform: uppercase;
}

/* Bone Tree */
.se-bone-tree { display: flex; flex-direction: column; height: 100%; }
.se-search {
  margin: 6px 8px; padding: 5px 8px; font-size: 12px;
  background: rgba(0,0,0,0.3); border: 1px solid rgba(232,196,138,0.2);
  color: #ddd; border-radius: 3px; font-family: inherit;
}
.se-search::placeholder { color: rgba(200,180,140,0.35); }
.se-tree-body { flex: 1; overflow-y: auto; padding: 4px 0; }
.se-tree-row {
  display: flex; align-items: center; gap: 4px;
  padding: 3px 8px; cursor: pointer; font-size: 12px; transition: background 0.1s;
}
.se-tree-row:hover { background: rgba(232,196,138,0.06); }
.se-tree-row.selected { background: rgba(232,196,138,0.15); }
.se-tree-toggle { width: 14px; font-size: 9px; color: rgba(200,180,140,0.5); text-align: center; flex-shrink: 0; }
.se-tree-dot { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; }
.se-tree-label { color: #ddd; flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.se-tree-role { font-size: 9px; color: rgba(200,180,140,0.4); flex-shrink: 0; }

/* Property Panel */
.se-prop-panel { padding: 0; }
.se-prop-body { padding: 8px 12px; font-size: 12px; }
.se-prop-empty { color: rgba(200,180,140,0.35); text-align: center; padding: 24px 0; }
.se-prop-section { margin-bottom: 12px; }
.se-prop-title { font-size: 15px; font-weight: 700; color: #e8c48a; margin-bottom: 2px; }
.se-prop-role { font-size: 11px; font-weight: 600; margin-bottom: 8px; }
.se-prop-subtitle { font-size: 10px; font-weight: 700; color: rgba(232,196,138,0.6); letter-spacing: 1px; text-transform: uppercase; margin-bottom: 4px; padding-bottom: 3px; border-bottom: 1px solid rgba(232,196,138,0.1); }
.se-prop-row { display: flex; justify-content: space-between; padding: 2px 0; }
.se-prop-label { color: rgba(220,200,170,0.7); }
.se-prop-value { color: #ddd; font-family: 'Orbitron',monospace; font-size: 11px; }
.se-prop-ik { padding: 4px 0; border-left: 2px solid #cc66ff; padding-left: 8px; margin: 4px 0; }

/* Timeline */
.se-timeline { display: flex; flex-direction: column; height: 100%; }
.tl-toolbar {
  display: flex; align-items: center; justify-content: space-between;
  padding: 4px 8px; background: rgba(28,24,16,0.98);
  border-bottom: 1px solid rgba(232,196,138,0.12); flex-shrink: 0;
}
.tl-toolbar-left, .tl-toolbar-right { display: flex; align-items: center; gap: 3px; }
.tl-btn {
  width: 26px; height: 24px; font-size: 12px;
  border: none; border-radius: 3px; cursor: pointer;
  background: rgba(232,196,138,0.08); color: rgba(220,200,170,0.7);
  display: flex; align-items: center; justify-content: center;
  transition: all 0.12s; padding: 0;
}
.tl-btn:hover { background: rgba(232,196,138,0.2); color: #e8c48a; }
.tl-btn.active { background: rgba(232,196,138,0.2); color: #e8c48a; }
.tl-sep { width: 1px; height: 16px; background: rgba(232,196,138,0.1); margin: 0 4px; }
.tl-select {
  padding: 2px 6px; font-size: 11px; max-width: 140px;
  background: rgba(0,0,0,0.3); border: 1px solid rgba(232,196,138,0.2);
  color: #ddd; border-radius: 3px;
}
.tl-time {
  font-family: 'Orbitron',monospace; font-size: 10px; color: #e8c48a;
  min-width: 120px; text-align: center; margin: 0 4px;
}
.tl-canvas-wrap {
  flex: 1; display: flex; min-height: 0; overflow: hidden;
}
.tl-label-area {
  width: 120px; flex-shrink: 0; overflow: hidden;
}
.tl-label-canvas { display: block; }
.tl-track-area { flex: 1; overflow: hidden; }
.tl-track-canvas { display: block; cursor: default; }

/* Timeline legacy compat */
.se-tl-btn {
  width: 28px; height: 28px; font-size: 14px;
  background: rgba(232,196,138,0.1); border: 1px solid rgba(232,196,138,0.25);
  color: #e8c48a; border-radius: 4px; cursor: pointer;
  display: flex; align-items: center; justify-content: center;
}
.se-tl-btn:hover { background: rgba(232,196,138,0.2); }
.se-tl-select {
  padding: 3px 8px; font-size: 12px;
  background: rgba(0,0,0,0.3); border: 1px solid rgba(232,196,138,0.2);
  color: #ddd; border-radius: 3px; font-family: inherit; max-width: 180px;
}
.se-tl-time { font-family: 'Orbitron',monospace; font-size: 11px; color: #e8c48a; min-width: 110px; }
.se-tl-scrubber { flex: 1; accent-color: #e8c48a; }
.se-tl-tracks { max-height: 140px; overflow-y: auto; padding: 4px 12px; }
.se-tl-empty { color: rgba(200,180,140,0.3); text-align: center; padding: 12px; font-size: 12px; }
.se-tl-track { display: flex; align-items: center; gap: 8px; padding: 2px 0; }
.se-tl-track-label { width: 100px; font-size: 10px; color: rgba(200,180,140,0.6); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; flex-shrink: 0; }
.se-tl-track-bar { flex: 1; height: 16px; background: rgba(0,0,0,0.25); border-radius: 2px; position: relative; cursor: crosshair; }
.se-tl-keyframe {
  position: absolute; top: 3px; width: 10px; height: 10px;
  background: #e8c48a; border-radius: 2px; transform: translateX(-5px) rotate(45deg);
  cursor: grab; transition: background 0.12s;
}
.se-tl-keyframe:hover { background: #ffe0a0; }

/* AI Panel */
.se-ai-container { border-top: 1px solid rgba(100,255,100,0.15); margin-top: 8px; }
.se-ai-concept-section { padding: 8px 12px; border-bottom: 1px solid rgba(100,255,100,0.1); background: rgba(100,255,100,0.02); }
.se-ai-concept-row { display: flex; align-items: center; gap: 8px; }
.se-ai-concept-input {
  flex: 1; padding: 6px 10px; font-size: 13px; font-weight: 600;
  background: rgba(0,0,0,0.35); border: 1px solid rgba(100,255,100,0.25);
  color: #88ff88; border-radius: 4px; font-family: inherit; box-sizing: border-box;
}
.se-ai-concept-input::placeholder { color: rgba(100,255,100,0.3); font-weight: 400; }
.se-ai-concept-input:focus { border-color: rgba(100,255,100,0.5); outline: none; }
.se-ai-weapon-badge {
  padding: 3px 8px; font-size: 10px; font-weight: 700;
  background: rgba(232,196,138,0.15); border: 1px solid rgba(232,196,138,0.35);
  color: #e8c48a; border-radius: 12px; white-space: nowrap; flex-shrink: 0;
}
.se-ai-concept-hint { font-size: 10px; color: rgba(200,180,140,0.4); padding: 4px 0 0; line-height: 1.4; }
.se-ai-panel { padding: 0; }
.se-ai-presets { display: flex; flex-wrap: wrap; gap: 4px; padding: 8px 12px; }
.se-ai-preset-wrapper { display: inline-flex; align-items: stretch; gap: 0; }
.se-ai-preset-btn {
  padding: 3px 10px; font-size: 11px;
  background: rgba(100,255,100,0.08); border: 1px solid rgba(100,255,100,0.25);
  color: #88ff88; border-radius: 3px; cursor: pointer; font-family: inherit;
}
.se-ai-preset-btn.has-ref { border-radius: 3px 0 0 3px; border-right: none; }
.se-ai-preset-btn:hover { background: rgba(100,255,100,0.18); }
.se-ai-quick-gen-btn {
  padding: 3px 6px; font-size: 11px;
  background: rgba(255,200,50,0.15); border: 1px solid rgba(255,200,50,0.4);
  color: #ffcc44; border-radius: 0 3px 3px 0; cursor: pointer; font-family: inherit;
}
.se-ai-quick-gen-btn:hover { background: rgba(255,200,50,0.35); }
.se-ai-label { font-size: 11px; color: rgba(200,180,140,0.5); padding: 4px 12px 2px; }
.se-ai-prompt {
  width: calc(100% - 24px); margin: 0 12px; padding: 6px 8px; font-size: 12px;
  background: rgba(0,0,0,0.3); border: 1px solid rgba(100,255,100,0.2);
  color: #ddd; border-radius: 3px; font-family: inherit; resize: vertical;
}
.se-ai-gen-btn {
  flex: 1; padding: 6px 16px; font-size: 13px; font-weight: 700;
  background: linear-gradient(135deg, rgba(100,255,100,0.2), rgba(60,200,80,0.2));
  border: 1px solid rgba(100,255,100,0.4); color: #88ff88;
  border-radius: 4px; cursor: pointer; font-family: inherit; transition: background 0.15s;
}
.se-ai-gen-btn:hover { background: rgba(100,255,100,0.3); }
.se-ai-status { padding: 4px 12px; font-size: 11px; color: rgba(200,180,140,0.4); }
.se-ai-status.active { color: #88bbff; }
.se-ai-status.success { color: #88ff88; }
.se-ai-result { padding: 0 12px 8px; }
.se-ai-apply-btn {
  margin: 6px 0; padding: 6px 14px; font-size: 12px; font-weight: 700;
  background: rgba(232,196,138,0.15); border: 1px solid rgba(232,196,138,0.4);
  color: #e8c48a; border-radius: 4px; cursor: pointer; width: 100%; font-family: inherit;
}
.se-ai-apply-btn:hover { background: rgba(232,196,138,0.3); }
.se-ai-prompt-preview, .se-ai-json-preview {
  max-height: 120px; overflow: auto; padding: 6px 8px;
  background: rgba(0,0,0,0.35); border: 1px solid rgba(100,100,80,0.2);
  border-radius: 3px; font-size: 10px; color: rgba(200,190,170,0.6);
  font-family: monospace; white-space: pre-wrap; margin: 4px 0;
}
.se-ai-llm-config { padding: 8px 12px; border-bottom: 1px solid rgba(100,255,100,0.1); }
.se-ai-input {
  display: block; width: calc(100% - 0px); margin: 4px 0; padding: 4px 8px; font-size: 11px;
  background: rgba(0,0,0,0.3); border: 1px solid rgba(100,255,100,0.2);
  color: #ddd; border-radius: 3px; font-family: inherit; box-sizing: border-box;
}
.se-ai-input option { background: #1a1510; color: #ddd; }
.se-ai-mode-desc { font-size: 10px; color: rgba(200,180,140,0.45); padding: 2px 0 4px; line-height: 1.4; }
.se-ai-custom-api { padding-top: 4px; }
.se-ai-sec-note { font-size: 10px; color: rgba(255,180,80,0.55); padding: 4px 0; line-height: 1.4; }
.se-ai-btn-row { display: flex; gap: 8px; padding: 4px 12px 8px; }
.se-ai-import-btn {
  padding: 6px 14px; font-size: 12px; font-weight: 600;
  background: rgba(100,180,255,0.1); border: 1px solid rgba(100,180,255,0.3);
  color: #88bbff; border-radius: 4px; cursor: pointer; font-family: inherit; transition: background 0.15s;
}
.se-ai-import-btn:hover { background: rgba(100,180,255,0.25); }
.se-ai-name-input {
  display: block; width: calc(100% - 24px); margin: 0 12px; padding: 5px 8px; font-size: 12px;
  background: rgba(0,0,0,0.3); border: 1px solid rgba(100,255,100,0.2);
  color: #ddd; border-radius: 3px; font-family: inherit; box-sizing: border-box;
}
.se-ai-anim-list { border-top: 1px solid rgba(100,255,100,0.1); margin-top: 8px; }
.se-ai-anim-list-header { font-size: 11px; font-weight: 700; color: rgba(200,180,140,0.5); padding: 8px 12px 4px; letter-spacing: 1px; }
.se-ai-anim-item {
  display: flex; align-items: center; gap: 8px; padding: 5px 12px;
  cursor: pointer; transition: background 0.1s; font-size: 12px;
}
.se-ai-anim-item:hover { background: rgba(100,255,100,0.06); }
.se-ai-anim-name { color: #88ff88; flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.se-ai-anim-dur { font-size: 10px; color: rgba(200,180,140,0.4); font-family: 'Orbitron',monospace; flex-shrink: 0; }
.se-ai-anim-btn {
  padding: 2px 6px; font-size: 10px; border-radius: 3px; cursor: pointer;
  border: 1px solid rgba(200,200,200,0.15); background: rgba(255,255,255,0.04);
  color: #999; font-family: inherit; transition: background 0.12s; flex-shrink: 0;
}
.se-ai-anim-btn:hover { background: rgba(255,255,255,0.12); color: #ddd; }
.se-ai-anim-del { border-color: rgba(255,80,80,0.25); color: #ff8888; }
.se-ai-anim-del:hover { background: rgba(255,80,80,0.15); }
.se-ai-anim-empty { font-size: 11px; color: rgba(200,180,140,0.3); padding: 8px 12px; text-align: center; }

/* Template Library */
.se-tmpl-container { overflow-y: auto; flex: 1; }
.se-tmpl-header {
  display: flex; align-items: center; justify-content: space-between;
  padding: 8px 12px; border-bottom: 1px solid rgba(232,196,138,0.12);
}
.se-tmpl-title { font-size: 14px; font-weight: 700; color: #e8c48a; font-family: 'Orbitron', monospace; }
.se-tmpl-import-btn {
  font-size: 11px; padding: 3px 10px; border-radius: 4px; cursor: pointer;
  background: rgba(100,180,255,0.1); border: 1px solid rgba(100,180,255,0.3);
  color: #88bbff; transition: background 0.15s;
}
.se-tmpl-import-btn:hover { background: rgba(100,180,255,0.2); }
.se-tmpl-grid { padding: 8px; display: flex; flex-direction: column; gap: 10px; }
.se-tmpl-card {
  display: flex; gap: 12px; padding: 12px; cursor: pointer; position: relative;
  background: rgba(232,196,138,0.04); border: 1px solid rgba(232,196,138,0.1);
  border-radius: 8px; transition: all 0.2s;
}
.se-tmpl-card:hover {
  background: rgba(232,196,138,0.12); border-color: rgba(232,196,138,0.35);
  transform: translateY(-1px); box-shadow: 0 2px 8px rgba(0,0,0,0.3);
}
.se-tmpl-featured { border-color: rgba(100,200,255,0.4) !important; background: rgba(100,200,255,0.06) !important; }
.se-tmpl-thumb {
  font-size: 28px; display: flex; align-items: center; justify-content: center;
  width: 80px; min-height: 60px; flex-shrink: 0;
  background: rgba(0,0,0,0.2); border-radius: 6px; overflow: hidden;
}
.se-tmpl-thumb-img { width: 100%; height: auto; max-height: 80px; object-fit: contain; image-rendering: pixelated; }
.se-tmpl-thumb-emoji { font-size: 32px; }
.se-tmpl-info { flex: 1; min-width: 0; }
.se-tmpl-name { font-size: 13px; font-weight: 700; color: #e8c48a; margin-bottom: 3px; }
.se-tmpl-desc { font-size: 11px; color: rgba(220,200,170,0.65); margin-bottom: 4px; line-height: 1.4; }
.se-tmpl-meta { font-size: 10px; color: rgba(200,180,140,0.45); font-family: 'Orbitron',monospace; }

/* Binding Panel */
.se-binding-container {
  position: absolute; top: 0; left: 0; right: 0; bottom: 0;
  background: #1a1a1a; z-index: 10;
}
.bp-root { display: flex; flex-direction: column; height: 100%; }
.bp-header {
  height: 44px; background: #222; border-bottom: 1px solid #333;
  display: flex; align-items: center; gap: 16px; padding: 0 16px; flex-shrink: 0;
}
.bp-title { font-weight: 700; font-size: 15px; color: #e8c48a; }
.bp-help { font-size: 11px; color: #666; margin-right: auto; }
.bp-upload {
  padding: 6px 18px; border: none; border-radius: 4px; cursor: pointer;
  background: #e8c48a; color: #111; font-weight: 700; font-size: 13px;
}
.bp-upload:hover { background: #ffd97a; }
.bp-body { flex: 1; display: flex; overflow: hidden; }
.bp-sidebar { width: 220px; background: #222; overflow-y: auto; flex-shrink: 0; border-right: 1px solid #333; }
.bp-tip { padding: 12px; font-size: 12px; color: #888; line-height: 1.6; border-bottom: 1px solid #333; }
.bp-tip b { color: #ccc; }
.bp-part {
  display: flex; align-items: center; gap: 8px; padding: 8px 12px; cursor: pointer;
  border-left: 3px solid transparent; transition: background 0.1s;
}
.bp-part:hover { background: #2a2a2a; }
.bp-part.active { background: #2d2d2d; border-left-color: #e8c48a; }
.bp-part.done { opacity: 1; }
.bp-part.skipped { opacity: 0.4; cursor: default; }
.bp-dot { width: 10px; height: 10px; border-radius: 50%; flex-shrink: 0; }
.bp-part-name { font-size: 13px; color: #ddd; flex: 1; }
.bp-part-status { font-size: 12px; flex-shrink: 0; }
.bp-thumb { width: 28px; height: 28px; object-fit: contain; border-radius: 3px; border: 1px solid #444; flex-shrink: 0; }
.bp-canvas-wrap { flex: 1; position: relative; overflow: hidden; }
.bp-canvas { display: block; width: 100%; height: 100%; }
.bp-toast {
  position: absolute; bottom: 20px; left: 50%; transform: translateX(-50%) translateY(60px);
  background: rgba(0,0,0,0.85); color: #fff; padding: 10px 24px; border-radius: 6px;
  font-size: 14px; pointer-events: none; opacity: 0; transition: all 0.3s;
}
.bp-toast.show { opacity: 1; transform: translateX(-50%) translateY(0); }
.bp-undo-btn {
  padding: 5px 14px; border: 1px solid rgba(232,196,138,0.3); border-radius: 4px;
  background: rgba(232,196,138,0.08); color: #e8c48a; font-size: 12px; font-weight: 600;
  cursor: pointer; font-family: inherit;
}
.bp-undo-btn:hover { background: rgba(232,196,138,0.2); }
.bp-part-btns { display: flex; gap: 4px; margin-left: auto; flex-shrink: 0; }
.bp-part-btn {
  padding: 2px 8px; font-size: 10px; border-radius: 3px; cursor: pointer;
  border: 1px solid rgba(200,200,200,0.2); background: rgba(255,255,255,0.06);
  color: #bbb; font-family: inherit; transition: background 0.12s;
}
.bp-part-btn:hover { background: rgba(255,255,255,0.15); color: #fff; }
.bp-part-del-btn { border-color: rgba(255,80,80,0.3); color: #ff8888; }
.bp-part-del-btn:hover { background: rgba(255,80,80,0.2); }
.bp-part-redo-btn { border-color: rgba(100,180,255,0.3); color: #88bbff; }
.bp-part-redo-btn:hover { background: rgba(100,180,255,0.2); }
.bp-ctx-menu {
  position: absolute; z-index: 100; min-width: 120px;
  background: #2a2a2a; border: 1px solid #444; border-radius: 6px;
  box-shadow: 0 4px 16px rgba(0,0,0,0.5); overflow: hidden;
}
.bp-ctx-label { padding: 6px 12px; font-size: 11px; font-weight: 700; color: #e8c48a; border-bottom: 1px solid #333; background: rgba(232,196,138,0.05); }
.bp-ctx-item { padding: 8px 12px; font-size: 12px; color: #ddd; cursor: pointer; transition: background 0.1s; }
.bp-ctx-item:hover { background: rgba(255,255,255,0.1); }
.bp-ctx-danger { color: #ff8888; }
.bp-ctx-danger:hover { background: rgba(255,80,80,0.15); }
.bp-action-bar {
  display: flex; align-items: center; gap: 10px;
  padding: 8px 16px; flex-shrink: 0;
  background: #222; border-top: 1px solid #333;
}
.bp-action-info { font-size: 12px; color: #888; margin-right: auto; }
.bp-action-btn {
  padding: 6px 16px; font-size: 12px; font-weight: 600;
  background: rgba(232,196,138,0.08); border: 1px solid rgba(232,196,138,0.25);
  color: #e8c48a; border-radius: 4px; cursor: pointer; font-family: inherit; transition: background 0.15s;
}
.bp-action-btn:hover { background: rgba(232,196,138,0.2); }
.bp-action-btn:disabled { opacity: 0.35; cursor: not-allowed; }
.bp-action-primary {
  background: linear-gradient(135deg, rgba(100,255,100,0.15), rgba(60,200,80,0.15));
  border-color: rgba(100,255,100,0.4); color: #88ff88;
}
.bp-action-primary:hover { background: rgba(100,255,100,0.25); }
.bp-offset-info { font-size: 9px; color: rgba(200,180,140,0.4); font-family: 'Orbitron',monospace; margin-left: auto; flex-shrink: 0; }
.bp-part-skip-btn { border-color: rgba(200,200,200,0.2); color: #999; }
.bp-part-skip-btn:hover { background: rgba(200,200,200,0.1); color: #ccc; }

/* ═══════════════════ Spine 左侧 step nav（拆分部件 / 自动绑骨 / 动作工坊 / 导出） ═══════════════════
 * 之前 mount() 把 .spine-step-nav 加到 leftPanel 但从未给它定义样式，
 * 4 个按钮渲染成裸 button 堆，视觉上几乎看不见。补上：grid 平铺 + 边框 +
 * active/completed 高亮，复用 STUDIO_CSS 已有的色板（亮绿 = #b6ff5a）。
 */
.spine-step-nav {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 6px;
  padding: 10px 12px;
  background: rgba(255,255,255,0.02);
  border-bottom: 1px solid rgba(255,255,255,0.06);
}
.spine-step-btn {
  display: flex; align-items: center; justify-content: center; gap: 6px;
  padding: 8px 6px;
  background: rgba(255,255,255,0.03);
  border: 1px solid rgba(255,255,255,0.1);
  border-radius: 6px;
  color: var(--text-secondary, #aaa);
  font-size: 12px; font-weight: 500;
  cursor: pointer;
  transition: all 0.15s;
}
.spine-step-btn:hover {
  background: rgba(182,255,90,0.08);
  border-color: rgba(182,255,90,0.3);
  color: #ddd;
}
.spine-step-btn.active {
  background: rgba(182,255,90,0.18);
  border-color: rgba(182,255,90,0.6);
  color: #b6ff5a;
  box-shadow: 0 0 0 1px rgba(182,255,90,0.25) inset;
}
.spine-step-btn.completed {
  border-color: rgba(100,200,255,0.35);
  color: #6cf;
}
.spine-step-btn .step-icon { font-size: 14px; line-height: 1; }
.spine-left-body { padding: 4px 0; }
`;
