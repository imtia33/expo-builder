'use client'

/*
 * Properties tab — schema-driven from the component registry, Phase 2
 * impl-aware: the EFFECTIVE schema (base props overlaid with the active
 * implementation's) feeds the sections, so switching implementations swaps
 * the visible controls live. Entries with >1 implementations also get an
 * "Implementation" select (setNodeImpl); direct children of lists get a
 * "List role" select (setNodeListRole — which children are the item template
 * vs header/footer/separator/empty chrome).
 *
 * A prop MISSING from node.props renders the registry default as a ghost
 * (muted placeholder) — committing writes the explicit value into the store.
 * Array-typed props (list data sources) render as dedicated full-width
 * sections with the structured array editor.
 */


import { useProjectStore } from '@/lib/project/store'
import type { InteractionAction, ProjectNode, Screen, ScreenGroup } from '@/lib/project/types'
import { propOptions, effectiveProps, resolveImplementation } from '@/expoforge/registry'
import type { PropField, RegistryEntry } from '@/expoforge/registry'
import { isListEntryType, LIST_ROLE_LABEL, type ListRole } from '@/lib/lists/bindings'
import { resolveInteraction } from '@/lib/interactions/resolve'
import { screenHref } from '@/lib/codegen/interactions'
import { cn } from '@/lib/utils'
import { CollapsibleSection } from '../collapsible-section'
import { ApiStatusSection } from './api-status'
import { SectionFields } from '../field-grid'
import { QuietHint } from '../shared'
import type { FieldChangeValue, FieldSpec, PanelSection } from '../schema'

/** Long-ish content becomes a textarea; short content stays single-line. */
const MULTILINE_THRESHOLD = 32

const LIST_ROLES: ListRole[] = ['item', 'header', 'footer', 'separator', 'empty', 'loading', 'error']

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
      // icon/object/array(handled separately)/callback — richer controls land
      // with the v3 inspector; never crash: degrade to a read-only label row.
      return { kind: 'label', id: field.key, label: field.label }
  }
}

/** The array-field view of an array-typed PropField (list data sources). */
function arrayFieldToSpec(field: PropField, node: ProjectNode): FieldSpec | null {
  if (field.type !== 'array') return null
  const isSet = field.key in node.props && node.props[field.key] !== undefined
  const raw = node.props[field.key]
  return {
    kind: 'array-list',
    id: field.key,
    label: field.label,
    value: isSet && Array.isArray(raw) ? (raw as unknown[]) : undefined,
    defaultValue: Array.isArray(field.default) ? (field.default as unknown[]) : undefined,
    minItems: field.minItems,
    ghostNote: isSet ? undefined : 'Using the default rows — editing commits the whole data source.',
    itemFields: (field.item ?? []).map((sub) => ({
      key: sub.key,
      label: sub.label,
      placeholder: sub.placeholder,
      type: sub.type === 'array' ? ('array' as const) : ('string' as const),
      ...(sub.type === 'array'
        ? {
            subItemFields: (sub.item ?? []).map((nested) => ({
              key: nested.key,
              label: nested.label,
              placeholder: nested.placeholder,
              type: 'string' as const
            }))
          }
        : {})
    }))
  }
}

/** visibleWhen gate: another prop of the same entry must equal `equals`
 * (explicit value, else the effective default). */
function visibleWhenPass(field: PropField, node: ProjectNode, defaults: Map<string, unknown>): boolean {
  if (!field.visibleWhen) return true
  const gate = field.visibleWhen
  const explicit = node.props[gate.key]
  const value = explicit !== undefined && explicit !== null ? explicit : (defaults.get(gate.key) ?? undefined)
  return value === gate.equals
}

/** Groups the effective registry fields by section (default 'Content'). */
function propSections(entry: RegistryEntry, node: ProjectNode): PanelSection[] {
  const fields = effectiveProps(entry, node.impl)
  const defaults = new Map<string, unknown>(fields.map((f) => [f.key, f.default]))
  const bySection = new Map<string, PropField[]>()
  for (const field of fields) {
    if (field.type === 'array') continue // dedicated sections below
    if (!visibleWhenPass(field, node, defaults)) continue
    const section = field.section ?? 'Content'
    const list = bySection.get(section)
    if (list) list.push(field)
    else bySection.set(section, [field])
  }
  const sections: PanelSection[] = []
  for (const [title, list] of bySection) {
    sections.push({
      id: `props-${entry.id}-${title.toLowerCase().replace(/\s+/g, '-')}`,
      title,
      entries: list.map((field) => propFieldToSpec(field, node))
    })
  }
  // Array-typed props become their own full-width sections (list data sources).
  // The visibleWhen gate applies here too: the static Rows editor hides while
  // the API source is active (P0-3) — the endpoint owns the data then.
  for (const field of fields) {
    if (field.type !== 'array') continue
    if (!visibleWhenPass(field, node, defaults)) continue
    const spec = arrayFieldToSpec(field, node)
    if (!spec) continue
    sections.push({
      id: `props-${entry.id}-array-${field.key}`,
      title: field.label,
      entries: [spec]
    })
  }
  return sections
}

