import type { IPipeline, PipelineContext, PipelinePanels, PipelineMeta } from '../core/types'
import type { PipelineRegistry } from '../core/PipelineRegistry'
import type { Engine } from '../core/Engine'
import type { CameraStore } from '../core/CameraStore'
import type { PreviewControls } from './PreviewControls'
import { globalState } from '../shared/GlobalState'

export interface ExtraPanels {
  center: HTMLElement
  right: HTMLElement
  bottom: HTMLElement
  toolbar: HTMLElement
}

export interface SceneDeps {
  engine: Engine
  previewControls: PreviewControls
  cameraStore: CameraStore
  sceneManager: import('../core/SceneManager').SceneManager
}

export class PipelinePanel {
  private tabsContainer: HTMLElement
  private leftPanel: HTMLElement
  private extra: ExtraPanels
  private registry: PipelineRegistry
  private context: PipelineContext
  private scene: SceneDeps
  private activePipeline: IPipeline | null = null
  private activeId: string | null = null
  private tabEls: Map<string, HTMLElement> = new Map()
  private unsub: (() => void) | null = null

  // Module 16 split-pane sync — wb-anim 在 Studio 主壳里被切成两个同源 iframe
  // (?pane=left, ?pane=center)，每个 iframe 都跑独立的 PipelinePanel。
  // 用户在任一 iframe 点 tab，必须把切换信号广播给另一份实例，否则两个面板
  // 各自激活不同的 pipeline，左侧编辑 UI 与中间画布不匹配。
  // 详见 pixel-char/index.ts 同名注释。
  private _bc: BroadcastChannel | null = null
  private _bcSelfId = Math.random().toString(36).slice(2, 10)
  private _applyingBroadcast = false

  constructor(
    topbar: HTMLElement,
    leftPanel: HTMLElement,
    extra: ExtraPanels,
    registry: PipelineRegistry,
    context: PipelineContext,
    sceneDeps: SceneDeps,
  ) {
    this.leftPanel = leftPanel
    this.extra = extra
    this.registry = registry
    this.context = context
    this.scene = sceneDeps

    this.tabsContainer = document.createElement('div')
    this.tabsContainer.className = 'pipeline-tabs'
    topbar.appendChild(this.tabsContainer)
  }

  render(): void {
    this.tabsContainer.innerHTML = ''
    this.tabEls.clear()

    // 主 tab（placement='main'）—— 动画工作台主流水线全部平铺到顶栏：
    // 像素角色 → 载具动画 → Spine 骨骼 → 视频角色。
    // 之前 spine / video 折在「⋯ 更多模块 ▾」抽屉里——按用户反馈改成
    // 全部展开，省掉一次点击；切到任一 tab 时 PipelinePanel.activate()
    // 会自动调用 pipeline.createUI(leftPanel, panels) 把对应左侧编辑 UI
    // 渲染出来，所以这里不需要做额外的左侧分发。
    const MAIN_TAB_ORDER = ['pixel-char', 'vehicle-design', 'spine', 'video']
    const mainMetas = this.registry.getByPlacement('main').sort((a, b) => {
      const ai = MAIN_TAB_ORDER.indexOf(a.id)
      const bi = MAIN_TAB_ORDER.indexOf(b.id)
      return (ai < 0 ? 999 : ai) - (bi < 0 ? 999 : bi)
    })
    for (const m of mainMetas) {
      const tab = document.createElement('button')
      tab.className = 'pipeline-tab main-tab'
      tab.innerHTML = `<span class="tab-icon">${m.icon}</span>${m.name}`
      tab.addEventListener('click', () => { void this.activate(m) })
      this.tabsContainer.appendChild(tab)
      this.tabEls.set(m.id, tab)
    }

    // 右侧弹性撑开——历史上「更多模块」贴右；现在 drawer 已经全部展开
    // 到主 tab，spacer 留着保险，未来再加 placement='drawer' 的管线时
    // buildMoreDrawer() 会自然回来。
    const spacer = document.createElement('div')
    spacer.className = 'tab-spacer'
    this.tabsContainer.appendChild(spacer)

    this.buildMoreDrawer()

    this.updateBadge()
    this.unsub = globalState.subscribe(() => this.updateBadge())

    window.addEventListener('ce:switch-pipeline', ((e: CustomEvent) => {
      const id = e.detail?.id
      const target = id
        ? this.registry.getMeta(id)
        : this.registry.getByPlacement('main')[0]
      if (!target) return
      void this.activate(target, { reset: true })
    }) as EventListener)

    this.setupSplitPaneSync()

    // 默认激活第一个 main 管线
    if (mainMetas.length > 0) {
      void this.activate(mainMetas[0], { reset: true })
    }
  }

