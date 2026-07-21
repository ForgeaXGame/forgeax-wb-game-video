/**
 * 选项 / 技能（component id: `choice` / `skill`）—— 契约 + 默认按钮条渲染同文件。
 * 专属皮肤（inkYingMo / battleSkillBar）另有 Layer，可覆盖交互渲染表。
 */
import type { ReactNode } from 'react'
import type { ComponentDef } from '../../registry/component-registry'
import {
  CHOICE_INPUTS,
  validateChoiceEvents,
  type ChoiceParams,
} from '../../registry/core-components'
import { isOptionLocked } from '../optionLock'
import type { OverlayProps } from '../rendererRegistry'
import { anchorStyle, bottomRow, defaultBtn, hasAnchor } from './defaultUi'
import { useDefaultEventTimeout } from './skinRuntime'

export const choiceComponent: ComponentDef<ChoiceParams> = {
  label: '选项',
  inputs: CHOICE_INPUTS,
  validate: validateChoiceEvents,
}

export const skillComponent: ComponentDef<ChoiceParams> = {
  label: '技能',
  inputs: CHOICE_INPUTS,
  validate: validateChoiceEvents,
}

export function ChoiceButtons({ overlay, emit, ctx, preview }: OverlayProps): ReactNode {
  useDefaultEventTimeout(emit, overlay.inputs as Record<string, unknown>, preview)
  const inputs = overlay.inputs as unknown as ChoiceParams
  const rowStyle = hasAnchor(inputs.x, inputs.y)
    ? anchorStyle(inputs.x as number, inputs.y as number, {
        display: 'flex',
        gap: 10,
        justifyContent: 'center',
        flexWrap: 'wrap',
        pointerEvents: 'auto',
      })
    : bottomRow
  return (
    <div className="gv-choice-layer" style={rowStyle}>
      {(inputs.events ?? []).map((e) => {
        const locked = isOptionLocked(e, ctx)
        return (
          <button
            key={e.id}
            style={{ ...defaultBtn('#2563eb'), ...(locked ? { opacity: 0.4, cursor: 'not-allowed' } : null) }}
            disabled={locked}
            onClick={() => {
              if (!locked) emit?.(e.id)
            }}
          >
            {e.label ?? e.id}
          </button>
        )
      })}
    </div>
  )
}