export interface PropsTabProps {
  node: ProjectNode
  entry: RegistryEntry
  className?: string
}

/* ── Interaction section (Phase 4, P0-1) ──────────────────────────────────── */

/** Field ids: `__ia-<hook>` (action kind), `__ia-<hook>@screen`, `__ia-<hook>@mode`. */
const IA_PREFIX = '__ia-'
/** Radix Select items cannot carry empty-string values — the unwired state
 *  uses this sentinel instead. */
const IA_NONE = 'none'

function parseIaField(fieldId: string): { hook: string; part: 'action' | 'screen' | 'mode' } | null {
  if (!fieldId.startsWith(IA_PREFIX)) return null
  const rest = fieldId.slice(IA_PREFIX.length)
  const at = rest.indexOf('@')
  if (at === -1) return { hook: rest, part: 'action' }
  const part = rest.slice(at + 1)
  if (part !== 'screen' && part !== 'mode') return null
  return { hook: rest.slice(0, at), part }
}

function interactionSection(
  entry: RegistryEntry,
  node: ProjectNode,
  screens: Screen[],
  groups: ScreenGroup[]
): PanelSection | null {
  if (!entry.hooks || entry.hooks.length === 0) return null
  // The node's own screen — set-state actions are scoped to it (useState).
  const ownScreen = screens.find((s) => s.id === node.screenId)
  const ownState = ownScreen?.state ?? []
  const entries: PanelSection['entries'] = []
  for (const { hook, label } of entry.hooks) {
    // The stored value may be dangling (target screen deleted): show the
    // kind but an EMPTY screen select — re-picking completes the wiring.
    const stored = node.interactions?.[hook]
    const kind = stored
      ? resolveInteraction(stored, screens, node.screenId)
        ? stored.kind
        : stored.kind // dangling still shows its kind (screen/entry select re-picks)
      : ''
    entries.push({
      kind: 'select',
      id: `${IA_PREFIX}${hook}`,
      label,
      value: kind === '' ? IA_NONE : kind,
      defaultValue: IA_NONE,
      options: [
        { value: IA_NONE, label: 'None' },
        { value: 'navigate', label: 'Navigate to screen' },
        { value: 'back', label: 'Go back' },
        { value: 'set-state', label: 'Set state' }
      ]
    })
    if (kind === 'navigate') {
      const current = stored?.kind === 'navigate' ? stored : null
      const screenOk = current && screens.some((s) => s.id === current.screenId)
      entries.push({
        kind: 'select',
        id: `${IA_PREFIX}${hook}@screen`,
        label: 'Screen',
        value: screenOk ? current.screenId : undefined,
        defaultValue: undefined,
        options: screens.map((s) => ({
          value: s.id,
          label: `${s.name}${s.id === node.screenId ? ' · current' : ''} (${screenHref(s, { groups })})`
        }))
      })
      entries.push({
        kind: 'segmented',
        id: `${IA_PREFIX}${hook}@mode`,
        label: 'Open',
        value: current?.mode ?? 'push',
        defaultValue: 'push',
        options: [
          { value: 'push', label: 'Push' },
          { value: 'replace', label: 'Replace' }
        ]
      })
    }
    if (kind === 'set-state') {
      const current = stored?.kind === 'set-state' ? stored : null
      const targetEntry = current ? ownState.find((e) => e.name === current.name) : undefined
      if (ownState.length === 0) {
        entries.push({
          kind: 'label',
          id: `${IA_PREFIX}${hook}@nostate`,
          label: 'No state on this screen — add entries in the Screen tab.'
        })
      } else {
        entries.push({
          kind: 'select',
          id: `${IA_PREFIX}${hook}@state`,
          label: 'State',
          value: targetEntry ? current!.name : undefined,
          defaultValue: undefined,
          options: ownState.map((e) => ({ value: e.name, label: `${e.name} (${e.type})` }))
        })
        if (targetEntry) {
          if (targetEntry.type === 'boolean') {
            entries.push({
              kind: 'select',
              id: `${IA_PREFIX}${hook}@value`,
              label: 'Value',
              value: String(current!.value),
              defaultValue: 'toggle',
              options: [
                { value: 'toggle', label: 'Toggle' },
                { value: 'true', label: 'True' },
                { value: 'false', label: 'False' }
              ]
            })
          } else if (targetEntry.type === 'number') {
            entries.push({
              kind: 'number',
              id: `${IA_PREFIX}${hook}@value`,
              label: 'Value',
              value: typeof current!.value === 'number' ? current!.value : typeof targetEntry.initial === 'number' ? targetEntry.initial : 0
            })
          } else {
            entries.push({
              kind: 'text',
              id: `${IA_PREFIX}${hook}@value`,
              label: 'Value',
              value: typeof current!.value === 'string' && current!.value !== 'toggle' ? current!.value : undefined,
              placeholder: String(targetEntry.initial)
            })
          }
        }
      }
    }
  }
  return { id: 'props-interaction', title: 'Interaction', entries }
}

