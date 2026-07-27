import { describe, it, expect } from 'vitest'
import {
  audioAssetOptions,
  audioChoices,
  audioLookupAlert,
  patchNodeBgm,
  type AudioOption,
} from '../bgm-authoring'
import { patchNodeData } from '../../../graph/edit/graph-edit'
import type { MediaAsset } from '../../assets/registry-types'
import type { GameGraph } from '../../../runtime/schema/graph-schema'

describe('patchNodeBgm', () => {
  it('清空 ref → 整个 bgm 消失（不留 { ref: "" } 这种 validate 判错、runtime 静默丢弃的半成品）', () => {
    expect(patchNodeBgm({ ref: 'bgm-battle', mode: 'replace' }, { ref: '' })).toBeUndefined()
    expect(patchNodeBgm({ ref: 'bgm-battle' }, { ref: '   ' })).toBeUndefined()
    expect(patchNodeBgm(undefined, { mode: 'replace', restart: true })).toBeUndefined()
  })

  it('第一次填 ref 就产出可跑的最小配置（默认值不落盘）', () => {
    expect(patchNodeBgm(undefined, { ref: ' bgm-battle ' })).toEqual({ ref: 'bgm-battle' })
  })

  it('mode 默认 push 不落盘，replace 才写', () => {
    expect(patchNodeBgm({ ref: 'a', mode: 'replace' }, { mode: 'push' })).toEqual({ ref: 'a' })
    expect(patchNodeBgm({ ref: 'a' }, { mode: 'replace' })).toEqual({ ref: 'a', mode: 'replace' })
  })

  // v2 的「结束当前音乐」是一条**不带曲子**的配置（SPEC §3.3：`mode: 'stop'` 时 ref 可省）。
  // 「没有非空 ref 就删键」那条 v1 规则会让作者压根写不出它。
  it("能写出 { mode: 'stop' }（这一条不引入曲子，所以不需要 ref）", () => {
    expect(patchNodeBgm(undefined, { mode: 'stop' })).toEqual({ mode: 'stop' })
  })

  // `BgmStack.stop()` 只读**被结束那一层**的字段：fadeOutMs 取自离场帧、volume/fadeInMs 取自恢复
  // 出来的那帧，ref 更是压根不读（§3.3「给了也忽略」）。留着这些字段就是一份撒谎的配置：
  // 面板上还显示着一首永远不播的曲子。
  it('曲子 → stop：ref / 播放字段一并收掉，不留自相矛盾的残留', () => {
    const stopped = patchNodeBgm(
      { ref: 'bgm-battle', volume: 0.4, fadeInMs: 800, fadeOutMs: 600, restart: true },
      { mode: 'stop' },
    )
    expect(stopped).toEqual({ mode: 'stop' })
  })

  // 反过来离开 stop 得显式给 mode（面板的下拉就是这么写的）：此时手上没有曲子，
  // 于是回到「这里不换音乐」的空态 —— 而不是落一个 { ref: '' } 半成品。
  it('stop → 起播：手上没曲子 → 整个 bgm 键消失（回空态，作者接着填 ref）', () => {
    expect(patchNodeBgm({ mode: 'stop' }, { mode: 'push' })).toBeUndefined()
  })

  // 合起来一条规则：**merge 完还是 stop，就还是那一条**。「填了 ref 就自动脱离 stop」听着聪明，
  // 但会让下拉与输入框互相偷改对方的值；面板在 stop 下压根不渲染资产输入，所以这条走不到。
  it('stop 状态下塞 ref 不会偷偷变成起播（要离开 stop 得显式换 mode）', () => {
    expect(patchNodeBgm({ mode: 'stop' }, { ref: 'bgm-battle' })).toEqual({ mode: 'stop' })
  })

  it('restart 默认 false 不落盘（同曲续播 = 回合循环友好）', () => {
    expect(patchNodeBgm({ ref: 'a', restart: true }, { restart: false })).toEqual({ ref: 'a' })
    expect(patchNodeBgm({ ref: 'a' }, { restart: true })).toEqual({ ref: 'a', restart: true })
    expect(patchNodeBgm({ ref: 'a', restart: true }, { ref: 'b' })).toEqual({ ref: 'b', restart: true })
  })

  it('只勾 restart 而没有曲子 → 仍是删键（没有曲子可重播）', () => {
    expect(patchNodeBgm(undefined, { restart: true })).toBeUndefined()
  })

  it('保留手写 blueprint.json 里的 volume / fade（面板不出这些控件，也不该抹掉）', () => {
    const kept = patchNodeBgm({ ref: 'a', volume: 0.4, fadeInMs: 800, fadeOutMs: 600 }, { mode: 'replace' })
    expect(kept).toEqual({ ref: 'a', mode: 'replace', volume: 0.4, fadeInMs: 800, fadeOutMs: 600 })
  })

  it('把越界 / 非法数值规范成合法形状（validate 只报 error，不会替作者兜底）', () => {
    expect(patchNodeBgm({ ref: 'a' }, { volume: 3 })).toEqual({ ref: 'a', volume: 1 })
    expect(patchNodeBgm({ ref: 'a' }, { volume: -1 })).toEqual({ ref: 'a', volume: 0 })
    expect(patchNodeBgm({ ref: 'a' }, { volume: Number.NaN })).toEqual({ ref: 'a' })
    expect(patchNodeBgm({ ref: 'a', fadeInMs: -5 }, {})).toEqual({ ref: 'a' })
    expect(patchNodeBgm({ ref: 'a', fadeInMs: 12.6 }, {})).toEqual({ ref: 'a', fadeInMs: 13 })
  })
})