  /** 跨同源 iframe (?pane=left | ?pane=center) 同步活跃 tab。
   *  广播自己 activate 的 pipeline id；收到对方广播时静默切到对应 tab，
   *  不再回播（用 _applyingBroadcast guard）。 */
  private setupSplitPaneSync(): void {
    try {
      this._bc = new BroadcastChannel('forgeax-plugin.@forgeax-plugin/wb-anim.active-pipeline')
    } catch {
      this._bc = null
      return
    }
    this._bc.onmessage = (e: MessageEvent) => {
      const data = e.data
      if (!data || data.from === this._bcSelfId) return
      const id = data.id
      if (!id || id === this.activeId) return
      const target = this.registry.getMeta(id)
      if (!target) return
      this._applyingBroadcast = true
      void this.activate(target).finally(() => { this._applyingBroadcast = false })
    }
  }

  private broadcastActive(id: string): void {
    if (!this._bc || this._applyingBroadcast) return
    try { this._bc.postMessage({ from: this._bcSelfId, id }) } catch { /* ignore */ }
  }

  /**
   * 「⋯ 更多模块 ▾」抽屉——右上角一个按钮，点开后列出所有 `placement='drawer'`
   * 的管线，按 `meta.group` 分到「生产变体」/「辅助工具」两组（缺省 `'variant'`）。
   */
  private buildMoreDrawer(): void {
    const drawerPipelines = this.registry.getByPlacement('drawer')
    if (drawerPipelines.length === 0) return

    const wrap = document.createElement('div')
    wrap.className = 'pipeline-drawer-wrap'

    const trigger = document.createElement('button')
    trigger.className = 'pipeline-tab drawer-trigger'
    trigger.innerHTML = '<span class="tab-icon">⋯</span>更多模块 <span class="drawer-chevron">▾</span>'
    wrap.appendChild(trigger)

    const panel = document.createElement('div')
    panel.className = 'pipeline-drawer'
    panel.style.display = 'none'

    const groupHead = (text: string) => {
      const h = document.createElement('div')
      h.className = 'pipeline-drawer-group'
      h.textContent = text
      return h
    }
    const item = (icon: string, name: string, desc: string, onClick: () => void) => {
      const it = document.createElement('button')
      it.className = 'pipeline-drawer-item'
      it.innerHTML = `<span class="pipeline-drawer-icon">${icon}</span>` +
        `<span class="pipeline-drawer-text"><span class="pipeline-drawer-name">${name}</span>` +
        `<span class="pipeline-drawer-desc">${desc}</span></span>`
      it.addEventListener('click', () => { panel.style.display = 'none'; onClick() })
      return it
    }

    const variantGroup: PipelineMeta[] = []
    const auxGroup: PipelineMeta[] = []
    for (const m of drawerPipelines) {
      if (m.group === 'aux') auxGroup.push(m)
      else variantGroup.push(m)
    }

    if (variantGroup.length) {
      panel.appendChild(groupHead('生产变体'))
      for (const m of variantGroup) {
        panel.appendChild(item(m.icon, m.name, m.description, () => { void this.activate(m) }))
        this.tabEls.set(m.id, trigger)
      }
    }

    if (auxGroup.length) {
      panel.appendChild(groupHead('辅助工具'))
      for (const m of auxGroup) {
        panel.appendChild(item(m.icon, m.name, m.description, () => { void this.activate(m) }))
        this.tabEls.set(m.id, trigger)
      }
    }

    trigger.addEventListener('click', (e) => {
      e.stopPropagation()
      panel.style.display = panel.style.display === 'none' ? 'block' : 'none'
    })
    document.addEventListener('click', (e) => {
      if (!wrap.contains(e.target as Node)) panel.style.display = 'none'
    }, true)

    wrap.appendChild(panel)
    this.tabsContainer.appendChild(wrap)
  }

