/*
 * Registry API — one typed catalog consumed by the toolbar, layers tree,
 * inspector, preview, and codegen. Never forked.
 */
import { VIEW_ENTRY, TEXT_ENTRY } from './entries'
import { DATA_ENTRIES } from './data'
import type { RegistryCategory, RegistryEntry, StyleSectionId } from './types'

export type {
  AnimationCapability,
  ComponentImplementation,
  PropField,
  PropFieldType,
  PropOption,
  RegistryCategory,
  RegistryEntry,
  StyleSectionId
} from './types'
export {
  animationCapability,
  effectiveProps,
  propOptions,
  resolveImplementation
} from './types'

const ALL: RegistryEntry[] = [VIEW_ENTRY, TEXT_ENTRY, ...DATA_ENTRIES]

const BY_ID = new Map(ALL.map((e) => [e.id, e]))

export function getEntry(id: string): RegistryEntry | undefined {
  return BY_ID.get(id)
}

export function allEntries(): RegistryEntry[] {
  return ALL
}

export function entriesByCategory(category: RegistryCategory): RegistryEntry[] {
  return ALL.filter((e) => e.category === category)
}

export const REGISTRY_TOOL_ORDER = ['view', 'text', 'textinput', 'button', 'image', 'scrollview'] as const
export const REGISTRY_FLYOUT_ORDER = [
  'switch',
  'divider',
  'lineargradient',
  'blurview',
  'activityindicator'
] as const
