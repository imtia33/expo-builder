'use client'
/*
 * ArrayField (Phase 2) — the structured list editor for a list's static data
 * source (flatlist `data`, sectionlist `sections`). The registry's 'array'
 * PropField type finally gets its control (it previously degraded to a
 * read-only label row).
 *
 * Behavior follows the panel's ghost convention: when the prop is UNSET, the
 * registry default rows render muted with a note; the first edit commits the
 * whole array (defaults + the edit) so the value becomes explicit — exactly
 * like typing into a ghosted number field.
 *
 * Every edit builds a fresh array and commits it as ONE setNodeProps call →
 * one undo entry. Nested arrays (a section's rows) recurse one level.
 */
import { type ReactNode } from 'react'
import { SlotIcon } from '@/components/builder/icons/slots'
import { cn } from '@/lib/utils'
import type { ArrayItemFieldSpec, ArrayListFieldSpec } from '../schema'

interface ArrayFieldProps {
  field: ArrayListFieldSpec
  onChange: (value: unknown[]) => void
  className?: string
}

interface RowLike {
  [key: string]: unknown
}

/** Coerce to row objects; anything else drops (forgiving, never throws). */
function asRows(v: unknown): RowLike[] {
  if (!Array.isArray(v)) return []
  return v.filter((r): r is RowLike => r !== null && typeof r === 'object' && !Array.isArray(r))
}

const inputClass =
  'h-6 w-full min-w-0 rounded-sm border border-input bg-transparent px-1.5 text-[11px] leading-none text-foreground placeholder:text-muted/70 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring'

export function ArrayField({ field, onChange, className }: ArrayFieldProps) {
  const unset = field.value === undefined || field.value === null
  const rows: RowLike[] = asRows(unset ? field.defaultValue : field.value)
  const minItems = field.minItems ?? 0

  /** Deep-ish copy of the current rows for an upcoming commit. */
  const cloneRows = (): RowLike[] => rows.map((r) => ({ ...r }))

  const commit = (next: RowLike[]): void => {
    onChange(next)
  }

  const setRowField = (rowIndex: number, key: string, value: string): void => {
    const next = cloneRows()
    if (value === '') delete next[rowIndex][key]
    else next[rowIndex][key] = value
    commit(next)
  }

  const setNestedField = (rowIndex: number, key: string, nestedIndex: number, nestedKey: string, value: string): void => {
    const next = cloneRows()
    const nested = asRows(next[rowIndex][key])
    if (value === '') delete nested[nestedIndex][nestedKey]
    else nested[nestedIndex][nestedKey] = value
    next[rowIndex][key] = nested
    commit(next)
  }

  const addRow = (): void => {
    commit([...cloneRows(), {}])
  }

  const removeRow = (rowIndex: number): void => {
    if (rows.length <= minItems) return
    commit(cloneRows().filter((_, i) => i !== rowIndex))
  }

  const addNestedRow = (rowIndex: number, key: string): void => {
    const next = cloneRows()
    const nested = asRows(next[rowIndex][key])
    nested.push({})
    next[rowIndex][key] = nested
    commit(next)
  }

  const removeNestedRow = (rowIndex: number, key: string, nestedIndex: number): void => {
    const next = cloneRows()
    const nested = asRows(next[rowIndex][key])
    if (nested.length <= minItems) return
    next[rowIndex][key] = nested.filter((_, i) => i !== nestedIndex)
    commit(next)
  }

  const removeButton = (label: string, onClick: () => void): ReactNode => (
    <button
      type="button"
      aria-label={label}
      className="shrink-0 rounded-sm p-1 text-muted hover:text-foreground"
      onClick={onClick}
    >
      <SlotIcon slot="dialog.close" aria-hidden="true" className="size-3" />
    </button>
  )

  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      {unset && field.ghostNote ? <p className="text-[10px] text-muted">{field.ghostNote}</p> : null}
      {rows.length === 0 ? (
        <p className="rounded-sm border border-dashed border-border px-2 py-3 text-center text-[11px] text-muted">
          No rows — the list shows its empty state
        </p>
      ) : null}
      {rows.map((row, rowIndex) => (
        <div
          key={rowIndex}
          data-slot="array-row"
          className={cn('relative rounded-md border border-border bg-panel-field/40 p-1.5 pr-7', unset && 'opacity-60')}
        >
          <div className="absolute right-1 top-1">
            {rows.length > minItems
              ? removeButton(`Remove row ${rowIndex + 1}`, () => removeRow(rowIndex))
              : null}
          </div>
          {field.itemFields.map((itemField: ArrayItemFieldSpec) =>
            itemField.type === 'array' ? (
              /* Nested rows (SectionList: one section's items). */
              <div key={itemField.key} className="mt-1.5 flex flex-col gap-1">
                <p className="select-none text-[10px] font-medium uppercase tracking-wide text-muted">
                  {itemField.label}
                </p>
                {asRows(row[itemField.key]).map((nestedRow, nestedIndex) => (
                  <div
                    key={nestedIndex}
                    className="flex items-center gap-1 rounded-sm border border-border/60 bg-panel/60 p-1 pr-6 relative"
                  >
                    <span className="w-4 shrink-0 text-center text-[10px] text-muted">{nestedIndex + 1}</span>
                    <div className="flex min-w-0 flex-1 flex-col gap-1">
                      {(itemField.subItemFields ?? []).map((sub) => (
                        <input
                          key={sub.key}
                          type="text"
                          className={cn(inputClass, unset && 'text-muted')}
                          placeholder={sub.placeholder ?? sub.label}
                          value={typeof nestedRow[sub.key] === 'string' ? (nestedRow[sub.key] as string) : ''}
                          onChange={(e) => setNestedField(rowIndex, itemField.key, nestedIndex, sub.key, e.target.value)}
                        />
                      ))}
                    </div>
                    <div className="absolute right-0.5 top-0.5">
                      {removeButton(`Remove nested row ${nestedIndex + 1}`, () =>
                        removeNestedRow(rowIndex, itemField.key, nestedIndex)
                      )}
                    </div>
                  </div>
                ))}
                <button
                  type="button"
                  className="flex items-center gap-1 self-start rounded-sm px-1 py-0.5 text-[11px] text-muted hover:text-foreground"
                  onClick={() => addNestedRow(rowIndex, itemField.key)}
                >
                  <SlotIcon slot="panel.new" aria-hidden="true" className="size-3" />
                  Add row
                </button>
              </div>
            ) : (
              /* Plain per-row string field (title / subtitle / image…). */
              <div key={itemField.key} className="flex items-center gap-1.5">
                <label className="w-14 shrink-0 truncate text-[10px] leading-none text-muted">
                  {itemField.label}
                </label>
                <input
                  type="text"
                  className={cn(inputClass, unset && 'text-muted')}
                  placeholder={itemField.placeholder ?? itemField.label}
                  value={typeof row[itemField.key] === 'string' ? (row[itemField.key] as string) : ''}
                  onChange={(e) => setRowField(rowIndex, itemField.key, e.target.value)}
                />
              </div>
            )
          )}
        </div>
      ))}
      <button
        type="button"
        className="flex items-center gap-1 self-start rounded-sm px-1 py-0.5 text-[11px] text-muted hover:text-foreground"
        onClick={addRow}
      >
        <SlotIcon slot="panel.new" aria-hidden="true" className="size-3" />
        Add {rows.length === 0 ? 'first row' : 'row'}
      </button>
    </div>
  )
}
