import * as React from 'react'
import type { ComponentType } from 'react'
import type { ComponentDef } from '../../runtime/registry/component-registry'
import type { ComponentManifest } from '../../runtime/schema/node-config-schema'
import {
  gameComponentRegister,
  importGameComponentModule,
  type GameComponentModule,
} from '../../runtime/component-host/game-component-module'

export interface ProjectComponentAsset {
  source: 'project-component'
  componentId: string
  manifest: ComponentManifest
  renderer: ComponentType<Record<string, unknown>>
}

interface ProjectComponentCollector {
  React: typeof React
  registerComponent(id: string, definition: ComponentDef): void
  registerOverlayRenderer(
    id: string,
    renderer: ComponentType<Record<string, unknown>>,
    manifest?: ComponentManifest,
  ): void
  registerInteractionSkin(): void
  registerHpBar(): void
}

function manifestFromDefinition(id: string, definition: ComponentDef): ComponentManifest {
  return {
    id,
    ...(definition.label ? { label: definition.label } : {}),
    ...(definition.inputs?.length ? { inputs: definition.inputs } : {}),
    events: definition.events ?? [],
  }
}

export function collectProjectComponentAssets(module: GameComponentModule): ProjectComponentAsset[] {
  const pending = new Map<string, Partial<ProjectComponentAsset>>()
  const entryFor = (componentId: string): Partial<ProjectComponentAsset> => {
    let entry = pending.get(componentId)
    if (!entry) {
      entry = { source: 'project-component', componentId }
      pending.set(componentId, entry)
    }
    return entry
  }
  const collector: ProjectComponentCollector = {
    React,
    registerComponent(componentId, definition) {
      entryFor(componentId).manifest = manifestFromDefinition(componentId, definition)
    },
    registerOverlayRenderer(componentId, renderer, manifest) {
      const entry = entryFor(componentId)
      entry.renderer = renderer
      if (manifest) entry.manifest = manifest
    },
    registerInteractionSkin() {},
    registerHpBar() {},
  }
  gameComponentRegister<ProjectComponentCollector>(module)?.(collector)
  return [...pending.values()].filter((entry): entry is ProjectComponentAsset =>
    entry.source === 'project-component'
      && typeof entry.componentId === 'string'
      && entry.manifest != null
      && entry.renderer != null,
  )
}

export async function loadProjectComponentAssets(slug: string, base = ''): Promise<ProjectComponentAsset[]> {
  const module = await importGameComponentModule(slug, base)
  return module ? collectProjectComponentAssets(module) : []
}
