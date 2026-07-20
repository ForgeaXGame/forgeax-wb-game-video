/**
 * 通用 QTE（component id: `qte`）—— 契约 + 默认三键渲染同文件。
 * 专属皮肤（inkKou / battleParry）另有 Layer，可覆盖交互渲染表。
 */
import type { ReactNode } from 'react'
import type { ComponentDef } from '../../registry/component-registry'
import { QTE_DEFAULT_EVENTS, QTE_INPUTS, type QteFullParams } from '../../registry/core-components'
import type { InteractionProps } from '../rendererRegistry'
import { bottomRow, defaultBtn } from './defaultUi'

export const qteComponent: ComponentDef<QteFullParams> = {
  role: 'interaction',
  label: 'QTE',
  events: QTE_DEFAULT_EVENTS,
  inputs: QTE_INPUTS,
}

export function QteButtons({ submit }: InteractionProps): ReactNode {
  return (
    <div className="gv-qte-layer" style={bottomRow}>
      <button style={defaultBtn('#16a34a')} onClick={() => submit('pass')}>完美</button>
      <button style={defaultBtn('#65a30d')} onClick={() => submit('good')}>成功</button>
      <button style={defaultBtn('#dc2626')} onClick={() => submit('fail')}>失败</button>
    </div>
  )
}
