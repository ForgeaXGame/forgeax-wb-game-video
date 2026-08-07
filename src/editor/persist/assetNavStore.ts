import { create } from 'zustand'
import type { AssetLibraryRootKind } from '../assets/registry-types'

const ROOT_KINDS: readonly AssetLibraryRootKind[] = ['image', 'video', 'control', 'sound', 'audio', 'font']
const LS_KEY = 'wb-game-video:asset:root'
const CHANNEL = 'wb-game-video:asset-root-sync'

function initialRoot(): AssetLibraryRootKind | null {
  try {
    const value = localStorage.getItem(LS_KEY)
    return value && ROOT_KINDS.includes(value as AssetLibraryRootKind) ? value as AssetLibraryRootKind : null
  } catch {
    return null
  }
}

interface AssetNavStore {
  root: AssetLibraryRootKind | null
  setRoot(root: AssetLibraryRootKind | null): void
}

let channel: BroadcastChannel | null = null
let applyingRemote = false

export const useAssetNav = create<AssetNavStore>((set) => ({
  root: initialRoot(),
  setRoot(root) {
    set((state) => {
      if (state.root === root) return state
      try {
        if (root) localStorage.setItem(LS_KEY, root)
        else localStorage.removeItem(LS_KEY)
      } catch { /* best effort */ }
      if (!applyingRemote) channel?.postMessage(root)
      return { root }
    })
  },
}))

export function installAssetNavSync(): () => void {
  const applyRemoteRoot = (root: unknown): void => {
    if (root !== null && !ROOT_KINDS.includes(root as AssetLibraryRootKind)) return
    applyingRemote = true
    try {
      useAssetNav.getState().setRoot(root as AssetLibraryRootKind | null)
    } finally {
      applyingRemote = false
    }
  }
  const onStorage = (event: StorageEvent): void => {
    if (event.key === LS_KEY) applyRemoteRoot(event.newValue)
  }
  if (typeof window !== 'undefined') window.addEventListener('storage', onStorage)
  if (typeof BroadcastChannel !== 'undefined') {
    channel = new BroadcastChannel(CHANNEL)
    channel.onmessage = (event: MessageEvent) => applyRemoteRoot(event.data)
  }
  return () => {
    channel?.close()
    channel = null
    if (typeof window !== 'undefined') window.removeEventListener('storage', onStorage)
  }
}
