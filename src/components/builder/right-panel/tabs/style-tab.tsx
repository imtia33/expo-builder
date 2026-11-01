'use client'

/*
 * Style tab — the RN inline-style editor, driven by `entry.styleSections` (registry
 * order = display order). Sections render ONLY what the registry allows, and every
 * field reads node.style / writes setNodeStyle (a value of `undefined` removes the
 * key, so "unset" is always recoverable).
 *
 * Layout — positioning mode (Absolute | Flow). Absolute edits left/top/width/height
 *   (W/H ghost to "Auto"); Flow drops position/left/top and edits flex + alignSelf,
 *   plus a "Children layout" sub-block for containers ('any' children): flexDirection,
 *   justifyContent, alignItems, gap, flexWrap — written to the SAME style object.
 * Spacing — Figma-style linked quads for padding and margin (per-side keys).
 * Appearance — backgroundColor, opacity (0–100 UI → 0–1 stored), corner-radius quads,
 *   border width+color, overflow.
 * Typography — text-bearing components only: fontSize, fontWeight, color, lineHeight,
 *   letterSpacing, textAlign.
 * Effects — platform-driven (from the screen's artboard): iOS shadow quad or
 *   Android elevation, with the platform note chip in the section header.
 */

import type { ReactNode } from 'react'
import {
  AlignCenterHorizontal,
  AlignCenterVertical,
  AlignEndHorizontal,
  AlignEndVertical,
  AlignStartHorizontal,
  AlignStartVertical
} from 'lucide-react'

import { useProjectStore } from '@/lib/project/store'
import type { ProjectNode, Screen } from '@/lib/project/types'
import type { RegistryEntry, StyleSectionId } from '@/expoforge/registry'
import { cn } from '@/lib/utils'
import { isGradientPaint, isTokenPaint, type GradientPaint, type TokenPaint } from '@/lib/paint'
import { alignNodeInParent, type AlignMode } from '@/components/builder/canvas/align'
import { Tip } from '@/components/builder/toolbar/tip'
import { CollapsibleSection } from '../collapsible-section'
import { SectionFields } from '../field-grid'
import { QuadField } from '../fields/quad-field'
import { QuietHint } from '../shared'
import type { FieldChangeValue, PanelSection } from '../schema'

/* ─── style read/write helpers ─────────────────────────────────────────────── */

function num(style: Record<string, unknown>, key: string): number | undefined {
  const v = style[key]
  return typeof v === 'number' ? v : undefined
}

function str(style: Record<string, unknown>, key: string): string | undefined {
  const v = style[key]
  return typeof v === 'string' ? v : undefined
}

function offset(style: Record<string, unknown>, axis: 'width' | 'height'): number | undefined {
  const v = style.shadowOffset
  if (v && typeof v === 'object' && !Array.isArray(v)) {
    const axisValue = (v as Record<string, unknown>)[axis]
    if (typeof axisValue === 'number') return axisValue
  }
  return undefined
}

/** Paint-aware color read: solids pass through, gradients/tokens validate. */
function paint(style: Record<string, unknown>, key: string): string | GradientPaint | TokenPaint | undefined {
  const v = style[key]
  if (typeof v === 'string') return v
  if (isGradientPaint(v) || isTokenPaint(v)) return v
  return undefined
}

const ALIGN_SELF_OPTIONS = [
  { value: 'auto', label: 'auto' },
  { value: 'flex-start', label: 'flex-start' },
  { value: 'flex-end', label: 'flex-end' },
  { value: 'center', label: 'center' },
  { value: 'stretch', label: 'stretch' }
]

const JUSTIFY_OPTIONS = [
  { value: 'flex-start', label: 'flex-start' },
  { value: 'center', label: 'center' },
  { value: 'flex-end', label: 'flex-end' },
  { value: 'space-between', label: 'space-between' },
  { value: 'space-around', label: 'space-around' },
  { value: 'space-evenly', label: 'space-evenly' }
]

const ALIGN_ITEMS_OPTIONS = [
  { value: 'stretch', label: 'stretch' },
  { value: 'flex-start', label: 'flex-start' },
  { value: 'center', label: 'center' },
  { value: 'flex-end', label: 'flex-end' },
  { value: 'baseline', label: 'baseline' }
]

const FONT_WEIGHT_OPTIONS = [
  { value: '400', label: '400 · Regular' },
  { value: '500', label: '500 · Medium' },
  { value: '600', label: '600 · Semibold' },
  { value: '700', label: '700 · Bold' }
]