export function PropsTab({ node, entry, className }: PropsTabProps) {
  const setNodeProps = useProjectStore((s) => s.setNodeProps)
  const setNodeName = useProjectStore((s) => s.setNodeName)
  const setNodeImpl = useProjectStore((s) => s.setNodeImpl)
  const setNodeListRole = useProjectStore((s) => s.setNodeListRole)
  const setNodeInteraction = useProjectStore((s) => s.setNodeInteraction)
  const beginGesture = useProjectStore((s) => s.beginGesture)
  const endGesture = useProjectStore((s) => s.endGesture)
  // The parent node (list membership decides the List-role section).
  const parent = useProjectStore((s) => (node.parentId ? s.data.nodes[node.parentId] ?? null : null))
  const parentIsList = parent !== null && isListEntryType(parent.type)
  // Interaction wiring surface (Phase 4): every screen is a legal target.
  const screens = useProjectStore((s) => s.data.screens)
  const groups = useProjectStore((s) => s.data.groups)

  function handleFieldChange(_sectionId: string, fieldId: string, value: FieldChangeValue) {
    if (fieldId === '__name') {
      if (typeof value === 'string' && value.trim() !== '') setNodeName(node.id, value)
      return
    }
    if (fieldId === '__impl') {
      if (typeof value === 'string' && value !== '') setNodeImpl(node.id, value)
      return
    }
    if (fieldId === '__role') {
      if (typeof value === 'string' && LIST_ROLES.includes(value as ListRole)) {
        setNodeListRole(node.id, value as ListRole)
      }
      return
    }
    const ia = parseIaField(fieldId)
    if (ia) {
      const stored = node.interactions?.[ia.hook]
      if (typeof value !== 'string') return
      if (ia.part === 'action') {
        if (value === IA_NONE) setNodeInteraction(node.id, ia.hook, null)
        else if (value === 'back') setNodeInteraction(node.id, ia.hook, { kind: 'back' })
        else if (value === 'set-state') {
          const prev = stored?.kind === 'set-state' ? stored : null
          setNodeInteraction(node.id, ia.hook, {
            kind: 'set-state',
            name: prev?.name ?? '',
            value: prev?.value ?? 'toggle'
          })
        } else if (value === 'navigate')
          setNodeInteraction(node.id, ia.hook, {
            kind: 'navigate',
            screenId: stored?.kind === 'navigate' ? stored.screenId : '',
            mode: stored?.kind === 'navigate' ? stored.mode : 'push'
          })
        return
      }
      if (stored?.kind !== 'navigate') return
      if (ia.part === 'screen') {
        if (value === '') return
        setNodeInteraction(node.id, ia.hook, { kind: 'navigate', screenId: value, mode: stored.mode })
        return
      }
      if (ia.part === 'mode' && (value === 'push' || value === 'replace')) {
        setNodeInteraction(node.id, ia.hook, { kind: 'navigate', screenId: stored.screenId, mode: value })
      }
      return
    }
    /* set-state parts: @state (entry name) and @value (typed by the entry). */
    if (fieldId.startsWith(IA_PREFIX) && fieldId.includes('@state')) {
      const hook = fieldId.slice(IA_PREFIX.length, fieldId.indexOf('@state'))
      const stored = node.interactions?.[hook]
      if (typeof value !== 'string' || value === '') return
      setNodeInteraction(node.id, hook, { kind: 'set-state', name: value, value: stored?.kind === 'set-state' ? stored.value : 'toggle' })
      return
    }
    if (fieldId.startsWith(IA_PREFIX) && fieldId.includes('@value')) {
      const hook = fieldId.slice(IA_PREFIX.length, fieldId.indexOf('@value'))
      const stored = node.interactions?.[hook]
      if (stored?.kind !== 'set-state') return
      const entry = screens.find((s) => s.id === node.screenId)?.state?.find((e) => e.name === stored.name)
      if (!entry) return
      let next: boolean | string | number | 'toggle'
      if (entry.type === 'boolean') {
        if (value === 'toggle' || value === 'true' || value === 'false') next = value === 'toggle' ? 'toggle' : value === 'true'
        else return
      } else if (entry.type === 'number') {
        if (typeof value !== 'number' || !Number.isFinite(value)) return
        next = value
      } else {
        if (typeof value !== 'string') return
        next = value
      }
      setNodeInteraction(node.id, hook, { kind: 'set-state', name: stored.name, value: next })
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

  /* Implementation switch (Phase 2): entries with >1 variants. The active
   * implementation's description rides along as a muted label row. */
  const impls = entry.implementations
  const activeImpl = impls ? resolveImplementation(entry, node.impl) : null
  const implSection: PanelSection | null =
    impls && impls.length > 1 && activeImpl
      ? {
          id: 'props-implementation',
          title: 'Implementation',
          entries: [
            {
              kind: 'select',
              id: '__impl',
              label: 'Implementation',
              value: activeImpl.id,
              defaultValue: impls[0].id,
              options: impls.map((i) => ({ value: i.id, label: i.label }))
            },
            { kind: 'label', id: '__impl-note', label: activeImpl.description }
          ]
        }
      : null

  /* List role (Phase 2): direct children of a list pick their role; the
   * section explains what each role becomes in the generated list. */
  const roleSection: PanelSection | null = parentIsList
    ? {
        id: 'props-list-role',
        title: 'List role',
        entries: [
          {
            kind: 'select',
            id: '__role',
            label: 'Role',
            value: node.listRole ?? 'item',
            defaultValue: 'item',
            options: LIST_ROLES.map((r) => ({ value: r, label: LIST_ROLE_LABEL[r] }))
          },
          {
            kind: 'label',
            id: '__role-note',
            label:
              parent?.type === 'sectionlist'
                ? 'Item template repeats per row; Header renders per section (renderSectionHeader).'
                : 'Item template repeats per row. Header / Footer / Separator / Empty render once; Loading / Error states show while an API source fetches or fails.'
          }
        ]
      }
    : null

  /* Interaction wiring (Phase 4, P0-1): registry-declared hooks become
   * Navigate/Back actions — preview + codegen consume the same wiring. */
  const iaSection = interactionSection(entry, node, screens, groups)

  const orderedSections: PanelSection[] = [
    nameSection,
    ...(implSection ? [implSection] : []),
    ...(roleSection ? [roleSection] : []),
    ...(iaSection ? [iaSection] : []),
    ...sections
  ]

  /* The live API status section (P0-3) sits directly below "Data source" —
   * the section that configures the endpoint it reports on. Slicing the
   * stack preserves every other position. */
  const dsIndex = orderedSections.findIndex((s) => s.title === 'Data source')

  return (
    <div className={cn('flex min-h-0 flex-1 flex-col overflow-y-auto scrollbar-thin', className)}>
      {sections.length === 0 && !implSection && !roleSection && !iaSection ? (
        <QuietHint
          icon="inspector.tab-props"
          title={`${entry.name} has no properties`}
          description={entry.description}
        />
      ) : null}
      {dsIndex === -1 ? (
        <SectionStack
          sections={orderedSections}
          onFieldChange={handleFieldChange}
          onScrubStart={beginGesture}
          onScrubEnd={endGesture}
        />
      ) : (
        <>
          <SectionStack
            sections={orderedSections.slice(0, dsIndex + 1)}
            onFieldChange={handleFieldChange}
            onScrubStart={beginGesture}
            onScrubEnd={endGesture}
          />
          <ApiStatusSection node={node} />
          <SectionStack
            sections={orderedSections.slice(dsIndex + 1)}
            onFieldChange={handleFieldChange}
            onScrubStart={beginGesture}
            onScrubEnd={endGesture}
          />
        </>
      )}
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
