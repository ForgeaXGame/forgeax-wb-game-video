/**
 * 热点（component id: `hotspot`）—— 契约 + 渲染同文件。
 */
import type { ReactNode } from 'react'
import type { ComponentDef } from '../../registry/component-registry'
import type { HotspotParams } from '../../registry/core-components'
import type { OverlayProps } from '../rendererRegistry'
import { bottomRow, defaultBtn } from './defaultUi'
import { useDefaultEventTimeout } from './skinRuntime'

export const hotspotComponent: ComponentDef<HotspotParams> = {
  label: '热点',
  // 标记用 'hotspotEvents'（非 'events'）：出口带画面坐标 x/y，编辑器出专属锚点控件。
  inputs: [{ key: 'events', label: '热点', valueType: 'string', component: 'hotspotEvents', default: [] }],
  validate: (p) => (Array.isArray(p.events) ? [] : ['hotspot.events must be an array']),
}

export function HotspotButtons({ overlay, emit, preview }: OverlayProps): ReactNode {
  useDefaultEventTimeout(emit, overlay.inputs as Record<string, unknown>, preview)
  const inputs = overlay.inputs as unknown as HotspotParams
  const spots = inputs.events ?? []
  const positioned = spots.some((e) => typeof e.x === 'number' || typeof e.y === 'number')
  if (!positioned) {
    return (
      <div className="gv-hotspot-layer" style={bottomRow}>
        {spots.map((e) => (
          <button key={e.id} style={defaultBtn('#0891b2')} onClick={() => emit?.(e.id)}>
            {e.label ?? e.id}
          </button>
        ))}
      </div>
    )
  }
  return (
    <div className="gv-hotspot-layer" style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
      {spots.map((e) => (
        <button
          key={e.id}
          style={{
            ...defaultBtn('#0891b2'),
            position: 'absolute',
            left: `${(e.x ?? 0.5) * 100}%`,
            top: `${(e.y ?? 0.5) * 100}%`,
            transform: 'translate(-50%, -50%)',
            pointerEvents: 'auto',
          }}
          onClick={() => emit?.(e.id)}
        >
          {e.label ?? e.id}
        </button>
      ))}
    </div>
  )
}