const OVERFLOW_OPTIONS = [
  { value: 'visible', label: 'visible' },
  { value: 'hidden', label: 'hidden' }
]

/** Absolute ⇄ Flow: absolute nodes carry position/left/top; flow nodes drop them. */
function positioningMode(style: Record<string, unknown>): 'absolute' | 'flow' {
  if (style.position === 'absolute') return 'absolute'
  if (style.position === 'relative') return 'flow'
  // Unset position: placed nodes still carry left/top → treat as absolute.
  if (style.left !== undefined || style.top !== undefined) return 'absolute'
  return 'flow'
}

/* ─── shared change context ────────────────────────────────────────────────── */

export interface StyleTabProps {
  node: ProjectNode
  entry: RegistryEntry
  screen: Screen
  className?: string
}

export function StyleTab({ node, entry, screen, className }: StyleTabProps) {
  const setNodeStyle = useProjectStore((s) => s.setNodeStyle)
  // Read BEFORE any early return (rules of hooks): the Effects section renders
  // per the ONE editor-global platform toggle.
  const globalPlatform = useProjectStore((s) => s.ui.platform)
  const beginGesture = useProjectStore((s) => s.beginGesture)
  const endGesture = useProjectStore((s) => s.endGesture)

  const style = node.style
  const mode = positioningMode(style)

  function set(patch: Record<string, unknown>) {
    setNodeStyle(node.id, patch)
  }

  function handleFieldChange(_sectionId: string, fieldId: string, value: FieldChangeValue) {
    switch (fieldId) {
      case '__mode': {
        if (value === 'absolute') {
          set({ position: 'absolute', left: num(style, 'left') ?? 0, top: num(style, 'top') ?? 0 })
        } else {
          // Flow: position/left/top leave the style object entirely (unset).
          set({ position: undefined, left: undefined, top: undefined })
        }
        return
      }
      case '__flexWrap': {
        set({ flexWrap: value === true ? 'wrap' : 'nowrap' })
        return
      }
      case '__opacity': {
        // UI percent (0–100) → stored 0–1.
        set({ opacity: typeof value === 'number' ? Math.round((value / 100) * 1000) / 1000 : undefined })
        return
      }
      case '__shadowOpacity': {
        set({ shadowOpacity: typeof value === 'number' ? Math.round((value / 100) * 1000) / 1000 : undefined })
        return
      }
      case '__shadowOffsetX': {
        // RN's shadowOffset is a {width, height} pair — always write BOTH axes
        // (the missing one defaults to 0), never a partial object.
        set({ shadowOffset: { width: value as number, height: offset(style, 'height') ?? 0 } })
        return
      }
      case '__shadowOffsetY': {
        set({ shadowOffset: { width: offset(style, 'width') ?? 0, height: value as number } })
        return
      }
      default: {
        // ColorField's Clear emits '' — that means UNSET, not an empty style
        // literal (codegen would emit `backgroundColor: ''`); remove the key.
        set({ [fieldId]: value === '' ? undefined : value })
      }
    }
  }

  if (entry.styleSections.length === 0) {
    return (
      <QuietHint
        icon="inspector.tab-style"
        title={`${entry.name} has no style sections`}
        description="This component's registry entry exposes no editable style groups."
        className={className}
      />
    )
  }

  /* ── Layout section ── */
  const layoutEntries: PanelSection['entries'] = [
    {
      kind: 'segmented',
      id: '__mode',
      label: 'Positioning',
      value: mode,
      options: [
        { value: 'absolute', label: 'Absolute' },
        { value: 'flow', label: 'Flow' }
      ]
    }
  ]
  if (mode === 'absolute') {
    layoutEntries.push({
      id: '__absolute-box',
      columns: 2,
      fields: [
        { kind: 'number', id: 'left', label: 'X', value: num(style, 'left'), glyph: 'X', step: 1 },
        { kind: 'number', id: 'top', label: 'Y', value: num(style, 'top'), glyph: 'Y', step: 1 },
        {
          kind: 'number',
          id: 'width',
          label: 'Width',
          value: num(style, 'width'),
          defaultValue: entry.insert.width,
          placeholder: 'Auto',
          glyph: 'W',
          min: 0,
          step: 1
        },
        {
          kind: 'number',
          id: 'height',
          label: 'Height',
          value: num(style, 'height'),
          defaultValue: entry.insert.height,
          placeholder: 'Auto',
          glyph: 'H',
          min: 0,
          step: 1
        }
      ]
    })
  } else {
    layoutEntries.push({
      kind: 'number',
      id: 'flex',
      label: 'Flex',
      value: num(style, 'flex'),
      placeholder: '—',
      min: 0,
      step: 0.1
    })
    layoutEntries.push({
      kind: 'select',
      id: 'alignSelf',
      label: 'Align self',
      value: str(style, 'alignSelf'),
      defaultValue: 'auto',
      options: ALIGN_SELF_OPTIONS
    })
  }
  if (entry.children === 'any') {
    layoutEntries.push({ kind: 'label', id: '__children-label', label: 'Children layout' })
    layoutEntries.push({
      kind: 'segmented',
      id: 'flexDirection',
      label: 'Direction',
      value: str(style, 'flexDirection'),
      defaultValue: 'column',
      options: [
        { value: 'row', label: 'Row' },
        { value: 'column', label: 'Column' }
      ]
    })
    layoutEntries.push({
      kind: 'select',
      id: 'justifyContent',
      label: 'Justify',
      value: str(style, 'justifyContent'),
      defaultValue: 'flex-start',
      options: JUSTIFY_OPTIONS
    })
    layoutEntries.push({
      kind: 'select',
      id: 'alignItems',
      label: 'Align',
      value: str(style, 'alignItems'),
      defaultValue: 'stretch',
      options: ALIGN_ITEMS_OPTIONS
    })
    layoutEntries.push({
      kind: 'number',
      id: 'gap',
      label: 'Gap',
      value: num(style, 'gap'),
      min: 0,
      step: 1
    })
    layoutEntries.push({
      kind: 'switch',
      id: '__flexWrap',
      label: 'Wrap children',
      value: str(style, 'flexWrap') === 'wrap' ? true : str(style, 'flexWrap') === 'nowrap' ? false : undefined,
      defaultValue: false
    })
  }

  const layoutSection: PanelSection = {
    id: 'style-layout',
    title: 'Layout',
    entries: layoutEntries,
    onReset:
      mode === 'absolute'
        ? () => set({ left: undefined, top: undefined, width: undefined, height: undefined })
        : () =>
            set({
              flex: undefined,
              alignSelf: undefined,
              flexDirection: undefined,
              justifyContent: undefined,
              alignItems: undefined,
              gap: undefined,
              flexWrap: undefined
            })
  }

  /* ── Typography section (registry-gated) ── */
  const typographySection: PanelSection = {
    id: 'style-typography',
    title: 'Typography',
    entries: [
      { kind: 'number', id: 'fontSize', label: 'Size', value: num(style, 'fontSize'), placeholder: '14', min: 0, step: 1 },
      {
        kind: 'select',
        id: 'fontWeight',
        label: 'Weight',
        value: str(style, 'fontWeight'),
        defaultValue: '400',
        options: FONT_WEIGHT_OPTIONS
      },
      { kind: 'color', id: 'color', label: 'Color', value: paint(style, 'color'), placeholder: 'None' },
      { kind: 'number', id: 'lineHeight', label: 'Line height', value: num(style, 'lineHeight'), min: 0, step: 1 },
      { kind: 'number', id: 'letterSpacing', label: 'Tracking', value: num(style, 'letterSpacing'), step: 0.1 },
      {
        kind: 'segmented',
        id: 'textAlign',
        label: 'Align',
        value: str(style, 'textAlign'),
        defaultValue: 'left',
        options: [
          { value: 'left', label: 'Left' },
          { value: 'center', label: 'Center' },
          { value: 'right', label: 'Right' }
        ]
      }
    ],
    onReset: () =>
      set({
        fontSize: undefined,
        fontWeight: undefined,
        color: undefined,
        lineHeight: undefined,
        letterSpacing: undefined,
        textAlign: undefined
      })
  }

  /* ── Appearance section (custom: simple rows + corner-radius quads) ── */
  const opacityPercent = typeof style.opacity === 'number' ? Math.round(style.opacity * 100) : undefined
  const appearanceSection: PanelSection = {
    id: 'style-appearance',
    title: 'Appearance',
    entries: [
      { kind: 'color', id: 'backgroundColor', label: 'Fill', value: paint(style, 'backgroundColor'), placeholder: 'None', gradient: true },
      {
        kind: 'slider',
        id: '__opacity',
        label: 'Opacity',
        value: opacityPercent,
        defaultValue: 100,
        min: 0,
        max: 100,
        step: 1,
        format: (value) => `${Math.round(value)}%`
      },
      {
        id: '__border-row',
        columns: 2,
        fields: [
          { kind: 'number', id: 'borderWidth', label: 'Border width', value: num(style, 'borderWidth'), glyph: 'B', min: 0, step: 1 },
          { kind: 'color', id: 'borderColor', label: 'Border color', value: paint(style, 'borderColor'), placeholder: 'None' }
        ]
      },
      { kind: 'select', id: 'overflow', label: 'Overflow', value: str(style, 'overflow'), defaultValue: 'visible', options: OVERFLOW_OPTIONS }
    ]
  }

  /* ── Effects section (platform from the ONE editor-global toggle) ── */
  const isIOS = globalPlatform === 'ios'
  const effectsEntries: PanelSection['entries'] = isIOS
    ? [
        { kind: 'color', id: 'shadowColor', label: 'Shadow', value: paint(style, 'shadowColor'), placeholder: 'None' },
        {
          id: '__shadow-offset',
          columns: 2,
          fields: [
            {
              kind: 'number',
              id: '__shadowOffsetX',
              label: 'Offset X',
              value: offset(style, 'width'),
              glyph: 'X',
              step: 1
            },
            {
              kind: 'number',
              id: '__shadowOffsetY',
              label: 'Offset Y',
              value: offset(style, 'height'),
              glyph: 'Y',
              step: 1
            }
          ]
        },
        { kind: 'number', id: 'shadowRadius', label: 'Radius', value: num(style, 'shadowRadius'), min: 0, step: 1 },
        {
          kind: 'slider',
          id: '__shadowOpacity',
          label: 'Shadow opacity',
          value: typeof style.shadowOpacity === 'number' ? Math.round(style.shadowOpacity * 100) : undefined,
          defaultValue: 100,
          min: 0,
          max: 100,
          step: 1,
          format: (value) => `${Math.round(value)}%`
        }
      ]
    : [{ kind: 'number', id: 'elevation', label: 'Elevation', value: num(style, 'elevation'), min: 0, step: 1 }]

  const effectsSection: PanelSection = {
    id: 'style-effects',
    title: 'Effects',
    entries: effectsEntries,
    onReset: isIOS
      ? () => set({ shadowColor: undefined, shadowOffset: undefined, shadowRadius: undefined, shadowOpacity: undefined })
      : () => set({ elevation: undefined })
  }

  /* ── Assemble in registry order; Spacing is custom (quads). ── */
  const SECTION_BUILDERS: Record<StyleSectionId, ReactNode> = {
    layout: (
      <LayoutSectionView
        key="layout"
        section={layoutSection}
        nodeId={node.id}
        alignable={mode === 'absolute' && !node.locked}
        onFieldChange={handleFieldChange}
        onScrubStart={beginGesture}
        onScrubEnd={endGesture}
      />
    ),
    spacing: (
      <SpacingSection
        key="spacing"
        style={style}
        set={set}
        onScrubStart={beginGesture}
        onScrubEnd={endGesture}
      />
    ),
    appearance: (
      <AppearanceSection
        key="appearance"
        section={appearanceSection}
        style={style}
        set={set}
        onFieldChange={handleFieldChange}
        onScrubStart={beginGesture}
        onScrubEnd={endGesture}
      />
    ),
    typography: (
      <PanelSectionView
        key="typography"
        section={typographySection}
        onFieldChange={handleFieldChange}
        onScrubStart={beginGesture}
        onScrubEnd={endGesture}
      />
    ),
    effects: (
      <PanelSectionView
        key="effects"
        section={effectsSection}
        onFieldChange={handleFieldChange}
        onScrubStart={beginGesture}
        onScrubEnd={endGesture}
        headerAction={<PlatformChip platform={globalPlatform} />}
      />
    )
  }

  return (
    <div className={cn('flex min-h-0 flex-1 flex-col overflow-y-auto scrollbar-thin', className)}>
      {entry.styleSections.map((sectionId) => SECTION_BUILDERS[sectionId])}
      <div className="h-6 shrink-0" aria-hidden="true" />
    </div>
  )
}

