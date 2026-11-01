'use client'

/*
 * Properties tab — schema-driven from the component registry: `getEntry(node.type).props`
 * grouped by `field.section` (default 'Content'). Controls pick themselves by
 * PropField.type:
 *
 *   text/string → input (textarea when the content is long) · number → scrub
 *   number field · boolean → switch · enum → select · color → color field.
 *
 * A prop MISSING from node.props renders the registry default as a ghost
 * (muted placeholder) — committing writes the explicit value into the store.
 * Components without registry props (View) get the quiet description hint
 * instead of an empty section stack.
 */


import { useProjectStore } from '@/lib/project/store'
import type { ProjectNode } from '@/lib/project/types'
import { propOptions } from '@/expoforge/registry'
import type { PropField, RegistryEntry } from '@/expoforge/registry'
import { cn } from '@/lib/utils'
import { CollapsibleSection } from '../collapsible-section'
import { SectionFields } from '../field-grid'
import { QuietHint } from '../shared'
import type { FieldChangeValue, FieldSpec, PanelSection } from '../schema'

/** Long-ish content becomes a textarea; short content stays single-line. */
const MULTILINE_THRESHOLD = 32

function propFieldToSpec(field: PropField, node: ProjectNode): FieldSpec {
  const isSet = field.key in node.props && node.props[field.key] !== undefined
  const raw = node.props[field.key]
  const def = field.default
  switch (field.type) {
    case 'text':
    case 'string': {
      const str = isSet && raw != null ? String(raw) : undefined
      const multiline =
        field.type === 'text' && (str?.length ?? (def != null ? String(def).length : 0)) > MULTILINE_THRESHOLD
      return {
        kind: 'text',
        id: field.key,
        label: field.label,
        value: str,
        defaultValue: def === undefined ? undefined : String(def),
        multiline,
        rows: multiline ? 3 : undefined,
        placeholder: field.placeholder
      }
    }
    case 'number':
      return {
        kind: 'number',
        id: field.key,
        label: field.label,
        value: isSet && typeof raw === 'number' ? raw : undefined,
        defaultValue: typeof def === 'number' ? def : undefined,
        min: field.min,
        max: field.max,
        step: field.step,
        placeholder: def === undefined ? undefined : String(def)
      }
    case 'boolean':
      return {
        kind: 'switch',
        id: field.key,
        label: field.label,
        value: isSet && typeof raw === 'boolean' ? raw : undefined,
        defaultValue: def === undefined ? undefined : Boolean(def)
      }
    case 'enum':
      return {
        kind: 'select',
        id: field.key,
        label: field.label,
        value: isSet && typeof raw === 'string' ? raw : undefined,
        defaultValue: typeof def === 'string' ? def : undefined,
        options: propOptions(field).map((option) => ({ value: option.value, label: option.label ?? option.value }))
      }
    case 'color':
      return {
        kind: 'color',
        id: field.key,
        label: field.label,
        value: isSet && typeof raw === 'string' ? raw : undefined,
        placeholder: typeof def === 'string' ? def : undefined
      }
    default:
      // icon/object/array/callback — richer controls land with the v3 inspector;
      // never crash: degrade to a read-only label row.
      return { kind: 'label', id: field.key, label: field.label }
  }
}

/** Groups registry prop fields by section (default 'Content'), keeping order. */
function propSections(entry: RegistryEntry, node: ProjectNode): PanelSection[] {
  const bySection = new Map<string, PropField[]>()
  for (const field of entry.props) {
    const section = field.section ?? 'Content'
    const list = bySection.get(section)
    if (list) list.push(field)
    else bySection.set(section, [field])
  }
  const sections: PanelSection[] = []
  for (const [title, fields] of bySection) {
    sections.push({
      id: `props-${entry.id}-${title.toLowerCase().replace(/\s+/g, '-')}`,
      title,
      entries: fields.map((field) => propFieldToSpec(field, node))
    })
  }
  return sections
}

export interface PropsTabProps {
  node: ProjectNode
  entry: RegistryEntry
  className?: string
}

export function PropsTab({ node, entry, className }: PropsTabProps) {
  const setNodeProps = useProjectStore((s) => s.setNodeProps)
  const setNodeName = useProjectStore((s) => s.setNodeName)
  const beginGesture = useProjectStore((s) => s.beginGesture)
  const endGesture = useProjectStore((s) => s.endGesture)

  function handleFieldChange(_sectionId: string, fieldId: string, value: FieldChangeValue) {
    if (fieldId === '__name') {
      if (typeof value === 'string' && value.trim() !== '') setNodeName(node.id, value)
      return
    }
    // An empty commit (ColorField Clear, a cleared text field) means UNSET, not
    // an explicit empty literal: write `undefined` so the registry default takes
    // over again (resolve + codegen both treat present-but-undefined as unset).
    if (value === '') {
      setNodeProps(node.id, { [fieldId]: undefined })
      return
    }
    setNodeProps(node.id, { [fieldId]: value })
  }

  const sections = propSections(entry, node)

  const nameSection: PanelSection = {
    id: 'props-layer',
    title: 'Layer',
    entries: [
      {
        kind: 'text',
        id: '__name',
        label: 'Name',
        value: node.name ?? '',
        placeholder: entry.name
      }
    ]
  }

  return (
    <div className={cn('flex min-h-0 flex-1 flex-col overflow-y-auto scrollbar-thin', className)}>
      {sections.length === 0 ? (
        <QuietHint
          icon="inspector.tab-props"
          title={`${entry.name} has no properties`}
          description={entry.description}
        />
      ) : null}
      <SectionStack
        sections={[nameSection, ...sections]}
        onFieldChange={handleFieldChange}
        onScrubStart={beginGesture}
        onScrubEnd={endGesture}
      />
      <div className="h-6 shrink-0" aria-hidden="true" />
    </div>
  )
}

/* Shared section stack (also used by the Style tab). */

export interface SectionStackProps {
  sections: PanelSection[]
  onFieldChange: (sectionId: string, fieldId: string, value: FieldChangeValue) => void
  onScrubStart?: () => void
  onScrubEnd?: () => void
  className?: string
}

export function SectionStack({ sections, onFieldChange, onScrubStart, onScrubEnd, className }: SectionStackProps) {
  return (
    <div className={cn('flex min-w-0 flex-col', className)}>
      {sections.map((section) => (
        <CollapsibleSection key={section.id} id={section.id} title={section.title} defaultOpen={section.defaultOpen ?? true} disabled={section.disabled}>
          <SectionFields
            section={section}
            onFieldChange={onFieldChange}
            onScrubStart={onScrubStart}
            onScrubEnd={onScrubEnd}
          />
        </CollapsibleSection>
      ))}
    </div>
  )
}
