'use client'

/*
 * Field rows inside a section (doc §5.2): label (fixed ~64px) + fields grid + actions
 * rail (w-[26px]), laid out with the ported panel/grid.ts theme. A row is either a
 * single FieldSpec or a FieldGroupSpec bundling several controls into one grid
 * (2×2 padding box, width mode+number, …). Linked groups render the chain toggle in
 * the rail; while linked, editing any field commits the same value to every field.
 */

import { useId, useState } from 'react'
import { tv } from 'tailwind-variants'
import { SlotIcon } from '@/components/builder/icons/slots'

import iconButtonTheme from '@/app/theme/button/icon-button'
import panelGridTheme from '@/app/theme/panel/grid'
import { cn } from '@/lib/utils'
import {
  isFieldGroup,
  type FieldChangeValue,
  type FieldGroupSpec,
  type FieldSpec,
  type PanelSection,
} from './schema'
import { FieldControl } from './fields/field-control'

const gridStyles = tv(panelGridTheme)
const iconButtonStyles = tv(iconButtonTheme)

const rowLabelClass = 'w-16 shrink-0 self-center truncate text-[11px] leading-none text-muted'

interface RowContext {
  sectionId: string
  defaultColumns: 1 | 2 | 3
  defaultDistribution: 'equal' | 'wide-first'
  onFieldChange: (sectionId: string, fieldId: string, value: FieldChangeValue) => void
  onScrubStart?: () => void
  onScrubEnd?: () => void
}

function SingleFieldRow({ field, context }: { field: FieldSpec; context: RowContext }) {
  const labelId = useId()
  const { onFieldChange, onScrubStart, onScrubEnd, sectionId } = context

  // Sub-heading rows (e.g. "Children layout") render as a full-width label.
  if (field.kind === 'label') {
    return (
      <p className="pt-1 text-[10px] font-medium tracking-wide text-muted uppercase select-none">{field.label}</p>
    )
  }

  // Array editors (Phase 2 list data sources) are full-width blocks: their
  // rows carry their own labels, and the section title above serves as the
  // row label — squeezing them into the 64px label grid would truncate them.
  if (field.kind === 'array-list') {
    return (
      <div className="pt-1">
        <FieldControl
          field={field}
          onChange={(value) => onFieldChange(sectionId, field.id, value)}
          onScrubStart={onScrubStart}
          onScrubEnd={onScrubEnd}
        />
      </div>
    )
  }

  return (
    <div className={gridStyles({ columns: 1, distribution: 'equal' })}>
      <label id={labelId} className={rowLabelClass}>
        {field.label}
      </label>
      <div data-slot="fields">
        <FieldControl
          field={field}
          labelId={labelId}
          onChange={(value) => onFieldChange(sectionId, field.id, value)}
          onScrubStart={onScrubStart}
          onScrubEnd={onScrubEnd}
        />
      </div>
      <div data-slot="actions" />
    </div>
  )
}

function GroupFieldRow({ group, context }: { group: FieldGroupSpec; context: RowContext }) {
  const labelId = useId()
  const [linked, setLinked] = useState(group.linked ?? false)
  const { onFieldChange, onScrubStart, onScrubEnd, sectionId } = context
  const hasLabel = Boolean(group.label)

  function handleFieldChange(fieldId: string, value: FieldChangeValue) {
    if (!linked) {
      onFieldChange(sectionId, fieldId, value)
      return
    }
    // Linked sides: one gesture applies the value to every field in the group.
    for (const member of group.fields) {
      onFieldChange(sectionId, member.id, value)
    }
  }

  return (
    <div
      className={gridStyles({
        columns: group.columns ?? context.defaultColumns,
        distribution: group.distribution ?? context.defaultDistribution,
      })}
    >
      {hasLabel ? (
        <label id={labelId} className={rowLabelClass}>
          {group.label}
        </label>
      ) : null}
      <div data-slot="fields">
        {group.fields.map((field) => (
          <FieldControl
            key={field.id}
            field={field}
            labelId={hasLabel ? undefined : labelId}
            onChange={(value) => handleFieldChange(field.id, value)}
            onScrubStart={onScrubStart}
            onScrubEnd={onScrubEnd}
          />
        ))}
      </div>
      <div data-slot="actions">
        {group.linked ? (
          <button
            type="button"
            data-slot="icon-button"
            aria-pressed={linked}
            aria-label={linked ? 'Unlink sides' : 'Link sides — one value applies to all'}
            title={linked ? 'Unlink sides' : 'Link sides — one value applies to all'}
            onClick={() => setLinked((previous) => !previous)}
            className={iconButtonStyles({ size: 'xs', active: linked })}
          >
            <SlotIcon slot="inspector.link-chains" aria-hidden="true" className="size-3" />
          </button>
        ) : null}
      </div>
    </div>
  )
}

export interface SectionFieldsProps {
  section: PanelSection
  /** Overrides the section's base entries (drill-in detail view). */
  entries?: PanelSection['entries']
  onFieldChange: (sectionId: string, fieldId: string, value: FieldChangeValue) => void
  onScrubStart?: () => void
  onScrubEnd?: () => void
  className?: string
}

/** Renders a section's entries as stacked field rows. */
export function SectionFields({
  section,
  entries,
  onFieldChange,
  onScrubStart,
  onScrubEnd,
  className,
}: SectionFieldsProps) {
  const context: RowContext = {
    sectionId: section.id,
    defaultColumns: section.columns ?? 1,
    defaultDistribution: section.distribution ?? 'equal',
    onFieldChange,
    onScrubStart,
    onScrubEnd,
  }
  const list = entries ?? section.entries

  return (
    <div className={cn('flex min-w-0 flex-col gap-1.5', className)}>
      {list.map((entry) =>
        isFieldGroup(entry) ? (
          <GroupFieldRow key={entry.id} group={entry} context={context} />
        ) : (
          <SingleFieldRow key={entry.id} field={entry} context={context} />
        )
      )}
    </div>
  )
}