/* ─── Layout: align-in-parent row above the fields (open-pencil PositionSection) ── */

interface LayoutSectionViewProps {
  section: PanelSection
  nodeId: string
  /** Absolute + unlocked → alignment actions apply. */
  alignable: boolean
  onFieldChange: (sectionId: string, fieldId: string, value: FieldChangeValue) => void
  onScrubStart?: () => void
  onScrubEnd?: () => void
}

/**
 * Align-to-parent toolbar (open-pencil PositionSection row: 3+3 icon buttons,
 * justify-between). Single selection → aligns within the coordinate parent
 * (Figma semantics); distribution needs multi-select, which the selection
 * model deliberately does not have yet.
 */
const ALIGN_BUTTONS: { mode: AlignMode; label: string; Icon: typeof AlignStartVertical }[] = [
  { mode: 'left', label: 'Align left', Icon: AlignStartVertical },
  { mode: 'centerH', label: 'Align horizontal centers', Icon: AlignCenterVertical },
  { mode: 'right', label: 'Align right', Icon: AlignEndVertical },
  { mode: 'top', label: 'Align top', Icon: AlignStartHorizontal },
  { mode: 'middleV', label: 'Align vertical centers', Icon: AlignCenterHorizontal },
  { mode: 'bottom', label: 'Align bottom', Icon: AlignEndHorizontal }
]

