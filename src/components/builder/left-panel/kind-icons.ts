/**
 * Icon + label metadata for the hierarchy tree, keyed off the project model.
 *
 * v3 icon migration: every glyph is a SlotIcon slot name from
 * @/components/builder/icons/slots (never a raw Iconify name), so the tree
 * stays inside the editor's one-icon-system contract and swapping the icon set
 * stays a one-file change.
 */
import type { IconSlot } from '@/components/builder/icons/slots'
import type { PlatformId } from '@/components/builder/screens/device-presets'
import type { NavKind } from '@/lib/project/types'

/** Nav-kind slots (spec-verified): tabs / stack / none. */
export const NAV_ICON: Record<NavKind, IconSlot> = {
  tabs: 'tree.group.tabs',
  stack: 'tree.group.stack',
  none: 'tree.group.none'
}

/** Nav-kind labels shown as the group row's secondary text. */
export const NAV_LABEL: Record<NavKind, string> = {
  tabs: 'Tab group',
  stack: 'Stack group',
  none: 'Group'
}

/** Compact nav-kind names for summaries ("Tabs" / "Stack" / "None"). */
export const NAV_SHORT_LABEL: Record<NavKind, string> = {
  tabs: 'Tabs',
  stack: 'Stack',
  none: 'None'
}

/** Screen rows use the mobile-device slot. */
export const SCREEN_ICON: IconSlot = 'tree.screen'

/** Fallback slot for registry types that are not (yet) registered. */
export const FALLBACK_LAYER_ICON: IconSlot = 'tree.layer'

/**
 * Layer-row slots per registry entry id. Mirrors the toolbar's `tool.*` slots
 * so one component reads as one glyph everywhere (toolbar pill, flyout,
 * tree). Types not listed here fall back to the generic layer glyph — the
 * registry's own ph: icon strings are deliberately NOT consulted (they are
 * another surface's raw names).
 */
const LAYER_ICON_SLOTS: Record<string, IconSlot> = {
  view: 'tool.view',
  text: 'tool.text',
  textinput: 'tool.textinput',
  button: 'tool.button',
  image: 'tool.image',
  scrollview: 'tool.scrollview',
  switch: 'tool.switch',
  divider: 'tool.divider',
  lineargradient: 'tool.lineargradient',
  blurview: 'tool.blurview',
  activityindicator: 'tool.activityindicator'
}

/** The layer-row slot for a registry entry id (fallback: the generic layer glyph). */
export function layerIconSlot(type: string): IconSlot {
  return LAYER_ICON_SLOTS[type] ?? FALLBACK_LAYER_ICON
}

/** Platform display labels (devices stay platform-scoped even though the
 *  editor target platform is one global value). */
export const PLATFORM_LABEL: Record<PlatformId, string> = {
  ios: 'iOS',
  android: 'Android'
}

/**
 * Platform glyph slots — the SAME slots the top-bar platform selector uses,
 * so iOS/Android read as one glyph everywhere in the editor.
 */
export const PLATFORM_ICON: Record<PlatformId, IconSlot> = {
  ios: 'platform.ios',
  android: 'platform.android'
}
