/*
 * resolveNode — the ONE resolver shared by the renderer and (conceptually)
 * codegen (docs/07 §2: "one resolver, two consumers — preview and export
 * cannot drift").
 *
 * Resolution order:
 *   1. registry entry prop defaults
 *   2. node.props overrides (a value of `undefined` removes the key — the
 *      same patch semantics the store uses for styles)
 *   3. node.style is returned as-is (registry entries carry no style defaults;
 *      placement geometry is written into node.style at insert time)
 *
 * The `platform` parameter is RESERVED for per-platform variant overlays
 * (NodeVariantOverlay in docs/07). The v1 data model has no variants field
 * yet, so it is accepted but not consulted — signature stability is the point.
 */
import type { PlatformId } from '@/components/builder/screens/device-presets'
import type { ProjectNode } from '@/lib/project/types'
import type { PropField, RegistryEntry } from '../registry/types'

export interface ResolvedNode {
  /** Registry defaults overlaid with node.props. */
  props: Record<string, unknown>
  /** node.style with undefined values (removals) stripped. */
  style: Record<string, unknown>
}

export function resolveNode(
  entry: RegistryEntry,
  node: ProjectNode,
  _platform: PlatformId
): ResolvedNode {
  const props: Record<string, unknown> = {}

  // 1. registry defaults
  for (const field of entry.props) {
    if (field.default !== undefined) {
      props[field.key] = field.default
    }
  }

  // 2. node overrides (undefined = remove the key, falling back to the default)
  for (const key of Object.keys(node.props)) {
    const value = node.props[key]
    if (value === undefined) {
      delete props[key]
    } else {
      props[key] = value
    }
  }

  // 3. style as-is, minus removals
  const style: Record<string, unknown> = {}
  for (const key of Object.keys(node.style)) {
    const value = node.style[key]
    if (value !== undefined) {
      style[key] = value
    }
  }

  return { props, style }
}

/**
 * The entry's text-content field (type 'text'), e.g. `content` on text,
 * `title` on button. Its value renders as JSX children in the preview and is
 * emitted as children by codegen.
 */
export function textPropField(entry: RegistryEntry): PropField | undefined {
  return entry.props.find((field) => field.type === 'text')
}

/** The resolved text content of a node ('' when the entry has no text field). */
export function textPropValue(entry: RegistryEntry, props: Record<string, unknown>): string {
  const field = textPropField(entry)
  if (!field) return ''
  const value = props[field.key]
  return value === undefined || value === null ? '' : String(value)
}