function LayoutSectionView({ section, nodeId, alignable, onFieldChange, onScrubStart, onScrubEnd }: LayoutSectionViewProps) {
  return (
    <CollapsibleSection id={section.id} title={section.title} onReset={section.onReset}>
      {alignable && (
        <div className="mb-1.5 flex items-center justify-between" role="group" aria-label="Align to parent">
          <div className="flex gap-0.5">
            {ALIGN_BUTTONS.slice(0, 3).map(({ mode, label, Icon }) => (
              <Tip key={mode} label={label}>
                <button
                  type="button"
                  aria-label={label}
                  className="flex size-6 cursor-pointer items-center justify-center rounded text-muted transition-colors outline-none hover:bg-hover hover:text-surface focus-visible:ring-1 focus-visible:ring-panel-focus"
                  onClick={() => alignNodeInParent(nodeId, mode)}
                >
                  <Icon className="size-3.5" aria-hidden />
                </button>
              </Tip>
            ))}
          </div>
          <div className="flex gap-0.5">
            {ALIGN_BUTTONS.slice(3).map(({ mode, label, Icon }) => (
              <Tip key={mode} label={label}>
                <button
                  type="button"
                  aria-label={label}
                  className="flex size-6 cursor-pointer items-center justify-center rounded text-muted transition-colors outline-none hover:bg-hover hover:text-surface focus-visible:ring-1 focus-visible:ring-panel-focus"
                  onClick={() => alignNodeInParent(nodeId, mode)}
                >
                  <Icon className="size-3.5" aria-hidden />
                </button>
              </Tip>
            ))}
          </div>
        </div>
      )}
      <SectionFields section={section} onFieldChange={onFieldChange} onScrubStart={onScrubStart} onScrubEnd={onScrubEnd} />
    </CollapsibleSection>
  )
}

