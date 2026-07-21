/**
 * 通用 QTE（component id: `qte`）—— 契约 + 默认三键渲染同文件。
 * 专属皮肤（inkKou / battleParry）另有 Layer，可覆盖交互渲染表。
 */
import type { ReactNode } from 'react'
import type { ComponentDef } from '../../registry/component-registry'
import { QTE_DEFAULT_EVENTS, QTE_INPUTS, type QteFullParams } from '../../registry/core-components'
import type { OverlayProps } from '../rendererRegistry'
import { bottomRow, defaultBtn } from './defaultUi'
import { useDefaultEventTimeout } from './skinRuntime'

export const qteComponent: ComponentDef<QteFullParams> = {
  label: 'QTE',
  events: QTE_DEFAULT_EVENTS,
  inputs: QTE_INPUTS,
}

export function QteButtons({ overlay, emit, preview }: OverlayProps): ReactNode {
  useDefaultEventTimeout(emit, overlay.inputs as Record<string, unknown>, preview)
  return (
    <div className="gv-qte-layer" style={bottomRow}>
      <button style={defaultBtn('#16a34a')} onClick={() => emit?.('pass')}>完美</button>
      <button style={defaultBtn('#65a30d')} onClick={() => emit?.('good')}>成功</button>
      <button style={defaultBtn('#dc2626')} onClick={() => emit?.('fail')}>失败</button>
    </div>
  )
}
