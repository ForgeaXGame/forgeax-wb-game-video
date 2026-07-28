/**
 * 音频资产引用输入 —— 素材候选 + 手填 id 合体（`<input list>` + `<datalist>`）。
 *
 * 为什么不是纯下拉：目前还没有任何链路能把 audio 写进 `assets/manifest`（无 audio
 * `MediaProductionType`、无 `a-aud-` id 铸造），纯下拉必然是个点开没内容的空壳。所以主控件是
 * 文本框（手填 id 今天就能跑通），候选只挂在补全里 —— 有资产时它是选择器，没资产时它就是个
 * 普通输入框，不会看着像坏了。
 *
 * 本件是纯控件：候选从哪来、查失败了怎么说，都在资产层（`assets/audioAssetCacheStore`）与
 * 壳层，不在这里 —— 与「视频」字段同款分工。
 */
import { useId, useState } from 'react'
import type { AudioOption } from './bgm-authoring'

export function AudioRefInput({
  value,
  options,
  placeholder,
  title,
  clearTitle,
  onChange,
}: {
  value: string
  options: readonly AudioOption[]
  placeholder?: string
  title?: string
  /** 「清除」按钮的 tooltip：两处语义不同（节点 = 不换曲；文档 = 静音起局）。 */
  clearTitle?: string
  /** 空串 = 清除该处 BGM 配置（调用方须把整个 bgm 字段删掉，别留 `{ ref: '' }`）。 */
  onChange: (ref: string) => void
}): JSX.Element {
  // useId 产出的 `:r7:` 虽是合法 HTML id，却不是合法 CSS 选择器——`input.list` 内部走
  // querySelector('#<id>')，冒号会让它抛 SyntaxError。这里洗成选择器安全的形状。
  const listId = `gv-audio-${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`
  // 打字草稿（`null` = 跟外部值）。「全选删除再打新 id」这个最普通的手势会让 ref 空一帧，
  // 而空 ref 的语义是「删掉整个 bgm」——若逐键写盘，那一帧就把 mode / restart / 手写的
  // volume·fade 一并抹了，下一键再拿 `{ ref }` 重建，作者毫无察觉（这些字段面板上没有控件）。
  // 所以空值只在**刻意清除**时才发出：点「清除」或留空失焦。
  const [draft, setDraft] = useState<string | null>(null)
  // 外部值换了（撤销 / 清除后回填 / 换到配了另一段 ref 的节点）→ 丢掉草稿跟上真相。
  // 注意这只认**值**变化：换到配着同一段 ref 的另一个节点时 `value` 一模一样，这里察觉不到。
  // 「换了编辑对象就该换一份草稿」是调用方的事，靠 `key=<对象 id>` 重挂本件表达（见 NodeInspector）。
  const [seenValue, setSeenValue] = useState(value)
  if (value !== seenValue) {
    setSeenValue(value)
    setDraft(null)
  }
  const shown = draft ?? value
  return (
    <>
      <input
        list={listId}
        value={shown}
        onChange={(e) => {
          const next = e.target.value
          setDraft(next)
          // 非空才写盘；空着先只留在草稿里（数据仍是原来那首）。
          if (next.trim() !== '') onChange(next)
        }}
        onBlur={() => {
          // 留空后离开 = 刻意清除；否则框里空着、数据里还挂着 id，UI 在撒谎。
          if (draft !== null && draft.trim() === '' && value !== '') onChange('')
          setDraft(null)
        }}
        placeholder={placeholder ?? '音频资产 id'}
        title={title}
        style={{ flex: 1, minWidth: 0, fontFamily: 'ui-monospace, monospace', fontSize: 11 }}
      />
      <datalist id={listId}>
        {options.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
      </datalist>
      {/* 按 `value`（已落盘的真相）而非草稿决定显示：把框打空后按钮仍在，作者能一键真删掉。 */}
      {value ? (
        <button
          type="button"
          onClick={() => { setDraft(null); onChange('') }}
          title={clearTitle ?? '清除音乐配置（整个 bgm 字段一起删掉）'}
          // 两处面板的行容器都是 `<label>`，按钮会被这层 label 命名成「音乐 <当前 id>」；
          // 显式 aria-label 压过它，读屏与测试都得到确定的名字。
          aria-label="清除音乐"
          style={{ fontSize: 11, flexShrink: 0 }}
        >
          清除
        </button>
      ) : null}
    </>
  )
}