  private async activate(meta: PipelineMeta, opts: { reset?: boolean } = {}): Promise<void> {
    this.leaveCurrentMode()
    this.clearPanels()
    this.setActiveTab(meta.id)
    this.activeId = meta.id
    this.broadcastActive(meta.id)
    this.showLoadingHint(meta)

    let pipeline: IPipeline | undefined
    try {
      pipeline = await this.registry.load(meta.id)
    } catch (err) {
      console.warn('[PipelinePanel] load failed:', meta.id, err)
    }
    if (!pipeline) {
      this.showLoadError(meta)
      return
    }

    // 用户在 await 期间可能已经切到别的 tab/设计页 —— 放弃这次 mount。
    if (this.activeId !== meta.id) return

    if (opts.reset) {
      try { await pipeline.resetForNewCharacter?.() }
      catch (err) { console.warn('[PipelinePanel] resetForNewCharacter failed:', err) }
      if (this.activeId !== meta.id) return
    }

    this.activePipeline = pipeline
    await pipeline.init(this.context)
    if (this.activeId !== meta.id) {
      pipeline.dispose()
      this.activePipeline = null
      return
    }

    const panels: PipelinePanels = {
      left: this.leftPanel,
      center: this.extra.center,
      right: this.extra.right,
      bottom: this.extra.bottom,
    }
    this.clearLoadingHint()
    pipeline.createUI(this.leftPanel, panels)
  }

  /** 懒加载期间在左面板里给一个轻量「加载中」提示,大模块第一次 import
   *  可能要 0.5–1s,空白会让人以为卡死。 */
  private showLoadingHint(meta: PipelineMeta): void {
    this.leftPanel.innerHTML = `
      <div class="pipeline-loading">
        <div class="pipeline-loading-spinner"></div>
        <div class="pipeline-loading-text">${meta.icon} ${meta.name} 加载中…</div>
      </div>
    `
  }

  private clearLoadingHint(): void {
    this.leftPanel.innerHTML = ''
  }

  private showLoadError(meta: PipelineMeta): void {
    this.leftPanel.innerHTML = `
      <div class="pipeline-loading pipeline-loading-error">
        ⚠️ 加载失败:${meta.id}
        <div style="margin-top:8px;font-size:12px;opacity:0.7">查看控制台获取详情</div>
      </div>
    `
  }

  private leaveCurrentMode(): void {
    if (this.activePipeline) {
      this.activePipeline.destroyUI()
      this.activePipeline.dispose()
      this.activePipeline = null
    }
    this.activeId = null
  }

  private setActiveTab(id: string): void {
    this.tabEls.forEach((el, tid) => {
      el.classList.toggle('active', tid === id)
    })
  }

  private updateBadge(): void {
    const has = globalState.hasCharacter
    this.tabEls.forEach(el => el.classList.toggle('needs-char', !has))
  }

  private clearPanels(): void {
    this.leftPanel.innerHTML = ''
    this.extra.center.innerHTML = ''
    this.extra.center.classList.remove('active')
    this.extra.toolbar.innerHTML = ''
    this.extra.toolbar.classList.remove('active')
    this.extra.right.innerHTML = ''
    this.extra.right.classList.remove('visible')
    this.extra.bottom.innerHTML = ''
    this.extra.bottom.classList.remove('visible')

    const centerParent = this.extra.center.parentElement
    if (centerParent) centerParent.classList.remove('has-right')
    this.extra.bottom.classList.remove('has-right')
  }

  dispose(): void {
    this.unsub?.()
    this.leaveCurrentMode()
    this.clearPanels()
    this.tabsContainer.remove()
  }
}