/* ─── Section renderer with reset support ──────────────────────────────────── */

interface PanelSectionViewProps {
  section: PanelSection
  onFieldChange: (sectionId: string, fieldId: string, value: FieldChangeValue) => void
  onScrubStart?: () => void
  onScrubEnd?: () => void
  headerAction?: ReactNode
}

function PanelSectionView({ section, onFieldChange, onScrubStart, onScrubEnd, headerAction }: PanelSectionViewProps) {
  return (
    <CollapsibleSection id={section.id} title={section.title} onReset={section.onReset} headerAction={headerAction}>
      <SectionFields section={section} onFieldChange={onFieldChange} onScrubStart={onScrubStart} onScrubEnd={onScrubEnd} />
    </CollapsibleSection>
  )
}

/** Small note chip in the Effects header: which platform's effects these are. */
function PlatformChip({ platform }: { platform: 'ios' | 'android' }) {
  return (
    <span className="rounded bg-panel-field px-1.5 py-0.5 text-[10px] font-medium text-muted" title={`From the editor's global platform (${platform})`}>
      {platform === 'ios' ? 'iOS shadow' : 'Android elevation'}
    </span>
  )
}

/* ─── Appearance: simple rows + corner-radius quads ───────────────────── */

interface AppearanceSectionProps {
  section: PanelSection
  style: Record<string, unknown>
  set: (patch: Record<string, unknown>) => void
  onFieldChange: (sectionId: string, fieldId: string, value: FieldChangeValue) => void
  onScrubStart?: () => void
  onScrubEnd?: () => void
}

