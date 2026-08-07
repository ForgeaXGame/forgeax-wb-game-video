import { describe, expect, it } from 'vitest'
import {
  listInterfaceCustomSchemeIds,
  SCHEME_DYNAMIC_ID,
  SCHEME_STATIC_ID,
} from '../builtin-schemes'
import type { Overlay } from '../../../runtime/schema/graph-schema'

describe('interface custom scheme order', () => {
  it('keeps a prepended new scheme ahead of built-in and existing schemes', () => {
    const overlay = (id: string): Overlay => ({ id, title: id, children: [] })
    const existing = {
      [SCHEME_STATIC_ID]: overlay(SCHEME_STATIC_ID),
      [SCHEME_DYNAMIC_ID]: overlay(SCHEME_DYNAMIC_ID),
      'scheme-old': overlay('scheme-old'),
    }
    const overlays = {
      'scheme-new': overlay('scheme-new'),
      ...existing,
    }

    expect(listInterfaceCustomSchemeIds(overlays)).toEqual([
      'scheme-new',
      SCHEME_STATIC_ID,
      SCHEME_DYNAMIC_ID,
      'scheme-old',
    ])
  })
})
