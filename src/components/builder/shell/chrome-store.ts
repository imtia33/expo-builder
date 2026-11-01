import { create } from 'zustand'

import { loadBuilderLayout, saveUIHidden } from './layout-storage'

/*
 * The `$mod+\` chrome toggle (docs/03-design.md §2.3) shared between the shell's pieces:
 * WorkspaceLayout renders from it, useBuilderShortcuts binds the key to it, and the floating
 * "Show UI" pill writes to it — one owner of the state, so nothing double-binds.
 */

export interface BuilderChromeState {
  /** Whether the top bar and side panels are hidden and the canvas runs full-bleed. */
  uiHidden: boolean
  /** Whether the persisted flag has been read (after mount, so SSR markup stays deterministic). */
  hydrated: boolean
  /** Reads the persisted flag once. Idempotent; safe to call from any consumer's mount effect. */
  hydrate: () => void
  toggleUI: () => void
  showUI: () => void
  hideUI: () => void
}

export const useBuilderChrome = create<BuilderChromeState>()((set, get) => ({
  uiHidden: false,
  hydrated: false,
  hydrate: () => {
    if (get().hydrated) return
    set({ uiHidden: loadBuilderLayout().uiHidden, hydrated: true })
  },
  toggleUI: () => {
    const uiHidden = !get().uiHidden
    set({ uiHidden, hydrated: true })
    saveUIHidden(uiHidden)
  },
  showUI: () => {
    if (!get().uiHidden) return
    set({ uiHidden: false })
    saveUIHidden(false)
  },
  hideUI: () => {
    if (get().uiHidden) return
    set({ uiHidden: true })
    saveUIHidden(true)
  }
}))
