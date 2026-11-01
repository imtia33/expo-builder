/*
 * ExpoForge right panel — field-schema types for the contextual inspector.
 *
 * A field spec is a small view-model: the control kind, the label, the CURRENT
 * value, and the EFFECTIVE default used when the value is unset. Controls render
 * unset values as ghosts (muted placeholder text / dimmed swatch) so "inherited
 * from the registry default" is always distinguishable from an explicit value:
 * committing writes the explicit value into the store, which is what makes the
 * ghost disappear.
 *
 * The MIXED sentinel (multi-selection disagreement) is kept from the ported
 * open-pencil model even though v1 selections are single — the display rules are
 * already wired through every control.
 */

import type { GradientPaint, TokenPaint } from '@/lib/paint'

/** Sentinel for "values differ across the selection" (ported open-pencil rule). */
export const MIXED = Symbol('mixed')
export type MixedValue<T> = T | typeof MIXED

/** Values a field control can commit (paint objects for color fields). */
export type FieldChangeValue = string | number | boolean | GradientPaint | TokenPaint

export interface FieldOption {
  value: string
  label: string
  /** Iconify name (Phosphor) rendered inside a segmented option. */
  icon?: string
}

interface FieldBase {
  id: string
  label: string
  /**
   * The value the control falls back to (registry default, computed "all" value,
   * …). For unset values this doubles as the ghost display and the scrub base.
   */
  defaultValue?: FieldChangeValue
}

export interface TextFieldSpec extends FieldBase {
  kind: 'text'
  value?: MixedValue<string>
  placeholder?: string
  /** Render a multi-line textarea instead of a single-line input. */
  multiline?: boolean
  rows?: number
}

export interface NumberFieldSpec extends FieldBase {
  kind: 'number'
  value?: MixedValue<number>
  unit?: string
  step?: number
  min?: number
  max?: number
  /** Ghost text shown while the value is unset (e.g. "Auto"). */
  placeholder?: string
  /** Tiny leading glyph inside the field (e.g. "T" for padding-top). */
  glyph?: string
}

export interface SelectFieldSpec extends FieldBase {
  kind: 'select'
  value?: MixedValue<string>
  options: FieldOption[]
}

export interface SwitchFieldSpec extends FieldBase {
  kind: 'switch'
  value?: MixedValue<boolean>
}

export interface SegmentedFieldSpec extends FieldBase {
  kind: 'segmented'
  value?: MixedValue<string>
  options: FieldOption[]
}

export interface ColorFieldSpec extends FieldBase {
  kind: 'color'
  /** Paint value: solid hex ('' = none), gradient, or theme token. */
  value?: MixedValue<string | GradientPaint | TokenPaint>
  /** Ghost label for the unset state (e.g. the registry default hex). */
  placeholder?: string
  /** Allow gradient fills (only container backgrounds in RN — backgroundColor). */
  gradient?: boolean
}

export interface SliderFieldSpec extends FieldBase {
  kind: 'slider'
  value?: MixedValue<number>
  min: number
  max: number
  step: number
  /** Formats the trailing readout (receives the raw field value). */
  format?: (value: number) => string
}

/** Not a control: a small sub-heading row inside a section (e.g. "Children layout"). */
export interface LabelSpec {
  kind: 'label'
  id: string
  label: string
}

export type FieldSpec =
  | TextFieldSpec
  | NumberFieldSpec
  | SelectFieldSpec
  | SwitchFieldSpec
  | SegmentedFieldSpec
  | ColorFieldSpec
  | SliderFieldSpec
  | LabelSpec

export type FieldKind = FieldSpec['kind']

/** True when the value is the MIXED sentinel. */
export function isMixed(value: unknown): value is typeof MIXED {
  return typeof value === 'symbol' && value === MIXED
}

/* ────────────────────────────────────────────────────────────────────────────
 * Section view-model
 * ──────────────────────────────────────────────────────────────────────────── */

/**
 * A labelled row bundling several controls into one grid (e.g. the 2×2 padding
 * box, or a width row of unit-mode + number). With `linked`, the chain toggle in
 * the row's actions rail applies one edit to every field in the group.
 */
export interface FieldGroupSpec<F extends FieldSpec = FieldSpec> {
  id: string
  label?: string
  columns?: 1 | 2 | 3
  distribution?: 'equal' | 'wide-first'
  linked?: boolean
  fields: F[]
}

export type PanelEntry<F extends FieldSpec = FieldSpec> = F | FieldGroupSpec<F>

export function isFieldGroup<F extends FieldSpec>(entry: PanelEntry<F>): entry is FieldGroupSpec<F> {
  return (entry as FieldGroupSpec<F>).fields !== undefined
}

export interface PanelSection<F extends FieldSpec = FieldSpec> {
  id: string
  title: string
  /** Default grid columns for the section's rows (panel/grid.ts). */
  columns?: 1 | 2 | 3
  distribution?: 'equal' | 'wide-first'
  defaultOpen?: boolean
  /** Not applicable: renders dimmed via data-[disabled]. */
  disabled?: boolean
  /** Reset-to-unset action rendered in the section header. */
  onReset?: () => void
  entries: PanelEntry<F>[]
}

/** Flattens a section's entries into a field list. */
export function collectSectionFields(section: PanelSection): FieldSpec[] {
  const fields: FieldSpec[] = []
  for (const entry of section.entries) {
    if (isFieldGroup(entry)) fields.push(...entry.fields)
    else fields.push(entry)
  }
  return fields
}

/* ────────────────────────────────────────────────────────────────────────────
 * Tabs
 * ──────────────────────────────────────────────────────────────────────────── */

export type TabId = 'props' | 'style' | 'screen' | 'nav' | 'project' | 'code'

export interface RightPanelProps {
  className?: string
}
