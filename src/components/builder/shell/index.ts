'use client'

/*
 * Barrel for the ExpoForge builder shell (docs/03-design.md §2): workspace layout, top bar,
 * keyboard registry, and their shared state and storage. Everything is client-side.
 */

export { WorkspaceLayout, type WorkspaceLayoutProps } from './workspace-layout'
export { TopBar, type TopBarProps } from './top-bar'
export {
  KeyboardHelp,
  ShortcutKbd,
  SHORTCUT_GROUPS,
  type KeyboardHelpProps,
  type ShortcutGroup,
  type ShortcutItem
} from './keyboard-help'
export {
  useBuilderShortcuts,
  isEditing,
  type BuilderShortcutsApi,
  type UseBuilderShortcutsOptions
} from './use-builder-shortcuts'
export { useBuilderChrome, type BuilderChromeState } from './chrome-store'
export { useMotionEnabled } from './use-motion'
export { formatShortcut, isMacPlatform } from './shortcut-format'
export {
  DEFAULT_PANEL_SIZES,
  LAYOUT_TOLERANCE,
  PANEL_LIMITS,
  loadBuilderLayout,
  savePanelSizes,
  saveUIHidden,
  sameLayout,
  type BuilderLayout,
  type PanelSizes
} from './layout-storage'