describe('节点面板的写回路径（patchNodeData + patchNodeBgm）', () => {
  const graphWith = (bgm?: unknown): GameGraph => ({
    nodes: [{
      id: 'n1',
      type: 'perf',
      position: { x: 0, y: 0 },
      inputs: [],
      outputs: [],
      data: { name: 'A', ...(bgm ? { bgm } : {}) } as never,
    }],
    edges: [],
  })

  it('清空音乐 → data 上不再有 bgm 键（不是留一个 { ref: "" }）', () => {
    const g = patchNodeData(graphWith({ ref: 'bgm-battle', restart: true }), 'n1', {
      bgm: patchNodeBgm({ ref: 'bgm-battle', restart: true }, { ref: '' }),
    })
    expect('bgm' in g.nodes[0]!.data).toBe(false)
  })

  it('填音乐 → data.bgm 落成最小合法形状', () => {
    const g = patchNodeData(graphWith(), 'n1', { bgm: patchNodeBgm(undefined, { ref: 'bgm-battle' }) })
    expect(g.nodes[0]!.data.bgm).toEqual({ ref: 'bgm-battle' })
  })
})

describe('audio picker fallbacks', () => {
  const asset = (id: string, label?: string): MediaAsset => ({
    id,
    kind: 'audio',
    productionType: 'video_clip',
    status: 'ready',
    ...(label ? { label } : {}),
    createdAt: 0,
    updatedAt: 0,
  })

  it('label 优先，缺 label 用 id', () => {
    expect(audioAssetOptions([asset('a-aud-1', '战斗床'), asset('a-aud-2')])).toEqual([
      { id: 'a-aud-1', label: '战斗床 (a-aud-1)' },
      { id: 'a-aud-2', label: 'a-aud-2' },
    ])
  })

  it('非 audio 资产不进候选（视频 id 填进床轨槽会解析成视频）', () => {
    expect(audioAssetOptions([{ ...asset('a-vid-1'), kind: 'video' }])).toEqual([])
  })

})

// 与 NodeInspector 的 `videoChoices` 同款：填进去的 id 不在素材候选里也得留在候选里，否则
// 手填的 / 素材被删的 / 查询失败时的 ref 在下拉里读起来像「什么都没选」。
describe('audioChoices（当前 ref 并进候选）', () => {
  const lib: AudioOption[] = [{ id: 'a-aud-1', label: '战斗床 (a-aud-1)' }]

  it('ref 不在候选里 → 置顶补一条，并标明不是素材库来的', () => {
    const merged = audioChoices(lib, 'bgm-battle')
    expect(merged).toHaveLength(2)
    expect(merged[0]!.id).toBe('bgm-battle')
    expect(merged[0]!.label).not.toBe('战斗床 (a-aud-1)')
    expect(merged[0]!.label).toContain('bgm-battle')
    expect(merged[1]).toEqual(lib[0])
  })

  it('ref 已在候选里 → 原样返回（不出现两条同 id）', () => {
    expect(audioChoices(lib, 'a-aud-1')).toEqual(lib)
  })

  it('没填 ref / 只填了空白 → 原样返回', () => {
    expect(audioChoices(lib, undefined)).toEqual(lib)
    expect(audioChoices(lib, '   ')).toEqual(lib)
  })

  it('候选查不到时也只剩当前 ref 一条（面板仍显示作者填的那首）', () => {
    expect(audioChoices([], 'bgm-battle').map((o) => o.id)).toEqual(['bgm-battle'])
  })
})

// 刷新失败时缓存刻意保留上一轮候选（一次网络抖动不该清空选择器），于是「候选不可用」这句话
// 会和补全里明明列着的候选互相打脸。两种失败得说两句话。
describe('audioLookupAlert（壳层报警文案）', () => {
  it('没失败就没有警告', () => {
    expect(audioLookupAlert(null, 0)).toBeNull()
    expect(audioLookupAlert(null, 3)).toBeNull()
  })

  it('一条候选都没有 → 说「候选不可用」', () => {
    const text = audioLookupAlert('HTTP 500', 0)
    expect(text).toContain('HTTP 500')
    expect(text).toContain('暂不可用')
    expect(text).not.toContain('不是最新')
  })

  it('手上还有候选 → 说「可能不是最新的」，不否认那些候选', () => {
    const text = audioLookupAlert('HTTP 503', 2)
    expect(text).toContain('HTTP 503')
    expect(text).toContain('不是最新')
    expect(text).not.toContain('暂不可用')
  })
})