const CORNER_KEYS = {
  topLeft: 'borderTopLeftRadius',
  topRight: 'borderTopRightRadius',
  bottomRight: 'borderBottomRightRadius',
  bottomLeft: 'borderBottomLeftRadius'
}

function AppearanceSection({ section, style, set, onFieldChange, onScrubStart, onScrubEnd }: AppearanceSectionProps) {
  // Plain borderRadius acts as the fallback for every unset corner.
  const uniform = num(style, 'borderRadius')
  return (
    <CollapsibleSection
      id={section.id}
      title={section.title}
      onReset={() =>
        set({
          backgroundColor: undefined,
          opacity: undefined,
          borderWidth: undefined,
          borderColor: undefined,
          overflow: undefined,
          borderRadius: undefined,
          borderTopLeftRadius: undefined,
          borderTopRightRadius: undefined,
          borderBottomRightRadius: undefined,
          borderBottomLeftRadius: undefined
        })
      }
    >
      <div className="flex min-w-0 flex-col gap-2.5">
        <SectionFields section={section} onFieldChange={onFieldChange} onScrubStart={onScrubStart} onScrubEnd={onScrubEnd} />
        <QuadField
          id="radius"
          label="Radius"
          values={{
            top: num(style, CORNER_KEYS.topLeft) ?? uniform,
            right: num(style, CORNER_KEYS.topRight) ?? uniform,
            bottom: num(style, CORNER_KEYS.bottomRight) ?? uniform,
            left: num(style, CORNER_KEYS.bottomLeft) ?? uniform
          }}
          keys={{
            top: CORNER_KEYS.topLeft,
            right: CORNER_KEYS.topRight,
            bottom: CORNER_KEYS.bottomRight,
            left: CORNER_KEYS.bottomLeft
          }}
          onChange={(patch) => {
            // "All" writes every corner; drop a stale uniform key so the data
            // stays a single source of truth.
            const touchesAll = Object.keys(patch).length === 4
            set(touchesAll ? { ...patch, borderRadius: undefined } : patch)
          }}
          onScrubStart={onScrubStart}
          onScrubEnd={onScrubEnd}
          min={0}
        />
      </div>
    </CollapsibleSection>
  )
}

/* ─── Spacing: linked quads for padding + margin ───────────────────────── */

interface SpacingSectionProps {
  style: Record<string, unknown>
  set: (patch: Record<string, unknown>) => void
  onScrubStart?: () => void
  onScrubEnd?: () => void
}

function SpacingSection({ style, set, onScrubStart, onScrubEnd }: SpacingSectionProps) {
  return (
    <CollapsibleSection
      id="style-spacing"
      title="Spacing"
      onReset={() =>
        set({
          paddingTop: undefined,
          paddingRight: undefined,
          paddingBottom: undefined,
          paddingLeft: undefined,
          marginTop: undefined,
          marginRight: undefined,
          marginBottom: undefined,
          marginLeft: undefined
        })
      }
    >
      <div className="flex min-w-0 flex-col gap-2.5">
        <QuadField
          id="padding"
          label="Padding"
          values={{
            top: num(style, 'paddingTop'),
            right: num(style, 'paddingRight'),
            bottom: num(style, 'paddingBottom'),
            left: num(style, 'paddingLeft')
          }}
          keys={{
            top: 'paddingTop',
            right: 'paddingRight',
            bottom: 'paddingBottom',
            left: 'paddingLeft'
          }}
          onChange={(patch) => set(patch)}
          onScrubStart={onScrubStart}
          onScrubEnd={onScrubEnd}
          min={0}
        />
        <QuadField
          id="margin"
          label="Margin"
          values={{
            top: num(style, 'marginTop'),
            right: num(style, 'marginRight'),
            bottom: num(style, 'marginBottom'),
            left: num(style, 'marginLeft')
          }}
          keys={{
            top: 'marginTop',
            right: 'marginRight',
            bottom: 'marginBottom',
            left: 'marginLeft'
          }}
          onChange={(patch) => set(patch)}
          onScrubStart={onScrubStart}
          onScrubEnd={onScrubEnd}
          allowNegative
        />
      </div>
    </CollapsibleSection>
  )
}
